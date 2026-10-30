// Display-only ownership hint for this browser session. Never used to authorize writes.
import type { ShareState } from './share-snapshot'

let owner: ShareState | null = null
let epoch = 0
const listeners = new Set<() => void>()
export const getPublishedOwnerSlug = () => owner?.slug ?? null
export const getPublishedOwnerEpoch = () => epoch
export function subscribePublishedOwner(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function rememberPublishedOwner(next: ShareState, requestEpoch: number) {
  if (typeof window === 'undefined' || requestEpoch !== epoch) return
  if (owner?.athleteId === next.athleteId && BigInt(owner.revision) > BigInt(next.revision)) return
  owner = next
  for (const listener of listeners) listener()
}
export function clearPublishedOwner() {
  epoch++
  owner = null
  for (const listener of listeners) listener()
}
