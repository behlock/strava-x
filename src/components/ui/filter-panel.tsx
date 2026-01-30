'use client'

import { useState } from 'react'
import { Checkbox } from './checkbox'
import { cn } from '@/lib/utils'
import { ActivityCluster } from '@/models/location'

interface FilterPanelProps {
  activityTypes: string[]
  selectedActivityTypes: string[]
  onActivityTypesChange: (types: string[]) => void
  activityCounts?: Record<string, number>
  dateRange?: { min: Date; max: Date } | null
  selectedDate: number
  onDateChange: (value: number) => void
  className?: string
  defaultExpanded?: boolean
  onTypeHover?: (type: string | null) => void
  // Location props
  clusters?: ActivityCluster[]
  selectedClusterId?: string | null
  onClusterSelect?: (clusterId: string | null) => void
}

export function FilterPanel({
  activityTypes,
  selectedActivityTypes,
  onActivityTypesChange,
  activityCounts = {},
  dateRange,
  selectedDate,
  onDateChange,
  className,
  defaultExpanded = true,
  onTypeHover,
  clusters = [],
  selectedClusterId = null,
  onClusterSelect,
}: FilterPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const handleTypeToggle = (type: string, checked: boolean) => {
    if (checked) {
      onActivityTypesChange([...selectedActivityTypes, type])
    } else {
      onActivityTypesChange(selectedActivityTypes.filter((t) => t !== type))
    }
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      year: '2-digit',
    }).toLowerCase()
  }

  const getCurrentDate = () => {
    if (!dateRange) return null
    const timeRange = dateRange.max.getTime() - dateRange.min.getTime()
    const currentTime = dateRange.min.getTime() + (timeRange * selectedDate) / 100
    return new Date(currentTime)
  }

  const currentDate = getCurrentDate()

  // Location navigation
  const currentIndex = selectedClusterId
    ? clusters.findIndex((c) => c.id === selectedClusterId)
    : -1

  const handlePrev = () => {
    if (!onClusterSelect || clusters.length === 0) return
    if (currentIndex <= 0) {
      onClusterSelect(clusters[clusters.length - 1].id)
    } else {
      onClusterSelect(clusters[currentIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (!onClusterSelect || clusters.length === 0) return
    if (currentIndex < 0 || currentIndex >= clusters.length - 1) {
      onClusterSelect(clusters[0].id)
    } else {
      onClusterSelect(clusters[currentIndex + 1].id)
    }
  }

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
          [03]—filters
        </span>
        <span className="text-panel-muted text-xs-compact">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {expanded && <div className="p-3 space-y-3">
        {/* Location selector */}
        {clusters.length > 0 && onClusterSelect && (
          <div className="space-y-0.5">
            <div className="flex justify-start gap-2 text-xs-compact text-panel-muted mb-1 pl-2">
              <button
                onClick={handlePrev}
                className="hover:text-foreground transition-colors"
                title="Previous location"
              >
                [&lt;]
              </button>
              <button
                onClick={handleNext}
                className="hover:text-foreground transition-colors"
                title="Next location"
              >
                [&gt;]
              </button>
            </div>

            {/* Location list */}
            <div className="space-y-0.5 max-h-[120px] overflow-y-auto">
              {clusters.map((cluster) => (
                <button
                  key={cluster.id}
                  onClick={() => onClusterSelect(cluster.id)}
                  className={cn(
                    'w-full flex items-center justify-between px-2 py-1.5 text-left text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors rounded-sm',
                    selectedClusterId === cluster.id && 'bg-foreground/10'
                  )}
                >
                  <span className="truncate mr-2">{cluster.displayName}</span>
                  <span className="text-panel-muted flex-shrink-0">{cluster.activityCount}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Divider if both locations and activity types exist */}
        {clusters.length > 0 && onClusterSelect && (
          <div className="border-t border-panel-border" />
        )}

        {/* Activity type filters */}
        <div className="space-y-0.5">
          <div className="flex gap-2 text-xs-compact text-panel-muted mb-1">
            <button
              onClick={() => onActivityTypesChange([...activityTypes])}
              className="hover:text-foreground transition-colors"
            >
              [all]
            </button>
            <button
              onClick={() => onActivityTypesChange([])}
              className="hover:text-foreground transition-colors"
            >
              [none]
            </button>
          </div>
          {[...activityTypes].sort((a, b) => (activityCounts[b] || 0) - (activityCounts[a] || 0)).map((type) => (
            <Checkbox
              key={type}
              checked={selectedActivityTypes.includes(type)}
              onChange={(checked) => handleTypeToggle(type, checked)}
              label={type}
              count={activityCounts[type]}
              onHover={(hovered) => onTypeHover?.(hovered ? type : null)}
            />
          ))}
        </div>

        {/* Timeline filter */}
        {dateRange && (
          <div className="pt-2 border-t border-panel-border">
            <div className="flex justify-between text-xs-compact text-panel-muted mb-2">
              <span>{formatDate(dateRange.min)}</span>
              <span>{currentDate ? formatDate(currentDate) : '—'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={selectedDate}
              onChange={(e) => onDateChange(Number(e.target.value))}
              className="w-full h-2 md:h-1 bg-panel-border rounded-sm appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-6
                [&::-webkit-slider-thumb]:h-6
                [&::-webkit-slider-thumb]:md:w-3
                [&::-webkit-slider-thumb]:md:h-3
                [&::-webkit-slider-thumb]:bg-foreground
                [&::-webkit-slider-thumb]:rounded-sm
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-6
                [&::-moz-range-thumb]:h-6
                [&::-moz-range-thumb]:md:w-3
                [&::-moz-range-thumb]:md:h-3
                [&::-moz-range-thumb]:bg-foreground
                [&::-moz-range-thumb]:rounded-sm
                [&::-moz-range-thumb]:cursor-pointer
                [&::-moz-range-thumb]:border-0"
            />
          </div>
        )}
      </div>}
    </div>
  )
}
