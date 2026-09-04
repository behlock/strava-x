'use client'

import { useCallback, useId, useRef } from 'react'

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
  const idPrefix = useId()
  const optionId = (index: number) => `${idPrefix}-${index}`
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
      {/* The list is the single Tab stop; options are not focusable themselves
          and the active descendant tells assistive tech which one is current. */}
      <div
        ref={listRef}
        className="max-h-[200px] space-y-0.5 overflow-y-auto p-3 focus-ring-inset"
        tabIndex={0}
        role="listbox"
        aria-label="Locations"
        aria-activedescendant={currentIndex >= 0 ? optionId(currentIndex) : undefined}
        onKeyDown={handleKeyDown}
      >
        {clusters.map((cluster, index) => (
          <div
            key={cluster.id}
            id={optionId(index)}
            role="option"
            tabIndex={-1}
            aria-selected={selectedClusterId === cluster.id}
            onClick={() => onClusterSelect(cluster.id)}
            className={cn(
              'flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-xs-compact tracking-wider transition-colors hover:bg-foreground/5',
              selectedClusterId === cluster.id && 'bg-foreground/10',
            )}
          >
            <span className="truncate">{cluster.displayName}</span>
          </div>
        ))}
      </div>
    </Panel>
  )
}
