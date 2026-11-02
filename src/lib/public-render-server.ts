import { HEAT_TILE_OPTIONS, prepareHeatRoutes } from './path-heat-routes'
import { renderMapThumbnail } from './map-thumbnail'
import geojsonvt from 'geojson-vt'
import { fromGeojsonVt } from 'vt-pbf'
import { findShareBySlug } from './sharing-db'
import { readPrivateSnapshot } from './sharing-storage'
import { loadLocalMap } from './local-map'
import { activitiesToGeoData } from './activities'
import { deserializeActivities } from './activities-serialize'
import { preparePublicPreview, type PublicSnapshot } from './public-render'
import { HEAT_SIZE, rasterizePathHeat } from './path-heat'
import { encodePng } from './png'
import { HeatTileCache } from './heat-tile-cache'
import { rateLimit } from './rate-limit'
import { ACTIVITY_TYPES } from '@/models/activity'

const PUBLIC_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
}
interface Asset {
  cacheId: number
  payload: PublicSnapshot
  preview: PublicSnapshot
  thumbnail?: Partial<Record<'light' | 'dark', string>>
  routeIndex?: ReturnType<typeof geojsonvt>
  heatIndex?: ReturnType<typeof geojsonvt>
  estimatedBytes: number
  expires: number
  tileRequests: number
}
// Internal immutable-path cache, NOT an access/slug cache. Every response has a
// live authorization gate, including hits. Bound estimated retained heap to 96 MiB.
const cache = new Map<string, Asset>()
const localAssets = new WeakMap<PublicSnapshot, Asset>()
const pending = new Map<string, Promise<Asset>>()
const LIMIT = 96 * 1024 * 1024
const heatTiles = new HeatTileCache()
let nextAssetId = 0
function prepare(payload: PublicSnapshot, size: number): Asset {
  if (!Array.isArray(payload.activities) || payload.version !== 1) throw new Error('invalid_snapshot')
  const preview = size * 8 <= LIMIT ? preparePublicPreview(payload.activities) : undefined
  return {
    cacheId: ++nextAssetId,
    payload,
    preview: { version: 1, updatedAt: payload.updatedAt, activities: preview ?? payload.activities },
    estimatedBytes: size * 8,
    expires: Date.now() + 60_000,
    tileRequests: 0,
  }
}
async function assetFor(path: string): Promise<Asset> {
  for (const [key, value] of cache) if (value.expires <= Date.now()) cache.delete(key)
  const hit = cache.get(path)
  if (hit) return hit
  const existing = pending.get(path)
  if (existing) return existing
  // Avoid accumulating arbitrary numbers of in-flight snapshot downloads.
  if (pending.size >= 4) throw new Error('render_busy')
  const request = (async () => {
    const blob = await readPrivateSnapshot(path, AbortSignal.timeout(15_000))
    if (!blob || blob.statusCode !== 200) throw new Error('snapshot_unavailable')
    const reader = blob.stream.getReader()
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > 32 * 1024 * 1024) throw new Error('snapshot_too_large')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    const asset = prepare(JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes)
    if (asset.estimatedBytes <= LIMIT) {
      let total = [...cache.values()].reduce((n, a) => n + a.estimatedBytes, 0)
      while (cache.size && total + asset.estimatedBytes > LIMIT) {
        const key = cache.keys().next().value!
        total -= cache.get(key)!.estimatedBytes
        cache.delete(key)
      }
      cache.set(path, asset)
    }
    return asset
  })().finally(() => pending.delete(path))
  pending.set(path, request)
  return request
}
const TILE_OPTIONS = { maxZoom: 16, indexMaxZoom: 5, indexMaxPoints: 50_000, tolerance: 2, buffer: 256 }
export async function servePublicRender(slug: string, query: URLSearchParams): Promise<Response> {
  try {
    const tile = query.get('tile')
    const numbers = tile?.split('/').map(Number)
    if (
      numbers &&
      (numbers.length !== 3 ||
        numbers.some((n) => !Number.isInteger(n)) ||
        numbers[0] < 0 ||
        numbers[0] > 16 ||
        numbers[1] < 0 ||
        numbers[2] < 0 ||
        numbers[1] >= 2 ** numbers[0] ||
        numbers[2] >= 2 ** numbers[0])
    )
      return new Response(null, { status: 400, headers: PUBLIC_HEADERS })
    const heat = Boolean(numbers) && query.get('kind') === 'heat'
    const cutoff = heat && query.has('cutoff') ? Number(query.get('cutoff')) : null
    const rawTypes = heat ? query.get('types') : null
    if (heat && ((cutoff !== null && !Number.isFinite(cutoff)) || (rawTypes?.length ?? 0) > 256))
      return new Response(null, { status: 400, headers: PUBLIC_HEADERS })
    const types = [...new Set(rawTypes === null ? ACTIVITY_TYPES : rawTypes.split(',').filter(Boolean))].sort()
    const dark = query.get('theme') === 'dark'
    const local = await loadLocalMap(slug)
    const row = local ? null : await findShareBySlug(slug)
    if (!local && !row?.snapshot_path) return new Response(null, { status: 404, headers: PUBLIC_HEADERS })
    const revision = local ? 'local' : row!.revision
    if (query.has('revision') && query.get('revision') !== revision)
      return new Response(null, { status: 404, headers: PUBLIC_HEADERS })
    let asset: Asset
    if (local) {
      const hit = localAssets.get(local)
      asset = hit && hit.expires > Date.now() ? hit : prepare(local, JSON.stringify(local).length)
      localAssets.set(local, asset)
    } else asset = await assetFor(row!.snapshot_path!)
    let body: string | Uint8Array
    let contentType = 'application/json'
    if (query.get('view') === 'thumbnail') {
      const theme = dark ? 'dark' : 'light'
      asset.thumbnail ??= {}
      asset.thumbnail[theme] ??= renderMapThumbnail(asset.payload.activities, dark)
      body = asset.thumbnail[theme]!
      contentType = 'image/svg+xml'
    } else if (numbers) {
      if (asset.estimatedBytes > LIMIT) throw new Error('snapshot_too_large')
      const heatKey = heat ? JSON.stringify([asset.cacheId, revision, numbers, types, cutoff, dark]) : ''
      const cachedHeat = heat ? heatTiles.get(heatKey) : undefined
      if (cachedHeat) {
        body = cachedHeat
        contentType = 'image/png'
      } else {
        // Cache misses consume a shared instance budget even when client identities vary.
        if (heat) {
          const budget = rateLimit('map-heat-render', { windowMs: 60_000, max: 240 })
          if (!budget.ok)
            return new Response(null, {
              status: 429,
              headers: { ...PUBLIC_HEADERS, 'Retry-After': String(budget.retryAfterSeconds) },
            })
        }
        // geojson-vt lazily retains generated tiles. Rebuild periodically to bound it.
        if (++asset.tileRequests > 256) {
          asset.routeIndex = undefined
          asset.heatIndex = undefined
          asset.tileRequests = 1
        }
        const routes = () => activitiesToGeoData(deserializeActivities(asset.payload.activities))
        if (heat) asset.heatIndex ??= geojsonvt(prepareHeatRoutes(routes()), HEAT_TILE_OPTIONS)
        else asset.routeIndex ??= geojsonvt(routes(), TILE_OPTIONS)
        const index = heat ? asset.heatIndex! : asset.routeIndex!
        const result = index.getTile(numbers[0], numbers[1], numbers[2])
        if (heat) {
          body = encodePng(rasterizePathHeat(result, { types, cutoff }, dark), HEAT_SIZE, HEAT_SIZE)
          heatTiles.set(heatKey, body)
          contentType = 'image/png'
        } else {
          // @types/vt-pbf incorrectly describes values as indexes rather than tiles.
          body = result
            ? fromGeojsonVt({ routes: result } as unknown as Parameters<typeof fromGeojsonVt>[0], { version: 2 })
            : new Uint8Array()
          contentType = 'application/vnd.mapbox-vector-tile'
        }
      }
    } else {
      const tiled = asset.preview.activities !== asset.payload.activities
      const base = `/api/maps/${encodeURIComponent(slug)}?revision=${encodeURIComponent(revision)}&tile={z}/{x}/{y}`
      body = JSON.stringify({
        ...asset.preview,
        ...(tiled
          ? {
              tiles: base,
              heatTiles: `${base}&kind=heat`,
              fullUrl: `/api/maps/${encodeURIComponent(slug)}?view=full&revision=${encodeURIComponent(revision)}`,
            }
          : {}),
      })
    }
    // Recheck even on cache hits, after serialization/indexing/storage work.
    if (!local) {
      const current = await findShareBySlug(slug)
      if (
        !current ||
        current.athlete_id !== row!.athlete_id ||
        current.revision !== row!.revision ||
        current.snapshot_path !== row!.snapshot_path
      )
        return new Response(null, { status: 404, headers: PUBLIC_HEADERS })
    }
    const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
    let offset = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset >= bytes.length) controller.close()
        else {
          controller.enqueue(bytes.subarray(offset, offset + 64 * 1024))
          offset += 64 * 1024
        }
      },
    })
    return new Response(stream, {
      headers: { ...PUBLIC_HEADERS, 'Content-Type': contentType },
    })
  } catch {
    return new Response(null, { status: 503, headers: PUBLIC_HEADERS })
  }
}
