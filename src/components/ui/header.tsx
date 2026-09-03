'use client'

import { Suspense } from 'react'
import { ArrowRight, LogOut } from 'lucide-react'

import { HEADER_LOGO_CLASS, HeaderBar, HeaderChip, ThemeToggle } from './header-bar'
import { ShareMenu } from './share-menu'
import { StravaAuthError } from './strava-auth-error'

interface HeaderProps {
  onLogoClick: () => void
  onExportClick: () => void
  onPublishClick: () => void
  hasActivities: boolean
  stravaAvailable: boolean
  stravaConnected: boolean
  isStravaSyncing: boolean
  stravaError: string | null
  onStravaConnect: () => void
  onStravaDisconnect: () => void
  onStravaAbortSync: () => void
}

export function Header({
  onLogoClick,
  onExportClick,
  onPublishClick,
  hasActivities,
  stravaAvailable,
  stravaConnected,
  isStravaSyncing,
  stravaError,
  onStravaConnect,
  onStravaDisconnect,
  onStravaAbortSync,
}: HeaderProps) {
  const disconnectVisible = stravaAvailable && stravaConnected && !isStravaSyncing
  return (
    <HeaderBar
      logo={
        <button type="button" onClick={onLogoClick} className={HEADER_LOGO_CLASS}>
          strava—x
        </button>
      }
    >
      {stravaAvailable && !stravaConnected && (
        <>
          <Suspense fallback={null}>
            <StravaAuthError />
          </Suspense>
          <HeaderChip variant="text" onClick={onStravaConnect} aria-label="Connect Strava">
            <ArrowRight className="size-4" aria-hidden="true" />
            <span className="ml-1.5 hidden md:inline">connect strava</span>
          </HeaderChip>
        </>
      )}

      {hasActivities && <ShareMenu onExport={onExportClick} onPublish={onPublishClick} canPublish={stravaConnected} />}

      {stravaAvailable && stravaConnected && isStravaSyncing && (
        <HeaderChip variant="text" onClick={onStravaAbortSync} aria-label="Cancel Strava sync">
          […]<span className="ml-1 hidden md:inline">syncing</span>
        </HeaderChip>
      )}

      {stravaAvailable && stravaConnected && !isStravaSyncing && stravaError && (
        <span
          role="alert"
          className="inline-flex h-8 items-center px-2 text-xs-compact tracking-wider text-red-500 dark:text-red-400"
          aria-label={stravaError}
          title={stravaError}
        >
          [!]<span className="ml-1 hidden md:inline">sync failed</span>
        </span>
      )}

      <ThemeToggle tooltipAlign={disconnectVisible ? 'center' : 'end'} />

      {/* Disconnect sits far-right so it's out of the primary flow — users are
          less likely to hit it by accident while reaching for sync/publish/export. */}
      {disconnectVisible && (
        <HeaderChip tooltip="disconnect" tooltipAlign="end" onClick={onStravaDisconnect} aria-label="Disconnect Strava">
          <LogOut className="size-4" />
        </HeaderChip>
      )}
    </HeaderBar>
  )
}
