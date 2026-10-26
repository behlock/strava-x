'use client'

import { useEffect } from 'react'

import { matchesShortcut, type ShortcutId } from '@/lib/keyboard-shortcuts'

const bindings = new Map<symbol, { id: ShortcutId; run: () => void }>()
const EDITABLE =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="combobox"]'

function handleShortcut(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.repeat) return
  if (event.target instanceof Element && event.target.closest(EDITABLE)) return
  // Dialogs own keyboard input until closed; keep global shortcuts out of them.
  if (
    Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).some(
      (dialog) => dialog.getClientRects().length > 0,
    )
  )
    return

  for (const { id, run } of bindings.values()) {
    if (!matchesShortcut(event, id)) continue
    event.preventDefault()
    run()
    break
  }
}

/** All actions share one listener, with typing, dialog, composition, and repeat guards. */
export function useKeyboardShortcut(id: ShortcutId, run: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const token = Symbol(id)
    if (bindings.size === 0) document.addEventListener('keydown', handleShortcut)
    bindings.set(token, { id, run })
    return () => {
      bindings.delete(token)
      if (bindings.size === 0) document.removeEventListener('keydown', handleShortcut)
    }
  }, [id, run, enabled])
}
