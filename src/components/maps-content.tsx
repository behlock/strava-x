import type { MapsPageProps } from '@/lib/maps-sort'
import { mapsPageHref } from '@/lib/maps-sort'
import { MapsList } from '@/components/maps-list'
import Link from 'next/link'
import { ArrowLeft, ArrowRight } from 'lucide-react'

import { listPublishedMaps } from '@/lib/published-maps-list'

const PAGE_SIZE = 24

export async function MapsContent({ searchParams }: MapsPageProps) {
  const query = await searchParams
  const raw = query.page
  const sort = query.sort === 'map' || query.sort === 'city' ? query.sort : 'activities'
  const order = query.order === 'asc' ? 'asc' : 'desc'
  const page = typeof raw === 'string' && /^\d{1,6}$/.test(raw) ? Math.max(1, Number(raw)) : 1
  let maps: Awaited<ReturnType<typeof listPublishedMaps>> = []
  let unavailable = false
  try {
    maps = await listPublishedMaps((page - 1) * PAGE_SIZE, PAGE_SIZE + 1, sort, order)
  } catch {
    unavailable = true
  }
  const hasNext = maps.length > PAGE_SIZE
  return (
    <div className="p-8 md:p-10">
      <h1 className="sr-only">published maps</h1>
      {unavailable ? (
        <div role="status" className="py-24 text-center text-sm-compact text-panel-muted">
          <p>maps couldn&apos;t be loaded</p>
          <Link href="/maps" className="mt-4 inline-block rounded-lg underline focus-ring">
            try again
          </Link>
        </div>
      ) : maps.length === 0 ? (
        <p className="py-24 text-center text-sm-compact text-panel-muted">
          {page === 1 ? 'no published maps yet' : 'no more maps'}
        </p>
      ) : (
        <MapsList maps={maps.slice(0, PAGE_SIZE)} sort={sort} order={order} />
      )}
      {!unavailable && (page > 1 || hasNext) && (
        <nav
          aria-label="Map pages"
          className="mt-6 flex items-center justify-between border-t border-panel-border/40 pt-3 text-xs-compact text-panel-muted"
        >
          <span className="tabular-nums">
            <span className="sr-only">Page {page}</span>
            <span aria-hidden="true">{String(page).padStart(3, '0')}</span>
          </span>
          <div className="flex items-center gap-1">
            {page > 1 && (
              <Link
                replace
                href={mapsPageHref(sort, order, page - 1)}
                aria-label="Previous page"
                className="flex size-11 items-center justify-center rounded-lg focus-ring transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <ArrowLeft aria-hidden="true" className="size-4" />
              </Link>
            )}
            {hasNext && (
              <Link
                replace
                href={mapsPageHref(sort, order, page + 1)}
                aria-label="Next page"
                className="flex size-11 items-center justify-center rounded-lg focus-ring transition-colors hover:bg-foreground/5 hover:text-foreground"
              >
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  )
}
