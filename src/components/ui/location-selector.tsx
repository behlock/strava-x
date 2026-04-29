'use client'

import { useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { ActivityCluster } from '@/models/location'

interface LocationSelectorProps {
  clusters: ActivityCluster[]
  selectedClusterId: string | null
  onClusterSelect: (clusterId: string) => void
  className?: string
}

export function LocationSelector({ clusters, selectedClusterId, onClusterSelect, className }: LocationSelectorProps) {
  const [expanded, setExpanded] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  const currentIndex = selectedClusterId ? clusters.findIndex((c) => c.id === selectedClusterId) : -1

  const scrollIndexIntoView = useCallback((index: number) => {
    const el = listRef.current?.children[index] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (clusters.length === 0) return

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const next = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, clusters.length - 1)
          onClusterSelect(clusters[next].id)
          scrollIndexIntoView(next)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const next = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0)
          onClusterSelect(clusters[next].id)
          scrollIndexIntoView(next)
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (currentIndex >= 0) {
            onClusterSelect(clusters[currentIndex].id)
          }
          break
        }
      }
    },
    [clusters, currentIndex, onClusterSelect, scrollIndexIntoView],
  )

  if (clusters.length === 0) {
    return null
  }

  return (
    <div className={cn('bg-panel/90 panel-blur border border-panel-border rounded-sm', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-panel-border hover:bg-foreground/5 transition-colors"
      >
        <span className="text-xs-compact tracking-wider">locations</span>
        <span className="text-panel-muted text-xs-compact">{expanded ? '[-]' : '[+]'}</span>
      </button>

      {expanded && (
        <div
          ref={listRef}
          className="p-3 space-y-0.5 max-h-[200px] overflow-y-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/60"
          tabIndex={0}
          role="listbox"
          aria-label="Locations"
          onKeyDown={handleKeyDown}
        >
          {clusters.map((cluster) => (
            <button
              key={cluster.id}
              role="option"
              aria-selected={selectedClusterId === cluster.id}
              onClick={() => onClusterSelect(cluster.id)}
              className={cn(
                'w-full flex items-center px-2 py-1.5 text-left text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors rounded-sm',
                selectedClusterId === cluster.id && 'bg-foreground/10',
              )}
            >
              <span className="truncate">{cluster.displayName}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
