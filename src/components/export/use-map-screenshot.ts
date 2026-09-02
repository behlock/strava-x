'use client'

import { useCallback, useState } from 'react'

import type { ActivityMapRef } from '@/components/activity-map'

export type AspectRatio = '1:1' | '16:9' | '4:5'

interface AspectRatioConfig {
  width: number
  height: number
}

const ASPECT_RATIOS: Record<AspectRatio, AspectRatioConfig> = {
  '1:1': { width: 2160, height: 2160 },
  '16:9': { width: 3840, height: 2160 },
  '4:5': { width: 1728, height: 2160 },
}

export const ASPECT_RATIO_OPTIONS = Object.keys(ASPECT_RATIOS) as AspectRatio[]

export function getAspectRatioConfig(aspectRatio: AspectRatio): AspectRatioConfig {
  return ASPECT_RATIOS[aspectRatio]
}

export interface PanOffset {
  /** -1..1, 0 is centered. */
  x: number
  /** -1..1, 0 is centered. */
  y: number
}

const PREVIEW_SCALE = 0.5
const PADDING = 48
const HEADER_HEIGHT = 80
const BORDER_WIDTH = 3
// Crop to 60% of the map canvas so the user has room to pan the framing.
const PAN_ZOOM = 0.6

/** The body font stack (JetBrains Mono via next/font), so the canvas matches the UI. */
function brandingFontFamily(): string {
  return getComputedStyle(document.body).fontFamily || 'monospace'
}

interface UseMapScreenshotOptions {
  mapRef: React.RefObject<ActivityMapRef | null>
  aspectRatio: AspectRatio
  isDark: boolean
  panOffset: PanOffset
}

interface UseMapScreenshotResult {
  /** Full-resolution PNG data URL. */
  captureScreenshot: () => Promise<string | null>
  /** Full-resolution PNG blob. */
  captureBlob: () => Promise<Blob | null>
  /** Half-resolution PNG data URL for the dialog preview. */
  capturePreview: () => Promise<string | null>
  isCapturing: boolean
}

/** Composes the live map canvas into a framed, branded image. */
export function useMapScreenshot({
  mapRef,
  aspectRatio,
  isDark,
  panOffset,
}: UseMapScreenshotOptions): UseMapScreenshotResult {
  const [isCapturing, setIsCapturing] = useState(false)

  const compose = useCallback(
    async (scale: number): Promise<HTMLCanvasElement | null> => {
      const source = mapRef.current?.getCanvas()
      if (!source) return null

      const { width, height } = ASPECT_RATIOS[aspectRatio]
      const targetWidth = Math.round(width * scale)
      const targetHeight = Math.round(height * scale)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return null

      const bgColor = isDark ? '#0a0a0a' : '#FAFAFA'
      const inkColor = isDark ? '#F5F5F5' : '#2D2D2D'
      const padding = PADDING * scale
      const headerHeight = HEADER_HEIGHT * scale
      const borderWidth = BORDER_WIDTH * scale

      // Outer background and the card frame.
      ctx.fillStyle = bgColor
      ctx.fillRect(0, 0, targetWidth, targetHeight)

      const cardX = padding
      const cardY = padding
      const cardWidth = targetWidth - padding * 2
      const cardHeight = targetHeight - padding * 2
      ctx.strokeStyle = inkColor
      ctx.lineWidth = borderWidth
      ctx.strokeRect(
        cardX + borderWidth / 2,
        cardY + borderWidth / 2,
        cardWidth - borderWidth,
        cardHeight - borderWidth,
      )

      // Branding header.
      const family = brandingFontFamily()
      await document.fonts.load(`16px ${family}`).catch(() => {})
      ctx.fillStyle = inkColor
      ctx.font = `${Math.round(24 * scale)}px ${family}`
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText('strava-x.com', cardX + borderWidth + padding / 2, cardY + borderWidth + headerHeight / 2)

      ctx.lineWidth = borderWidth / 2
      ctx.beginPath()
      ctx.moveTo(cardX + borderWidth, cardY + borderWidth + headerHeight)
      ctx.lineTo(cardX + cardWidth - borderWidth, cardY + borderWidth + headerHeight)
      ctx.stroke()

      // Map area below the header, center-cropped from the source with the pan offset applied.
      const mapX = cardX + borderWidth
      const mapY = cardY + borderWidth + headerHeight
      const mapWidth = cardWidth - borderWidth * 2
      const mapHeight = cardHeight - borderWidth * 2 - headerHeight
      const targetAspect = mapWidth / mapHeight

      let sourceWidth: number
      let sourceHeight: number
      if (source.width / source.height > targetAspect) {
        sourceHeight = source.height * PAN_ZOOM
        sourceWidth = sourceHeight * targetAspect
      } else {
        sourceWidth = source.width * PAN_ZOOM
        sourceHeight = sourceWidth / targetAspect
      }
      const maxPanX = (source.width - sourceWidth) / 2
      const maxPanY = (source.height - sourceHeight) / 2
      const sourceX = maxPanX + panOffset.x * maxPanX
      const sourceY = maxPanY + panOffset.y * maxPanY

      ctx.drawImage(source, sourceX, sourceY, sourceWidth, sourceHeight, mapX, mapY, mapWidth, mapHeight)
      return canvas
    },
    [mapRef, aspectRatio, isDark, panOffset],
  )

  const withCapturing = useCallback(async <T>(work: () => Promise<T>): Promise<T> => {
    setIsCapturing(true)
    try {
      return await work()
    } finally {
      setIsCapturing(false)
    }
  }, [])

  const captureScreenshot = useCallback(
    () => withCapturing(async () => (await compose(1))?.toDataURL('image/png') ?? null),
    [compose, withCapturing],
  )

  const capturePreview = useCallback(
    async () => (await compose(PREVIEW_SCALE))?.toDataURL('image/png') ?? null,
    [compose],
  )

  const captureBlob = useCallback(
    () =>
      withCapturing(async () => {
        const canvas = await compose(1)
        if (!canvas) return null
        return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      }),
    [compose, withCapturing],
  )

  return { captureScreenshot, captureBlob, capturePreview, isCapturing }
}
