'use client'

import { useEffect } from 'react'

/** Keep browser chrome in sync with a manual theme override as well as the OS. */
export function BrowserTheme() {
  useEffect(() => {
    const update = () => {
      const color = getComputedStyle(document.documentElement).getPropertyValue('--background').trim()
      for (const tag of document.querySelectorAll('meta[name="theme-color"]')) {
        tag.setAttribute('content', color)
      }
    }
    // Observe the applied class: next-themes may apply it after child effects.
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    update()
    return () => observer.disconnect()
  }, [])
  return null
}
