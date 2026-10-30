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
  const gestureRef = useRef<{
    id: number
    kind: 'touch' | 'pointer'
    startX: number
    startY: number
    deltaX: number
    deltaY: number
  } | null>(null)
  const suppressClickRef = useRef(false)

  const begin = (
    id: number,
    kind: 'touch' | 'pointer',
    clientX: number,
    clientY: number,
    target: EventTarget | null,
    root: EventTarget | null,
  ) => {
    if (!enabled || gestureRef.current) return false
    if (target instanceof Element && target.closest('input, textarea, select, [role="slider"]')) return false
    if (respectScroll && scrollParentBlocksSwipeDown(target, root)) return false
    suppressClickRef.current = false
    gestureRef.current = { id, kind, startX: clientX, startY: clientY, deltaX: 0, deltaY: 0 }
    return true
  }
  const move = (clientX: number, clientY: number) => {
    if (!gestureRef.current) return
    gestureRef.current.deltaX = clientX - gestureRef.current.startX
    gestureRef.current.deltaY = clientY - gestureRef.current.startY
    if (Math.abs(gestureRef.current.deltaY) > SWIPE_CLICK_SUPPRESS_PX) suppressClickRef.current = true
  }
  const finish = () => {
    const gesture = gestureRef.current
    gestureRef.current = null
    if (!enabled || !gesture || Math.abs(gesture.deltaX) >= Math.abs(gesture.deltaY)) return
    const { deltaY } = gesture
    const direction = swipeDirection(deltaY, SWIPE_THRESHOLD)
    if (direction === 'down') onDown?.()
    else if (direction === 'up') onUp?.()
  }
  const cancel = () => {
    gestureRef.current = null
    suppressClickRef.current = true
  }

  return {
    handlers: {
      onTouchStart: (event: TouchEvent) => {
        const touch = event.changedTouches[0]
        if (touch) begin(touch.identifier, 'touch', touch.clientX, touch.clientY, event.target, event.currentTarget)
      },
      onTouchMove: (event: TouchEvent) => {
        const gesture = gestureRef.current
        if (gesture?.kind !== 'touch') return
        const touch = Array.from(event.touches).find((touch) => touch.identifier === gesture.id)
        if (touch) move(touch.clientX, touch.clientY)
      },
      onTouchEnd: (event: TouchEvent) => {
        const gesture = gestureRef.current
        if (gesture?.kind !== 'touch') return
        const touch = Array.from(event.changedTouches).find((touch) => touch.identifier === gesture.id)
        if (touch) {
          move(touch.clientX, touch.clientY)
          finish()
        }
      },
      onTouchCancel: (event: TouchEvent) => {
        if (
          gestureRef.current?.kind === 'touch' &&
          Array.from(event.changedTouches).some((touch) => touch.identifier === gestureRef.current?.id)
        )
          cancel()
      },
      onPointerDown: (event: PointerEvent) => {
        if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return
        begin(event.pointerId, 'pointer', event.clientX, event.clientY, event.target, event.currentTarget)
      },
      onPointerMove: (event: PointerEvent) => {
        if (gestureRef.current?.kind !== 'pointer' || gestureRef.current.id !== event.pointerId) return
        move(event.clientX, event.clientY)
        // Capturing on pointerdown retargets ordinary child-button clicks to
        // the sheet/nav. Capture only once a drag has actually begun.
        if (suppressClickRef.current && !event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId)
        }
      },
      onPointerUp: (event: PointerEvent) => {
        if (gestureRef.current?.kind !== 'pointer' || gestureRef.current.id !== event.pointerId) return
        move(event.clientX, event.clientY)
        finish()
      },
      onPointerCancel: (event: PointerEvent) => {
        if (gestureRef.current?.kind === 'pointer' && gestureRef.current.id === event.pointerId) cancel()
      },
      onPointerLeave: (event: PointerEvent) => {
        if (
          gestureRef.current?.kind === 'pointer' &&
          gestureRef.current.id === event.pointerId &&
          !event.currentTarget.hasPointerCapture(event.pointerId)
        )
          cancel()
      },
      onLostPointerCapture: (event: PointerEvent) => {
        if (gestureRef.current?.kind === 'pointer' && gestureRef.current.id === event.pointerId) cancel()
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
