export type MapsSort = 'map' | 'activities' | 'city'
export type MapsOrder = 'asc' | 'desc'

export function mapsPageHref(sort: MapsSort, order: MapsOrder, page = 1): string {
  return `/maps?sort=${sort}&order=${order}${page > 1 ? `&page=${page}` : ''}`
}

export interface MapsPageProps {
  searchParams: Promise<{ page?: string | string[]; sort?: string; order?: string }>
}
