'use client'

import { type ReactNode, useCallback, useState } from 'react'

import { cn } from '@/lib/utils'

/** Horizontal alignment of the bubble relative to its trigger. */
export type TooltipAlign = 'center' | 'start' | 'end'

interface TooltipProps {
  children: ReactNode
  text: string
  position?: 'top' | 'bottom'
  /** Use `end` for triggers near the viewport's right edge so the bubble stays on-screen. */
  align?: TooltipAlign
  disabled?: boolean
}

const BUBBLE_CLASS =
  'pointer-events-none rounded-sm border border-panel-border bg-panel/95 px-2 py-1 text-xs-compact tracking-wider whitespace-nowrap text-foreground backdrop-blur-md transition-opacity duration-150'

export function Tooltip({ children, text, position = 'bottom', align = 'center', disabled = false }: TooltipProps) {
  const [visible, setVisible] = useState(false)

  const show = useCallback(() => {
    if (disabled) return
    setVisible(true)
  }, [disabled])
  const hide = useCallback(() => setVisible(false), [])

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {!disabled && (
        <div
          role="tooltip"
          className={cn(
            'absolute z-50',
            align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2',
            position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            BUBBLE_CLASS,
          )}
          style={{ opacity: visible ? 1 : 0 }}
        >
          {text}
        </div>
      )}
    </div>
  )
}
