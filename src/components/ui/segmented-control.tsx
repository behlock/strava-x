'use client'

import { useRef } from 'react'

import { cn } from '@/lib/utils'

interface SegmentedControlProps<T extends string> {
  options: readonly T[]
  /** `null` renders no selection (e.g. before the stored value is known). */
  value: T | null
  onChange: (value: T) => void
  'aria-label': string
  className?: string
}

/**
 * Radio group rendered as joined segments. One Tab stop: arrows move and
 * select, Home/End jump to the ends, as in the WAI-ARIA radio group pattern.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  'aria-label': ariaLabel,
  className,
}: SegmentedControlProps<T>) {
  const groupRef = useRef<HTMLDivElement>(null)
  const selectedIndex = value === null ? -1 : options.indexOf(value)
  // The selected segment is the Tab stop; the first one stands in until there is a selection.
  const tabStopIndex = selectedIndex === -1 ? 0 : selectedIndex

  const select = (index: number) => {
    onChange(options[index])
    groupRef.current?.querySelectorAll<HTMLElement>('[role=radio]')[index]?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const count = options.length
    const current = selectedIndex === -1 ? tabStopIndex : selectedIndex
    let next: number
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % count
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + count) % count
        break
      case 'Home':
        next = 0
        break
      case 'End':
        next = count - 1
        break
      default:
        return
    }
    e.preventDefault()
    select(next)
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn('inline-flex overflow-hidden rounded-sm border border-panel-border', className)}
    >
      {options.map((option, index) => {
        const selected = index === selectedIndex
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={index === tabStopIndex ? 0 : -1}
            onClick={() => select(index)}
            className={cn(
              'min-h-11 px-2 py-1 text-xs-compact tracking-wider focus-ring-inset transition-colors md:min-h-0',
              selected
                ? 'bg-foreground text-background'
                : 'text-panel-muted hover:bg-foreground/5 hover:text-foreground',
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
