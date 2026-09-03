'use client'

import { Suspense } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'

import { HEADER_LOGO_CLASS, HeaderBar, HeaderChip } from './header-bar'
import { ShareMenu } from './share-menu'
import { StravaAuthError } from './strava-auth-error'
import { Tooltip } from './tooltip'

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

/** Small spinner beside the logo while activities stream in; click cancels. */
function SyncSpinner({ onCancel }: { onCancel: () => void }) {
  return (
    <Tooltip text="syncing, click to cancel" align="start">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancel Strava sync"
        className="flex size-6 items-center justify-center text-panel-muted transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-hidden"
      >
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      </button>
    </Tooltip>
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
  const connected = stravaAvailable && stravaConnected
  return (
    <HeaderBar
      logo={
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onLogoClick} className={HEADER_LOGO_CLASS}>
            strava—x
          </button>
          {connected && isStravaSyncing && <SyncSpinner onCancel={onStravaAbortSync} />}
          {connected && !isStravaSyncing && stravaError && <SyncFailed message={stravaError} />}
        </div>
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
      {hasActivities && (
        <ShareMenu
          onExport={onExportClick}
          onPublish={onPublishClick}
          canPublish={stravaConnected}
          tooltipAlign="end"
        />
      )}
    </HeaderBar>
  )
}
