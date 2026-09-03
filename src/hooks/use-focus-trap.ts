'use client'

import { type RefObject, useEffect, useRef } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface UseFocusTrapOptions {
  active: boolean
  onEscape?: () => void
  /** Element to focus on activation. Defaults to the first focusable, then the container. */
  initialFocus?: RefObject<HTMLElement | null>
}

/**
 * Keeps keyboard focus inside `containerRef` while `active`: focus moves in
 * on activation, Tab wraps at both ends (including from the container
 * itself), Escape calls `onEscape`, and the previously focused element gets
 * focus back on deactivation.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape, initialFocus }: UseFocusTrapOptions,
) {
  // Latest callback without re-running the effect (which would reset focus).
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    ;(initialFocus?.current ?? focusables()[0] ?? container).focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onEscapeRef.current?.()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        e.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement
      const onItem = current instanceof HTMLElement && current !== container && container.contains(current)
      if (e.shiftKey && (!onItem || current === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (!onItem || current === last)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused?.isConnected) previouslyFocused.focus()
    }
  }, [active, containerRef, initialFocus])
}
