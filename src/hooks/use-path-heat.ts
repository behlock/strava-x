'use client'

import { useEffect, useState } from 'react'
import type { ActivityFeatureCollection } from '@/models/activity'
import { packRoutes, routeTransfers } from '@/lib/packed-routes'
import type { HeatFilter, HeatTileCoordinate } from '@/lib/path-heat'
import type { HeatRenderRequest, HeatRenderResponse } from '@/lib/path-heat.worker'

interface HeatImage {
  coordinate: HeatTileCoordinate
  url: string
}

export function usePathHeat(
  data: ActivityFeatureCollection,
  tiles: HeatTileCoordinate[],
  filter: HeatFilter,
  dark: boolean,
  enabled: boolean,
) {
  const [result, setResult] = useState<{
    contentKey: string
    data: ActivityFeatureCollection
    images: HeatImage[]
  } | null>(null)
  // Camera changes may reuse the previous heat; data/filter/theme changes may not.
  const contentKey = JSON.stringify([filter, dark, enabled])
  const key = JSON.stringify([tiles, contentKey])
  // Images belong to the displayed result, not to the request that produced it.
  useEffect(
    () => () => {
      result?.images.forEach(({ url }) => URL.revokeObjectURL(url))
    },
    [result],
  )
  useEffect(() => {
    if (!enabled || !tiles.length || !data.features.length) return
    let live = true
    let worker: Worker | undefined
    // Debounce slider/viewport changes. Cleanup terminates obsolete raster work.
    const timer = setTimeout(() => {
      const fail = () => {
        if (live) setResult({ contentKey, data, images: [] })
        worker?.terminate()
      }
      try {
        const vertices = data.features.reduce((count, feature) => count + feature.geometry.coordinates.length, 0)
        if (vertices > 2_000_000) {
          fail()
          return
        }
        worker = new Worker(new URL('../lib/path-heat.worker.ts', import.meta.url), { type: 'module' })
        worker.onerror = fail
        worker.onmessage = (event: MessageEvent<HeatRenderResponse>) => {
          if (!live) return
          if ('error' in event.data) {
            fail()
            return
          }
          const images = event.data.images.map(({ coordinate, blob }) => ({
            coordinate,
            url: URL.createObjectURL(blob),
          }))
          setResult({ contentKey, data, images })
          worker?.terminate()
        }
        const routes = packRoutes(data)
        worker.postMessage({ routes, tiles, filter, dark } satisfies HeatRenderRequest, routeTransfers(routes))
      } catch {
        fail()
      }
    }, 120)
    return () => {
      live = false
      clearTimeout(timer)
      worker?.terminate()
    }
    // key includes the complete serialisable request, avoiding work for equal arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, key])
  const current = enabled && result?.contentKey === contentKey && result.data === data ? result : null
  return { images: current?.images ?? [] }
}
