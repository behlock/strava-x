'use client'

import { type ButtonHTMLAttributes, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Link2Off, LoaderCircle, Pencil, X } from 'lucide-react'

import { HeaderChip } from '@/components/ui/header-bar'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { normalizeSlug } from '@/lib/slug'
import type { CheckResult, PublishError } from '@/hooks/use-publish'

interface SharingControlsProps {
  open: boolean
  onOpen: () => void
  onClose: () => void
  currentSlug: string | null
  suggestedAddress?: string
  isPublishing: boolean
  isSyncing: boolean
  estimatedSizeBytes: number
  publish: (slug: string) => Promise<{ error: PublishError } | { slug: string }>
  unpublish: () => Promise<{ ok: true } | { ok: false; error: PublishError }>
  checkSlug: (slug: string) => Promise<CheckResult>
}

const ERROR_MESSAGES: Record<PublishError, string> = {
  sync_required: 'could not refresh your activities, try sharing again',
  sharing_not_configured: 'sharing storage is not configured yet',
  invalid_snapshot: 'this update could not be verified, try sharing again',
  invalid_slug: 'use 2–30 lowercase letters, numbers or dashes',
  slug_reserved: 'that link is reserved, pick another',
  slug_taken: 'someone else already uses that link',
  strava_auth_failed: 'strava session expired, reconnect to continue',
  payload_too_large: 'your activities are too large to share (25 MB limit)',
  network: 'network error, try again',
  server: 'sharing failed on the server',
  busy: 'another update is finishing, try again in a moment',
  publication_changed: 'sharing changed in another tab, review the current link and try again',
  cancelled: 'update cancelled, try again',
}

function availabilityMessage(reason?: string): string {
  switch (reason) {
    case 'auth_failed':
      return ERROR_MESSAGES.strava_auth_failed
    case 'invalid_slug':
      return ERROR_MESSAGES.invalid_slug
    case 'slug_reserved':
      return ERROR_MESSAGES.slug_reserved
    case 'network':
      return ERROR_MESSAGES.network
    case 'server':
      return ERROR_MESSAGES.server
    default:
      return ERROR_MESSAGES.slug_taken
  }
}

function Action({
  label,
  className,
  tooltipHidden = false,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tooltipHidden?: boolean }) {
  return (
    <HeaderChip
      {...props}
      aria-label={label}
      tooltip={label.toLowerCase()}
      tooltipHidden={tooltipHidden}
      className={cn('shrink-0 md:size-[35px]', className)}
    />
  )
}

export function SharingControls({
  open,
  onOpen,
  onClose,
  currentSlug,
  suggestedAddress,
  isPublishing,
  isSyncing,
  estimatedSizeBytes,
  publish,
  unpublish,
  checkSlug,
}: SharingControlsProps) {
  const rootRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const session = useRef({ live: false, version: 0 })
  const [draft, setDraft] = useState<string | null>(null)
  const [lastCheck, setLastCheck] = useState<{ slug: string; result: CheckResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updated, setUpdated] = useState(false)
  const [confirmingStop, setConfirmingStop] = useState(false)
  const [settledOpen, setSettledOpen] = useState(false)
  const statusId = useId()
  const stopQuestionId = useId()
  const input = draft ?? currentSlug ?? suggestedAddress ?? ''
  const displayValue = open ? input : (currentSlug ?? 'sharing')
  const normalized = normalizeSlug(input)
  const editing = !currentSlug || normalized !== currentSlug
  const busy = isPublishing || isSyncing
  const check = editing && normalized && lastCheck?.slug === normalized ? lastCheck.result : null
  const tooLarge = !currentSlug && estimatedSizeBytes > 25 * 1024 * 1024
  const canSubmit = open && !busy && !tooLarge && check?.available === true
  const unavailable = check?.available === false
  const message =
    error ?? (unavailable ? availabilityMessage(check.reason) : tooLarge ? ERROR_MESSAGES.payload_too_large : null)

  const reset = useCallback(() => {
    setDraft(null)
    setError(null)
    setLastCheck(null)
    setUpdated(false)
    setConfirmingStop(false)
  }, [])

  const close = useCallback(
    (restoreFocus = true) => {
      session.current.version++
      reset()
      setSettledOpen(false)
      onClose()
      const field = inputRef.current
      field?.setSelectionRange(field.value.length, field.value.length)
      if (restoreFocus) field?.focus({ preventScroll: true })
    },
    [onClose, reset],
  )

  const edit = () => {
    if (open || busy) return
    session.current.version++
    reset()
    setSettledOpen(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    onOpen()
  }

  useEffect(() => {
    const current = session.current
    current.live = open
    return () => {
      current.live = false
      current.version++
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [open, close])

  useEffect(() => {
    if (!open || !editing || !normalized) return
    let checking = true
    const timer = setTimeout(async () => {
      const result = await checkSlug(normalized).catch(() => ({ available: false, reason: 'network' }))
      if (checking) setLastCheck({ slug: normalized, result })
    }, 300)
    return () => {
      checking = false
      clearTimeout(timer)
    }
  }, [editing, normalized, checkSlug, open])

  useEffect(() => {
    if (!updated) return
    const timer = setTimeout(() => setUpdated(false), 2000)
    return () => clearTimeout(timer)
  }, [updated])

  const save = async () => {
    if (!canSubmit) return
    const version = session.current.version
    setError(null)
    const result = await publish(normalized)
    if (!session.current.live || version !== session.current.version) return
    if ('error' in result) setError(ERROR_MESSAGES[result.error])
    else {
      setDraft(null)
      setUpdated(true)
    }
  }

  const stop = async () => {
    if (!open || busy) return
    const version = session.current.version
    setError(null)
    const result = await unpublish()
    if (!session.current.live || version !== session.current.version) return
    if (result.ok) close()
    else setError(ERROR_MESSAGES[result.error])
  }

  return (
    <form
      ref={rootRef}
      aria-label="Sharing"
      aria-busy={busy}
      className="relative flex shrink-0 flex-row-reverse items-center"
      onSubmit={(event) => {
        event.preventDefault()
        if (confirmingStop) void stop()
        else void save()
      }}
      onBlur={(event) => {
        if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) close(false)
      }}
      onKeyDown={(event) => {
        if (!open || event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (confirmingStop || (currentSlug && editing)) reset()
        else close()
      }}
    >
      <Tooltip text={isSyncing ? 'syncing activities' : 'sharing options'} disabled={open}>
        <label
          onPointerDown={(event) => {
            if (!open) event.preventDefault()
          }}
          onClick={(event) => {
            if (!open) {
              event.preventDefault()
              edit()
            }
          }}
          className={cn(
            'group/link relative inline-flex h-8 max-w-[46vw] min-w-0 items-center rounded-lg border bg-control px-2.5 text-base-compact tracking-wider transition-colors hover:bg-control-hover md:h-[35px] md:max-w-xs md:px-4 md:text-xs-compact',
            open ? 'cursor-text' : 'cursor-pointer',
            !message && (check?.available || updated) && open
              ? 'border-green-600/50 bg-green-600/10 text-green-700 dark:border-green-400/50 dark:bg-green-400/10 dark:text-green-400'
              : message && open
                ? 'border-red-500/60'
                : 'border-panel-border',
            open && 'focus-within:border-foreground/50',
          )}
        >
          <span className="sr-only">Map link</span>
          <span className={cn('inline-flex min-w-0 items-center', isSyncing && 'invisible')}>
            {(currentSlug || open) && (
              <span aria-hidden="true" className={open ? 'text-panel-muted' : undefined}>
                /
              </span>
            )}
            <span className="inline-grid min-w-0 grid-cols-[minmax(0,1fr)] md:max-w-[14rem]">
              <span
                aria-hidden="true"
                className={cn('invisible col-start-1 row-start-1 overflow-hidden whitespace-pre', open && 'pr-[2px]')}
              >
                {displayValue || 'your-name'}
              </span>
              <input
                ref={inputRef}
                type="text"
                size={1}
                value={displayValue}
                placeholder="your-name"
                readOnly={!open}
                disabled={busy || confirmingStop}
                onKeyDown={(event) => {
                  if (!open && ['Enter', ' '].includes(event.key)) {
                    event.preventDefault()
                    edit()
                  }
                }}
                onChange={(event) => {
                  setDraft(event.target.value.toLowerCase())
                  setError(null)
                  setUpdated(false)
                }}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                aria-invalid={open && Boolean(message)}
                aria-describedby={statusId}
                className="col-start-1 row-start-1 w-full min-w-0 cursor-[inherit] appearance-none rounded-none border-0 bg-transparent p-0 placeholder:text-panel-muted/60 focus:outline-hidden"
              />
            </span>
            {open && (
              <Pencil
                className="ml-2 size-3.5 shrink-0 text-panel-muted transition-colors group-hover/link:text-foreground"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
          </span>
          {isSyncing && (
            <LoaderCircle
              className="absolute left-1/2 size-4 -translate-x-1/2 motion-safe:animate-spin"
              aria-hidden="true"
            />
          )}
        </label>
      </Tooltip>
      <div
        role="group"
        aria-label="Sharing controls"
        inert={!open}
        aria-hidden={!open}
        data-open={open}
        data-settled-open={settledOpen}
        className="profile-menu-reveal sharing-controls-reveal absolute top-[calc(100%+0.75rem)] right-0 shrink-0 md:static"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'max-width') setSettledOpen(open)
        }}
      >
        <div
          data-open={open}
          className="profile-menu-items relative flex min-h-9 w-max flex-row-reverse items-center rounded-lg border border-panel-border bg-panel p-2 md:min-h-[35px] md:border-0 md:bg-transparent md:p-0"
        >
          {confirmingStop || editing ? (
            <Action
              type={confirmingStop ? 'button' : 'submit'}
              label={confirmingStop ? 'Confirm stop sharing' : currentSlug ? 'Update link' : 'Share map'}
              onClick={confirmingStop ? stop : undefined}
              tooltipHidden={confirmingStop}
              aria-describedby={confirmingStop ? (message ? statusId : stopQuestionId) : undefined}
              disabled={confirmingStop ? busy : !canSubmit}
              className={confirmingStop ? 'text-red-600 dark:text-red-400' : undefined}
            >
              {busy ? (
                <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <Check className="size-4" aria-hidden="true" />
              )}
            </Action>
          ) : (
            <Action
              label="Stop sharing"
              onClick={() => {
                setConfirmingStop(true)
                setError(null)
              }}
              disabled={busy}
            >
              <Link2Off className="size-4" aria-hidden="true" />
            </Action>
          )}
          {confirmingStop && (
            <Action label="Cancel stop sharing" tooltipHidden disabled={busy} onClick={() => setConfirmingStop(false)}>
              <X className="size-4" aria-hidden="true" />
            </Action>
          )}
          {open && confirmingStop && !message && (
            <div
              id={stopQuestionId}
              role="status"
              className="absolute top-[calc(100%+0.5rem)] left-1/2 w-max -translate-x-1/2 rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 text-xs-compact text-panel-muted"
            >
              stop sharing?
            </div>
          )}
        </div>
      </div>
      <div
        id={statusId}
        role={open && message ? 'alert' : 'status'}
        className={cn(
          'text-xs-compact',
          open && (message || !currentSlug)
            ? 'absolute top-[calc(100%+4.5rem)] right-0 w-max max-w-[min(20rem,calc(100vw-5rem))] rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 md:top-[calc(100%+0.5rem)] md:max-w-xs'
            : 'sr-only',
          message ? 'text-red-600 dark:text-red-400' : 'text-panel-muted',
        )}
      >
        {open
          ? (message ??
            (!currentSlug
              ? 'Anyone with this link can view your activity map.'
              : updated
                ? 'Link updated'
                : check?.available
                  ? 'Link available'
                  : editing
                    ? 'Checking availability'
                    : ''))
          : ''}
      </div>
    </form>
  )
}
