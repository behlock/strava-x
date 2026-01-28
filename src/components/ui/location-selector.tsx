'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ActivityCluster } from '@/models/location'

interface LocationSelectorProps {
  clusters: ActivityCluster[]
  selectedClusterId: string | null
  onClusterSelect: (clusterId: string | null) => void
  className?: string
}

export function LocationSelector({
  clusters,
  selectedClusterId,
  onClusterSelect,
  className,
}: LocationSelectorProps) {
  const [expanded, setExpanded] = useState(true)

  if (clusters.length === 0) {
    return null
  }

  const currentIndex = selectedClusterId
    ? clusters.findIndex((c) => c.id === selectedClusterId)
    : -1

  const handlePrev = () => {
    if (currentIndex <= 0) {
      onClusterSelect(clusters[clusters.length - 1].id)
    } else {
      onClusterSelect(clusters[currentIndex - 1].id)
    }
  }

  const handleNext = () => {
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
          [03]—locations
        </span>
        <span className="text-panel-muted text-xs-compact">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          {/* Navigation controls */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handlePrev}
              className="px-2 py-1 text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-panel-border rounded-sm"
              title="Previous location"
            >
              &lt;
            </button>
            <button
              onClick={handleNext}
              className="px-2 py-1 text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-panel-border rounded-sm"
              title="Next location"
            >
              &gt;
            </button>
          </div>

          {/* Location list */}
          <div className="space-y-0.5 max-h-[200px] overflow-y-auto">
            <button
              onClick={() => onClusterSelect(null)}
              className={cn(
                'w-full flex items-center justify-between px-2 py-1.5 text-left text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors rounded-sm',
                selectedClusterId === null && 'bg-foreground/10'
              )}
            >
              <span>all locations</span>
              <span className="text-panel-muted">{clusters.reduce((sum, c) => sum + c.activityCount, 0)}</span>
            </button>
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
    </div>
  )
}
