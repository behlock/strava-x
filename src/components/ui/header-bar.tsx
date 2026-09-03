'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'
import { useMounted } from '@/hooks/use-mounted'
import { Tooltip } from './tooltip'

/** Class for the brand mark on the far left; the element differs per page (button vs link). */
export const HEADER_LOGO_CLASS = 'text-base-compact font-medium tracking-tight transition-opacity hover:opacity-70'

interface HeaderBarProps {
  logo: ReactNode
  /** Action chips, rendered right-aligned. */
  children?: ReactNode
  className?: string
}

export function HeaderBar({ logo, children, className }: HeaderBarProps) {
  return (
    <header
      className={cn(
        'flex items-center justify-between border-b border-panel-border bg-panel/90 px-4 py-3 backdrop-blur-md',
        className,
      )}
    >
      {logo}
      <div className="flex items-center gap-1">{children}</div>
    </header>
  )
}

const CHIP_BASE =
  'inline-flex items-center justify-center rounded-sm border border-transparent text-xs-compact tracking-wider whitespace-nowrap transition-colors hover:border-panel-border hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50'
// 44px touch targets on mobile, compact 32px chips from md up.
const CHIP_ICON = 'min-h-11 min-w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0'
const CHIP_TEXT = 'min-h-11 px-3 md:h-8 md:min-h-0 md:px-2'

interface HeaderChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Icon chips are square; text chips size to their label. */
  variant?: 'icon' | 'text'
  tooltip?: string
  tooltipAlign?: 'center' | 'start' | 'end'
  /**
   * Suppress the tooltip without changing the rendered tree (e.g. while a
   * menu is open). Toggling `tooltip` itself would remount the button.
   */
  tooltipHidden?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function HeaderChip({
  variant = 'icon',
  tooltip,
  tooltipAlign,
  tooltipHidden = false,
  className,
  ...props
}: HeaderChipProps) {
  const button = (
    <button type="button" className={cn(CHIP_BASE, variant === 'icon' ? CHIP_ICON : CHIP_TEXT, className)} {...props} />
  )
  if (!tooltip) return button
  return (
    <Tooltip text={tooltip} align={tooltipAlign} disabled={props.disabled || tooltipHidden}>
      {button}
    </Tooltip>
  )
}

interface ThemeToggleProps {
  /** Pass `end` when the toggle is the last chip so its tooltip stays on-screen. */
  tooltipAlign?: 'center' | 'start' | 'end'
}

export function ThemeToggle({ tooltipAlign }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme()
  // next-themes can't know the theme during SSR; keep the icon stable until hydrated.
  const mounted = useMounted()
  const isDark = mounted && resolvedTheme === 'dark'

  return (
    <HeaderChip
      tooltip={isDark ? 'light mode' : 'dark mode'}
      tooltipAlign={tooltipAlign}
      disabled={!mounted}
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </HeaderChip>
  )
}
