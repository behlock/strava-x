'use client'

import { useState, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TEPanelProps {
  sectionNumber: string
  title: string
  children: ReactNode
  defaultExpanded?: boolean
  className?: string
  contentClassName?: string
}

export function TEPanel({
  sectionNumber,
  title,
  children,
  defaultExpanded = true,
  className,
  contentClassName,
}: TEPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div
      className={cn(
        'bg-te-panel/90 te-backdrop border border-te-border rounded-te',
        className
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-te-border hover:bg-foreground/5 transition-colors"
      >
        <span className="text-te-xs tracking-wider">
          [{sectionNumber}]—{title}
        </span>
        <span className="text-te-muted text-te-xs">
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

interface TEPanelHeaderProps {
  sectionNumber: string
  title: string
  action?: ReactNode
}

export function TEPanelHeader({ sectionNumber, title, action }: TEPanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-te-border">
      <span className="text-te-xs tracking-wider">
        [{sectionNumber}]—{title}
      </span>
      {action}
    </div>
  )
}

interface TEPanelContentProps {
  children: ReactNode
  className?: string
}

export function TEPanelContent({ children, className }: TEPanelContentProps) {
  return <div className={cn('p-3', className)}>{children}</div>
}
