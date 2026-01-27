'use client'

import { useState } from 'react'
import { TECheckbox } from './te-checkbox'
import { cn } from '@/lib/utils'

interface TEFilterPanelProps {
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
}

export function TEFilterPanel({
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
}: TEFilterPanelProps) {
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
          [03]—filters
        </span>
        <span className="text-te-muted text-te-xs">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {expanded && <div className="p-3 space-y-3">
        {/* Activity type filters */}
        <div className="space-y-0.5">
          <div className="flex gap-2 text-te-xs text-te-muted mb-1">
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
            <TECheckbox
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
          <div className="pt-2 border-t border-te-border">
            <div className="flex justify-between text-te-xs text-te-muted mb-2">
              <span>{formatDate(dateRange.min)}</span>
              <span>{currentDate ? formatDate(currentDate) : '—'}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={selectedDate}
              onChange={(e) => onDateChange(Number(e.target.value))}
              className="w-full h-2 md:h-1 bg-te-border rounded-te appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-6
                [&::-webkit-slider-thumb]:h-6
                [&::-webkit-slider-thumb]:md:w-3
                [&::-webkit-slider-thumb]:md:h-3
                [&::-webkit-slider-thumb]:bg-foreground
                [&::-webkit-slider-thumb]:rounded-te
                [&::-webkit-slider-thumb]:cursor-pointer
                [&::-moz-range-thumb]:w-6
                [&::-moz-range-thumb]:h-6
                [&::-moz-range-thumb]:md:w-3
                [&::-moz-range-thumb]:md:h-3
                [&::-moz-range-thumb]:bg-foreground
                [&::-moz-range-thumb]:rounded-te
                [&::-moz-range-thumb]:cursor-pointer
                [&::-moz-range-thumb]:border-0"
            />
          </div>
        )}
      </div>}
    </div>
  )
}
