'use client'

import { type ReactNode, useEffect, useId, useRef, useState } from 'react'

import { useSwipeGesture } from '@/hooks/use-swipe-gesture'
import { cn } from '@/lib/utils'
import { PanelChromeContext, PanelVisibilityContext } from './panel'

type Section = 'filters' | 'timeline' | 'locations' | 'activities'

const PEEK_CLASS =
  'pointer-events-auto flex w-full items-start justify-center pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]'

interface MobileDrawerProps {
  id?: string
  visible?: boolean
  filterPanel?: ReactNode
  timelinePanel?: ReactNode
  locationsPanel?: ReactNode
  activityList?: ReactNode
  onHeightChange: (height: number) => void
  onHide?: () => void
  onShow?: () => void
}

/** Direct section navigation below a single, non-modal sheet on phones. */
export function MobileDrawer({
  id,
  visible = true,
  filterPanel,
  timelinePanel,
  locationsPanel,
  activityList,
  onHeightChange,
  onHide,
  onShow,
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
    const report = () => onHeightChange(element.getBoundingClientRect().height)
    const observer = new ResizeObserver(report)
    observer.observe(element)
    report()
    return () => observer.disconnect()
  }, [onHeightChange, visible])

  const sheetSwipe = useSwipeGesture({ onDown: close, respectScroll: true })
  const navSwipe = useSwipeGesture({
    onDown: () => {
      if (activeSection) close()
      else onHide?.()
    },
    onUp: () => {
      if (!activeSection && sections[0]) activate(sections[0].key)
    },
  })
  const peekSwipe = useSwipeGesture({ onUp: onShow })

  return (
    <div
      ref={containerRef}
      id={id}
      className={cn(
        'pointer-events-none fixed bottom-0 z-20 flex flex-col md:hidden',
        visible
          ? 'right-3 left-3 max-h-[calc(100dvh-5rem-env(safe-area-inset-top,0px))] gap-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
          : 'inset-x-0',
      )}
      onKeyDownCapture={(event) => {
        event.currentTarget.dataset.keyboard = 'true'
      }}
      onPointerDownCapture={(event) => {
        delete event.currentTarget.dataset.keyboard
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && activeSection) {
          event.preventDefault()
          event.stopPropagation()
          close()
        }
      }}
    >
      {visible ? (
        <>
          {/* Keep the panels mounted so switching away pauses playback without
              discarding the timeline position or the activity list's scroll. */}
          <PanelChromeContext value={false}>
            <div
              className="mobile-sheet-slot grid min-h-0"
              data-switching={switching}
              data-open={Boolean(activeSection)}
            >
              {sections.map(({ key, label, content }) => (
                <section
                  key={key}
                  id={`${contentId}-${key}`}
                  aria-labelledby={`${contentId}-${key}-label`}
                  inert={activeSection?.key !== key}
                  hidden={activeSection?.key !== key}
                  aria-hidden={activeSection?.key !== key}
                  className="mobile-sheet pointer-events-auto col-start-1 row-start-1 flex min-h-0 flex-col overflow-hidden rounded-xl border border-panel-border bg-panel shadow-lg"
                  {...sheetSwipe.handlers}
                >
                  <button
                    type="button"
                    aria-label={`Close ${label}`}
                    className="flex min-h-11 w-full shrink-0 touch-none items-center px-4 text-xs-compact text-panel-muted focus-ring-inset"
                    onClick={() => {
                      if (sheetSwipe.guardClick()) close()
                    }}
                  >
                    <span id={`${contentId}-${key}-label`}>{label}</span>
                  </button>
                  <div className="flex scrollbar-thin max-h-[50dvh] min-h-0 flex-col overflow-y-auto overscroll-contain border-t border-panel-border/40">
                    {visited.includes(key) && (
                      <PanelVisibilityContext value={visible && activeSection?.key === key}>
                        {content}
                      </PanelVisibilityContext>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </PanelChromeContext>
          <nav
            aria-label="Map controls"
            className="pointer-events-auto flex shrink-0 touch-none items-stretch rounded-xl border border-panel-border bg-panel p-px shadow-lg"
            {...navSwipe.handlers}
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
                  if (!navSwipe.guardClick()) return
                  if (activeSection?.key === key) close()
                  else activate(key)
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
        </>
      ) : (
        <button
          type="button"
          aria-label="Show map controls"
          className={cn(PEEK_CLASS, 'touch-none')}
          {...peekSwipe.handlers}
          onClick={() => {
            if (peekSwipe.guardClick()) onShow?.()
          }}
        >
          <span className="h-1 w-9 rounded-full bg-foreground/25" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
