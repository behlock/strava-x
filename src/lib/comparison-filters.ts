import type { Activity } from '@/models/activity'

export interface ComparisonFilters {
  types: string[]
  cutoff: number | null
}

export function filterComparisonActivities(activities: Activity[], filters: ComparisonFilters): Activity[] {
  return activities.filter(
    (activity) =>
      filters.types.includes(activity.type || 'unknown') &&
      (filters.cutoff === null || (activity.date?.getTime() ?? 0) <= filters.cutoff),
  )
}
