'use client'

import { useEffect, useRef, useState } from 'react'
import type { ActivityFeatureCollection } from '@/models/activity'
import type { RouteHeatmaps, RouteHeatmapSources } from '@/lib/route-heatmap'
import { packRoutes, routeTransfers } from '@/lib/packed-routes'

/** Prepare after first paint; retain a bounded set of worker-readable sources. */
export function useRouteHeatmap(sources: RouteHeatmapSources | null, enabled: boolean) {
  const cache = useRef(new Map<ActivityFeatureCollection, { url: string; bytes: number }>())
  const [result, setResult] = useState<{ sources: RouteHeatmapSources; data?: RouteHeatmaps; error?: string } | null>(
    null,
  )
  const current = result?.sources === sources ? result : null
  useEffect(
    () => () => {
      for (const { url } of cache.current.values()) URL.revokeObjectURL(url)
      cache.current.clear()
    },
    [],
  )
  useEffect(() => {
    if (!sources || current) return
    let live = true
    let worker: Worker | undefined
    const start = () => {
      if (worker || !live) return
      if (document.visibilityState === 'hidden' && !enabled) return

      const missing = [...new Set(Object.values(sources))].filter((source) => !cache.current.has(source))
      const complete = () => {
        if (!live) return
        const data = Object.fromEntries(
          Object.entries(sources).map(([role, source]) => [role, cache.current.get(source)!.url]),
        ) as RouteHeatmaps
        setResult({ sources, data })
      }
      if (!missing.length) {
        complete()
        return
      }
      const fail = () => {
        if (live) setResult({ sources, error: 'route sampling unavailable; showing routes' })
        worker?.terminate()
      }
      try {
        worker = new Worker(new URL('../lib/route-heatmap.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<{ blobs?: Blob[] }>) => {
          const blobs = event.data.blobs
          if (live && blobs?.length === missing.length) {
            const currentSources = new Set(Object.values(sources))
            const incomingBytes = blobs.reduce((n, blob) => n + blob.size, 0)
            const retainedBytes = [...cache.current].reduce(
              (n, [source, entry]) => n + (currentSources.has(source) ? entry.bytes : 0),
              0,
            )
            if (incomingBytes + retainedBytes > 64 * 1024 * 1024) {
              fail()
              return
            }
            let total = incomingBytes + [...cache.current.values()].reduce((n, entry) => n + entry.bytes, 0)
            for (const [source, entry] of cache.current) {
              if (total <= 64 * 1024 * 1024 && cache.current.size + missing.length <= 6) break
              if (currentSources.has(source)) continue
              URL.revokeObjectURL(entry.url)
              cache.current.delete(source)
              total -= entry.bytes
            }
            blobs.forEach((blob, i) =>
              cache.current.set(missing[i], { url: URL.createObjectURL(blob), bytes: blob.size }),
            )
            complete()
          } else fail()
          worker?.terminate()
        }
        worker.onerror = fail
        const packed = missing.map(packRoutes)
        worker.postMessage(packed, packed.flatMap(routeTransfers))
      } catch {
        queueMicrotask(fail)
      }
    }
    // A selected mode starts immediately. Speculation waits until the initial
    // render has had time to settle; it is cancelled when the library changes.
    const timer = setTimeout(start, enabled ? 0 : 1200)
    const visible = () => {
      if (document.visibilityState === 'visible' && !worker) start()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      live = false
      clearTimeout(timer)
      worker?.terminate()
      document.removeEventListener('visibilitychange', visible)
    }
  }, [sources, enabled, current])
  return { data: current?.data, error: current?.error, loading: enabled && Boolean(sources) && !current }
}
