'use client'
import { ChoiceList } from './choice-list'
import { Panel } from './panel'

interface FilterPanelProps {
  activityTypes: readonly string[]
  selectedActivityTypes: string[]
  onActivityTypesChange: (types: string[]) => void
  activityCounts: Record<string, number>
  dateRange: { min: Date; max: Date } | null
  selectedDate: number
  onDateChange: (value: number) => void
  onTypeHover: (type: string | null) => void
}
function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }).toLowerCase()
}

const RANGE_THUMB =
  '[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-sm [&::-webkit-slider-thumb]:bg-foreground md:[&::-webkit-slider-thumb]:size-3 ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-sm [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground md:[&::-moz-range-thumb]:size-3'

export function FilterPanel({
  activityTypes,
  selectedActivityTypes,
  onActivityTypesChange,
  activityCounts,
  dateRange,
  selectedDate,
  onDateChange,
  onTypeHover,
}: FilterPanelProps) {
  const cutoffDate = dateRange
    ? new Date(dateRange.min.getTime() + ((dateRange.max.getTime() - dateRange.min.getTime()) * selectedDate) / 100)
    : null

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
      {dateRange && cutoffDate && (
        <div className="border-t border-panel-border pt-2">
          <div className="mb-2 flex justify-between text-xs-compact text-panel-muted">
            <span>{formatMonth(dateRange.min)}</span>
            <span>{formatMonth(cutoffDate)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={selectedDate}
            onChange={(e) => onDateChange(Number(e.target.value))}
            aria-label="Activity date cutoff"
            aria-valuetext={`Showing activities up to ${cutoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
            className={`h-2 w-full cursor-pointer appearance-none rounded-sm bg-panel-border focus-ring md:h-1 ${RANGE_THUMB}`}
          />
        </div>
      )}
    </Panel>
  )
}
