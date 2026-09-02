'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

interface TooltipProps {
  children: ReactNode
  text: string
  position?: 'top' | 'bottom'
  /**
   * Horizontal alignment relative to the trigger. Use `end` for triggers near
   * the viewport's right edge so the bubble stays on-screen.
   */
  align?: 'center' | 'start' | 'end'
  disabled?: boolean
  /** Render via portal so the tooltip escapes overflow-hidden containers. */
  portal?: boolean
}

interface PortalCoords {
  top: number
  left: number
  center: number
  right: number
}

const BUBBLE_CLASS =
  'pointer-events-none rounded-sm border border-panel-border bg-panel/95 px-2 py-1 text-xs-compact tracking-wider whitespace-nowrap text-foreground backdrop-blur-md transition-opacity duration-150'

export function Tooltip({
  children,
  text,
  position = 'bottom',
  align = 'center',
  disabled = false,
  portal = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<PortalCoords | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    if (disabled) return
    setVisible(true)
  }, [disabled])
  const hide = useCallback(() => setVisible(false), [])

  // Portal bubbles are positioned from the trigger's viewport rect, measured
  // when they become visible.
  useEffect(() => {
    if (!visible || !portal || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: position === 'top' ? rect.top - 8 : rect.bottom + 8,
      left: rect.left,
      center: rect.left + rect.width / 2,
      right: window.innerWidth - rect.right,
    })
  }, [visible, portal, position])

  let bubble: ReactNode
  if (portal) {
    bubble =
      coords &&
      typeof document !== 'undefined' &&
      createPortal(
        <div
          role="tooltip"
          className={cn('fixed z-9999', BUBBLE_CLASS)}
          style={{
            opacity: visible ? 1 : 0,
            top: coords.top,
            ...(align === 'end' ? { right: coords.right } : { left: align === 'start' ? coords.left : coords.center }),
            transform: [align === 'center' && 'translateX(-50%)', position === 'top' && 'translateY(-100%)']
              .filter(Boolean)
              .join(' '),
          }}
        >
          {text}
        </div>,
        document.body,
      )
  } else {
    bubble = (
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
    )
  }

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {!disabled && bubble}
    </div>
  )
}
