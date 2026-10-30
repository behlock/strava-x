import type { Metadata } from 'next'
import { MapsBackground } from '@/components/maps-background'
import { SITE_NAME } from '@/lib/site'
import { config } from '@/lib/config'
import { notFound } from 'next/navigation'
export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: `maps · ${SITE_NAME}` }

export default function MapsPage() {
  if (!config.COMMUNITY_DIRECTORY) notFound()
  return <MapsBackground />
}
