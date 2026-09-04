'use client'

import { Suspense } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

import { HEADER_LOGO_CLASS, HeaderBar, HeaderChip } from './header-bar'
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
  onStravaAbortSync: () => void
}

/** Spinner chip beside the logo while activities stream in; click cancels. */
function SyncSpinner({ onCancel }: { onCancel: () => void }) {
  return (
    <HeaderChip
      tooltip="syncing, click to cancel"
      tooltipAlign="start"
      onClick={onCancel}
      aria-label="Cancel Strava sync"
      className="text-panel-muted hover:text-foreground"
    >
      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
    </HeaderChip>
  )
}

function SyncFailed({ message }: { message: string }) {
  return (
    <span
      role="alert"
      title={message}
      aria-label={message}
      className="text-xs-compact tracking-wider text-red-500 dark:text-red-400"
    >
      [!]<span className="ml-1 hidden md:inline">sync failed</span>
    </span>
  )
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
  onStravaAbortSync,
}: HeaderProps) {
  return (
    <HeaderBar
      logo={
        <button type="button" onClick={onLogoClick} className={HEADER_LOGO_CLASS}>
          strava—x
        </button>
      }
      // Errors are not gated on the connection: an expired session sets the
      // error at the same moment it disconnects, and still needs showing.
      status={
        <>
          {isStravaSyncing && <SyncSpinner onCancel={onStravaAbortSync} />}
          {!isStravaSyncing && stravaError && <SyncFailed message={stravaError} />}
        </>
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

      {/* The one primary action; disconnect and theme live in the setup panel. */}
      {hasActivities && <ShareMenu onExport={onExportClick} onPublish={onPublishClick} canPublish={stravaConnected} />}
    </HeaderBar>
  )
}
