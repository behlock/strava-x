import type { MapsPageProps } from '@/lib/maps-sort'
import { config } from '@/lib/config'
import { notFound } from 'next/navigation'
import { MapsContent } from '@/components/maps-content'
import { MapsOverlay } from '@/components/maps-overlay'
export const dynamic = 'force-dynamic'
export default function MapsModal(props: MapsPageProps) {
  if (!config.COMMUNITY_DIRECTORY) notFound()
  return (
    <MapsOverlay intercepted>
      <MapsContent {...props} />
    </MapsOverlay>
  )
}
