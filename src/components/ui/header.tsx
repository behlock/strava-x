'use client'

import { Suspense } from 'react'
import { Download, Locate, LogOut, Share2 } from 'lucide-react'

import { HEADER_LOGO_CLASS, HeaderBar, HeaderChip, ThemeToggle } from './header-bar'
import { StravaAuthError } from './strava-auth-error'

interface HeaderProps {
  onLogoClick: () => void
  onLocateClick: () => void
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
  onLocateClick,
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
  return (
    <HeaderBar
      logo={
        <button type="button" onClick={onLogoClick} className={HEADER_LOGO_CLASS}>
          strava—x
        </button>
      }
    >
      <HeaderChip tooltip="my location" onClick={onLocateClick} aria-label="Recenter on my location">
        <Locate className="size-4" />
      </HeaderChip>

      {hasActivities && (
        <HeaderChip tooltip="export" onClick={onExportClick} aria-label="Export">
          <Download className="size-4" />
        </HeaderChip>
      )}

      {hasActivities && stravaConnected && (
        <HeaderChip tooltip="publish" onClick={onPublishClick} aria-label="Publish map">
          <Share2 className="size-4" />
        </HeaderChip>
      )}

      {stravaAvailable && stravaConnected && isStravaSyncing && (
        <HeaderChip variant="text" onClick={onStravaAbortSync} aria-label="Cancel Strava sync">
          […]<span className="hidden md:inline">—syncing</span>
        </HeaderChip>
      )}

      {stravaAvailable && stravaConnected && !isStravaSyncing && stravaError && (
        <span
          role="alert"
          className="inline-flex h-8 items-center px-2 text-xs-compact tracking-wider text-red-500 dark:text-red-400"
          aria-label={stravaError}
          title={stravaError}
        >
          [!]<span className="hidden md:inline">—sync failed</span>
        </span>
      )}

      {stravaAvailable && !stravaConnected && (
        <>
          <Suspense fallback={null}>
            <StravaAuthError />
          </Suspense>
          <HeaderChip variant="text" onClick={onStravaConnect} aria-label="Connect Strava">
            [→]<span className="hidden md:inline">—connect strava</span>
          </HeaderChip>
        </>
      )}

      <ThemeToggle />

      {/* Disconnect sits far-right so it's out of the primary flow — users are
          less likely to hit it by accident while reaching for sync/publish/export. */}
      {stravaAvailable && stravaConnected && !isStravaSyncing && (
        <HeaderChip tooltip="disconnect" tooltipAlign="end" onClick={onStravaDisconnect} aria-label="Disconnect Strava">
          <LogOut className="size-4" />
        </HeaderChip>
      )}
    </HeaderBar>
  )
}
