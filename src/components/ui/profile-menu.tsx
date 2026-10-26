'use client'

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Plus } from 'lucide-react'

import { cn } from '@/lib/utils'
import { ThemeSwitch } from './theme-switch'

interface ProfileMenuProps {
  onDisconnect?: () => void
  profilePhotoUrl?: string | null
}

export function ProfileMenu({ onDisconnect, profilePhotoUrl }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [settledOpen, setSettledOpen] = useState(false)
  const [loadedPhotoUrl, setLoadedPhotoUrl] = useState<string | null>(null)
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null)
  const showPhoto = profilePhotoUrl && profilePhotoUrl !== failedPhotoUrl
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const actionsId = useId()

  const collapse = useCallback(() => {
    setSettledOpen(false)
    setOpen(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) collapse()
    }
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        collapse()
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('pointerdown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, collapse])

  const choose = (action: () => void) => {
    collapse()
    triggerRef.current?.focus()
    action()
  }

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 flex-row-reverse items-center"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) collapse()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? 'Close profile controls' : 'Open profile controls'}
        aria-expanded={open}
        aria-controls={actionsId}
        onClick={() => {
          setSettledOpen(false)
          setOpen((value) => !value)
        }}
        className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full floating-control text-foreground focus-ring md:size-[35px]"
      >
        {showPhoto && (
          // Remote Strava photo URLs vary by athlete; load directly without an image proxy.
          <img
            src={profilePhotoUrl}
            alt=""
            referrerPolicy="no-referrer"
            onLoad={() => setLoadedPhotoUrl(profilePhotoUrl)}
            onError={() => setFailedPhotoUrl(profilePhotoUrl)}
            className={cn(
              'absolute inset-0 size-full object-cover transition-[opacity,rotate] duration-300 ease-[cubic-bezier(0,0,0.58,1)] motion-reduce:transition-none',
              open
                ? '-rotate-45 opacity-0'
                : loadedPhotoUrl === profilePhotoUrl
                  ? 'rotate-0 opacity-100'
                  : 'rotate-0 opacity-0',
            )}
          />
        )}
        <Plus
          aria-hidden="true"
          className={cn(
            'absolute size-[19px] transition-[opacity,rotate] duration-300 ease-[cubic-bezier(0,0,0.58,1)] motion-reduce:transition-none',
            open ? 'rotate-45 opacity-100' : 'rotate-90 opacity-0',
          )}
        />
      </button>
      <div
        id={actionsId}
        inert={!open}
        aria-hidden={!open}
        data-open={open}
        data-settled-open={settledOpen}
        className="profile-menu-reveal absolute top-0 right-full shrink-0 rounded-full bg-panel md:static md:bg-transparent"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'max-width') setSettledOpen(open)
        }}
      >
        <div
          role="group"
          aria-label="Profile controls"
          data-open={open}
          className="profile-menu-items flex items-center"
        >
          <ThemeSwitch />
          {onDisconnect && (
            <button
              type="button"
              onClick={() => choose(onDisconnect)}
              className="min-h-11 shrink-0 rounded-full floating-control px-3 text-xs-compact tracking-wider whitespace-nowrap focus-ring sm:px-4 md:min-h-[35px]"
            >
              disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
