'use client'

import { useState } from 'react'
import { Activity } from '@/models/activity'
import { getActivityColor } from '@/hooks/use-statistics'
import { cn } from '@/lib/utils'

interface TEActivityListProps {
  activities: Activity[]
  highlightedActivityId?: string | null
  onActivityHover?: (id: string | null) => void
  onActivityClick?: (activity: Activity) => void
  loading?: boolean
  className?: string
  defaultExpanded?: boolean
}

function formatDistance(km: number): string {
  if (km < 10) {
    return km.toFixed(1).padStart(5, ' ')
  }
  return km.toFixed(0).padStart(4, ' ')
}

function formatDate(date: Date | undefined): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  }).toLowerCase()
}

export function TEActivityList({
  activities,
  highlightedActivityId,
  onActivityHover,
  onActivityClick,
  loading = false,
  className,
  defaultExpanded = true,
}: TEActivityListProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  if (loading) {
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
            [04]—activities
          </span>
          <span className="text-te-muted text-te-xs">
            {expanded ? '[-]' : '[+]'}
          </span>
        </button>
        {expanded && (
          <div className="p-3">
            <div className="animate-pulse space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-te-border rounded-te" />
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

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
          [04]—activities
        </span>
        <span className="text-te-muted text-te-xs flex items-center gap-2">
          <span className="tabular-nums">{activities.length.toLocaleString()} total</span>
          <span>{expanded ? '[-]' : '[+]'}</span>
        </span>
      </button>

      {expanded && <div className="max-h-64 overflow-y-auto scrollbar-thin">
        {activities.length === 0 ? (
          <div className="p-3 text-te-xs text-te-muted text-center">
            no activities
          </div>
        ) : (
          activities.map((activity, index) => {
            const color = getActivityColor(activity.type)
            const isHighlighted = activity.id === highlightedActivityId

            return (
              <div
                key={activity.id}
                className={cn(
                  'relative border-b border-te-border last:border-b-0 cursor-pointer transition-colors',
                  isHighlighted ? 'bg-foreground/10' : 'hover:bg-foreground/5'
                )}
                onMouseEnter={() => onActivityHover?.(activity.id)}
                onMouseLeave={() => onActivityHover?.(null)}
                onClick={() => onActivityClick?.(activity)}
              >
                {/* Color indicator bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5"
                  style={{ backgroundColor: color }}
                />

                <div className="pl-3 pr-3 py-4 md:py-2">
                  {/* Main row */}
                  <div className="flex items-center justify-between text-te-sm">
                    <span className="text-te-muted tabular-nums w-8">
                      {(index + 1).toString().padStart(3, '0')}
                    </span>
                    <span className="flex-1 ml-2 truncate">{activity.type || 'unknown'}</span>
                    <span className="tabular-nums ml-2">
                      {formatDistance(activity.distance)} km
                    </span>
                  </div>

                  {/* Detail row */}
                  <div className="flex items-center justify-between text-te-xs text-te-muted pl-10">
                    <span>{formatDate(activity.date)}</span>
                    {activity.elevationGain > 0 && (
                      <span className="tabular-nums">
                        +{Math.round(activity.elevationGain)}m
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>}
    </div>
  )
}
