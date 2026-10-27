'use client'

import { useEffect, useState } from 'react'
import type { RouteHeatmaps, RouteHeatmapSources } from '@/lib/route-heatmap'

/** Only sample when requested; reuse points across palette, filter and mode changes. */
export function useRouteHeatmap(sources: RouteHeatmapSources | null, enabled: boolean) {
  const [result, setResult] = useState<{ sources: RouteHeatmapSources; data?: RouteHeatmaps; error?: string } | null>(
    null,
  )
  const current = result?.sources === sources ? result : null
  useEffect(() => {
    if (!enabled || !sources || current) return
    let live = true
    let worker: Worker | undefined
    const fail = () => {
      if (live) setResult({ sources, error: 'hotspots unavailable; showing routes' })
      worker?.terminate()
    }
    try {
      worker = new Worker(new URL('../lib/route-heatmap.worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (event: MessageEvent<{ data?: RouteHeatmaps; error?: string }>) => {
        if (live) setResult({ sources, ...event.data })
        worker?.terminate()
      }
      worker.onerror = fail
      worker.postMessage(sources)
    } catch {
      // Report asynchronously, just like worker completion.
      queueMicrotask(fail)
    }
    return () => {
      live = false
      worker?.terminate()
    }
  }, [sources, enabled, current])
  return { data: current?.data, error: current?.error, loading: enabled && Boolean(sources) && !current }
}
