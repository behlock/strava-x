'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import type { MapboxHeatmapRef } from '@/components/mapbox-heatmap'
import {
  useMapScreenshot,
  AspectRatio,
  ASPECT_RATIO_OPTIONS,
  getAspectRatioConfig,
  PanOffset,
} from './use-map-screenshot'

interface ExportModalProps {
  open: boolean
  onClose: () => void
  mapRef: React.RefObject<MapboxHeatmapRef | null>
  className?: string
}

export function ExportModal({ open, onClose, mapRef, className }: ExportModalProps) {
  const { theme, systemTheme } = useTheme()
  const currentTheme = theme === 'system' ? systemTheme : theme
  const isDark = currentTheme === 'dark'

  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef<{ x: number; y: number; startOffset: PanOffset } | null>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const { captureScreenshot, captureBlob, capturePreview, isCapturing } = useMapScreenshot({
    mapRef,
    aspectRatio,
    showBranding: true,
    isDark,
    panOffset,
  })

  // Feature detection
  const canCopy = typeof navigator !== 'undefined' && 'clipboard' in navigator && 'write' in navigator.clipboard
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator && 'canShare' in navigator

  // Generate preview when settings change
  useEffect(() => {
    if (!open) return
    const generate = async () => {
      const dataUrl = await capturePreview()
      setPreviewUrl(dataUrl)
    }
    generate()
  }, [open, capturePreview])

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  // Reset pan offset when aspect ratio changes
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 })
  }, [aspectRatio])

  // Drag handlers
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    setIsDragging(true)
    dragStartRef.current = { x: clientX, y: clientY, startOffset: panOffset }
  }, [panOffset])

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging || !dragStartRef.current || !previewRef.current) return

    const rect = previewRef.current.getBoundingClientRect()
    const deltaX = (clientX - dragStartRef.current.x) / rect.width
    const deltaY = (clientY - dragStartRef.current.y) / rect.height

    const sensitivity = 2
    const newX = Math.max(-1, Math.min(1, dragStartRef.current.startOffset.x - deltaX * sensitivity))
    const newY = Math.max(-1, Math.min(1, dragStartRef.current.startOffset.y - deltaY * sensitivity))

    setPanOffset({ x: newX, y: newY })
  }, [isDragging])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    dragStartRef.current = null
  }, [])

  // Mouse event handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    handleDragStart(e.clientX, e.clientY)
  }, [handleDragStart])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    handleDragMove(e.clientX, e.clientY)
  }, [handleDragMove])

  const handleMouseUp = useCallback(() => {
    handleDragEnd()
  }, [handleDragEnd])

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientX, e.touches[0].clientY)
    }
  }, [handleDragStart])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientX, e.touches[0].clientY)
    }
  }, [handleDragMove])

  const handleTouchEnd = useCallback(() => {
    handleDragEnd()
  }, [handleDragEnd])

  // Global mouse up listener for when mouse leaves the preview area
  useEffect(() => {
    if (isDragging) {
      const handleGlobalMouseUp = () => handleDragEnd()
      window.addEventListener('mouseup', handleGlobalMouseUp)
      window.addEventListener('touchend', handleGlobalMouseUp)
      return () => {
        window.removeEventListener('mouseup', handleGlobalMouseUp)
        window.removeEventListener('touchend', handleGlobalMouseUp)
      }
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
      setTimeout(() => setError(null), 3000)
      return
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy image:', err)
      setError('Failed to copy to clipboard')
      setTimeout(() => setError(null), 3000)
    }
  }, [captureBlob])

  const handleShare = useCallback(async () => {
    setError(null)
    const blob = await captureBlob()
    if (!blob) {
      setError('Failed to capture image')
      setTimeout(() => setError(null), 3000)
      return
    }

    try {
      const file = new File([blob], 'strava-x-map.png', { type: 'image/png' })

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'My Strava Activity Map',
        })
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to share:', err)
        setError('Failed to share')
        setTimeout(() => setError(null), 3000)
      }
    }
  }, [captureBlob])

  if (!open) return null

  const config = getAspectRatioConfig(aspectRatio)
  const previewAspect = config.width / config.height

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 panel-blur" onClick={onClose} />

      {/* Modal */}
      <div className={cn('relative bg-panel border border-panel-border rounded-sm w-full max-w-lg mx-4', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
          <span className="text-sm-compact tracking-wider">[export]</span>
          <button onClick={onClose} className="text-xs-compact text-panel-muted hover:text-foreground transition-colors">
            [x]
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Preview */}
          <div className="relative bg-background border border-panel-border rounded-sm overflow-hidden">
            <div
              ref={previewRef}
              className={cn(
                "relative w-full select-none",
                isDragging ? "cursor-grabbing" : "cursor-grab"
              )}
              style={{ paddingBottom: `${(1 / previewAspect) * 100}%` }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {previewUrl && (
                <img
                  src={previewUrl}
                  alt="Map preview"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  draggable={false}
                />
              )}
            </div>
          </div>
          <p className="text-xs-compact text-panel-muted text-center">drag to reposition</p>

          {/* Options */}
          <div className="space-y-3">
            {/* Aspect Ratio */}
            <div className="flex items-center justify-between">
              <span className="text-xs-compact tracking-wider text-panel-muted">aspect ratio</span>
              <div className="flex gap-1">
                {ASPECT_RATIO_OPTIONS.map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={cn(
                      'px-2 py-1 text-xs-compact border rounded-sm transition-colors',
                      aspectRatio === ratio
                        ? 'border-foreground bg-foreground/10'
                        : 'border-panel-border hover:border-foreground/50'
                    )}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Error feedback */}
          {error && (
            <p className="text-xs-compact text-red-500 text-center">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-panel-border">
            <button
              onClick={handleDownload}
              disabled={isCapturing}
              className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm disabled:opacity-50"
            >
              [download]
            </button>
            {canCopy && (
              <button
                onClick={handleCopy}
                disabled={isCapturing}
                className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm disabled:opacity-50"
              >
                {copied ? '[copied]' : '[copy]'}
              </button>
            )}
            {canShare && (
              <button
                onClick={handleShare}
                disabled={isCapturing}
                className="flex-1 min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm disabled:opacity-50"
              >
                [share]
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
