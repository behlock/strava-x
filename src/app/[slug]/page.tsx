import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { PublicMapView } from '@/components/public-map-view'
import { findBySlug } from '@/lib/db'
import { SITE_NAME } from '@/lib/site'
import { validateSlug } from '@/lib/slug'

// Always hit the database; the activity payload itself is served from
// Vercel Blob's CDN so this page stays cheap.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Deduped per request between generateMetadata and the page.
const lookup = cache(async (rawSlug: string) => {
  const result = validateSlug(rawSlug)
  return result.ok ? findBySlug(result.slug) : null
})

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row) return { title: `Not found • ${SITE_NAME}` }
  const who = row.athlete_display_name ?? row.slug
  return {
    title: `${who} • ${SITE_NAME}`,
    description: `${who}'s map of ${row.activity_count} Strava activities`,
  }
}

export default async function PublicMapPage({ params }: PageProps) {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row) notFound()

  return <PublicMapView slug={row.slug} blobUrl={row.blob_url} displayName={row.athlete_display_name} />
}
