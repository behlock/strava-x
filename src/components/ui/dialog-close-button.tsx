'use client'

import type { ButtonHTMLAttributes, Ref } from 'react'

import { cn } from '@/lib/utils'

interface DialogCloseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  ref?: Ref<HTMLButtonElement>
}

/**
 * The `[x]` in a dialog's corner. Reads as text but has a 44px hit area on
 * touch screens; the negative margins keep the glyph where the text would sit.
 */
export function DialogCloseButton({ className, ...props }: DialogCloseButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        '-m-2 inline-flex min-h-11 min-w-11 items-center justify-center p-2 text-xs-compact text-panel-muted focus-ring transition-colors hover:text-foreground md:min-h-0 md:min-w-0',
        className,
      )}
      {...props}
    >
      [x]
    </button>
  )
}
