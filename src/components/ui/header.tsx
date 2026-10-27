'use client'

import { type ReactNode, Suspense } from 'react'

import { HEADER_LOGO_CLASS, HeaderBar } from './header-bar'
import { StravaAuthError } from './strava-auth-error'
import { Tooltip } from './tooltip'

interface HeaderProps {
  onLogoClick: () => void
  sharingControls: ReactNode
  mapUpdateError: string | null
  sharingAvailable: boolean
  hasActivities: boolean
  stravaAvailable: boolean
  stravaConnected: boolean
  profilePhotoUrl?: string | null
  isStravaSyncing: boolean
  stravaError: string | null
  onStravaConnect?: () => void
  onStravaDisconnect: () => void
}

function SyncFailed({ message, label = 'sync failed' }: { message: string; label?: string }) {
  return (
    <Tooltip text={message}>
      <span
        role="alert"
        tabIndex={0}
        aria-label={message}
        className="text-xs-compact tracking-wider text-red-500 dark:text-red-400"
      >
        [!]<span className="ml-1 hidden md:inline">{label}</span>
      </span>
    </Tooltip>
  )
}

export function Header({
  onLogoClick,
  sharingControls,
  mapUpdateError,
  sharingAvailable,
  hasActivities,
  stravaAvailable,
  stravaConnected,
  profilePhotoUrl,
  isStravaSyncing,
  stravaError,
  onStravaConnect,
  onStravaDisconnect,
}: HeaderProps) {
  const showSharing = (hasActivities || isStravaSyncing) && stravaConnected
  return (
    <HeaderBar
      profilePhotoUrl={stravaConnected ? profilePhotoUrl : null}
      onConnect={stravaAvailable && !stravaConnected ? onStravaConnect : undefined}
      onDisconnect={stravaConnected ? onStravaDisconnect : undefined}
      logo={
        <button type="button" onClick={onLogoClick} className={HEADER_LOGO_CLASS}>
          strava—x
        </button>
      }
      // Errors are not gated on the connection: an expired session sets the
      // error at the same moment it disconnects, and still needs showing.
      status={
        <>
          {!isStravaSyncing && stravaError && <SyncFailed message={stravaError} />}
          {!stravaError && !sharingAvailable ? (
            <Tooltip text="public sharing is unavailable; your personal map is loaded">
              <span tabIndex={0} className="text-xs-compact tracking-wider text-panel-muted">
                sharing unavailable
              </span>
            </Tooltip>
          ) : !stravaError && mapUpdateError ? (
            <SyncFailed message={mapUpdateError} label="update failed" />
          ) : null}
        </>
      }
    >
      {stravaAvailable && !stravaConnected && (
        <Suspense fallback={null}>
          <StravaAuthError />
        </Suspense>
      )}

      {showSharing && sharingControls}
    </HeaderBar>
  )
}
