'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'

import type { ActivityMapRef } from '@/components/activity-map'
import { cn } from '@/lib/utils'
import {
  ASPECT_RATIO_OPTIONS,
  type AspectRatio,
  getAspectRatioConfig,
  type PanOffset,
  useMapScreenshot,
} from './use-map-screenshot'

interface ExportModalProps {
  open: boolean
  onClose: () => void
  mapRef: React.RefObject<ActivityMapRef | null>
}

const CENTER: PanOffset = { x: 0, y: 0 }
const FEEDBACK_MS = 3000
const DRAG_SENSITIVITY = 2

const ACTION_BUTTON =
  'min-h-11 flex-1 rounded-sm border border-panel-border px-3 py-2 text-xs-compact tracking-wider transition-colors hover:border-foreground hover:bg-foreground/5 disabled:opacity-50 md:min-h-0'

function clamp(value: number): number {
  return Math.max(-1, Math.min(1, value))
}

export function ExportModal({ open, onClose, mapRef }: ExportModalProps) {
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [panOffset, setPanOffset] = useState<PanOffset>(CENTER)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; startOffset: PanOffset } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  const { captureScreenshot, captureBlob, capturePreview, isCapturing } = useMapScreenshot({
    mapRef,
    aspectRatio,
    isDark,
    panOffset,
  })

  const canCopy = typeof navigator !== 'undefined' && 'clipboard' in navigator && 'write' in navigator.clipboard
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator

  // Regenerate the preview whenever framing changes.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    capturePreview().then((dataUrl) => {
      if (!cancelled) setPreviewUrl(dataUrl)
    })
    return () => {
      cancelled = true
    }
  }, [open, capturePreview])

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !modalRef.current) return
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Focus the close button on open; restore the trigger's focus on close.
  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null
      closeButtonRef.current?.focus()
    } else if (previouslyFocusedRef.current) {
      previouslyFocusedRef.current.focus()
      previouslyFocusedRef.current = null
    }
  }, [open])

  // Transient feedback auto-clears.
  useEffect(() => {
    if (!error && !copied) return
    const handle = setTimeout(() => {
      setError(null)
      setCopied(false)
    }, FEEDBACK_MS)
    return () => clearTimeout(handle)
  }, [error, copied])

  const handleAspectRatioChange = useCallback((ratio: AspectRatio) => {
    setAspectRatio(ratio)
    setPanOffset(CENTER)
  }, [])

  const handleDragStart = useCallback(
    (clientX: number, clientY: number) => {
      setIsDragging(true)
      dragStartRef.current = { x: clientX, y: clientY, startOffset: panOffset }
    },
    [panOffset],
  )

  const handleDragMove = useCallback(
    (clientX: number, clientY: number) => {
      const start = dragStartRef.current
      const rect = previewRef.current?.getBoundingClientRect()
      if (!isDragging || !start || !rect) return
      const deltaX = (clientX - start.x) / rect.width
      const deltaY = (clientY - start.y) / rect.height
      setPanOffset({
        x: clamp(start.startOffset.x - deltaX * DRAG_SENSITIVITY),
        y: clamp(start.startOffset.y - deltaY * DRAG_SENSITIVITY),
      })
    },
    [isDragging],
  )

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    dragStartRef.current = null
  }, [])

  // End the drag even when the pointer is released outside the preview.
  useEffect(() => {
    if (!isDragging) return
    window.addEventListener('mouseup', handleDragEnd)
    window.addEventListener('touchend', handleDragEnd)
    return () => {
      window.removeEventListener('mouseup', handleDragEnd)
      window.removeEventListener('touchend', handleDragEnd)
    }
  }, [isDragging, handleDragEnd])

  const handleDownload = useCallback(async () => {
    const dataUrl = await captureScreenshot()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = `strava-x-map-${Date.now()}.png`
    link.click()
  }, [captureScreenshot])

  const handleCopy = useCallback(async () => {
    setError(null)
    const blob = await captureBlob()
    if (!blob) {
      setError('Failed to capture image')
      return
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
    } catch (err) {
      console.error('Failed to copy image:', err)
      setError('Failed to copy to clipboard')
    }
  }, [captureBlob])

  const handleShare = useCallback(async () => {
    setError(null)
    const blob = await captureBlob()
    if (!blob) {
      setError('Failed to capture image')
      return
    }
    try {
      const file = new File([blob], 'strava-x-map.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My Strava Activity Map' })
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      console.error('Failed to share:', err)
      setError('Failed to share')
    }
  }, [captureBlob])

  if (!open) return null

  const { width, height } = getAspectRatioConfig(aspectRatio)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-md" onClick={onClose} aria-hidden="true" />

      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-modal-title"
        className="relative mx-4 w-full max-w-lg rounded-sm border border-panel-border bg-panel"
      >
        <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
          <span id="export-modal-title" className="text-sm-compact tracking-wider">
            [export]
          </span>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
            className="text-xs-compact text-panel-muted transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-hidden"
          >
            [x]
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="relative overflow-hidden rounded-sm border border-panel-border bg-background">
            <div
              ref={previewRef}
              className={cn('relative w-full select-none', isDragging ? 'cursor-grabbing' : 'cursor-grab')}
              style={{ aspectRatio: `${width} / ${height}` }}
              onMouseDown={(e) => {
                e.preventDefault()
                handleDragStart(e.clientX, e.clientY)
              }}
              onMouseMove={(e) => handleDragMove(e.clientX, e.clientY)}
              onMouseUp={handleDragEnd}
              onMouseLeave={handleDragEnd}
              onTouchStart={(e) => {
                if (e.touches.length === 1) handleDragStart(e.touches[0].clientX, e.touches[0].clientY)
              }}
              onTouchMove={(e) => {
                if (e.touches.length === 1) handleDragMove(e.touches[0].clientX, e.touches[0].clientY)
              }}
              onTouchEnd={handleDragEnd}
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Map preview"
                  className="pointer-events-none absolute inset-0 size-full object-contain"
                  draggable={false}
                />
              )}
            </div>
          </div>
          <p className="text-center text-xs-compact text-panel-muted">drag to reposition</p>

          <div className="flex items-center justify-between">
            <span className="text-xs-compact tracking-wider text-panel-muted">aspect ratio</span>
            <div className="flex gap-1" role="radiogroup" aria-label="Aspect ratio">
              {ASPECT_RATIO_OPTIONS.map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  role="radio"
                  aria-checked={aspectRatio === ratio}
                  onClick={() => handleAspectRatioChange(ratio)}
                  className={cn(
                    'rounded-sm border px-2 py-1 text-xs-compact transition-colors',
                    aspectRatio === ratio
                      ? 'border-foreground bg-foreground/10'
                      : 'border-panel-border hover:border-foreground/50',
                  )}
                >
                  {ratio}
                </button>
              ))}
            </div>
          </div>

          <div role="status" aria-live="polite" className="sr-only">
            {error ?? (copied ? 'Image copied to clipboard' : '')}
          </div>
          {error && (
            <p className="text-center text-xs-compact text-red-500" aria-hidden="true">
              {error}
            </p>
          )}

          <div className="flex gap-2 border-t border-panel-border pt-2">
            <button type="button" onClick={handleDownload} disabled={isCapturing} className={ACTION_BUTTON}>
              [download]
            </button>
            {canCopy && (
              <button type="button" onClick={handleCopy} disabled={isCapturing} className={ACTION_BUTTON}>
                {copied ? '[copied]' : '[copy]'}
              </button>
            )}
            {canShare && (
              <button type="button" onClick={handleShare} disabled={isCapturing} className={ACTION_BUTTON}>
                [share]
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
