'use client'

import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function MapSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('absolute inset-0 bg-background animate-pulse', className)}>
      <div className="absolute inset-0 bg-muted/20" />
    </div>
  )
}

export function PanelSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-panel/90 panel-blur border border-panel-border rounded-sm p-3',
        className
      )}
    >
      <div className="animate-pulse space-y-2">
        <div className="h-4 bg-panel-border rounded-sm w-1/3" />
        <div className="h-8 bg-panel-border rounded-sm" />
        <div className="h-8 bg-panel-border rounded-sm" />
        <div className="h-8 bg-panel-border rounded-sm" />
      </div>
    </div>
  )
}

export function ActivityListSkeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'bg-panel/90 panel-blur border border-panel-border rounded-sm',
        className
      )}
    >
      <div className="px-3 py-2 border-b border-panel-border">
        <div className="h-4 bg-panel-border rounded-sm w-24 animate-pulse" />
      </div>
      <div className="p-3 space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 bg-panel-border rounded-sm animate-pulse" />
        ))}
      </div>
    </div>
  )
}
