import type { HTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border border-panel-border bg-foreground/5 px-2 py-0.5 text-xs-compact tracking-normal',
        className,
      )}
      {...props}
    />
  )
}
