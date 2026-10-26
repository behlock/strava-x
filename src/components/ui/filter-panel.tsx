'use client'
import { ChoiceList } from './choice-list'
import { Panel } from './panel'

interface FilterPanelProps {
  activityTypes: readonly string[]
  selectedActivityTypes: string[]
  onActivityTypesChange: (types: string[]) => void
  activityCounts: Record<string, number>
  onTypeHover: (type: string | null) => void
}
export function FilterPanel({
  activityTypes,
  selectedActivityTypes,
  onActivityTypesChange,
  activityCounts,
  onTypeHover,
}: FilterPanelProps) {
  const selected = selectedActivityTypes.length === 1 ? selectedActivityTypes[0] : null
  const types = [...activityTypes].sort((a, b) => (activityCounts[b] ?? 0) - (activityCounts[a] ?? 0))
  return (
    <Panel title="activity types">
      <ChoiceList
        label="Activity types"
        selectedId={selected}
        onHover={onTypeHover}
        options={[
          {
            id: null,
            label: 'all activity types',
            count: types.reduce((sum, type) => sum + (activityCounts[type] ?? 0), 0),
          },
          ...types.map((type) => ({ id: type, label: type, count: activityCounts[type] ?? 0 })),
        ]}
        onSelect={(type, toggle) => {
          onTypeHover(null)
          onActivityTypesChange(type === null || (toggle && selected === type) ? [...activityTypes] : [type])
        }}
      />
    </Panel>
  )
}
