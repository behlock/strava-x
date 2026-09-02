'use client'

import { cn } from '@/lib/utils'

interface CheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  count?: number
  className?: string
  onHover?: (hovered: boolean) => void
}

export function Checkbox({ checked, onChange, label, count, className, onHover }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        '-mx-1 flex min-h-[44px] w-full items-center justify-between px-1 py-3 text-sm-compact transition-colors hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-hidden md:min-h-0 md:py-1',
        className,
      )}
    >
      <span className="font-mono text-panel-muted" aria-hidden="true">
        {checked ? '[x]' : '[ ]'}
      </span>
      <span className="ml-2 flex-1 text-left">{label}</span>
      {count !== undefined && (
        <span className="text-panel-muted tabular-nums" aria-hidden="true">
          ({count.toString().padStart(3, '0')})
        </span>
      )}
    </button>
  )
}
