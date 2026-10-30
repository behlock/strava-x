import type { MapsPageProps } from '@/lib/maps-sort'
import { config } from '@/lib/config'
import { MapsContent } from '@/components/maps-content'
import { MapsOverlay } from '@/components/maps-overlay'
export const dynamic = 'force-dynamic'
export default function MapsModal(props: MapsPageProps) {
  if (!config.COMMUNITY_DIRECTORY) return null
  return (
    <MapsOverlay>
      <MapsContent {...props} />
    </MapsOverlay>
  )
}
