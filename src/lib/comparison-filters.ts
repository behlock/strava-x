export interface ComparisonFilters {
  types: string[]
  cutoff: number | null
}

export function comparisonFilterKey(filters?: ComparisonFilters): string {
  return filters ? JSON.stringify([[...new Set(filters.types)].sort(), filters.cutoff]) : 'all'
}
