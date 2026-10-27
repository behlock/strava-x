'use client'

import { type PointerEvent, type TouchEvent, useRef } from 'react'

import {
  SWIPE_CLICK_SUPPRESS_PX,
  SWIPE_THRESHOLD,
  scrollParentBlocksSwipeDown,
  swipeDirection,
} from '@/lib/swipe-gesture'

interface SwipeGestureOptions {
  onUp?: () => void
  onDown?: () => void
  enabled?: boolean
  /** Ignore a swipe-down that starts inside a scrolled container. */
  respectScroll?: boolean
}

/** Vertical swipe detector that also suppresses the click a swipe would otherwise fire. */
export function useSwipeGesture({ onUp, onDown, enabled = true, respectScroll = false }: SwipeGestureOptions) {
  const gestureRef = useRef<{ startY: number; deltaY: number } | null>(null)
  const suppressClickRef = useRef(false)

  const begin = (clientY: number, target: EventTarget | null, root: EventTarget | null) => {
    if (!enabled) return false
    if (respectScroll && scrollParentBlocksSwipeDown(target, root)) return false
    suppressClickRef.current = false
    gestureRef.current = { startY: clientY, deltaY: 0 }
    return true
  }
  const move = (clientY: number) => {
    if (!gestureRef.current) return
    gestureRef.current.deltaY = clientY - gestureRef.current.startY
    if (Math.abs(gestureRef.current.deltaY) > SWIPE_CLICK_SUPPRESS_PX) suppressClickRef.current = true
  }
  const finish = () => {
    const deltaY = gestureRef.current?.deltaY ?? 0
    gestureRef.current = null
    const direction = swipeDirection(deltaY, SWIPE_THRESHOLD)
    if (direction === 'down') onDown?.()
    else if (direction === 'up') onUp?.()
    else suppressClickRef.current = false
  }
  const cancel = () => {
    gestureRef.current = null
    suppressClickRef.current = true
  }

  return {
    handlers: {
      onTouchStart: (event: TouchEvent) => {
        begin(event.touches[0].clientY, event.target, event.currentTarget)
      },
      onTouchMove: (event: TouchEvent) => {
        move(event.touches[0].clientY)
      },
      onTouchEnd: finish,
      onTouchCancel: cancel,
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === 'touch') return
        if (begin(event.clientY, event.target, event.currentTarget)) {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      },
      onPointerMove: (event: PointerEvent) => {
        if (event.pointerType === 'touch') return
        move(event.clientY)
      },
      onPointerUp: (event: PointerEvent) => {
        if (event.pointerType === 'touch') return
        finish()
      },
      onPointerCancel: (event: PointerEvent) => {
        if (event.pointerType === 'touch') return
        cancel()
      },
    },
    guardClick: () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false
        return false
      }
      return true
    },
  }
}
