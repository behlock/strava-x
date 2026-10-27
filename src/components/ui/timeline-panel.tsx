'use client'

import { useContext } from 'react'
import { Pause, Play } from 'lucide-react'

import { useTimelinePlayback } from '@/hooks/use-timeline-playback'
import { Panel, PanelVisibilityContext } from './panel'
import { Tooltip } from './tooltip'

interface TimelinePanelProps {
  dateRange: { min: Date; max: Date }
  selectedDate: number
  onDateChange: (value: number) => void
}

function formatMonth(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toLowerCase()
}

const RANGE_THUMB =
  '[&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground md:[&::-webkit-slider-thumb]:size-3 ' +
  '[&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground md:[&::-moz-range-thumb]:size-3'

export function TimelinePanel({ dateRange, selectedDate, onDateChange }: TimelinePanelProps) {
  const visible = useContext(PanelVisibilityContext)
  const canPlay = dateRange.max.getTime() > dateRange.min.getTime()
  const { playing, toggle, pause, seek } = useTimelinePlayback(selectedDate, onDateChange, visible && canPlay)
  const handleSpace = (event: React.KeyboardEvent) => {
    if (event.key !== ' ' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    event.preventDefault()
    if (!event.repeat) toggle()
  }
  const cutoffDate = new Date(
    dateRange.min.getTime() + ((dateRange.max.getTime() - dateRange.min.getTime()) * selectedDate) / 100,
  )

  return (
    <Panel
      title="timeline"
      onExpandedChange={(expanded) => {
        if (!expanded) pause()
      }}
    >
      <div className="flex flex-col gap-1 px-3 py-2">
        <div className="flex justify-between px-2 text-xs-compact text-panel-muted">
          <span>{formatMonth(dateRange.min)}</span>
          <span>{formatMonth(cutoffDate)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Tooltip text={playing ? 'pause' : 'play'} shortcut="Space">
            <button
              type="button"
              onClick={toggle}
              onKeyDown={handleSpace}
              disabled={!canPlay}
              aria-label={playing ? 'Pause timeline' : 'Play timeline'}
              aria-pressed={playing}
              aria-keyshortcuts="Space"
              className="flex size-11 items-center justify-center rounded-lg focus-ring transition-colors hover:bg-foreground/5 disabled:opacity-40 md:size-6"
            >
              {playing ? (
                <Pause className="size-3.5" aria-hidden="true" />
              ) : (
                <Play className="size-3.5" aria-hidden="true" />
              )}
            </button>
          </Tooltip>
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={selectedDate}
            onPointerDown={pause}
            onKeyDown={(event) => {
              if (event.key === ' ') handleSpace(event)
              else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault()
                seek(event.key === 'Home' ? 0 : 100)
              } else if (event.key === 'PageUp' || event.key === 'PageDown') {
                event.preventDefault()
                seek(Math.max(0, Math.min(100, selectedDate + (event.key === 'PageUp' ? 10 : -10))))
              } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) pause()
            }}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Activity date cutoff"
            aria-valuetext={`Showing activities up to ${cutoffDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`}
            className={`h-11 min-w-0 flex-1 cursor-pointer appearance-none bg-transparent focus-ring md:h-4 [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-panel-border md:[&::-moz-range-track]:h-1 [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-panel-border md:[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-thumb]:-mt-[9px] md:[&::-webkit-slider-thumb]:-mt-1 ${RANGE_THUMB}`}
          />
        </div>
      </div>
    </Panel>
  )
}
