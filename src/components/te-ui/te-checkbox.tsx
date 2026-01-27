'use client'

import { cn } from '@/lib/utils'

interface TECheckboxProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  count?: number
  className?: string
  onHover?: (hovered: boolean) => void
}

export function TECheckbox({
  checked,
  onChange,
  label,
  count,
  className,
  onHover,
}: TECheckboxProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      className={cn(
        'flex items-center justify-between w-full text-te-sm py-3 md:py-1 min-h-[44px] md:min-h-0 hover:bg-foreground/5 px-1 -mx-1 transition-colors',
        className
      )}
    >
      <span className="text-te-muted font-mono">
        {checked ? '[x]' : '[ ]'}
      </span>
      <span className="flex-1 text-left ml-2">{label}</span>
      {count !== undefined && (
        <span className="text-te-muted tabular-nums">
          ({count.toString().padStart(3, '0')})
        </span>
      )}
    </button>
  )
}
