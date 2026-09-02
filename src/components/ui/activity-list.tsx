'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

import type { Activity } from '@/models/activity'
import { getActivityColor } from '@/lib/activity-colors'
import { sortActivitiesByDateDesc } from '@/lib/activities'
import { cn } from '@/lib/utils'
import { Panel, PanelSkeleton } from './panel'

interface ActivityListProps {
  activities: Activity[]
  highlightedActivityId: string | null
  onActivityHover: (id: string | null) => void
  onActivityClick: (activity: Activity) => void
  /** Keyboard navigation: called for the row that gains selection. */
  onActivityNavigate: (activity: Activity) => void
  loading?: boolean
}

function formatDistance(km: number): string {
  return km < 10 ? km.toFixed(1).padStart(5, ' ') : km.toFixed(0).padStart(4, ' ')
}

function formatDate(date: Date | undefined): string {
  if (!date) return '—'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase()
}

// Rows are absolutely positioned by the virtualizer, so this fixes the row
// height on every breakpoint. Sized for the taller mobile rows (py-4).
const ROW_HEIGHT = 56

export function ActivityList({
  activities,
  highlightedActivityId,
  onActivityHover,
  onActivityClick,
  onActivityNavigate,
  loading = false,
}: ActivityListProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const selectedIndexRef = useRef(-1)

  const sortedActivities = useMemo(() => sortActivitiesByDateDesc(activities), [activities])

  // Reset keyboard selection when the list changes.
  useEffect(() => {
    selectedIndexRef.current = -1
  }, [sortedActivities])

  const virtualizer = useVirtualizer({
    count: sortedActivities.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedActivities.length === 0) return
      const moveTo = (index: number) => {
        e.preventDefault()
        selectedIndexRef.current = index
        const activity = sortedActivities[index]
        onActivityHover(activity.id)
        onActivityNavigate(activity)
        virtualizer.scrollToIndex(index, { align: 'auto' })
      }
      switch (e.key) {
        case 'ArrowDown':
          moveTo(Math.min(selectedIndexRef.current + 1, sortedActivities.length - 1))
          break
        case 'ArrowUp':
          moveTo(Math.max(selectedIndexRef.current - 1, 0))
          break
        case 'Enter': {
          e.preventDefault()
          const selected = sortedActivities[selectedIndexRef.current]
          if (selected) onActivityClick(selected)
          break
        }
      }
    },
    [sortedActivities, onActivityHover, onActivityNavigate, onActivityClick, virtualizer],
  )

  if (loading) {
    return (
      <Panel title="activities" grow>
        <PanelSkeleton rows={5} rowClassName="h-8 !w-full" />
      </Panel>
    )
  }

  return (
    <Panel
      title="activities"
      grow
      meta={<span className="tabular-nums">{activities.length.toLocaleString()} total</span>}
    >
      <div
        ref={parentRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto focus:outline-hidden focus-visible:ring-1 focus-visible:ring-foreground/60 focus-visible:ring-inset"
        tabIndex={0}
        role="listbox"
        aria-label="Activities"
        onKeyDown={handleKeyDown}
      >
        {activities.length === 0 ? (
          <div className="p-3 text-center text-xs-compact text-panel-muted">no activities</div>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => {
              const activity = sortedActivities[row.index]
              const isHighlighted = activity.id === highlightedActivityId
              return (
                <div
                  key={activity.id}
                  role="option"
                  aria-selected={isHighlighted}
                  className={cn(
                    'absolute top-0 left-0 w-full cursor-pointer border-b border-panel-border transition-colors',
                    isHighlighted ? 'bg-foreground/20' : 'hover:bg-foreground/5',
                  )}
                  style={{ height: row.size, transform: `translateY(${row.start}px)` }}
                  onMouseEnter={() => {
                    selectedIndexRef.current = row.index
                    onActivityHover(activity.id)
                  }}
                  onMouseLeave={() => onActivityHover(null)}
                  onClick={() => onActivityClick(activity)}
                >
                  <div
                    className="absolute top-0 bottom-0 left-0 w-0.5"
                    style={{ backgroundColor: getActivityColor(activity.type) }}
                  />
                  <div className="px-3 py-4 md:py-2">
                    <div className="flex items-center justify-between text-sm-compact">
                      <span className="w-8 text-panel-muted tabular-nums">
                        {String(row.index + 1).padStart(3, '0')}
                      </span>
                      <span className="ml-2 flex-1 truncate">{activity.type || 'unknown'}</span>
                      <span className="ml-2 tabular-nums">{formatDistance(activity.distance)} km</span>
                    </div>
                    <div className="flex items-center justify-between pl-10 text-xs-compact text-panel-muted">
                      <span>{formatDate(activity.date)}</span>
                      {activity.elevationGain > 0 && (
                        <span className="tabular-nums">+{Math.round(activity.elevationGain)}m</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Panel>
  )
}
