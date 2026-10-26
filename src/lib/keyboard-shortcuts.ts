export type ShortcutId = 'toggle-ui' | 'toggle-theme' | 'publish-map'

export const SHORTCUTS = {
  'toggle-ui': { key: 's', label: 'S', aria: 'S' },
  'toggle-theme': { key: 't', label: 'T', aria: 'T' },
  'publish-map': { key: 'p', label: 'P', aria: 'P' },
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
