'use client'

import { type ReactNode, cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { autoUpdate, flip, hide as hideReference, offset, shift, useFloating } from '@floating-ui/react-dom'

export type TooltipAlign = 'center' | 'start' | 'end'

// Delay initial hover, then allow quick movement between tooltips.
const HOVER_DELAY = 700
const SKIP_DELAY_WINDOW = 300
let warmUntil = 0
let activeTooltip: { id: string; hide: () => void } | null = null

interface TooltipProps {
  children: ReactNode
  text: string
  shortcut?: string
  position?: 'top' | 'bottom'
  align?: TooltipAlign
  disabled?: boolean
}

export function Tooltip({
  children,
  text,
  shortcut,
  position = 'bottom',
  align = 'center',
  disabled = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const id = useId()
  const shown = visible && !disabled
  const {
    refs: { setReference, setFloating },
    floatingStyles,
    isPositioned,
    middlewareData,
  } = useFloating({
    open: shown,
    placement: align === 'center' ? position : `${position}-${align}`,
    strategy: 'fixed',
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 }), hideReference()],
    whileElementsMounted: (reference, floating, update) =>
      autoUpdate(reference, floating, update, { animationFrame: true }),
  })
  const pendingRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const leaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelTimers = useCallback(() => {
    if (pendingRef.current) clearTimeout(pendingRef.current)
    if (leaveRef.current) clearTimeout(leaveRef.current)
    pendingRef.current = null
    leaveRef.current = null
  }, [])

  const hide = useCallback(() => {
    cancelTimers()
    if (activeTooltip?.id === id) {
      activeTooltip = null
      warmUntil = Date.now() + SKIP_DELAY_WINDOW
    }
    setVisible(false)
  }, [id, cancelTimers])

  const show = useCallback(() => {
    cancelTimers()
    if (disabled) return
    if (activeTooltip?.id !== id) activeTooltip?.hide()
    activeTooltip = { id, hide }
    setVisible(true)
  }, [id, disabled, hide, cancelTimers])

  const hover = () => {
    cancelTimers()
    if (disabled) return
    if (activeTooltip || Date.now() < warmUntil) show()
    else pendingRef.current = setTimeout(show, HOVER_DELAY)
  }

  const leave = () => {
    cancelTimers()
    // Allow crossing the small gap into the tooltip without dismissing it.
    leaveRef.current = setTimeout(hide, 100)
  }

  useEffect(
    () => () => {
      cancelTimers()
      if (activeTooltip?.id === id) {
        activeTooltip = null
        warmUntil = Date.now() + SKIP_DELAY_WINDOW
      }
    },
    [id, cancelTimers],
  )

  useEffect(() => {
    if (!shown) return
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('keydown', dismiss)
    return () => document.removeEventListener('keydown', dismiss)
  }, [shown, hide])

  const child = isValidElement<{ 'aria-describedby'?: string }>(children)
    ? cloneElement(children, {
        'aria-describedby':
          [children.props['aria-describedby'], shown ? id : undefined].filter(Boolean).join(' ') || undefined,
      })
    : children

  return (
    <div
      ref={setReference}
      className="relative inline-flex min-w-0"
      onPointerEnter={(event) => {
        if (event.pointerType !== 'touch') hover()
      }}
      onPointerLeave={leave}
      onFocus={(event) => {
        if (event.target.matches(':focus-visible')) show()
      }}
      onBlur={hide}
      onPointerDown={hide}
      onKeyDown={(event) => {
        if (['Escape', 'Enter', ' '].includes(event.key)) hide()
      }}
    >
      {child}
      {shown &&
        createPortal(
          <div
            ref={setFloating}
            id={id}
            role="tooltip"
            className="pointer-events-auto fixed z-50 w-max max-w-[calc(100vw-16px)] rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 text-center font-mono text-xs-compact font-medium break-words text-foreground"
            onPointerEnter={cancelTimers}
            onPointerLeave={leave}
            style={{
              ...floatingStyles,
              visibility: isPositioned && !middlewareData.hide?.referenceHidden ? 'visible' : 'hidden',
            }}
          >
            <span className="inline-flex items-center gap-3">
              <span>{text}</span>
              {shortcut && (
                <kbd aria-hidden="true" className="shrink-0 whitespace-nowrap opacity-60">
                  {shortcut}
                </kbd>
              )}
            </span>
          </div>,
          document.body,
        )}
    </div>
  )
}
