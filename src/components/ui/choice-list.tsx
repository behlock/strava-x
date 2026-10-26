'use client'

import { useId, useRef } from 'react'
import { cn } from '@/lib/utils'

interface ChoiceListProps {
  label: string
  options: { id: string | null; label: string; count: number }[]
  selectedId: string | null
  onSelect: (id: string | null, toggle: boolean) => void
  onHover?: (id: string | null) => void
  className?: string
}

/** One tab stop with arrow-key selection, shared by location and activity filters. */
export function ChoiceList({ label, options, selectedId, onSelect, onHover, className }: ChoiceListProps) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const current = options.findIndex((option) => option.id === selectedId)
  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={current >= 0 ? `${id}-${current}` : undefined}
      className={cn('space-y-0.5 p-3 focus-ring-inset', className)}
      onMouseLeave={() => onHover?.(null)}
      onKeyDown={(event) => {
        let index: number
        switch (event.key) {
          case 'ArrowDown':
            index = Math.min(current + 1, options.length - 1)
            break
          case 'ArrowUp':
            index = Math.max(current - 1, 0)
            break
          case 'Home':
            index = 0
            break
          case 'End':
            index = options.length - 1
            break
          case 'Enter':
          case ' ':
            if (current < 0) return
            event.preventDefault()
            onSelect(options[current].id, true)
            return
          default:
            return
        }
        if (!options[index]) return
        event.preventDefault()
        onSelect(options[index].id, false)
        ;(ref.current?.children[index] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
      }}
    >
      {options.map((option, index) => (
        <div
          key={option.id ?? 'all'}
          id={`${id}-${index}`}
          role="option"
          aria-selected={selectedId === option.id}
          onClick={() => {
            ref.current?.focus({ preventScroll: true })
            onSelect(option.id, true)
          }}
          onMouseEnter={() => onHover?.(option.id)}
          className={cn(
            'flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-xs-compact tracking-wider transition-colors md:min-h-0',
            selectedId === option.id
              ? 'border-selection-foreground bg-selection font-medium text-selection-foreground'
              : 'border-transparent hover:bg-control-hover',
          )}
        >
          <span className="min-w-0 truncate">{option.label}</span>
          <span
            className={cn(
              'shrink-0 tabular-nums',
              selectedId === option.id ? 'text-selection-muted' : 'text-panel-muted',
            )}
          >
            <span className="sr-only"> — </span>({String(option.count).padStart(3, '0')})
            <span className="sr-only"> activities</span>
          </span>
        </div>
      ))}
    </div>
  )
}
