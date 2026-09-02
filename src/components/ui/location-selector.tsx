'use client'

import { useCallback, useRef } from 'react'

import type { ActivityCluster } from '@/models/location'
import { cn } from '@/lib/utils'
import { Panel } from './panel'

interface LocationSelectorProps {
  clusters: ActivityCluster[]
  selectedClusterId: string | null
  onClusterSelect: (clusterId: string) => void
}

export function LocationSelector({ clusters, selectedClusterId, onClusterSelect }: LocationSelectorProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const currentIndex = selectedClusterId ? clusters.findIndex((c) => c.id === selectedClusterId) : -1

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (clusters.length === 0) return
      const select = (index: number) => {
        e.preventDefault()
        onClusterSelect(clusters[index].id)
        const el = listRef.current?.children[index] as HTMLElement | undefined
        el?.scrollIntoView({ block: 'nearest' })
      }
      switch (e.key) {
        case 'ArrowDown':
          select(currentIndex < 0 ? 0 : Math.min(currentIndex + 1, clusters.length - 1))
          break
        case 'ArrowUp':
          select(Math.max(currentIndex - 1, 0))
          break
        case 'Enter':
          if (currentIndex >= 0) select(currentIndex)
          break
      }
    },
    [clusters, currentIndex, onClusterSelect],
  )

  if (clusters.length === 0) return null

  return (
    <Panel title="locations">
      <div
        ref={listRef}
        className="max-h-[200px] space-y-0.5 overflow-y-auto p-3 focus:outline-hidden focus-visible:ring-1 focus-visible:ring-foreground/60 focus-visible:ring-inset"
        tabIndex={0}
        role="listbox"
        aria-label="Locations"
        onKeyDown={handleKeyDown}
      >
        {clusters.map((cluster) => (
          <button
            key={cluster.id}
            type="button"
            role="option"
            aria-selected={selectedClusterId === cluster.id}
            onClick={() => onClusterSelect(cluster.id)}
            className={cn(
              'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-xs-compact tracking-wider transition-colors hover:bg-foreground/5',
              selectedClusterId === cluster.id && 'bg-foreground/10',
            )}
          >
            <span className="truncate">{cluster.displayName}</span>
          </button>
        ))}
      </div>
    </Panel>
  )
}
