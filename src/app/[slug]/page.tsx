import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

import { findBySlug } from '@/lib/db'
import { validateSlug } from '@/lib/slug'
import { PublicMapView } from '@/components/public-map-view'

// Cache the DB lookup per-request; the actual activity payload is served
// directly from Vercel Blob's CDN so this page stays cheap.
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

async function lookup(rawSlug: string) {
  const result = validateSlug(rawSlug)
  if (!result.ok) return null
  return findBySlug(result.slug)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row) return { title: 'Not found — strava—x' }
  const who = row.athlete_display_name ?? row.slug
  return {
    title: `${who} — strava—x`,
    description: `${who}'s heatmap of ${row.activity_count} Strava activities.`,
  }
}

export default async function PublicMapPage({ params }: PageProps) {
  const { slug } = await params
  const row = await lookup(slug)
  if (!row) notFound()

  return <PublicMapView slug={row.slug} blobUrl={row.blob_url} displayName={row.athlete_display_name} />
}
