'use client'

import { ReactNode, useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Section = 'stats' | 'filters' | 'activities'

interface MobileDrawerProps {
  statsPanel?: ReactNode
  filterPanel?: ReactNode
  activityList?: ReactNode
  hasActivities?: boolean
  className?: string
}

interface CollapsibleSectionProps {
  title: string
  isOpen: boolean
  onToggle: () => void
  children: ReactNode
}

function CollapsibleSection({ title, isOpen, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="border-b border-panel-border last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-foreground/5 transition-colors"
      >
        <span className="text-sm-compact tracking-wider">[{title}]</span>
        <span className="text-panel-muted text-xs-compact">
          {isOpen ? '[-]' : '[+]'}
        </span>
      </button>
      <div
        className={cn(
          'overflow-hidden transition-all duration-200',
          isOpen ? 'max-h-[40vh]' : 'max-h-0'
        )}
      >
        <div className="px-4 pb-4 overflow-y-auto max-h-[40vh]">
          {children}
        </div>
      </div>
    </div>
  )
}

export function MobileDrawer({
  statsPanel,
  filterPanel,
  activityList,
  hasActivities = false,
  className,
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

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const diff = currentY - startYRef.current
    setDragOffset(Math.max(-100, Math.min(100, diff)))
  }, [isDragging])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    if (isExpanded && dragOffset > 50) {
      setIsExpanded(false)
    }
    if (!isExpanded && dragOffset < -50) {
      setIsExpanded(true)
    }
    setDragOffset(0)
  }, [isExpanded, dragOffset])

  const handleDragHandleClick = useCallback(() => {
    if (!isDragging) {
      setIsExpanded(!isExpanded)
    }
  }, [isDragging, isExpanded])

  const toggleSection = (section: Section) => {
    if (!isExpanded) {
      setIsExpanded(true)
      setOpenSection(section)
    } else {
      setOpenSection(openSection === section ? null : section)
    }
  }

  const getTransform = () => {
    if (isDragging && isExpanded) {
      return `translateY(${Math.max(0, dragOffset)}px)`
    }
    if (isDragging && !isExpanded) {
      return `translateY(${Math.min(0, dragOffset)}px)`
    }
    return 'translateY(0)'
  }

  if (!hasActivities) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'fixed bottom-0 left-0 right-0 z-20 bg-panel/95 panel-blur border-t border-panel-border rounded-t-lg transition-all duration-300 ease-out',
        isExpanded ? 'max-h-[80vh]' : 'max-h-[56px]',
        className
      )}
      style={{
        transform: getTransform(),
        paddingBottom: 'env(safe-area-inset-bottom, 0px)'
      }}
    >
      {/* Drag handle */}
      <div
        className="flex flex-col items-center py-2 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDragHandleClick}
      >
        <div className="w-10 h-1 bg-panel-border rounded-full" />
        {!isExpanded && (
          <span className="text-xs-compact text-panel-muted mt-1">swipe up for controls</span>
        )}
      </div>

      {/* Collapsible sections */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300',
          isExpanded ? 'max-h-[70vh]' : 'max-h-0'
        )}
      >
        <CollapsibleSection
          title="filters"
          isOpen={openSection === 'filters'}
          onToggle={() => toggleSection('filters')}
        >
          {filterPanel}
        </CollapsibleSection>

        <CollapsibleSection
          title="list"
          isOpen={openSection === 'activities'}
          onToggle={() => toggleSection('activities')}
        >
          {activityList}
        </CollapsibleSection>

        <CollapsibleSection
          title="stats"
          isOpen={openSection === 'stats'}
          onToggle={() => toggleSection('stats')}
        >
          {statsPanel}
        </CollapsibleSection>
      </div>
    </div>
  )
}
