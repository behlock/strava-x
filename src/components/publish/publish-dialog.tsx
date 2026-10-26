'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { DialogCloseButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { normalizeSlug } from '@/lib/slug'
import { useMounted } from '@/hooks/use-mounted'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import type { CheckResult, PublishError } from '@/hooks/use-publish'

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  currentSlug: string | null
  suggestedAddress?: string
  isPublishing: boolean
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
  slug_reserved: 'that address is reserved, pick another',
  slug_taken: 'someone else already uses that address',
  strava_auth_failed: 'strava session expired, reconnect to continue',
  payload_too_large: 'your activities are too large to share (25 MB limit)',
  network: 'network error, try again',
  server: 'sharing failed on the server',
  busy: 'another update is finishing, try again in a moment',
  publication_changed: 'sharing changed in another tab, review the current address and try again',
  cancelled: 'update cancelled, try again',
}

const SIZE_HARD_LIMIT_BYTES = 25 * 1024 * 1024
const CHECK_DEBOUNCE_MS = 300
const SUCCESS_PILL_MS = 2500
const COPIED_PILL_MS = 2000

const BUTTON =
  'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs-compact tracking-wider transition-colors md:min-h-0'
const BUTTON_OUTLINE = `${BUTTON} floating-control disabled:opacity-50`
const BUTTON_DANGER = `${BUTTON} border border-panel-border text-red-600 hover:bg-red-500/10 disabled:opacity-50 dark:text-red-400`

function checkMessage(reason: string | undefined): string {
  switch (reason) {
    case 'invalid_slug':
      return ERROR_MESSAGES.invalid_slug
    case 'slug_reserved':
      return ERROR_MESSAGES.slug_reserved
    case 'auth_failed':
      return ERROR_MESSAGES.strava_auth_failed
    case 'network':
      return ERROR_MESSAGES.network
    case 'server':
      return ERROR_MESSAGES.server
    default:
      return ERROR_MESSAGES.slug_taken
  }
}

/** Runs a timer whenever `active` flips true and calls `onExpire` when it fires. */
function useTimeout(active: boolean, ms: number, onExpire: () => void) {
  useEffect(() => {
    if (!active) return
    const handle = setTimeout(onExpire, ms)
    return () => clearTimeout(handle)
  }, [active, ms, onExpire])
}

export function PublishDialog({ open, onClose, ...props }: PublishDialogProps) {
  if (!open) return null
  // Mounting the body fresh on every open resets all transient state.
  return <PublishDialogBody onClose={onClose} {...props} />
}

function PublishDialogBody({
  onClose,
  currentSlug,
  suggestedAddress,
  isPublishing,
  estimatedSizeBytes,
  publish,
  unpublish,
  checkSlug,
}: Omit<PublishDialogProps, 'open'>) {
  const [slugInput, setSlugInput] = useState<string | null>(null)
  const addressInput = slugInput ?? currentSlug ?? suggestedAddress ?? ''
  // Latest availability result, tagged with the slug it was computed for so
  // stale answers are ignored.
  const [lastCheck, setLastCheck] = useState<{ slug: string; result: CheckResult } | null>(null)
  const [error, setError] = useState<PublishError | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const mounted = useMounted()
  const origin = mounted ? window.location.origin : ''
  const normalized = normalizeSlug(addressInput)
  const editingSlug = !currentSlug || normalized !== currentSlug
  const publishedUrl = origin && currentSlug ? `${origin}/${currentSlug}` : null

  useTimeout(
    showSuccess,
    SUCCESS_PILL_MS,
    useCallback(() => setShowSuccess(false), []),
  )
  useTimeout(
    copied,
    COPIED_PILL_MS,
    useCallback(() => setCopied(false), []),
  )

  // Debounced availability check while editing.
  useEffect(() => {
    if (!editingSlug || !normalized) return
    let active = true
    const handle = setTimeout(async () => {
      const result = await checkSlug(normalized)
      if (active) setLastCheck({ slug: normalized, result })
    }, CHECK_DEBOUNCE_MS)
    return () => {
      active = false
      clearTimeout(handle)
    }
  }, [normalized, editingSlug, checkSlug])

  const check = editingSlug && normalized ? (lastCheck?.slug === normalized ? lastCheck.result : 'checking') : null

  const handlePublish = useCallback(async () => {
    setError(null)
    const result = await publish(normalized)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setSlugInput(null)
    setShowSuccess(true)
  }, [publish, normalized])

  const handleUnpublish = useCallback(async () => {
    setError(null)
    const result = await unpublish()
    if (!result.ok) {
      setError(result.error)
      return
    }
    onClose()
  }, [unpublish, onClose])

  const handleCopy = useCallback(async () => {
    if (!publishedUrl) return
    try {
      await navigator.clipboard.writeText(publishedUrl)
      setCopied(true)
    } catch {
      // Clipboard access denied; the URL is still visible to copy by hand.
    }
  }, [publishedUrl])

  // Focus the dialog on open; Tab reaches the controls and Escape closes.
  // The body only mounts while open and restores focus to its trigger on close.
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, { active: true, onEscape: onClose, initialFocus: dialogRef })

  // First-time sharing starts in the address field; existing links stay unfocused.
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!currentSlug) inputRef.current?.focus()
  }, [currentSlug])

  const tooLarge = estimatedSizeBytes > SIZE_HARD_LIMIT_BYTES
  const addressAvailable = typeof check === 'object' && check !== null && check.available
  const addressUnavailable = typeof check === 'object' && check !== null && !check.available
  const canSubmit = !isPublishing && !tooLarge && addressAvailable

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="dialog-backdrop-enter absolute inset-0 bg-background/50 backdrop-blur-xs"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        tabIndex={-1}
        className="dialog-surface-enter relative mx-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-panel-border bg-panel focus:outline-hidden"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-panel-border/40 px-4 py-3">
          <span id="publish-dialog-title" className="text-sm-compact tracking-wider">
            share map
          </span>
          <DialogCloseButton onClick={onClose} aria-label="Close share map dialog" />
        </div>

        <form
          className="min-h-0 space-y-3 overflow-y-auto overscroll-contain p-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (canSubmit) void handlePublish()
          }}
        >
          {!currentSlug && (
            <p className="text-xs-compact text-panel-muted">Anyone with this link can view your activity map.</p>
          )}
          <label className="sr-only" htmlFor="map-address">
            Map link
          </label>
          <div className="rounded-lg border border-panel-border bg-control py-1 pr-1 pl-3 focus-within:border-foreground/50">
            <div className="flex items-center">
              <span
                className="max-w-[50%] min-w-0 truncate text-[12px] leading-5 text-panel-muted md:text-sm-compact"
                title={`${origin}/`}
              >
                <span className="md:hidden">{`${origin.replace(/^https?:\/\/(?:www\.)?/, '')}/`}</span>
                <span className="hidden md:inline">{`${origin}/`}</span>
              </span>
              <span
                className={cn(
                  'ml-1 inline-grid min-h-11 min-w-0 grid-cols-[minmax(0,1fr)] items-center rounded-full border px-2 py-1 text-base-compact tracking-normal transition-colors md:min-h-0 md:text-sm-compact md:tracking-normal',
                  addressAvailable || showSuccess
                    ? 'border-green-600/50 bg-green-600/10 text-green-700 focus-within:border-green-600 hover:bg-green-600/15 dark:border-green-400/50 dark:bg-green-400/10 dark:text-green-400 dark:focus-within:border-green-400'
                    : 'border-panel-border bg-selection/60 focus-within:border-foreground/50 focus-within:bg-selection hover:bg-selection',
                  (isPublishing || confirmingUnpublish) && 'opacity-60',
                )}
              >
                <span
                  aria-hidden="true"
                  className="invisible col-start-1 row-start-1 min-w-0 overflow-hidden pr-[2px] whitespace-pre"
                >
                  {addressInput || suggestedAddress || 'your-name'}
                </span>
                <input
                  id="map-address"
                  ref={inputRef}
                  type="text"
                  size={1}
                  value={addressInput}
                  disabled={isPublishing || confirmingUnpublish}
                  onChange={(event) => {
                    setSlugInput(event.target.value.toLowerCase())
                    setError(null)
                    setShowSuccess(false)
                    setCopied(false)
                  }}
                  placeholder={suggestedAddress ?? 'your-name'}
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  aria-describedby={editingSlug || error ? 'map-address-status' : undefined}
                  aria-invalid={addressUnavailable || undefined}
                  className="col-start-1 row-start-1 w-full min-w-0 appearance-none rounded-none border-0 bg-transparent p-0 placeholder:text-panel-muted/60 focus:outline-hidden"
                />
              </span>
              {currentSlug && !editingSlug && (
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? 'Link copied' : 'Copy map link'}
                  className="ml-auto flex size-11 shrink-0 items-center justify-center rounded-full focus-ring transition-colors hover:bg-foreground/5 md:size-8"
                >
                  <span
                    className="copy-feedback relative size-3.5"
                    data-copied={copied || showSuccess}
                    aria-hidden="true"
                  >
                    <span className="copy-feedback-original absolute inset-0">
                      <Copy className="size-3.5" />
                    </span>
                    <span className="copy-feedback-success absolute inset-0 text-green-600 dark:text-green-400">
                      <Check className="size-3.5" />
                    </span>
                  </span>
                </button>
              )}
            </div>
            <div
              id="map-address-status"
              className={
                error || addressUnavailable || (editingSlug && tooLarge)
                  ? 'w-full py-1 pr-2 text-xs-compact text-red-500'
                  : 'sr-only'
              }
              aria-live="polite"
            >
              {error
                ? ERROR_MESSAGES[error]
                : addressUnavailable
                  ? checkMessage(check.reason)
                  : editingSlug && tooLarge
                    ? 'over the 25 MB limit, sharing is disabled'
                    : copied
                      ? 'Link copied'
                      : showSuccess
                        ? 'Link updated'
                        : check === 'checking'
                          ? 'Checking availability'
                          : addressAvailable
                            ? 'Address available'
                            : ''}
            </div>
          </div>

          {editingSlug ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  if (currentSlug) {
                    setSlugInput(null)
                    setError(null)
                  } else onClose()
                }}
                disabled={isPublishing}
                className={BUTTON_OUTLINE}
              >
                cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  BUTTON,
                  'flex-1 border',
                  canSubmit
                    ? 'border-foreground bg-foreground/10 hover:bg-foreground/20'
                    : 'cursor-not-allowed border-panel-border opacity-50',
                )}
              >
                {currentSlug ? (isPublishing ? 'updating…' : 'update link') : isPublishing ? 'sharing…' : 'share map'}
              </button>
            </div>
          ) : confirmingUnpublish ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="flex-1 text-xs-compact text-panel-muted">stop sharing this map?</span>
              <button
                type="button"
                onClick={() => setConfirmingUnpublish(false)}
                disabled={isPublishing}
                className={BUTTON_OUTLINE}
              >
                cancel
              </button>
              <button type="button" onClick={handleUnpublish} disabled={isPublishing} className={BUTTON_DANGER}>
                {isPublishing ? 'stopping…' : 'stop sharing'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingUnpublish(true)}
              disabled={isPublishing}
              className={cn(BUTTON_DANGER, 'w-full')}
            >
              stop sharing
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
