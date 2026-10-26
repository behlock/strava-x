'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const PLAYBACK_DURATION_MS = 20_000
// Keep map filtering and clustering off the browser's full frame rate.
const UPDATE_INTERVAL_MS = 100

export function useTimelinePlayback(selectedDate: number, onDateChange: (value: number) => void, visible: boolean) {
  const [playing, setPlaying] = useState(false)
  const [wasVisible, setWasVisible] = useState(visible)
  if (wasVisible !== visible) {
    setWasVisible(visible)
    if (!visible) setPlaying(false)
  }
  const frameRef = useRef<number | null>(null)
  const fromRef = useRef(0)
  // Slider changes and animation frames update this immediately, while the
  // parent applies expensive map filtering in a React transition.
  const positionRef = useRef(selectedDate)

  const pause = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setPlaying(false)
  }, [])

  const seek = useCallback(
    (value: number) => {
      pause()
      positionRef.current = value
      onDateChange(value)
    },
    [pause, onDateChange],
  )

  const toggle = useCallback(() => {
    if (playing) {
      pause()
      return
    }
    if (!visible || document.hidden) return
    const start = positionRef.current >= 100 ? 0 : positionRef.current
    fromRef.current = start
    positionRef.current = start
    onDateChange(start)
    setPlaying(true)
  }, [playing, onDateChange, visible, pause])

  useEffect(() => {
    if (!playing || !visible) return
    const startedAt = performance.now()
    const from = fromRef.current
    let lastUpdate = startedAt
    const tick = (now: number) => {
      if (document.hidden) {
        pause()
        return
      }
      const value = Math.min(100, from + ((now - startedAt) / PLAYBACK_DURATION_MS) * 100)
      if (now - lastUpdate >= UPDATE_INTERVAL_MS || value >= 100) {
        lastUpdate = now
        positionRef.current = value
        onDateChange(value)
      }
      if (value >= 100) {
        frameRef.current = null
        setPlaying(false)
      } else {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [playing, visible, onDateChange, pause])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) pause()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', pause)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', pause)
    }
  }, [pause])

  return { playing, toggle, pause, seek }
}
