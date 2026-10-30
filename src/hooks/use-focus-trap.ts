'use client'

import { type RefObject, useEffect } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface UseFocusTrapOptions {
  active: boolean
  /** Element to focus on activation. Defaults to the first focusable, then the container. */
  initialFocus?: RefObject<HTMLElement | null>
  /** The modal shell, including its dismissible backdrop. */
  modalRoot?: RefObject<HTMLElement | null>
}

/**
 * Keeps keyboard focus inside `containerRef` while `active`: focus moves in
 * on activation, Tab wraps at both ends (including from the container
 * itself), and the previously focused element gets focus back on deactivation.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, initialFocus, modalRoot }: UseFocusTrapOptions,
) {
  useEffect(() => {
    if (!active) return
    const container = containerRef.current
    if (!container) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const isolated = new Map<HTMLElement, boolean>()
    const root = modalRoot?.current
    const previousOverflow = document.body.style.overflow
    if (root) {
      // Isolate sibling branches, never the backdrop or the dialog itself.
      let branch: HTMLElement = root
      while (branch.parentElement) {
        for (const sibling of branch.parentElement.children) {
          if (sibling !== branch && sibling instanceof HTMLElement) {
            isolated.set(sibling, sibling.inert)
            sibling.setAttribute('inert', '')
          }
        }
        if (branch.parentElement === document.body) break
        branch = branch.parentElement
      }
      document.body.style.overflow = 'hidden'
    }
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          !element.closest('[inert]') &&
          getComputedStyle(element).visibility !== 'hidden',
      )
    ;(initialFocus?.current ?? focusables()[0] ?? container).focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || e.defaultPrevented || container.closest('[inert]')) return
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

    const handleFocus = (event: FocusEvent) => {
      if (!container.closest('[inert]') && event.target instanceof Node && !container.contains(event.target)) {
        ;(focusables()[0] ?? container).focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocus)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocus)
      for (const [element, wasInert] of isolated) element.toggleAttribute('inert', wasInert)
      if (root) document.body.style.overflow = previousOverflow
      if (previouslyFocused?.isConnected && !previouslyFocused.closest('[inert]'))
        previouslyFocused.focus({ preventScroll: true })
    }
  }, [active, containerRef, initialFocus, modalRoot])
}
