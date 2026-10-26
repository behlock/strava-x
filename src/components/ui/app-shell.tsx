'use client'

import { type ReactNode, useCallback, useId, useState } from 'react'

import { useIsMobile } from '@/hooks/use-media-query'
import { DRAWER_COLLAPSED_HEIGHT, MobileDrawer } from './mobile-drawer'
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
  /** Floating map controls (e.g. locate), anchored bottom-right above the mobile drawer. */
  mapControls?: ReactNode
  onDrawerHeightChange: (height: number) => void
  onSidebarVisibilityChange?: (visible: boolean) => void
}

const EDGE_GAP = 16
// Keep the bottom-right stack clear of the header even when the drawer is
// fully expanded on a short viewport: header height + control + gap.
const STACK_MAX_BOTTOM = 'calc(100% - 120px)'

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
  mapControls,
  onDrawerHeightChange,
  onSidebarVisibilityChange,
}: AppShellProps) {
  const isMobile = useIsMobile()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const sidebarId = useId()

  // Track the drawer height locally too so map controls can sit above it.
  // Starts at the collapsed height so the first paint isn't under the drawer.
  const [drawerHeight, setDrawerHeight] = useState(DRAWER_COLLAPSED_HEIGHT)
  const handleDrawerHeightChange = useCallback(
    (height: number) => {
      setDrawerHeight(height)
      onDrawerHeightChange(height)
    },
    [onDrawerHeightChange],
  )
  const showDrawer = hasActivities && isMobile
  const stackBottom = showDrawer ? `min(${drawerHeight + EDGE_GAP}px, ${STACK_MAX_BOTTOM})` : EDGE_GAP

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      <div className="absolute inset-0">{children}</div>

      {/* Above the mobile drawer (z-20) so header menus never paint under it. */}
      <SidebarContext
        value={
          hasActivities && !isMobile
            ? {
                open: sidebarOpen,
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
              'pointer-events-auto scrollbar-thin min-h-0 w-full floating-sidebar flex-col overflow-y-auto rounded-lg border border-panel-border bg-panel',
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

      {/* Map controls sit above the drawer on mobile. The wrapper lets
          pointer events through to the map; only the controls catch them. */}
      <div className="pointer-events-none absolute right-4 z-10" style={{ bottom: stackBottom }}>
        {mapControls && <div className="pointer-events-auto">{mapControls}</div>}
      </div>

      {showDrawer && (
        <MobileDrawer
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
