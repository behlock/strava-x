'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Globe, Share2 } from 'lucide-react'

import { HeaderChip } from './header-bar'

interface ShareMenuProps {
  onExport: () => void
  onPublish: () => void
  /** Publishing needs a connected Strava account; without it the chip exports directly. */
  canPublish: boolean
  /** Pass `end` when the chip is the last one in the header. */
  tooltipAlign?: 'center' | 'start' | 'end'
}

const ITEM_CLASS =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-xs-compact tracking-wider whitespace-nowrap transition-colors hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-hidden'

/** One header chip for both ways of getting the map out of the app. */
export function ShareMenu({ onExport, onPublish, canPublish, tooltipAlign }: ShareMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close and hand focus back to the chip, so nothing is left on a detached node.
  const close = useCallback(() => {
    triggerRef.current?.focus()
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    const handlePointer = (e: PointerEvent) => {
      // The click lands somewhere else, so let that element take focus.
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, close])

  const choose = (action: () => void) => {
    close()
    action()
  }

  // Arrow keys move between items; Tab closes and continues from the chip.
  const handleMenuKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLElement)
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        items[(index + 1) % items.length]?.focus()
        break
      case 'ArrowUp':
        e.preventDefault()
        items[(index - 1 + items.length) % items.length]?.focus()
        break
      case 'Home':
        e.preventDefault()
        items[0]?.focus()
        break
      case 'End':
        e.preventDefault()
        items[items.length - 1]?.focus()
        break
      case 'Tab':
        close()
        break
    }
  }

  if (!canPublish) {
    return (
      <HeaderChip tooltip="export" tooltipAlign={tooltipAlign} onClick={onExport} aria-label="Export image">
        <Share2 className="size-4" />
      </HeaderChip>
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <HeaderChip
        ref={triggerRef}
        tooltip="share"
        tooltipAlign={tooltipAlign}
        tooltipHidden={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault()
            setOpen(true)
          }
        }}
        aria-label="Share map"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Share2 className="size-4" />
      </HeaderChip>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={handleMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-2 min-w-36 rounded-sm border border-panel-border bg-panel/95 py-1 backdrop-blur-md"
        >
          <button type="button" role="menuitem" onClick={() => choose(onExport)} className={ITEM_CLASS}>
            <Download className="size-3.5 shrink-0" aria-hidden="true" />
            export image
          </button>
          <button type="button" role="menuitem" onClick={() => choose(onPublish)} className={ITEM_CLASS}>
            <Globe className="size-3.5 shrink-0" aria-hidden="true" />
            publish map
          </button>
        </div>
      )}
    </div>
  )
}
