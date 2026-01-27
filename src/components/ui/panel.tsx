'use client'

import { useState, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface PanelProps {
  sectionNumber: string
  title: string
  children: ReactNode
  defaultExpanded?: boolean
  className?: string
  contentClassName?: string
}

export function Panel({
  sectionNumber,
  title,
  children,
  defaultExpanded = true,
  className,
  contentClassName,
}: PanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div
      className={cn(
        'bg-panel/90 panel-blur border border-panel-border rounded-sm',
        className
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-panel-border hover:bg-foreground/5 transition-colors"
      >
        <span className="text-xs-compact tracking-wider">
          [{sectionNumber}]—{title}
        </span>
        <span className="text-panel-muted text-xs-compact">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>
      {expanded && (
        <div className={cn('p-3', contentClassName)}>
          {children}
        </div>
      )}
    </div>
  )
}

interface PanelHeaderProps {
  sectionNumber: string
  title: string
  action?: ReactNode
}

export function PanelHeader({ sectionNumber, title, action }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-panel-border">
      <span className="text-xs-compact tracking-wider">
        [{sectionNumber}]—{title}
      </span>
      {action}
    </div>
  )
}

interface PanelContentProps {
  children: ReactNode
  className?: string
}

export function PanelContent({ children, className }: PanelContentProps) {
  return <div className={cn('p-3', className)}>{children}</div>
}
