'use client'

import Link from 'next/link'

import { useStravaAuth } from '@/hooks/use-strava-auth'
import { useStravaProfile } from '@/hooks/use-strava-profile'
import { SITE_NAME } from '@/lib/site'
import { HeaderBar, HEADER_LOGO_CLASS } from '@/components/ui/header-bar'
import { MapView } from '@/components/map-view'

export function MapsBackground() {
  const { isConnected, getAccessToken, disconnect } = useStravaAuth()
  const profile = useStravaProfile(isConnected, getAccessToken)

  return (
    <div data-maps-background>
      <MapView
        activities={[]}
        header={
          <HeaderBar
            framedLogo
            logo={
              <Link href="/" className={HEADER_LOGO_CLASS}>
                {SITE_NAME}
              </Link>
            }
            showProfileMenu={isConnected}
            profilePhotoUrl={profile?.photoUrl}
            onDisconnect={isConnected ? disconnect : undefined}
          />
        }
      />
    </div>
  )
}
