'use client'

import { createContext, type ReactNode, useContext, useState } from 'react'

import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'

export const PanelVisibilityContext = createContext(true)

export const PanelChromeContext = createContext<boolean | 'sidebar'>(true)

interface PanelProps {
  title: string
  onExpandedChange?: (expanded: boolean) => void
  /** Fill the remaining space of a flex column while expanded. */
  grow?: boolean
  className?: string
  children: ReactNode
}

/** Collapsible floating panel with a quiet section header. */
export function Panel({ title, grow = false, className, children, onExpandedChange }: PanelProps) {
  const [expanded, setExpanded] = useState(true)
  const chrome = useContext(PanelChromeContext)

  if (!chrome) {
    return <div className={cn('flex flex-col', grow ? 'min-h-0 flex-1' : 'flex-none', className)}>{children}</div>
  }

  return (
    <div
      data-panel-grow={grow || undefined}
      data-expanded={expanded}
      className={cn(
        'collapsible-panel flex flex-col overflow-hidden bg-panel',
        chrome === 'sidebar'
          ? 'border-b border-panel-border/60 last:border-b-0'
          : 'rounded-xl border border-panel-border',
        grow
          ? expanded
            ? chrome === 'sidebar'
              ? 'min-h-40 flex-1'
              : 'min-h-0 flex-1'
            : 'min-h-0 flex-none'
          : 'flex-none',
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          const next = !expanded
          setExpanded(next)
          onExpandedChange?.(next)
        }}
        aria-expanded={expanded}
        className="flex w-full shrink-0 items-center justify-between border-b border-panel-border/40 py-2 pr-5 pl-3 focus-ring-inset transition-colors hover:bg-foreground/5"
      >
        <span className="text-xs-compact tracking-wider text-panel-muted">{title}</span>
        <span className="flex items-center gap-2 text-xs-compact text-panel-muted">
          <ChevronDown
            aria-hidden="true"
            className={cn(
              'size-3.5 transition-transform duration-200 motion-reduce:transition-none',
              !expanded && '-rotate-90',
            )}
          />
        </span>
      </button>
      <div
        inert={!expanded}
        aria-hidden={!expanded}
        className={cn('collapsible-panel-body grid min-h-0', grow && 'flex-1')}
      >
        <div className="flex min-h-0 flex-col overflow-hidden">{children}</div>
      </div>
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
