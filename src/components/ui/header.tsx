'use client'

import { Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'

import { HEADER_LOGO_CLASS, HeaderBar } from './header-bar'
import { StravaAuthError } from './strava-auth-error'
import { Tooltip } from './tooltip'

interface HeaderProps {
  onLogoClick: () => void
  onPublishClick: () => void
  currentSlug: string | null
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
  onPublishClick,
  currentSlug,
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
  const publishControl =
    (hasActivities || isStravaSyncing) && stravaConnected ? (
      <Tooltip text={isStravaSyncing ? 'syncing activities' : 'sharing'}>
        <button
          type="button"
          onClick={onPublishClick}
          disabled={isStravaSyncing}
          aria-busy={isStravaSyncing}
          aria-label={isStravaSyncing ? 'Syncing activities' : currentSlug ? `Sharing for /${currentSlug}` : 'Sharing'}
          className="mobile-touch-target relative inline-flex min-h-8 max-w-[46vw] items-center justify-center rounded-lg floating-control px-2.5 text-xs-compact tracking-wider text-foreground focus-ring disabled:cursor-wait md:min-h-[35px] md:max-w-xs md:px-4"
        >
          <span className={isStravaSyncing ? 'invisible truncate' : 'truncate'}>
            {currentSlug ? `/${currentSlug}` : 'sharing'}
          </span>
          {isStravaSyncing && <LoaderCircle className="absolute size-4 motion-safe:animate-spin" aria-hidden="true" />}
        </button>
      </Tooltip>
    ) : null
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

      {publishControl}
    </HeaderBar>
  )
}
