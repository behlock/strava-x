import { createRouteComparison } from './common-routes'
import { unpackRoutes, packRoutes, routeTransfers, type PackedRoutes } from './packed-routes'
import type { ComparisonFilters } from './comparison-filters'
import type { Activity } from '@/models/activity'

let compare: ReturnType<typeof createRouteComparison> | undefined
function activities(data: PackedRoutes): Activity[] {
  return unpackRoutes(data).features.map((feature) => ({
    id: feature.properties.id,
    type: feature.properties.type,
    date: new Date(feature.properties.dateTs),
    distance: 0,
    elevationGain: 0,
    feature,
  }))
}
self.onmessage = (
  event: MessageEvent<{
    id: number
    publicRoutes?: PackedRoutes
    ownRoutes?: PackedRoutes
    filters?: ComparisonFilters
  }>,
) => {
  const { id, publicRoutes, ownRoutes, filters } = event.data
  try {
    if (publicRoutes && ownRoutes) compare = createRouteComparison(activities(publicRoutes), activities(ownRoutes))
    if (!compare) throw new Error('comparison_not_initialized')
    const data = packRoutes(compare(filters))
    self.postMessage({ id, data }, { transfer: routeTransfers(data) })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : 'comparison_failed' })
  }
}
