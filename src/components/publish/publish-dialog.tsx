'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'
import { normalizeSlug } from '@/lib/slug'
import type { CheckResult, PublishError } from '@/hooks/use-publish'

interface PublishDialogProps {
  open: boolean
  onClose: () => void
  currentSlug: string | null
  isPublishing: boolean
  estimatedSizeBytes: number
  publish: (slug: string) => Promise<{ error: PublishError } | { slug: string; url: string; blobUrl: string }>
  unpublish: () => Promise<{ ok: boolean; error?: PublishError }>
  checkSlug: (slug: string) => Promise<CheckResult>
}

const ERROR_MESSAGES: Record<PublishError, string> = {
  invalid_slug: 'Slug must be 2–30 lowercase letters, numbers or dashes.',
  slug_reserved: 'That slug is reserved — please pick another.',
  slug_taken: 'Someone else already owns that slug.',
  strava_auth_failed: 'Strava session expired. Please reconnect.',
  payload_too_large: 'Your activities payload is too large to publish (limit 25 MB).',
  no_activities: 'Sync some activities before publishing.',
  network: 'Network error — please try again.',
  server: 'Publish failed on the server.',
}

const SIZE_WARN_BYTES = 10 * 1024 * 1024
const SIZE_HARD_LIMIT_BYTES = 25 * 1024 * 1024

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'available' }
  | { status: 'available-owned' }
  | { status: 'unavailable'; reason: string }

export function PublishDialog({
  open,
  onClose,
  currentSlug,
  isPublishing,
  estimatedSizeBytes,
  publish,
  unpublish,
  checkSlug,
}: PublishDialogProps) {
  const [slugInput, setSlugInput] = useState('')
  const [editingSlug, setEditingSlug] = useState(false)
  const [checkState, setCheckState] = useState<CheckState>({ status: 'idle' })
  const [error, setError] = useState<PublishError | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmingUnpublish, setConfirmingUnpublish] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)

  const publishedUrl = typeof window !== 'undefined' && currentSlug ? `${window.location.origin}/${currentSlug}` : null

  // Reset transient UI on open/close so the next open starts clean.
  useEffect(() => {
    if (open) {
      setSlugInput(currentSlug ?? '')
      setEditingSlug(!currentSlug)
      setCheckState({ status: 'idle' })
      setError(null)
      setCopied(false)
      setConfirmingUnpublish(false)
      setShowSuccess(false)
    }
  }, [open, currentSlug])

  // Auto-clear the success pill a few seconds after it appears.
  useEffect(() => {
    if (!showSuccess) return
    const handle = setTimeout(() => setShowSuccess(false), 2500)
    return () => clearTimeout(handle)
  }, [showSuccess])

  // Debounced slug availability check. checkSeqRef guards against late
  // responses from earlier keystrokes overwriting a newer result.
  const checkSeqRef = useRef(0)
  useEffect(() => {
    if (!open || !editingSlug) return
    const normalized = normalizeSlug(slugInput)
    if (!normalized) {
      setCheckState({ status: 'idle' })
      return
    }
    const seq = ++checkSeqRef.current
    setCheckState({ status: 'checking' })
    const handle = setTimeout(async () => {
      const result = await checkSlug(normalized)
      if (seq !== checkSeqRef.current) return
      if (result.available) {
        setCheckState({ status: result.ownedByMe ? 'available-owned' : 'available' })
      } else {
        setCheckState({ status: 'unavailable', reason: result.reason ?? 'slug_taken' })
      }
    }, 300)
    return () => clearTimeout(handle)
  }, [slugInput, open, editingSlug, checkSlug])

  const handlePublish = useCallback(async () => {
    setError(null)
    const normalized = normalizeSlug(slugInput)
    const result = await publish(normalized)
    if ('error' in result) {
      setError(result.error)
      return
    }
    setEditingSlug(false)
    setShowSuccess(true)
  }, [publish, slugInput])

  const handleUnpublish = useCallback(async () => {
    setError(null)
    const result = await unpublish()
    if (!result.ok && result.error) {
      setError(result.error)
      return
    }
    setConfirmingUnpublish(false)
    onClose()
  }, [unpublish, onClose])

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleCopy = useCallback(async () => {
    if (!publishedUrl) return
    try {
      await navigator.clipboard.writeText(publishedUrl)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback: select-and-do-nothing; modern browsers should support clipboard API
    }
  }, [publishedUrl])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  if (!open) return null

  const tooLarge = estimatedSizeBytes > SIZE_HARD_LIMIT_BYTES
  const sizeWarn = estimatedSizeBytes > SIZE_WARN_BYTES
  const canSubmit =
    !isPublishing &&
    !tooLarge &&
    (checkState.status === 'available' || checkState.status === 'available-owned') &&
    normalizeSlug(slugInput).length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 panel-blur" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-dialog-title"
        className="relative bg-panel border border-panel-border rounded-sm w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
          <span id="publish-dialog-title" className="text-sm-compact tracking-wider">
            [publish]
          </span>
          <button
            onClick={onClose}
            aria-label="Close publish dialog"
            className="text-xs-compact text-panel-muted hover:text-foreground transition-colors"
          >
            [x]
          </button>
        </div>

        <div className="p-4 space-y-4">
          {currentSlug && !editingSlug ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs-compact tracking-wider text-panel-muted">your map is published at</p>
                {showSuccess && (
                  <span role="status" className="text-xs-compact tracking-wider text-green-500">
                    [✓]—published
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm-compact px-3 py-2 bg-background border border-panel-border rounded-sm break-all">
                  {publishedUrl}
                </code>
                <button
                  onClick={handleCopy}
                  className="px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm min-h-[44px] md:min-h-0"
                >
                  {copied ? '[copied]' : '[copy]'}
                </button>
              </div>
              <p className="text-xs-compact text-panel-muted">
                Republishing overwrites the snapshot. Your latest {formatBytes(estimatedSizeBytes)} of activities will
                be uploaded.
              </p>

              {error && <p className="text-xs-compact text-red-500">{ERROR_MESSAGES[error]}</p>}

              {confirmingUnpublish ? (
                <div className="flex items-center gap-2 pt-2 border-t border-panel-border">
                  <span className="text-xs-compact text-panel-muted flex-1">unpublish this map?</span>
                  <button
                    onClick={() => setConfirmingUnpublish(false)}
                    disabled={isPublishing}
                    className="px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground transition-colors rounded-sm min-h-[44px] md:min-h-0 disabled:opacity-50"
                  >
                    cancel
                  </button>
                  <button
                    onClick={handleUnpublish}
                    disabled={isPublishing}
                    className="px-3 py-2 text-xs-compact tracking-wider border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors rounded-sm min-h-[44px] md:min-h-0 disabled:opacity-50"
                  >
                    {isPublishing ? '[…]' : '[x]—confirm'}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2 pt-2 border-t border-panel-border">
                  <button
                    onClick={handlePublish}
                    disabled={isPublishing || tooLarge}
                    className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm disabled:opacity-50"
                  >
                    {isPublishing ? '[…]—republishing' : '[↻]—republish'}
                  </button>
                  <button
                    onClick={() => setEditingSlug(true)}
                    disabled={isPublishing}
                    className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm disabled:opacity-50"
                  >
                    [/]—change slug
                  </button>
                  <button
                    onClick={() => setConfirmingUnpublish(true)}
                    disabled={isPublishing}
                    className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors rounded-sm disabled:opacity-50"
                  >
                    [x]—unpublish
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block space-y-2">
                <span className="text-xs-compact tracking-wider text-panel-muted">choose a slug</span>
                <div className="flex items-center bg-background border border-panel-border rounded-sm overflow-hidden">
                  <span className="px-3 text-xs-compact text-panel-muted select-none">/</span>
                  <input
                    type="text"
                    value={slugInput}
                    onChange={(e) => setSlugInput(e.target.value.toLowerCase())}
                    placeholder="walid"
                    autoFocus
                    inputMode="text"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="flex-1 bg-transparent px-0 py-2 text-sm-compact placeholder:text-panel-muted/60 focus:outline-none min-h-[44px] md:min-h-0"
                  />
                </div>
              </label>

              <div className="text-xs-compact min-h-[1.25rem]">
                {checkState.status === 'checking' && <span className="text-panel-muted">checking…</span>}
                {checkState.status === 'available' && <span className="text-green-500">available</span>}
                {checkState.status === 'available-owned' && (
                  <span className="text-green-500">this is your current slug</span>
                )}
                {checkState.status === 'unavailable' && (
                  <span className="text-red-500">
                    {checkState.reason === 'invalid_slug'
                      ? ERROR_MESSAGES.invalid_slug
                      : checkState.reason === 'slug_reserved'
                        ? ERROR_MESSAGES.slug_reserved
                        : checkState.reason === 'auth_failed'
                          ? ERROR_MESSAGES.strava_auth_failed
                          : ERROR_MESSAGES.slug_taken}
                  </span>
                )}
              </div>

              <p className="text-xs-compact text-panel-muted">
                Upload size: {formatBytes(estimatedSizeBytes)}
                {sizeWarn && !tooLarge && ' — this may take a moment.'}
                {tooLarge && ' — over the 25 MB limit; publish not available.'}
              </p>

              {error && <p className="text-xs-compact text-red-500">{ERROR_MESSAGES[error]}</p>}

              <div className="flex gap-2 pt-2 border-t border-panel-border">
                {currentSlug ? (
                  <button
                    onClick={() => {
                      setEditingSlug(false)
                      setSlugInput(currentSlug)
                      setError(null)
                    }}
                    disabled={isPublishing}
                    className="px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground transition-colors rounded-sm disabled:opacity-50 min-h-[44px] md:min-h-0"
                  >
                    cancel
                  </button>
                ) : (
                  <button
                    onClick={onClose}
                    disabled={isPublishing}
                    className="px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground transition-colors rounded-sm disabled:opacity-50 min-h-[44px] md:min-h-0"
                  >
                    cancel
                  </button>
                )}
                <button
                  onClick={handlePublish}
                  disabled={!canSubmit}
                  className={cn(
                    'flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border rounded-sm transition-colors',
                    canSubmit
                      ? 'border-foreground bg-foreground/10 hover:bg-foreground/20'
                      : 'border-panel-border opacity-50 cursor-not-allowed',
                  )}
                >
                  {isPublishing ? '[…]—publishing' : '[↑]—publish'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
