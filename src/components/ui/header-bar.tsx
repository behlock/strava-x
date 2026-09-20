'use client'

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'

import { cn } from '@/lib/utils'
import { Tooltip, type TooltipAlign } from './tooltip'

/** Class for the brand mark on the far left; the element differs per page (button vs link). */
export const HEADER_LOGO_CLASS = 'text-base-compact font-medium tracking-tight transition-opacity hover:opacity-70'

interface HeaderBarProps {
  logo: ReactNode
  /** Status indicators (sync spinner, errors) shown beside the logo. */
  status?: ReactNode
  /** Action chips, rendered right-aligned. */
  children?: ReactNode
  className?: string
}

export function HeaderBar({ logo, status, children, className }: HeaderBarProps) {
  return (
    <header
      className={cn(
        'flex items-center justify-between border-b border-panel-border bg-panel px-4 py-3 backdrop-blur-md md:bg-panel/90',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {logo}
        {status}
      </div>
      <div className="flex items-center gap-1">{children}</div>
    </header>
  )
}

const CHIP_BASE =
  'focus-ring inline-flex items-center justify-center rounded-sm border border-transparent text-xs-compact tracking-wider whitespace-nowrap transition-colors hover:border-panel-border hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-50'
// 44px touch targets on mobile, compact 32px chips from md up.
const CHIP_ICON = 'min-h-11 min-w-11 md:h-8 md:w-8 md:min-h-0 md:min-w-0'
const CHIP_TEXT = 'min-h-11 px-3 md:h-8 md:min-h-0 md:px-2'

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
