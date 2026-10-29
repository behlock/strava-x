import { cache } from 'react'
import { preload } from 'react-dom'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PublicMapView } from '@/components/public-map-view'
import { findShareBySlug } from '@/lib/sharing-db'
import { SITE_NAME } from '@/lib/site'
import { validateSlug } from '@/lib/slug'
import { loadLocalMap } from '@/lib/local-map'

// Public access is checked against the live sharing record on every request.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Deduped per request between generateMetadata and the page.
const lookup = cache(async (rawSlug: string) => {
  const result = validateSlug(rawSlug)
  if (!result.ok) return null
  const local = await loadLocalMap(result.slug)
  if (local) return { slug: result.slug, displayName: result.slug, activityCount: local.activities.length }
  const row = await findShareBySlug(result.slug)
  return row?.snapshot_path
    ? { slug: row.slug, displayName: row.athlete_display_name ?? row.slug, activityCount: row.activity_count }
    : null
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row) return { title: `${SITE_NAME} · Not found` }
  return {
    title: `${SITE_NAME} · ${row.slug}`,
    description: `${row.displayName}'s map of ${row.activityCount} Strava activities`,
  }
}

export default async function PublicMapPage({ params }: PageProps) {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row) notFound()

  const blobUrl = `/api/maps/${encodeURIComponent(slug)}`
  preload(`${blobUrl}?view=render`, { as: 'fetch', crossOrigin: 'anonymous' })

  return <PublicMapView key={slug} slug={slug} blobUrl={blobUrl} />
}
