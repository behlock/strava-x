export const SWIPE_THRESHOLD = 50
export const SWIPE_CLICK_SUPPRESS_PX = 10

export function swipeDirection(deltaY: number, threshold = SWIPE_THRESHOLD): 'up' | 'down' | null {
  if (deltaY > threshold) return 'down'
  if (deltaY < -threshold) return 'up'
  return null
}

/** True when a swipe-down would steal an in-progress scroll. */
export function scrollParentBlocksSwipeDown(target: EventTarget | null, root: EventTarget | null): boolean {
  if (!(target instanceof Element) || !(root instanceof Element)) return false
  let el: Element | null = target
  while (el && root.contains(el)) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return true
    el = el.parentElement
  }
  return false
}
