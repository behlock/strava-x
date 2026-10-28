'use client'

import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Plus, Settings2, Unplug, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { MapStyleToggle } from './map-style-toggle'
import { ThemeSwitch } from './theme-switch'
import { Tooltip } from './tooltip'

interface ProfileMenuProps {
  children?: ReactNode
  onDisconnect?: () => void
  profilePhotoUrl?: string | null
}

export function ProfileMenu({ onDisconnect, profilePhotoUrl, children }: ProfileMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmingLogout, setConfirmingLogout] = useState(false)
  const [settledOpen, setSettledOpen] = useState(false)
  const [loadedPhotoUrl, setLoadedPhotoUrl] = useState<string | null>(null)
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null)
  const showPhoto = profilePhotoUrl && profilePhotoUrl !== failedPhotoUrl
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const actionsId = useId()
  const logoutQuestionId = useId()

  const collapse = useCallback(() => {
    setSettledOpen(false)
    setOpen(false)
    setConfirmingLogout(false)
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

  const closeConfirmation = () => {
    setConfirmingLogout(false)
    setTimeout(() => triggerRef.current?.focus({ preventScroll: true }), 0)
  }

  return (
    <div
      ref={rootRef}
      className="relative flex shrink-0 flex-row-reverse items-center"
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) collapse()
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={open ? 'Close profile controls' : 'Open profile controls'}
        aria-expanded={open}
        aria-controls={actionsId}
        onClick={() => {
          if (open) collapse()
          else {
            setSettledOpen(false)
            setOpen(true)
          }
        }}
        className="mobile-touch-target relative flex size-9 shrink-0 items-center justify-center rounded-lg floating-control text-foreground focus-ring md:size-[35px]"
      >
        {showPhoto && (
          <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-[calc(var(--radius-lg)-1px)]">
            {/* Strava photos load directly because their remote hosts vary by athlete. */}
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
          </span>
        )}
        {!showPhoto && !open && <Settings2 className="size-4" aria-hidden="true" />}
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
        className="profile-menu-reveal absolute top-[calc(100%+0.75rem)] right-0 shrink-0 rounded-lg bg-panel md:static md:bg-transparent"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'max-width') setSettledOpen(open)
        }}
      >
        <div
          role="group"
          aria-label="Profile controls"
          data-open={open}
          className="profile-menu-items relative flex max-w-[calc(100vw-2rem)] items-center rounded-lg border border-panel-border p-2 md:max-w-none md:border-0 md:p-0"
        >
          {children}
          <MapStyleToggle />
          <ThemeSwitch />
          {onDisconnect &&
            (confirmingLogout ? (
              <>
                <button
                  type="button"
                  aria-label="Cancel log out"
                  autoFocus
                  onClick={closeConfirmation}
                  className="mobile-touch-target inline-flex size-8 shrink-0 items-center justify-center rounded-lg floating-control focus-ring md:size-[35px]"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Confirm log out"
                  aria-describedby={logoutQuestionId}
                  onClick={() => {
                    collapse()
                    onDisconnect()
                  }}
                  className="mobile-touch-target inline-flex size-8 shrink-0 items-center justify-center rounded-lg floating-control text-red-600 focus-ring md:size-[35px] dark:text-red-400"
                >
                  <Check className="size-3.5" aria-hidden="true" />
                </button>
                <div
                  id={logoutQuestionId}
                  role="status"
                  className="absolute top-[calc(100%+0.5rem)] right-0 w-max rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 text-xs-compact text-panel-muted"
                >
                  log out?
                </div>
              </>
            ) : (
              <Tooltip text="log out">
                <button
                  type="button"
                  aria-label="Log out"
                  onClick={() => setConfirmingLogout(true)}
                  className="mobile-touch-target inline-flex size-8 shrink-0 items-center justify-center rounded-lg floating-control focus-ring md:size-[35px]"
                >
                  <Unplug className="size-4" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </Tooltip>
            ))}
        </div>
      </div>
    </div>
  )
}
