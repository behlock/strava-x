'use client'

import { useState } from 'react'
import { Statistics } from '@/hooks/use-statistics'
import { cn } from '@/lib/utils'

interface TEStatsPanelProps {
  statistics: Statistics
  loading?: boolean
  className?: string
  defaultExpanded?: boolean
}

// Format number with commas
function formatNumber(num: number, decimals: number = 0): string {
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function TEStatsPanel({
  statistics,
  loading = false,
  className,
  defaultExpanded = true,
}: TEStatsPanelProps) {
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
            [05]—statistics
          </span>
          <span className="text-te-muted text-te-xs">
            {expanded ? '[-]' : '[+]'}
          </span>
        </button>
        {expanded && (
          <div className="p-3">
            <div className="animate-pulse space-y-2">
              <div className="h-4 bg-te-border rounded-te w-3/4" />
              <div className="h-4 bg-te-border rounded-te w-1/2" />
              <div className="h-4 bg-te-border rounded-te w-2/3" />
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
          [05]—statistics
        </span>
        <span className="text-te-muted text-te-xs">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {expanded && <div className="p-3 space-y-2">
        {/* Total activities */}
        <div className="flex justify-between items-baseline">
          <span className="text-te-xs text-te-muted">activities</span>
          <span className="text-te-lg tabular-nums font-medium">
            {formatNumber(statistics.totalActivities)}
          </span>
        </div>

        {/* Total distance */}
        <div className="flex justify-between items-baseline">
          <span className="text-te-xs text-te-muted">distance</span>
          <span className="text-te-lg tabular-nums font-medium">
            {formatNumber(statistics.totalDistance, 1)} km
          </span>
        </div>

        {/* Total elevation */}
        <div className="flex justify-between items-baseline">
          <span className="text-te-xs text-te-muted">elevation</span>
          <span className="text-te-lg tabular-nums font-medium">
            {formatNumber(statistics.totalElevation)} m
          </span>
        </div>

        {/* Activity breakdown */}
        {statistics.breakdown.length > 0 && (
          <div className="pt-2 mt-2 border-t border-te-border space-y-1">
            {statistics.breakdown.map((item) => (
              <div
                key={item.type}
                className="flex items-center gap-2 text-te-xs"
              >
                <div
                  className="w-2 h-2 rounded-te flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="flex-1 text-te-muted">{item.type}</span>
                <span className="tabular-nums">
                  {item.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>}
    </div>
  )
}
