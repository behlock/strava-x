'use client'

import { useCallback, useEffect, useId, useMemo, useRef } from 'react'
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

function scrollIndexIntoView(parent: HTMLElement, index: number) {
  const start = index * ROW_HEIGHT
  const end = start + ROW_HEIGHT
  const top = parent.scrollTop
  const bottom = top + parent.clientHeight
  if (start < top) parent.scrollTop = start
  else if (end > bottom) parent.scrollTop = end - parent.clientHeight
}

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
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const pointerLockRef = useRef<{ x: number; y: number } | null>(null)
  const listIdentityRef = useRef(activities)
  const idPrefix = useId()
  const rowId = (activityId: string) => `${idPrefix}-${activityId}`

  const sortedActivities = useMemo(() => sortActivitiesByDateDesc(activities), [activities])

  useEffect(() => {
    const listChanged = listIdentityRef.current !== activities
    listIdentityRef.current = activities
    if (highlightedActivityId) {
      const index = sortedActivities.findIndex((activity) => activity.id === highlightedActivityId)
      if (index >= 0) selectedIndexRef.current = index
      else if (listChanged) selectedIndexRef.current = -1
      return
    }
    if (listChanged || selectedIndexRef.current >= sortedActivities.length) selectedIndexRef.current = -1
  }, [activities, highlightedActivityId, sortedActivities])

  const virtualizer = useVirtualizer({
    count: sortedActivities.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  const handlePointerMove = (e: React.PointerEvent) => {
    const lock = pointerLockRef.current
    pointerRef.current = { x: e.clientX, y: e.clientY }
    if (!lock) return
    if (Number.isNaN(lock.x)) {
      if (e.movementX !== 0 || e.movementY !== 0) pointerLockRef.current = null
      return
    }
    const dx = e.clientX - lock.x
    const dy = e.clientY - lock.y
    if (dx * dx + dy * dy > 9) pointerLockRef.current = null
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (sortedActivities.length === 0) return
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return
      e.preventDefault()

      const highlightedIndex = highlightedActivityId
        ? sortedActivities.findIndex((activity) => activity.id === highlightedActivityId)
        : -1
      const remembered = selectedIndexRef.current
      const current =
        highlightedIndex >= 0
          ? highlightedIndex
          : remembered >= 0 && remembered < sortedActivities.length
            ? remembered
            : -1

      if (e.key === 'Enter') {
        const selected = sortedActivities[current]
        if (selected) onActivityClick(selected)
        return
      }

      const next =
        e.key === 'ArrowDown'
          ? Math.min(current < 0 ? 0 : current + 1, sortedActivities.length - 1)
          : Math.max(current - 1, 0)
      if (next === current) return

      selectedIndexRef.current = next
      pointerLockRef.current = pointerRef.current ?? { x: Number.NaN, y: Number.NaN }
      const activity = sortedActivities[next]
      onActivityHover(activity.id)
      onActivityNavigate(activity)
      const parent = parentRef.current
      if (!parent) return
      scrollIndexIntoView(parent, next)
      requestAnimationFrame(() => {
        if (selectedIndexRef.current === next) scrollIndexIntoView(parent, next)
      })
    },
    [sortedActivities, highlightedActivityId, onActivityHover, onActivityNavigate, onActivityClick],
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
      {/* Arrow keys highlight a row (via the parent); the active descendant
          follows the highlight so assistive tech announces the move. */}
      <div
        ref={parentRef}
        className="scrollbar-thin min-h-0 flex-1 overflow-y-auto focus-ring-inset"
        tabIndex={0}
        role="listbox"
        aria-label="Activities"
        aria-activedescendant={highlightedActivityId ? rowId(highlightedActivityId) : undefined}
        onKeyDown={handleKeyDown}
        onPointerMove={handlePointerMove}
        onMouseDown={() => {
          parentRef.current?.focus({ preventScroll: true })
        }}
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
                  id={rowId(activity.id)}
                  role="option"
                  aria-selected={isHighlighted}
                  className={cn(
                    'absolute top-0 left-0 w-full cursor-pointer border-b border-panel-border transition-colors',
                    isHighlighted ? 'bg-foreground/20' : 'hover:bg-foreground/5',
                  )}
                  style={{ height: row.size, transform: `translateY(${row.start}px)` }}
                  onMouseEnter={(e) => {
                    pointerRef.current = { x: e.clientX, y: e.clientY }
                    if (pointerLockRef.current) return
                    selectedIndexRef.current = row.index
                    onActivityHover(activity.id)
                  }}
                  onMouseLeave={() => {
                    if (pointerLockRef.current) return
                    onActivityHover(null)
                  }}
                  onMouseDown={() => {
                    pointerLockRef.current = null
                    selectedIndexRef.current = row.index
                  }}
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
