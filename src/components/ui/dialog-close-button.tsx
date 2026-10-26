'use client'

import type { ButtonHTMLAttributes, Ref } from 'react'

import { X } from 'lucide-react'

import { cn } from '@/lib/utils'

interface DialogCloseButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  ref?: Ref<HTMLButtonElement>
}

/** A quiet close control with a generous touch target. */
export function DialogCloseButton({ className, ...props }: DialogCloseButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        '-m-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full p-2 text-xs-compact text-panel-muted transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/10 focus-visible:text-foreground focus-visible:outline-hidden md:min-h-0 md:min-w-0',
        className,
      )}
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  )
}
