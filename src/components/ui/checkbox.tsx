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
        'flex items-center justify-between w-full text-sm-compact py-3 md:py-1 min-h-[44px] md:min-h-0 hover:bg-foreground/5 px-1 -mx-1 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground',
        className,
      )}
    >
      <span className="text-panel-muted font-mono" aria-hidden="true">
        {checked ? '[x]' : '[ ]'}
      </span>
      <span className="flex-1 text-left ml-2">{label}</span>
      {count !== undefined && (
        <span className="text-panel-muted tabular-nums" aria-hidden="true">
          ({count.toString().padStart(3, '0')})
        </span>
      )}
    </button>
  )
}
