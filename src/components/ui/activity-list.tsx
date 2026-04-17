'use client'

import { useState, useRef, useMemo, useCallback, useEffect } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Activity } from '@/models/activity'
import { getActivityColor } from '@/hooks/use-statistics'
import { cn } from '@/lib/utils'

interface ActivityListProps {
  activities: Activity[]
  highlightedActivityId?: string | null
  onActivityHover?: (id: string | null) => void
  onActivityClick?: (activity: Activity) => void
  onActivityNavigate?: (activity: Activity) => void
  loading?: boolean
  className?: string
  defaultExpanded?: boolean
  convertDistance?: (km: number) => number
  convertElevation?: (m: number) => number
  distanceLabel?: string
  elevationLabel?: string
}

function formatDistance(km: number): string {
  if (km < 10) {
    return km.toFixed(1).padStart(5, ' ')
  }
  return km.toFixed(0).padStart(4, ' ')
}

function formatDate(date: Date | undefined): string {
  if (!date) return '—'
  return date
    .toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    .toLowerCase()
}

// Row height: 56px on mobile (py-4 = 16px*2 + content), 40px on desktop (py-2 = 8px*2 + content)
const ITEM_HEIGHT = 56

export function ActivityList({
  activities,
  highlightedActivityId,
  onActivityHover,
  onActivityClick,
  onActivityNavigate,
  loading = false,
  className,
  defaultExpanded = true,
  convertDistance = (km) => km,
  convertElevation = (m) => m,
  distanceLabel = 'km',
  elevationLabel = 'm',
}: ActivityListProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const parentRef = useRef<HTMLDivElement>(null)
  const selectedIndexRef = useRef(-1)

  // Sort activities by date in descending order (newest first)
  const sortedActivities = useMemo(() => {
    return [...activities].sort((a, b) => {
      const dateA = a.date?.getTime() ?? 0
      const dateB = b.date?.getTime() ?? 0
      return dateB - dateA
    })
  }, [activities])

  // Reset keyboard selection when activities change
  useEffect(() => {
    selectedIndexRef.current = -1
  }, [sortedActivities])

  const virtualizer = useVirtualizer({
    count: sortedActivities.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 5,
  })

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedActivities.length === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const next = Math.min(selectedIndexRef.current + 1, sortedActivities.length - 1)
          selectedIndexRef.current = next
          const downActivity = sortedActivities[next]
          onActivityHover?.(downActivity.id)
          onActivityNavigate?.(downActivity)
          virtualizer.scrollToIndex(next, { align: 'auto' })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const next = Math.max(selectedIndexRef.current - 1, 0)
          selectedIndexRef.current = next
          const upActivity = sortedActivities[next]
          onActivityHover?.(upActivity.id)
          onActivityNavigate?.(upActivity)
          virtualizer.scrollToIndex(next, { align: 'auto' })
          break
        }
        case 'Enter': {
          e.preventDefault()
          const idx = selectedIndexRef.current
          if (idx >= 0 && idx < sortedActivities.length) {
            onActivityClick?.(sortedActivities[idx])
          }
          break
        }
      }
    },
    [sortedActivities, onActivityHover, onActivityNavigate, onActivityClick, virtualizer],
  )

  if (loading) {
    return (
      <div
        className={cn(
          'bg-panel/90 panel-blur border border-panel-border rounded-sm',
          expanded ? className : 'flex-none',
        )}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-3 py-2 border-b border-panel-border hover:bg-foreground/5 transition-colors"
        >
          <span className="text-xs-compact tracking-wider">activities</span>
          <span className="text-panel-muted text-xs-compact">{expanded ? '[-]' : '[+]'}</span>
        </button>
        {expanded && (
          <div className="p-3">
            <div className="animate-pulse space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-8 bg-panel-border rounded-sm" />
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
        'bg-panel/90 panel-blur border border-panel-border rounded-sm flex flex-col',
        expanded ? className : 'flex-none',
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-panel-border hover:bg-foreground/5 transition-colors shrink-0"
      >
        <span className="text-xs-compact tracking-wider">activities</span>
        <span className="text-panel-muted text-xs-compact flex items-center gap-2">
          <span className="tabular-nums">{activities.length.toLocaleString()} total</span>
          <span>{expanded ? '[-]' : '[+]'}</span>
        </span>
      </button>

      {expanded && (
        <div
          ref={parentRef}
          className="flex-1 min-h-0 overflow-y-auto scrollbar-thin focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/60"
          tabIndex={0}
          role="listbox"
          aria-label="Activities"
          onKeyDown={handleKeyDown}
        >
          {activities.length === 0 ? (
            <div className="p-3 text-xs-compact text-panel-muted text-center">no activities</div>
          ) : (
            <div
              style={{
                height: `${virtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const activity = sortedActivities[virtualItem.index]
                const color = getActivityColor(activity.type)
                const isHighlighted = activity.id === highlightedActivityId

                return (
                  <div
                    key={activity.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <div
                      className={cn(
                        'relative h-full border-b border-panel-border cursor-pointer transition-colors',
                        isHighlighted ? 'bg-foreground/20' : 'hover:bg-foreground/5',
                      )}
                      onMouseEnter={() => {
                        selectedIndexRef.current = virtualItem.index
                        onActivityHover?.(activity.id)
                      }}
                      onMouseLeave={() => onActivityHover?.(null)}
                      onClick={() => onActivityClick?.(activity)}
                    >
                      {/* Color indicator bar */}
                      <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: color }} />

                      <div className="pl-3 pr-3 py-4 md:py-2">
                        {/* Main row */}
                        <div className="flex items-center justify-between text-sm-compact">
                          <span className="text-panel-muted tabular-nums w-8">
                            {(virtualItem.index + 1).toString().padStart(3, '0')}
                          </span>
                          <span className="flex-1 ml-2 truncate">{activity.type || 'unknown'}</span>
                          <span className="tabular-nums ml-2">
                            {formatDistance(convertDistance(activity.distance))} {distanceLabel}
                          </span>
                        </div>

                        {/* Detail row */}
                        <div className="flex items-center justify-between text-xs-compact text-panel-muted pl-10">
                          <span>{formatDate(activity.date)}</span>
                          {activity.elevationGain > 0 && (
                            <span className="tabular-nums">
                              +{Math.round(convertElevation(activity.elevationGain))}
                              {elevationLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
