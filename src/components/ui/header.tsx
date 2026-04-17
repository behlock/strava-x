'use client'

import { ReactNode } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun, Download, Share2, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMounted } from '@/hooks/use-mounted'
import { Tooltip } from './tooltip'

interface HeaderProps {
  className?: string
  onExportClick?: () => void
  onLogoClick?: () => void
  onPublishClick?: () => void
  hasActivities?: boolean
  stravaAvailable?: boolean
  stravaConnected?: boolean
  isStravaSyncing?: boolean
  stravaError?: string | null
  onStravaConnect?: () => void
  onStravaDisconnect?: () => void
  onStravaAbortSync?: () => void
}

const CHIP_BASE =
  'inline-flex items-center justify-center text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-panel-border rounded-sm whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed'
const CHIP_TEXT = `${CHIP_BASE} min-h-[44px] px-3 md:min-h-0 md:h-8 md:px-2`
const CHIP_ICON = `${CHIP_BASE} min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 md:h-8 md:w-8`

export function Header({
  className,
  onExportClick,
  onLogoClick,
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
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()
  const isDark = mounted && theme === 'dark'
  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  const stravaStatus = stravaError
    ? { icon: '[!]', label: '—sync failed' }
    : isStravaSyncing
      ? { icon: '[…]', label: '—syncing' }
      : { icon: '[↻]', label: '—sync strava' }

  const chips: ReactNode[] = []

  if (stravaAvailable && stravaConnected) {
    if (isStravaSyncing) {
      chips.push(
        <button key="strava-status" onClick={onStravaAbortSync} className={CHIP_TEXT} aria-label="Cancel Strava sync">
          {stravaStatus.icon}
          <span className="hidden md:inline">{stravaStatus.label}</span>
        </button>,
      )
    } else if (stravaError) {
      chips.push(
        <span
          key="strava-status"
          className="inline-flex items-center text-xs-compact tracking-wider px-2 h-8 text-red-500 dark:text-red-400"
          aria-label="Strava sync failed"
        >
          {stravaStatus.icon}
          <span className="hidden md:inline">{stravaStatus.label}</span>
        </span>,
      )
    }
  }

  if (stravaAvailable && !stravaConnected) {
    chips.push(
      <button key="strava-connect" onClick={onStravaConnect} className={CHIP_TEXT} aria-label="Connect Strava">
        [→]<span className="hidden md:inline">—connect strava</span>
      </button>,
    )
  }

  if (hasActivities && onPublishClick && stravaConnected) {
    chips.push(
      <Tooltip key="publish" text="publish map">
        <button onClick={onPublishClick} aria-label="Publish map" className={CHIP_ICON}>
          <Share2 className="w-4 h-4" />
        </button>
      </Tooltip>,
    )
  }

  if (hasActivities) {
    chips.push(
      <Tooltip key="export" text="export image">
        <button onClick={onExportClick} aria-label="Export" className={CHIP_ICON}>
          <Download className="w-4 h-4" />
        </button>
      </Tooltip>,
    )
  }

  chips.push(
    <Tooltip key="theme" text={isDark ? 'light mode' : 'dark mode'} disabled={!mounted}>
      <button
        onClick={toggleTheme}
        disabled={!mounted}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className={CHIP_ICON}
      >
        {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
    </Tooltip>,
  )

  // Disconnect sits far-right so it's out of the primary flow — users are less
  // likely to hit it by accident while reaching for sync/publish/export.
  if (stravaAvailable && stravaConnected && !isStravaSyncing) {
    chips.push(
      <Tooltip key="strava-disconnect" text="disconnect strava" align="end">
        <button onClick={onStravaDisconnect} className={CHIP_ICON} aria-label="Disconnect Strava">
          <LogOut className="w-4 h-4" />
        </button>
      </Tooltip>,
    )
  }

  return (
    <header
      className={cn(
        'flex items-center justify-between px-4 py-3 bg-panel/90 panel-blur border-b border-panel-border',
        className,
      )}
    >
      <button
        onClick={onLogoClick}
        className="text-base-compact font-medium tracking-tight hover:opacity-70 transition-opacity"
      >
        strava—x
      </button>

      <div className="flex items-center gap-1">{chips}</div>
    </header>
  )
}
