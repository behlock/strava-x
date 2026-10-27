'use client'

import { type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { PanelChromeContext, PanelVisibilityContext } from './panel'

type Section = 'filters' | 'timeline' | 'locations' | 'activities'

const SWIPE_THRESHOLD = 50

interface MobileDrawerProps {
  filterPanel?: ReactNode
  timelinePanel?: ReactNode
  locationsPanel?: ReactNode
  activityList?: ReactNode
  onHeightChange: (height: number) => void
}

/** Direct section navigation below a single, non-modal sheet on phones. */
export function MobileDrawer({
  filterPanel,
  timelinePanel,
  locationsPanel,
  activityList,
  onHeightChange,
}: MobileDrawerProps) {
  const sections = (
    [
      { key: 'timeline', label: 'timeline', content: timelinePanel },
      { key: 'locations', label: 'locations', content: locationsPanel },
      { key: 'filters', label: 'types', content: filterPanel },
      { key: 'activities', label: 'activities', content: activityList },
    ] as const satisfies readonly { key: Section; label: string; content: ReactNode }[]
  ).filter((section) => Boolean(section.content))

  const [switching, setSwitching] = useState(false)
  const [visited, setVisited] = useState<Section[]>([])
  const [chosenSection, setChosenSection] = useState<Section | null>(null)
  const activeSection = sections.find((section) => section.key === chosenSection)
  const contentId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonsRef = useRef<Partial<Record<Section, HTMLButtonElement | null>>>({})
  const gestureRef = useRef<{ startY: number; deltaY: number } | null>(null)
  const suppressClickRef = useRef(false)

  const activate = (key: Section) => {
    setSwitching(Boolean(activeSection))
    setVisited((previous) => (previous.includes(key) ? previous : [...previous, key]))
    setChosenSection(key)
  }
  const close = () => {
    setSwitching(false)
    setChosenSection(null)
    if (activeSection) buttonsRef.current[activeSection.key]?.focus({ preventScroll: true })
  }

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(() => onHeightChange(element.getBoundingClientRect().height))
    observer.observe(element)
    return () => observer.disconnect()
  }, [onHeightChange])

  const startGesture = (event: React.TouchEvent) => {
    suppressClickRef.current = false
    gestureRef.current = { startY: event.touches[0].clientY, deltaY: 0 }
  }
  const moveGesture = (event: React.TouchEvent) => {
    if (!gestureRef.current) return
    gestureRef.current.deltaY = event.touches[0].clientY - gestureRef.current.startY
    if (Math.abs(gestureRef.current.deltaY) > 10) suppressClickRef.current = true
  }
  const endGesture = () => {
    const deltaY = gestureRef.current?.deltaY ?? 0
    gestureRef.current = null
    if (deltaY > SWIPE_THRESHOLD) close()
    else if (deltaY < -SWIPE_THRESHOLD && !activeSection && sections[0]) activate(sections[0].key)
  }
  const cancelGesture = () => {
    gestureRef.current = null
    suppressClickRef.current = true
  }

  return (
    <div
      ref={containerRef}
      className="pointer-events-none fixed right-3 bottom-0 left-3 z-20 flex max-h-[calc(100dvh-5rem-env(safe-area-inset-top,0px))] flex-col gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] md:hidden"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && activeSection) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      {/* Keep the panels mounted so switching away pauses playback without
          discarding the timeline position or the activity list's scroll. */}
      <PanelChromeContext value={false}>
        <div className="mobile-sheet-slot grid min-h-0" data-switching={switching} data-open={Boolean(activeSection)}>
          {sections.map(({ key, label, content }) => (
            <section
              key={key}
              id={`${contentId}-${key}`}
              aria-labelledby={`${contentId}-${key}-label`}
              inert={activeSection?.key !== key}
              hidden={activeSection?.key !== key}
              aria-hidden={activeSection?.key !== key}
              className="mobile-sheet pointer-events-auto col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden rounded-xl border border-panel-border bg-panel shadow-lg"
            >
              <button
                type="button"
                aria-label={`Close ${label}`}
                className="flex min-h-11 w-full shrink-0 touch-none items-center justify-between gap-3 px-4 text-xs-compact text-panel-muted focus-ring-inset"
                onTouchStart={startGesture}
                onTouchMove={moveGesture}
                onTouchEnd={endGesture}
                onTouchCancel={cancelGesture}
                onClick={() => {
                  if (!suppressClickRef.current) close()
                  suppressClickRef.current = false
                }}
              >
                <span id={`${contentId}-${key}-label`}>{label}</span>
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
              <div className="flex scrollbar-thin max-h-[50dvh] min-h-0 flex-col overflow-y-auto overscroll-contain border-t border-panel-border/40">
                {visited.includes(key) && (
                  <PanelVisibilityContext value={activeSection?.key === key}>{content}</PanelVisibilityContext>
                )}
              </div>
            </section>
          ))}
        </div>
      </PanelChromeContext>
      <nav
        aria-label="Map controls"
        className="pointer-events-auto flex shrink-0 touch-none items-stretch rounded-xl border border-panel-border bg-panel p-px shadow-lg"
        onTouchStart={startGesture}
        onTouchMove={moveGesture}
        onTouchEnd={endGesture}
        onTouchCancel={cancelGesture}
      >
        {sections.map(({ key, label }) => (
          <button
            key={key}
            ref={(element) => {
              buttonsRef.current[key] = element
            }}
            type="button"
            aria-label={label}
            aria-expanded={activeSection?.key === key}
            aria-controls={`${contentId}-${key}`}
            onClick={() => {
              if (!suppressClickRef.current) {
                if (activeSection?.key === key) close()
                else activate(key)
              }
              suppressClickRef.current = false
            }}
            className={cn(
              'group flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-lg px-0.5 text-center text-xs leading-4 whitespace-nowrap focus-ring-inset',
              activeSection?.key === key ? 'text-selection-foreground' : 'text-panel-muted',
            )}
          >
            <span
              className={cn(
                'flex h-8 w-full items-center justify-center rounded-lg transition-colors',
                activeSection?.key === key ? 'bg-selection' : 'group-hover:bg-foreground/5',
              )}
            >
              {label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  )
}
