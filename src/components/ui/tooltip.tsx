'use client'

import { ReactNode, useState, useRef, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/utils'

interface TooltipProps {
  children: ReactNode
  text: string
  position?: 'top' | 'bottom'
  /**
   * Horizontal alignment of the tooltip relative to the trigger.
   * - `center`: tooltip is centered under/above the trigger (default).
   * - `start`:  tooltip's left edge aligns to the trigger's left edge.
   * - `end`:    tooltip's right edge aligns to the trigger's right edge — use
   *             this for triggers close to the viewport's right edge so the
   *             bubble stays on-screen.
   */
  align?: 'center' | 'start' | 'end'
  disabled?: boolean
  /** Custom class for the tooltip bubble (replaces default styling). */
  tooltipClassName?: string
  /** Render via portal so the tooltip escapes overflow-hidden containers. */
  portal?: boolean
}

export function Tooltip({
  children,
  text,
  position = 'bottom',
  align = 'center',
  disabled = false,
  tooltipClassName,
  portal = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; right: number } | null>(null)

  const updateCoords = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      left: rect.left + rect.width / 2,
      right: window.innerWidth - rect.right,
      top: position === 'top' ? rect.top - 8 : rect.bottom + 8,
    })
  }, [position])

  useEffect(() => {
    if (visible && portal) updateCoords()
  }, [visible, portal, updateCoords])

  const defaultClass =
    'px-2 py-1 bg-panel/95 panel-blur border border-panel-border text-foreground text-xs-compact tracking-wider rounded-sm whitespace-nowrap pointer-events-none transition-opacity duration-150'

  const bubbleClass = tooltipClassName
    ? cn(tooltipClassName, 'pointer-events-none transition-opacity duration-150')
    : defaultClass

  const alignClasses = align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2'

  const inlineTooltip = (
    <div
      className={cn(
        'absolute z-50',
        alignClasses,
        position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        bubbleClass,
      )}
      style={{ opacity: visible ? 1 : 0 }}
      role="tooltip"
    >
      {text}
    </div>
  )

  // For `center` alignment, coords.left is the trigger's horizontal midpoint,
  // so we pull the bubble left by 50% of its own width. `start` and `end`
  // pin to an edge, so no horizontal translate is needed.
  const portalTranslateY = position === 'top' ? 'translateY(-100%)' : 'translateY(0)'
  const portalTranslateX = align === 'center' ? 'translateX(-50%)' : ''

  const portalTooltip = coords && (
    <div
      className={cn('fixed z-[9999]', bubbleClass)}
      style={{
        opacity: visible ? 1 : 0,
        top: coords.top,
        ...(align === 'end'
          ? { right: coords.right }
          : align === 'start'
            ? { left: triggerRef.current?.getBoundingClientRect().left ?? coords.left }
            : { left: coords.left }),
        transform: `${portalTranslateX} ${portalTranslateY}`.trim(),
      }}
      role="tooltip"
    >
      {text}
    </div>
  )

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={() => !disabled && setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => !disabled && setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {!disabled &&
        (portal && typeof document !== 'undefined' ? createPortal(portalTooltip, document.body) : inlineTooltip)}
    </div>
  )
}
