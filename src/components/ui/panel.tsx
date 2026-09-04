'use client'

import { createContext, type ReactNode, useContext, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Whether panels draw their own chrome (border, background, header bar).
 * The mobile drawer provides `false` so its sections, which already have a
 * header, render the bare panel body.
 */
export const PanelChromeContext = createContext(true)

interface PanelProps {
  title: string
  /** Extra content on the right of the header, before the [-]/[+] toggle. */
  meta?: ReactNode
  defaultExpanded?: boolean
  /** Fill the remaining space of a flex column while expanded. */
  grow?: boolean
  className?: string
  children: ReactNode
}

/** Collapsible floating panel with the app's bracketed header style. */
export function Panel({ title, meta, defaultExpanded = true, grow = false, className, children }: PanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const chrome = useContext(PanelChromeContext)

  if (!chrome) {
    return <div className={cn('flex flex-col', grow ? 'min-h-0 flex-1' : 'flex-none', className)}>{children}</div>
  }

  return (
    <div
      className={cn(
        'flex flex-col rounded-sm border border-panel-border bg-panel/90 backdrop-blur-md',
        grow && expanded ? 'min-h-0 flex-1' : 'flex-none',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full shrink-0 items-center justify-between border-b border-panel-border px-3 py-2 focus-ring-inset transition-colors hover:bg-foreground/5"
      >
        <span className="text-xs-compact tracking-wider">{title}</span>
        <span className="flex items-center gap-2 text-xs-compact text-panel-muted">
          {meta}
          <span>{expanded ? '[-]' : '[+]'}</span>
        </span>
      </button>
      {expanded && children}
    </div>
  )
}

const SKELETON_WIDTHS = ['75%', '50%', '66%']

export function PanelSkeleton({ rows = 3, rowClassName }: { rows?: number; rowClassName?: string }) {
  return (
    <div className="animate-pulse space-y-2 p-3">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className={cn('h-4 rounded-sm bg-panel-border', rowClassName)}
          style={{ width: SKELETON_WIDTHS[i % SKELETON_WIDTHS.length] }}
        />
      ))}
    </div>
  )
}
