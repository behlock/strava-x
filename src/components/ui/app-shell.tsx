'use client'

import { type ReactNode, useCallback, useId, useRef, useState } from 'react'

import { useIsMobile } from '@/hooks/use-media-query'
import { MobileDrawer } from './mobile-drawer'
import { PanelChromeContext, PanelVisibilityContext } from './panel'
import { SidebarContext } from './sidebar-context'
import { cn } from '@/lib/utils'

interface AppShellProps {
  header: ReactNode
  /** The map. */
  children: ReactNode
  hasActivities: boolean
  filterPanel: ReactNode
  timelinePanel: ReactNode
  locationsPanel: ReactNode
  activityList: ReactNode
  onDrawerHeightChange: (height: number) => void
  onSidebarVisibilityChange?: (visible: boolean) => void
}

/**
 * Full-screen map with floating panels: a left column on desktop and a
 * bottom-sheet drawer on mobile.
 */
export function AppShell({
  header,
  children,
  hasActivities,
  filterPanel,
  timelinePanel,
  locationsPanel,
  activityList,
  onDrawerHeightChange,
  onSidebarVisibilityChange,
}: AppShellProps) {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebarId = useId()
  const shellRef = useRef<HTMLDivElement>(null)
  const handleDrawerHeightChange = useCallback(
    (height: number) => {
      shellRef.current?.style.setProperty('--map-drawer-height', `${height}px`)
      onDrawerHeightChange(height)
    },
    [onDrawerHeightChange],
  )

  const showDrawer = hasActivities && isMobile

  return (
    <div ref={shellRef} className="relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">{children}</div>

      {/* Above the mobile drawer (z-20) so header menus never paint under it. */}
      <SidebarContext
        value={
          hasActivities
            ? {
                open: sidebarOpen,
                mobile: isMobile,
                controlsId: sidebarId,
                toggle: () => {
                  const visible = !sidebarOpen
                  setSidebarOpen(visible)
                  onSidebarVisibilityChange?.(visible)
                },
              }
            : null
        }
      >
        <div className="absolute top-0 right-0 left-0 z-30">{header}</div>
      </SidebarContext>

      {hasActivities && !isMobile && (
        <div className="pointer-events-none absolute top-18 bottom-4 left-4 z-10 hidden min-h-0 w-56 flex-col items-start gap-2 md:flex lg:w-64 xl:w-72">
          <aside
            id={sidebarId}
            aria-label="Map controls"
            className={cn(
              'pointer-events-auto scrollbar-thin min-h-0 w-full floating-sidebar flex-col overflow-y-auto rounded-xl border border-panel-border bg-panel',
              sidebarOpen ? 'flex' : 'hidden',
            )}
          >
            <PanelVisibilityContext value={sidebarOpen}>
              <PanelChromeContext value="sidebar">
                {timelinePanel}
                {locationsPanel}
                {filterPanel}
                {activityList}
              </PanelChromeContext>
            </PanelVisibilityContext>
          </aside>
        </div>
      )}

      {showDrawer && (
        <MobileDrawer
          id={sidebarId}
          visible={sidebarOpen}
          filterPanel={filterPanel}
          timelinePanel={timelinePanel}
          locationsPanel={locationsPanel}
          activityList={activityList}
          onHeightChange={handleDrawerHeightChange}
        />
      )}
    </div>
  )
}
