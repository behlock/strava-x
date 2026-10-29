import { sampleRouteHeatmap } from './route-heatmap'
import { unpackRoutes, type PackedRoutes } from './packed-routes'

self.onmessage = (event: MessageEvent<PackedRoutes[]>) => {
  try {
    // Blob clones share immutable bytes. Mapbox fetches/parses their URLs in its
    // worker, avoiding a huge object clone and another main-thread JSON.stringify.
    let remaining = 250_000
    const blobs = event.data.map((source) => {
      const sampled = sampleRouteHeatmap(unpackRoutes(source), remaining)
      remaining -= sampled.features.length
      return new Blob([JSON.stringify(sampled)], { type: 'application/json' })
    })
    self.postMessage({ blobs })
  } catch {
    self.postMessage({ error: 'route sampling unavailable; showing routes' })
  }
}
