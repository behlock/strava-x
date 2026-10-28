import { sampleRouteHeatmap, type RouteHeatmapSources } from './route-heatmap'

self.onmessage = (event: MessageEvent<RouteHeatmapSources>) => {
  try {
    const { own, other, overlap } = event.data
    self.postMessage({
      data: {
        own: sampleRouteHeatmap(own),
        other: sampleRouteHeatmap(other),
        overlap: sampleRouteHeatmap(overlap),
      },
    })
  } catch {
    self.postMessage({ error: 'route sampling unavailable; showing routes' })
  }
}
