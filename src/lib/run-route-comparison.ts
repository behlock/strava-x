import type { Activity, ActivityFeatureCollection } from '@/models/activity'
import type { ComparisonFilters } from './comparison-filters'
import { activitiesToGeoData } from './activities'
import { packRoutes, unpackRoutes, routeTransfers, type PackedRoutes } from './packed-routes'
import { comparisonFilterKey } from './comparison-filters'

/** Owned by one hook/session. No account data is retained in a module cache. */
export function createRouteComparisonClient() {
  let worker: Worker | undefined
  let libraries: [Activity[], Activity[]] | undefined
  let serial = 0
  let busy = false
  let queued: { id: number; send: () => void } | undefined
  const pending = new Map<
    number,
    { resolve: (data: ActivityFeatureCollection) => void; reject: (error: Error) => void }
  >()
  const cache = new Map<string, ActivityFeatureCollection>()
  let cachedVertices = 0
  function dispose() {
    worker?.terminate()
    busy = false
    queued = undefined
    worker = undefined
    libraries = undefined
    for (const request of pending.values()) request.reject(new Error('comparison_cancelled'))
    pending.clear()
    cache.clear()
    cachedVertices = 0
  }
  function run(
    publicActivities: Activity[],
    ownActivities: Activity[],
    signal: AbortSignal,
    filters?: ComparisonFilters,
  ): Promise<ActivityFeatureCollection> {
    signal.throwIfAborted()
    const changed = !libraries || libraries[0] !== publicActivities || libraries[1] !== ownActivities
    if (changed) dispose()
    const key = comparisonFilterKey(filters)
    const cached = cache.get(key)
    if (cached) return Promise.resolve(cached)

    return new Promise((resolve, reject) => {
      const id = ++serial
      const abort = () => {
        pending.delete(id)
        reject(signal.reason)
      }
      signal.addEventListener('abort', abort, { once: true })
      const cleanup = () => signal.removeEventListener('abort', abort)
      pending.set(id, {
        resolve: (data) => {
          cleanup()

          const vertices = data.features.reduce((n, f) => n + f.geometry.coordinates.length, 0)
          if (vertices <= 250_000) {
            while (cache.size >= 4 || cachedVertices + vertices > 500_000) {
              const oldest = cache.keys().next().value!
              for (const feature of cache.get(oldest)!.features) cachedVertices -= feature.geometry.coordinates.length
              cache.delete(oldest)
            }
            if (!cache.has(key)) {
              cache.set(key, data)
              cachedVertices += vertices
            }
          }
          resolve(data)
        },
        reject: (error) => {
          cleanup()
          reject(error)
        },
      })
      try {
        if (!worker) {
          worker = new Worker(new URL('./common-routes.worker.ts', import.meta.url), { type: 'module' })
          worker.onmessage = (event: MessageEvent<{ id: number; data?: PackedRoutes; error?: string }>) => {
            busy = false
            const next = queued
            queued = undefined
            const request = pending.get(event.data.id)
            pending.delete(event.data.id)
            if (request) {
              if (event.data.data) request.resolve(unpackRoutes(event.data.data))
              else request.reject(new Error(event.data.error ?? 'comparison_failed'))
            }
            next?.send()
          }
          worker.onerror = () => dispose()
        }
        if (changed) {
          const publicRoutes = packRoutes(activitiesToGeoData(publicActivities)),
            ownRoutes = packRoutes(activitiesToGeoData(ownActivities))
          libraries = [publicActivities, ownActivities]
          busy = true
          worker.postMessage({ id, publicRoutes, ownRoutes, filters }, [
            ...routeTransfers(publicRoutes),
            ...routeTransfers(ownRoutes),
          ])
        } else {
          const send = () => {
            if (!pending.has(id)) return
            busy = true
            worker!.postMessage({ id, filters })
          }
          // Rapid timeline changes replace the waiting query. At most one
          // obsolete computation can be in flight, rather than an unbounded queue.
          if (busy) {
            if (queued) {
              pending.get(queued.id)?.reject(new Error('comparison_cancelled'))
              pending.delete(queued.id)
            }
            queued = { id, send }
          } else send()
        }
      } catch (error) {
        pending.delete(id)
        cleanup()
        dispose()
        reject(error)
      }
    })
  }
  return { run, dispose }
}
