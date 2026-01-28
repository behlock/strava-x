'use client'

import { useCallback, useState } from 'react'
import type { MapboxHeatmapRef } from '@/components/mapbox-heatmap'

export type AspectRatio = '1:1' | '16:9' | '4:5'

export interface ExportStatistics {
  totalActivities: number
  totalDistance: number // in km
  totalElevation: number // in meters
  breakdown: { type: string; count: number; distance: number; color: string }[]
  locationName?: string
}

interface AspectRatioConfig {
  width: number
  height: number
  label: string
}

const ASPECT_RATIOS: Record<AspectRatio, AspectRatioConfig> = {
  '1:1': { width: 2160, height: 2160, label: 'Square' },
  '16:9': { width: 3840, height: 2160, label: 'Landscape' },
  '4:5': { width: 1728, height: 2160, label: 'Portrait' },
}

const PREVIEW_SCALE = 0.25 // Preview at 25% resolution for performance
const BRANDING_FONT = 'JetBrains Mono'

export interface PanOffset {
  x: number // -1 to 1, where 0 is center
  y: number // -1 to 1, where 0 is center
}

const PADDING = 48
const HEADER_HEIGHT = 80
const FOOTER_HEIGHT = 120
const BORDER_WIDTH = 3

// Ensure font is loaded before rendering branding
async function ensureFontLoaded(): Promise<void> {
  if (typeof document === 'undefined') return
  try {
    await document.fonts.load(`16px "${BRANDING_FONT}"`)
  } catch {
    // Font loading failed, will fall back to monospace
  }
}

interface UseMapScreenshotOptions {
  mapRef: React.RefObject<MapboxHeatmapRef | null>
  aspectRatio: AspectRatio
  showBranding: boolean
  isDark: boolean
  panOffset?: PanOffset
  statistics?: ExportStatistics
}

interface UseMapScreenshotResult {
  captureScreenshot: () => Promise<string | null>
  captureBlob: () => Promise<Blob | null>
  capturePreview: () => Promise<string | null>
  isCapturing: boolean
}

export function useMapScreenshot({
  mapRef,
  aspectRatio,
  showBranding,
  isDark,
  panOffset = { x: 0, y: 0 },
  statistics,
}: UseMapScreenshotOptions): UseMapScreenshotResult {
  const [isCapturing, setIsCapturing] = useState(false)

  const captureToCanvas = useCallback(async (scale: number): Promise<HTMLCanvasElement | null> => {
    const canvas = mapRef.current?.getCanvas()
    if (!canvas) return null

    const config = ASPECT_RATIOS[aspectRatio]
    const targetWidth = Math.round(config.width * scale)
    const targetHeight = Math.round(config.height * scale)

    // Create composite canvas with error handling for memory constraints
    const compositeCanvas = document.createElement('canvas')
    try {
      compositeCanvas.width = targetWidth
      compositeCanvas.height = targetHeight
    } catch {
      console.error('Failed to create canvas - dimensions may be too large')
      return null
    }

    const ctx = compositeCanvas.getContext('2d')
    if (!ctx) return null

    // Background color (outer background)
    const bgColor = isDark ? '#0a0a0a' : '#FAFAFA'
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, targetWidth, targetHeight)

    // Calculate dimensions
    const padding = PADDING * scale
    const headerHeight = showBranding ? HEADER_HEIGHT * scale : 0
    const footerHeight = showBranding && statistics ? FOOTER_HEIGHT * scale : 0
    const borderWidth = BORDER_WIDTH * scale

    // Card dimensions (the polaroid frame)
    const cardX = padding
    const cardY = padding
    const cardWidth = targetWidth - padding * 2
    const cardHeight = targetHeight - padding * 2

    // Draw card border
    const borderColor = isDark ? '#F0EBE3' : '#2D2D2D'
    const mutedColor = isDark ? '#666666' : '#888888'
    ctx.strokeStyle = borderColor
    ctx.lineWidth = borderWidth
    ctx.strokeRect(cardX + borderWidth / 2, cardY + borderWidth / 2, cardWidth - borderWidth, cardHeight - borderWidth)

    await ensureFontLoaded()
    const textColor = isDark ? '#F0EBE3' : '#2D2D2D'

    // Draw header
    if (showBranding) {
      ctx.fillStyle = bgColor
      ctx.fillRect(cardX + borderWidth, cardY + borderWidth, cardWidth - borderWidth * 2, headerHeight)

      ctx.fillStyle = textColor
      const headerFontSize = Math.round(24 * scale)
      ctx.font = `${headerFontSize}px "${BRANDING_FONT}", monospace`
      ctx.textBaseline = 'middle'

      const headerTextY = cardY + borderWidth + headerHeight / 2

      // Draw "strava—x" on the left
      ctx.textAlign = 'left'
      ctx.fillText('strava—x', cardX + borderWidth + padding / 2, headerTextY)

      // Draw location name on the right (if available)
      if (statistics?.locationName) {
        ctx.textAlign = 'right'
        ctx.fillStyle = mutedColor
        const locationFontSize = Math.round(18 * scale)
        ctx.font = `${locationFontSize}px "${BRANDING_FONT}", monospace`
        ctx.fillText(statistics.locationName, cardX + cardWidth - borderWidth - padding / 2, headerTextY)
      }

      // Draw separator line under header
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth / 2
      ctx.beginPath()
      ctx.moveTo(cardX + borderWidth, cardY + borderWidth + headerHeight)
      ctx.lineTo(cardX + cardWidth - borderWidth, cardY + borderWidth + headerHeight)
      ctx.stroke()
    }

    // Draw footer with statistics
    if (showBranding && statistics) {
      const footerY = cardY + cardHeight - borderWidth - footerHeight

      // Draw separator line above footer
      ctx.strokeStyle = borderColor
      ctx.lineWidth = borderWidth / 2
      ctx.beginPath()
      ctx.moveTo(cardX + borderWidth, footerY)
      ctx.lineTo(cardX + cardWidth - borderWidth, footerY)
      ctx.stroke()

      // Footer background
      ctx.fillStyle = bgColor
      ctx.fillRect(cardX + borderWidth, footerY, cardWidth - borderWidth * 2, footerHeight)

      const footerPadding = padding / 2
      const statStartX = cardX + borderWidth + footerPadding
      const statWidth = (cardWidth - borderWidth * 2 - footerPadding * 2) / 3

      // Helper to format distance
      const formatDistance = (km: number): string => {
        if (km >= 1000) return `${(km / 1000).toFixed(1)}k`
        if (km >= 100) return km.toFixed(0)
        return km.toFixed(1)
      }

      // Helper to format elevation
      const formatElevation = (m: number): string => {
        if (m >= 1000) return `${(m / 1000).toFixed(1)}k`
        return m.toFixed(0)
      }

      // Draw stats
      const labelFontSize = Math.round(12 * scale)
      const valueFontSize = Math.round(28 * scale)
      const labelY = footerY + footerHeight * 0.35
      const valueY = footerY + footerHeight * 0.72

      const stats = [
        { label: 'activities', value: statistics.totalActivities.toLocaleString() },
        { label: 'kilometers', value: formatDistance(statistics.totalDistance) },
        { label: 'elevation (m)', value: formatElevation(statistics.totalElevation) },
      ]

      stats.forEach((stat, i) => {
        const centerX = statStartX + statWidth * i + statWidth / 2

        // Label
        ctx.fillStyle = mutedColor
        ctx.font = `${labelFontSize}px "${BRANDING_FONT}", monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(stat.label, centerX, labelY)

        // Value
        ctx.fillStyle = textColor
        ctx.font = `${valueFontSize}px "${BRANDING_FONT}", monospace`
        ctx.fillText(stat.value, centerX, valueY)
      })
    }

    // Calculate map area (inside the card, between header and footer)
    const mapAreaX = cardX + borderWidth
    const mapAreaY = cardY + borderWidth + headerHeight
    const mapAreaWidth = cardWidth - borderWidth * 2
    const mapAreaHeight = cardHeight - borderWidth * 2 - headerHeight - footerHeight

    // Calculate crop from source canvas (center crop with pan offset)
    // Scale down to 60% to allow more panning range in both directions
    const panZoom = 0.6
    const targetAspect = mapAreaWidth / mapAreaHeight

    // Calculate the crop size maintaining target aspect ratio, scaled down for pan room
    let sourceWidth: number
    let sourceHeight: number

    if (canvas.width / canvas.height > targetAspect) {
      // Source is wider than target
      sourceHeight = canvas.height * panZoom
      sourceWidth = sourceHeight * targetAspect
    } else {
      // Source is taller than target
      sourceWidth = canvas.width * panZoom
      sourceHeight = sourceWidth / targetAspect
    }

    // Calculate max pan range and apply offset
    const maxPanX = (canvas.width - sourceWidth) / 2
    const maxPanY = (canvas.height - sourceHeight) / 2
    const sourceX = maxPanX + panOffset.x * maxPanX
    const sourceY = maxPanY + panOffset.y * maxPanY

    // Draw map onto composite canvas
    ctx.drawImage(
      canvas,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      mapAreaX,
      mapAreaY,
      mapAreaWidth,
      mapAreaHeight
    )

    return compositeCanvas
  }, [mapRef, aspectRatio, showBranding, isDark, panOffset, statistics])

  const capture = useCallback(async (scale: number): Promise<string | null> => {
    const canvas = await captureToCanvas(scale)
    if (!canvas) return null
    return canvas.toDataURL('image/png')
  }, [captureToCanvas])

  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    setIsCapturing(true)
    try {
      return await capture(1)
    } finally {
      setIsCapturing(false)
    }
  }, [capture])

  const capturePreview = useCallback(async (): Promise<string | null> => {
    return await capture(PREVIEW_SCALE)
  }, [capture])

  const captureBlob = useCallback(async (): Promise<Blob | null> => {
    setIsCapturing(true)
    try {
      const canvas = await captureToCanvas(1)
      if (!canvas) return null

      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob)
        }, 'image/png')
      })
    } finally {
      setIsCapturing(false)
    }
  }, [captureToCanvas])

  return { captureScreenshot, captureBlob, capturePreview, isCapturing }
}

export function getAspectRatioConfig(aspectRatio: AspectRatio): AspectRatioConfig {
  return ASPECT_RATIOS[aspectRatio]
}

export const ASPECT_RATIO_OPTIONS: AspectRatio[] = ['1:1', '16:9', '4:5']
