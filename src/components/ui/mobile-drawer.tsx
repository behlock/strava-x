'use client'

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type Section = 'filters' | 'locations' | 'activities' | 'stats' | 'setup'

export const DRAWER_COLLAPSED_HEIGHT = 56
const SWIPE_THRESHOLD = 50

interface MobileDrawerProps {
  filterPanel: ReactNode
  locationsPanel: ReactNode
  activityList: ReactNode
  statsPanel: ReactNode
  setupPanel?: ReactNode
  onHeightChange: (height: number) => void
}

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="border-b border-panel-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-foreground/5"
      >
        <span className="text-sm-compact tracking-wider">[{title}]</span>
        <span className="text-xs-compact text-panel-muted">{isOpen ? '[-]' : '[+]'}</span>
      </button>
      <div className={cn('overflow-hidden transition-all duration-200', isOpen ? 'max-h-[40vh]' : 'max-h-0')}>
        <div className="max-h-[40vh] overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </div>
  )
}

/** Bottom sheet holding the panels on small screens. Swipe or tap the handle to expand. */
export function MobileDrawer({
  filterPanel,
  locationsPanel,
  activityList,
  statsPanel,
  setupPanel,
  onHeightChange,
}: MobileDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [openSection, setOpenSection] = useState<Section | null>('filters')
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const startYRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true)
    startYRef.current = e.touches[0].clientY
    setDragOffset(0)
  }, [])

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return
      const diff = e.touches[0].clientY - startYRef.current
      setDragOffset(Math.max(-100, Math.min(100, diff)))
    },
    [isDragging],
  )

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    if (isExpanded && dragOffset > SWIPE_THRESHOLD) setIsExpanded(false)
    if (!isExpanded && dragOffset < -SWIPE_THRESHOLD) setIsExpanded(true)
    setDragOffset(0)
  }, [isExpanded, dragOffset])

  const toggleSection = (section: Section) => {
    if (!isExpanded) {
      setIsExpanded(true)
      setOpenSection(section)
    } else {
      setOpenSection((current) => (current === section ? null : section))
    }
  }

  // Let the map pad its viewport so the drawer never covers what it frames.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => onHeightChange(el.getBoundingClientRect().height))
    observer.observe(el)
    return () => observer.disconnect()
  }, [onHeightChange])

  // While dragging: an expanded drawer slides down with the finger; a
  // collapsed one grows upward (anchored to the bottom edge).
  const transform = isDragging && isExpanded ? `translateY(${Math.max(0, dragOffset)}px)` : 'translateY(0)'
  const maxHeight = isDragging && !isExpanded ? `${DRAWER_COLLAPSED_HEIGHT + Math.max(0, -dragOffset)}px` : undefined

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed right-0 bottom-0 left-0 z-20 rounded-t-lg border-t border-panel-border bg-panel/95 backdrop-blur-md',
        !isDragging && 'transition-all duration-300 ease-out',
        isExpanded ? 'max-h-[80vh]' : 'max-h-14',
      )}
      style={{ transform, maxHeight, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="flex cursor-grab touch-none flex-col items-center py-2 active:cursor-grabbing"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          if (!isDragging) setIsExpanded((value) => !value)
        }}
      >
        <div className="h-1 w-10 rounded-full bg-panel-border" />
        {!isExpanded && <span className="mt-1 text-xs-compact text-panel-muted">swipe up for controls</span>}
      </div>

      <div className={cn('overflow-hidden transition-all duration-300', isExpanded ? 'max-h-[70vh]' : 'max-h-0')}>
        <CollapsibleSection
          title="filters"
          isOpen={openSection === 'filters'}
          onToggle={() => toggleSection('filters')}
        >
          {filterPanel}
        </CollapsibleSection>
        {locationsPanel && (
          <CollapsibleSection
            title="locations"
            isOpen={openSection === 'locations'}
            onToggle={() => toggleSection('locations')}
          >
            {locationsPanel}
          </CollapsibleSection>
        )}
        <CollapsibleSection
          title="activities"
          isOpen={openSection === 'activities'}
          onToggle={() => toggleSection('activities')}
        >
          {activityList}
        </CollapsibleSection>
        <CollapsibleSection title="stats" isOpen={openSection === 'stats'} onToggle={() => toggleSection('stats')}>
          {statsPanel}
        </CollapsibleSection>
        {setupPanel && (
          <CollapsibleSection title="setup" isOpen={openSection === 'setup'} onToggle={() => toggleSection('setup')}>
            {setupPanel}
          </CollapsibleSection>
        )}
      </div>
    </div>
  )
}
