'use client'

import { type ButtonHTMLAttributes, type ReactNode, type Ref, useContext } from 'react'
import { ArrowRight, PanelLeft } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Tooltip, type TooltipAlign } from './tooltip'
import { ProfileMenu } from './profile-menu'
import { ThemeSwitch } from './theme-switch'
import { SidebarContext } from './sidebar-context'
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut'
import { SHORTCUTS } from '@/lib/keyboard-shortcuts'

/** Class for the brand mark on the far left; the element differs per page (button vs link). */
export const HEADER_LOGO_CLASS =
  'inline-flex min-h-11 shrink-0 items-center md:min-h-0 rounded-lg text-lg-compact md:text-base-compact font-medium tracking-tight md:-translate-y-px whitespace-nowrap transition-opacity hover:opacity-70'

interface HeaderBarProps {
  logo: ReactNode
  /** Status messages shown beside the logo. */
  status?: ReactNode
  /** Action chips, rendered right-aligned. */
  children?: ReactNode
  className?: string
  onConnect?: () => void
  onDisconnect?: () => void
  profilePhotoUrl?: string | null
  profileControls?: ReactNode
  showProfileMenu?: boolean
}

export function HeaderBar({
  logo,
  status,
  children,
  className,
  onConnect,
  onDisconnect,
  profilePhotoUrl,
  profileControls,
  showProfileMenu = Boolean(onDisconnect),
}: HeaderBarProps) {
  const sidebar = useContext(SidebarContext)
  useKeyboardShortcut('toggle-ui', () => sidebar?.toggle(), Boolean(sidebar))
  return (
    <header
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top, 0px))',
        paddingLeft: 'max(1rem, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(1rem, env(safe-area-inset-right, 0px))',
      }}
      className={cn(
        'flex items-center justify-between gap-2 bg-linear-to-b from-background/90 to-transparent px-4 py-3',
        className,
      )}
    >
      <div
        className={cn(
          'flex min-w-0 items-center gap-3',
          sidebar && !sidebar.mobile && 'justify-between rounded-xl border border-panel-border bg-panel px-3 py-1.5',
          sidebar && !sidebar.mobile && 'w-56 lg:w-64 xl:w-72',
        )}
      >
        <div className="flex min-w-0 items-center gap-3">
          {logo}
          {status}
        </div>
        {sidebar && !sidebar.mobile && (
          <Tooltip text={sidebar.open ? 'hide sidebar' : 'show sidebar'}>
            <button
              type="button"
              aria-label={sidebar.open ? 'Hide sidebar' : 'Show sidebar'}
              aria-keyshortcuts={SHORTCUTS['toggle-ui'].aria}
              aria-expanded={sidebar.open}
              aria-controls={sidebar.controlsId}
              onClick={sidebar.toggle}
              className="mobile-touch-target flex size-8 shrink-0 items-center justify-center rounded-lg focus-ring hover:bg-foreground/5"
            >
              <PanelLeft className="size-4" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {children}
        {onConnect && (
          <button
            type="button"
            onClick={onConnect}
            className="mobile-touch-target inline-flex min-h-8 shrink-0 items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-xs-compact tracking-wider whitespace-nowrap text-background focus-ring transition-colors hover:bg-foreground/85 md:min-h-[35px] md:px-4"
          >
            <ArrowRight className="size-3.5" aria-hidden="true" />
            connect strava
          </button>
        )}
        {showProfileMenu ? (
          <ProfileMenu onDisconnect={onDisconnect} profilePhotoUrl={profilePhotoUrl}>
            {profileControls}
          </ProfileMenu>
        ) : (
          <ThemeSwitch />
        )}
      </div>
    </header>
  )
}

const CHIP_BASE =
  'focus-ring floating-control mobile-touch-target inline-flex items-center justify-center rounded-lg text-xs-compact tracking-wider whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50'
const CHIP_ICON = 'size-8'
const CHIP_TEXT = 'min-h-8 px-3 md:px-2'

interface HeaderChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon chips are square; text chips size to their label. */
  variant?: 'icon' | 'text'
  tooltip?: string
  tooltipAlign?: TooltipAlign
  /**
   * Suppress the tooltip without changing the rendered tree (e.g. while a
   * menu is open). Toggling `tooltip` itself would remount the button.
   */
  tooltipHidden?: boolean
  tooltipWhenDisabled?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function HeaderChip({
  variant = 'icon',
  tooltip,
  tooltipAlign,
  tooltipHidden = false,
  tooltipWhenDisabled = false,
  className,
  ...props
}: HeaderChipProps) {
  const button = (
    <button type="button" className={cn(CHIP_BASE, variant === 'icon' ? CHIP_ICON : CHIP_TEXT, className)} {...props} />
  )
  if (!tooltip) return button
  return (
    <Tooltip text={tooltip} align={tooltipAlign} disabled={tooltipHidden || (props.disabled && !tooltipWhenDisabled)}>
      {button}
    </Tooltip>
  )
}
