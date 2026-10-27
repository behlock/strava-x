import { findCommonRoutes } from './common-routes'
import type { Activity } from '@/models/activity'

self.onmessage = (event: MessageEvent<{ publicActivities: Activity[]; ownActivities: Activity[] }>) => {
  try {
    self.postMessage({ data: findCommonRoutes(event.data.publicActivities, event.data.ownActivities) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'comparison_failed' })
  }
}
