import { cache } from 'react'
import { preload } from 'react-dom'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PublicMapView } from '@/components/public-map-view'
import { findShareBySlug } from '@/lib/sharing-db'
import { SITE_NAME } from '@/lib/site'
import { validateSlug } from '@/lib/slug'

// Public access is checked against the live sharing record on every request.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Deduped per request between generateMetadata and the page.
const lookup = cache(async (rawSlug: string) => {
  const result = validateSlug(rawSlug)
  return result.ok ? findShareBySlug(result.slug) : null
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row?.snapshot_path) return { title: `${SITE_NAME} · Not found` }
  const who = row.athlete_display_name ?? row.slug
  return {
    title: `${SITE_NAME} · ${row.slug}`,
    description: `${who}'s map of ${row.activity_count} Strava activities`,
  }
}

export default async function PublicMapPage({ params }: PageProps) {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row?.snapshot_path) notFound()

  const blobUrl = `/api/maps/${encodeURIComponent(slug)}`
  preload(blobUrl, { as: 'fetch', crossOrigin: 'anonymous' })

  return <PublicMapView key={slug} slug={slug} blobUrl={blobUrl} />
}
