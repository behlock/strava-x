'use client'
import type { ActivityCluster } from '@/models/location'
import { ChoiceList } from './choice-list'
import { Panel } from './panel'

interface LocationSelectorProps {
  clusters: ActivityCluster[]
  totalActivityCount: number
  selectedClusterId: string | null
  onClusterSelect: (id: string | null, toggle?: boolean) => void
}
export function LocationSelector({
  clusters,
  totalActivityCount,
  selectedClusterId,
  onClusterSelect,
}: LocationSelectorProps) {
  return (
    <Panel title="locations">
      <ChoiceList
        label="Locations"
        selectedId={selectedClusterId}
        onSelect={onClusterSelect}
        className="max-h-[min(40dvh,18rem)] overflow-y-auto overscroll-contain md:max-h-40"
        options={[
          { id: null, label: 'all locations', count: totalActivityCount },
          ...clusters.map((cluster) => ({ id: cluster.id, label: cluster.displayName, count: cluster.activityCount })),
        ]}
      />
    </Panel>
  )
}
