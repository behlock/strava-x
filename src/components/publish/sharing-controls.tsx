'use client'

import { type ButtonHTMLAttributes, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Link2Off, LoaderCircle, Share2, X } from 'lucide-react'

import { HeaderChip } from '@/components/ui/header-bar'
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
      className={cn('size-7 shrink-0', className)}
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const session = useRef({ live: false, version: 0 })
  const [draft, setDraft] = useState<string | null>(null)
  const [lastCheck, setLastCheck] = useState<{ slug: string; result: CheckResult } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('')
  const [confirmingStop, setConfirmingStop] = useState(false)
  const statusId = useId()
  const stopQuestionId = useId()
  const input = draft ?? currentSlug ?? suggestedAddress ?? ''
  const mapUrl = currentSlug ? `${origin}/${currentSlug}` : null
  const normalized = normalizeSlug(input)
  const editing = !currentSlug
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
    setCopied(false)
    setConfirmingStop(false)
  }, [])

  const close = useCallback(
    (restoreFocus = true) => {
      session.current.version++
      reset()
      onClose()
      if (restoreFocus) triggerRef.current?.focus({ preventScroll: true })
    },
    [onClose, reset],
  )

  const openControls = () => {
    if (open || busy) return
    session.current.version++
    reset()
    setOrigin(window.location.origin)
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
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const save = async () => {
    if (!canSubmit) return
    const version = session.current.version
    setError(null)
    const result = await publish(normalized)
    if (!session.current.live || version !== session.current.version) return
    if ('error' in result) setError(ERROR_MESSAGES[result.error])
    else {
      setDraft(null)
      setCopied(false)
    }
  }

  const share = async () => {
    if (!currentSlug) return
    const version = session.current.version
    const url = `${window.location.origin}/${currentSlug}`
    setError(null)
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ url })
      } else {
        await navigator.clipboard.writeText(url)
        if (session.current.live && version === session.current.version) setCopied(true)
      }
    } catch (cause) {
      if (!session.current.live || version !== session.current.version) return
      if (!(cause instanceof Error && cause.name === 'AbortError')) {
        setError('could not share — copy the map link')
      }
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
      className="control-group relative flex shrink-0 flex-row-reverse items-center"
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
        if (confirmingStop) reset()
        else close()
      }}
    >
      {!currentSlug && open ? (
        <label
          className={cn(
            'inline-flex h-8 max-w-[min(46vw,8rem)] min-w-0 items-center rounded-lg border bg-control px-2.5 text-base-compact tracking-wider md:h-[35px] md:max-w-xs md:px-4 md:text-xs-compact',
            message ? 'border-red-500/60' : 'border-panel-border',
          )}
        >
          <span className="sr-only">Map link</span>
          <span aria-hidden="true" className="text-panel-muted">
            /
          </span>
          <span className="inline-grid min-w-0 grid-cols-[minmax(0,1fr)] md:max-w-[14rem]">
            <span
              aria-hidden="true"
              className="invisible col-start-1 row-start-1 overflow-hidden pr-[2px] whitespace-pre"
            >
              {input || 'your-name'}
            </span>
            <input
              type="text"
              size={1}
              value={input}
              placeholder="your-name"
              autoFocus
              disabled={busy || confirmingStop}
              onChange={(event) => {
                setDraft(event.target.value.toLowerCase())
                setError(null)
                setCopied(false)
              }}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={open && Boolean(message)}
              aria-describedby={statusId}
              className="col-start-1 row-start-1 w-full min-w-0 cursor-[inherit] appearance-none rounded-none border-0 bg-transparent p-0 placeholder:text-panel-muted/60 focus:outline-hidden"
            />
          </span>
        </label>
      ) : (
        <HeaderChip
          ref={triggerRef}
          variant="text"
          aria-label={currentSlug ? 'Sharing options' : 'Share map'}
          aria-expanded={open}
          tooltip={isSyncing ? 'syncing...' : currentSlug ? 'sharing options' : 'share map'}
          tooltipWhenDisabled={isSyncing}
          tooltipHidden={open}
          disabled={busy}
          onClick={open ? () => close() : openControls}
          className={cn('h-9 gap-2 md:h-[35px]', currentSlug && 'max-w-[40vw]')}
        >
          {isSyncing ? (
            <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : currentSlug ? (
            <span className="truncate">/{currentSlug}</span>
          ) : (
            <>
              <Share2 className="size-3.5" aria-hidden="true" />
              <span>share map</span>
            </>
          )}
        </HeaderChip>
      )}
      <div
        role="group"
        aria-label="Sharing controls"
        inert={!open}
        aria-hidden={!open}
        data-open={open}
        style={currentSlug ? { marginRight: 0 } : undefined}
        className={cn(
          'profile-menu-reveal absolute top-[calc(100%+0.75rem)] right-0 shrink-0',
          !currentSlug && 'md:static',
        )}
      >
        <div
          data-open={open}
          className={cn(
            'profile-menu-items relative flex min-h-9 w-max max-w-[min(22rem,calc(100vw-6rem))] flex-row-reverse items-center rounded-lg border border-panel-border bg-panel p-2',
            !currentSlug && 'md:min-h-[35px] md:border-0 md:bg-transparent md:p-0',
          )}
        >
          {open && mapUrl && !confirmingStop && (
            <>
              <Action label={copied ? 'Link copied' : 'Share link'} onClick={share}>
                {copied ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="size-3.5" aria-hidden="true" />
                )}
              </Action>
              <a
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 rounded-sm px-2 text-xs-compact break-all whitespace-normal text-foreground focus-ring hover:underline"
                title={mapUrl}
              >
                {mapUrl.replace(/^https?:\/\//, '')}
              </a>
            </>
          )}
          {confirmingStop || editing ? (
            <Action
              type={confirmingStop ? 'button' : 'submit'}
              label={confirmingStop ? 'Confirm stop sharing' : 'Share map'}
              onClick={confirmingStop ? stop : undefined}
              tooltipHidden={confirmingStop}
              aria-describedby={confirmingStop ? (message ? statusId : stopQuestionId) : undefined}
              disabled={confirmingStop ? busy : !canSubmit}
              className={confirmingStop ? 'text-red-600 dark:text-red-400' : 'size-8 md:size-[35px]'}
            >
              {busy ? (
                <LoaderCircle
                  className={cn('motion-safe:animate-spin', confirmingStop ? 'size-3.5' : 'size-4')}
                  aria-hidden="true"
                />
              ) : (
                <Check className={confirmingStop ? 'size-3.5' : 'size-4'} aria-hidden="true" />
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
              <Link2Off className="size-3.5" aria-hidden="true" />
            </Action>
          )}
          {confirmingStop && (
            <Action label="Cancel stop sharing" tooltipHidden disabled={busy} onClick={() => setConfirmingStop(false)}>
              <X className="size-3.5" aria-hidden="true" />
            </Action>
          )}
          {open && confirmingStop && !message && (
            <div
              id={stopQuestionId}
              role="status"
              className="absolute top-[calc(100%+0.5rem)] right-0 w-max rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 text-xs-compact text-panel-muted"
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
          open && message
            ? cn(
                currentSlug
                  ? 'top-[calc(100%+8.5rem)] md:top-[calc(100%+4.5rem)]'
                  : 'top-[calc(100%+4.5rem)] md:top-[calc(100%+0.5rem)]',
                'absolute left-[calc(-0.5rem-1px)] w-max max-w-[min(20rem,calc(100vw-5rem))] rounded-lg border border-panel-border bg-panel px-2.5 py-1.5 md:right-0 md:left-auto md:max-w-xs',
              )
            : 'sr-only',
          message ? 'text-red-600 dark:text-red-400' : 'text-panel-muted',
        )}
      >
        {open ? (message ?? (copied ? 'Link copied' : '')) : ''}
      </div>
    </form>
  )
}
