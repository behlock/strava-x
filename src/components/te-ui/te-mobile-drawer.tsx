'use client'

import { ReactNode, useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type Tab = 'stats' | 'filters' | 'activities'

interface TEMobileDrawerProps {
  statsPanel?: ReactNode
  filterPanel?: ReactNode
  activityList?: ReactNode
  hasActivities?: boolean
  className?: string
}

export function TEMobileDrawer({
  statsPanel,
  filterPanel,
  activityList,
  hasActivities = false,
  className,
}: TEMobileDrawerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('stats')
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
    // Limit drag offset
    setDragOffset(Math.max(-100, Math.min(100, diff)))
  }, [isDragging])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    // If dragged down more than 50px while expanded, collapse
    if (isExpanded && dragOffset > 50) {
      setIsExpanded(false)
    }
    // If dragged up more than 50px while collapsed, expand
    if (!isExpanded && dragOffset < -50) {
      setIsExpanded(true)
    }
    setDragOffset(0)
  }, [isDragging, isExpanded, dragOffset])

  const handleDragHandleClick = useCallback(() => {
    if (!isDragging) {
      setIsExpanded(!isExpanded)
    }
  }, [isDragging, isExpanded])

  const tabs: { id: Tab; label: string }[] = hasActivities
    ? [
        { id: 'stats', label: 'stats' },
        { id: 'filters', label: 'filters' },
        { id: 'activities', label: 'list' },
      ]
    : []

  const renderContent = () => {
    if (!hasActivities) {
      return null
    }

    switch (activeTab) {
      case 'stats':
        return statsPanel
      case 'filters':
        return filterPanel
      case 'activities':
        return activityList
      default:
        return null
    }
  }

  // Calculate transform based on drag offset
  const getTransform = () => {
    if (isDragging && isExpanded) {
      // Allow dragging down when expanded
      return `translateY(${Math.max(0, dragOffset)}px)`
    }
    if (isDragging && !isExpanded) {
      // Allow dragging up when collapsed
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
        'fixed bottom-0 left-0 right-0 z-20 bg-te-panel/95 te-backdrop border-t border-te-border rounded-t-lg transition-all duration-300 ease-out',
        isExpanded ? 'max-h-[70vh]' : 'max-h-[120px]',
        className
      )}
      style={{ transform: getTransform() }}
    >
      {/* Drag handle */}
      <div
        className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleDragHandleClick}
      >
        <div className="w-10 h-1 bg-te-border rounded-full" />
      </div>

      {/* Tab bar */}
      {tabs.length > 0 && (
        <div className="flex border-b border-te-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                if (!isExpanded) setIsExpanded(true)
              }}
              className={cn(
                'flex-1 py-3 text-te-sm tracking-wider transition-colors min-h-[44px]',
                activeTab === tab.id
                  ? 'border-b-2 border-foreground'
                  : 'text-te-muted hover:bg-foreground/5'
              )}
            >
              [{tab.label}]
            </button>
          ))}
        </div>
      )}

      {/* Content area */}
      <div
        className={cn(
          'overflow-y-auto transition-all duration-300',
          isExpanded ? 'max-h-[calc(70vh-100px)]' : 'max-h-0 overflow-hidden'
        )}
      >
        <div className="p-4">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
