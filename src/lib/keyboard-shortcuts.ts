export type ShortcutId = 'toggle-ui' | 'toggle-theme' | 'toggle-map-style'

export const SHORTCUTS = {
  'toggle-ui': { key: 's', label: 'S', aria: 'S' },
  'toggle-theme': { key: 't', label: 'T', aria: 'T' },
  'toggle-map-style': { key: 'm', label: 'M', aria: 'M' },
} as const

type ShortcutKeyEvent = Pick<KeyboardEvent, 'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'>

export function matchesShortcut(event: ShortcutKeyEvent, id: ShortcutId): boolean {
  return (
    event.key.toLowerCase() === SHORTCUTS[id].key &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  )
}
