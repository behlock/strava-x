'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { DialogCloseButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { normalizeSlug } from '@/lib/slug'
import { useFocusTrap } from '@/hooks/use-focus-trap'
import type { CheckResult, PublishError } from '@/hooks/use-publish'

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  currentSlug: string | null
  isPublishing: boolean
  estimatedSizeBytes: number
  publish: (slug: string) => Promise<{ error: PublishError } | { slug: string }>
  unpublish: () => Promise<{ ok: true } | { ok: false; error: PublishError }>
  checkSlug: (slug: string) => Promise<CheckResult>
}

const ERROR_MESSAGES: Record<PublishError, string> = {
  invalid_slug: 'slugs are 2–30 lowercase letters, numbers or dashes',
  slug_reserved: 'that slug is reserved, pick another',
  slug_taken: 'someone else already owns that slug',
  strava_auth_failed: 'strava session expired, reconnect to continue',
  payload_too_large: 'your activities are too large to publish (25 MB limit)',
  no_activities: 'sync some activities before publishing',
  network: 'network error, try again',
  server: 'publish failed on the server',
}

const SIZE_WARN_BYTES = 10 * 1024 * 1024
const SIZE_HARD_LIMIT_BYTES = 25 * 1024 * 1024
const CHECK_DEBOUNCE_MS = 300
const SUCCESS_PILL_MS = 2500
const COPIED_PILL_MS = 2000

const BUTTON = 'focus-ring min-h-11 rounded-sm px-3 py-2 text-xs-compact tracking-wider transition-colors md:min-h-0'
const BUTTON_OUTLINE = `${BUTTON} border border-panel-border hover:border-foreground hover:bg-foreground/5 disabled:opacity-50`
const BUTTON_DANGER = `${BUTTON} border border-red-500/50 text-red-500 hover:bg-red-500/10 disabled:opacity-50`

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

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
  isPublishing,
  estimatedSizeBytes,
  publish,
  unpublish,
  checkSlug,
}: Omit<PublishDialogProps, 'open'>) {
  const [slugInput, setSlugInput] = useState(currentSlug ?? '')
  const [editingSlug, setEditingSlug] = useState(!currentSlug)
  // Latest availability result, tagged with the slug it was computed for so
  // stale answers are ignored.
  const [lastCheck, setLastCheck] = useState<{ slug: string; result: CheckResult } | null>(null)
  const [error, setError] = useState<PublishError | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const normalized = normalizeSlug(slugInput)
  const publishedUrl = typeof window !== 'undefined' && currentSlug ? `${window.location.origin}/${currentSlug}` : null

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
    setEditingSlug(false)
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

  // Escape closes, Tab stays inside, focus starts on the close button and
  // returns to the trigger on close. The body only mounts while open.
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useFocusTrap(dialogRef, { active: true, onEscape: onClose, initialFocus: closeButtonRef })

  // Declared after the trap so that, when the slug is being edited, the
  // input wins the initial focus.
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editingSlug) inputRef.current?.focus()
  }, [editingSlug])

  const tooLarge = estimatedSizeBytes > SIZE_HARD_LIMIT_BYTES
  const sizeWarn = estimatedSizeBytes > SIZE_WARN_BYTES
  const canSubmit = !isPublishing && !tooLarge && typeof check === 'object' && check !== null && check.available

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        className="relative mx-4 w-full max-w-md rounded-sm border border-panel-border bg-panel"
      >
        <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
          <span id="publish-dialog-title" className="text-sm-compact tracking-wider">
            [publish]
          </span>
          <DialogCloseButton ref={closeButtonRef} onClick={onClose} aria-label="Close publish dialog" />
        </div>

        <div className="space-y-4 p-4">
          {currentSlug && !editingSlug ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs-compact tracking-wider text-panel-muted">your map is published at</p>
                {showSuccess && (
                  <span role="status" className="text-xs-compact tracking-wider text-green-500">
                    [✓] published
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-sm border border-panel-border bg-background px-3 py-2 text-sm-compact break-all">
                  {publishedUrl}
                </code>
                <button type="button" onClick={handleCopy} className={BUTTON_OUTLINE}>
                  {copied ? '[copied]' : '[copy]'}
                </button>
              </div>
              <p className="text-xs-compact text-panel-muted">
                republishing replaces the snapshot with your latest {formatBytes(estimatedSizeBytes)} of activities
              </p>

              {error && <p className="text-xs-compact text-red-500">{ERROR_MESSAGES[error]}</p>}

              {confirmingUnpublish ? (
                <div className="flex items-center gap-2 border-t border-panel-border pt-2">
                  <span className="flex-1 text-xs-compact text-panel-muted">unpublish this map?</span>
                  <button
                    type="button"
                    onClick={() => setConfirmingUnpublish(false)}
                    disabled={isPublishing}
                    className={BUTTON_OUTLINE}
                  >
                    cancel
                  </button>
                  <button type="button" onClick={handleUnpublish} disabled={isPublishing} className={BUTTON_DANGER}>
                    {isPublishing ? '[…]' : '[x] confirm'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 border-t border-panel-border pt-2">
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={isPublishing || tooLarge}
                    className={cn(BUTTON_OUTLINE, 'flex-1')}
                  >
                    {isPublishing ? '[…] republishing' : '[↻] republish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingSlug(true)}
                    disabled={isPublishing}
                    className={cn(BUTTON_OUTLINE, 'flex-1')}
                  >
                    [/] change slug
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingUnpublish(true)}
                    disabled={isPublishing}
                    className={cn(BUTTON_DANGER, 'flex-1')}
                  >
                    [x] unpublish
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-2">
                <span className="text-xs-compact tracking-wider text-panel-muted">choose a slug</span>
                <div className="flex items-center overflow-hidden rounded-sm border border-panel-border bg-background">
                  <span className="px-3 text-xs-compact text-panel-muted select-none">/</span>
                  <input
                    ref={inputRef}
                    type="text"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                    placeholder="walid"
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="min-h-11 flex-1 bg-transparent px-0 py-2 text-sm-compact placeholder:text-panel-muted/60 focus:outline-hidden md:min-h-0"
                  />
                </div>
              </label>

              <div className="min-h-5 text-xs-compact" aria-live="polite">
                {check === 'checking' && <span className="text-panel-muted">checking…</span>}
                {check && check !== 'checking' && check.available && (
                  <span className="text-green-500">{check.ownedByMe ? 'this is your current slug' : 'available'}</span>
                )}
                {check && check !== 'checking' && !check.available && (
                  <span className="text-red-500">{checkMessage(check.reason)}</span>
                )}
              </div>

              <p className="text-xs-compact text-panel-muted">
                upload size: {formatBytes(estimatedSizeBytes)}
                {sizeWarn && !tooLarge && ' — this may take a moment'}
                {tooLarge && ' — over the 25 MB limit, publishing is disabled'}
              </p>

              {error && <p className="text-xs-compact text-red-500">{ERROR_MESSAGES[error]}</p>}

              <div className="flex gap-2 border-t border-panel-border pt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (currentSlug) {
                      setEditingSlug(false)
                      setSlugInput(currentSlug)
                      setError(null)
                    } else {
                      onClose()
                    }
                  }}
                  disabled={isPublishing}
                  className={BUTTON_OUTLINE}
                >
                  cancel
                </button>
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={!canSubmit}
                  className={cn(
                    BUTTON,
                    'flex-1 border',
                    canSubmit
                      ? 'border-foreground bg-foreground/10 hover:bg-foreground/20'
                      : 'cursor-not-allowed border-panel-border opacity-50',
                  )}
                >
                  {isPublishing ? '[…] publishing' : '[↑] publish'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
