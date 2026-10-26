'use client'

import { type ReactNode, useCallback, useState } from 'react'

import { useIsMobile } from '@/hooks/use-media-query'
import { DRAWER_COLLAPSED_HEIGHT, MobileDrawer } from './mobile-drawer'

interface AppShellProps {
  header: ReactNode
  /** The map. */
  children: ReactNode
  hasActivities: boolean
  timelinePanel: ReactNode
  filterPanel: ReactNode
  locationsPanel: ReactNode
  activityList: ReactNode
  /** Settings panel; last in the left column on desktop, last drawer section on mobile. */
  setupPanel?: ReactNode
  /** Floating map controls (e.g. locate), anchored bottom-right above the mobile drawer. */
  mapControls?: ReactNode
  onDrawerHeightChange: (height: number) => void
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
  timelinePanel,
  filterPanel,
  locationsPanel,
  activityList,
  setupPanel,
  mapControls,
  onDrawerHeightChange,
}: AppShellProps) {
  const isMobile = useIsMobile()

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
  // The setup panel (theme, disconnect) must stay reachable with no
  // activities, so the column and drawer show whenever there is one.
  const showPanels = hasActivities || Boolean(setupPanel)
  const showDrawer = showPanels && isMobile
  const stackBottom = showDrawer ? `min(${drawerHeight + EDGE_GAP}px, ${STACK_MAX_BOTTOM})` : EDGE_GAP

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">{children}</div>

      {/* Above the mobile drawer (z-20) so header menus never paint under it. */}
      <div className="absolute top-0 right-0 left-0 z-30">{header}</div>

      {showPanels && !isMobile && (
        // Scrolls on short viewports so the setup panel is always reachable;
        // the activity list keeps a floor height and takes any spare room.
        <div className="absolute top-18 bottom-4 left-4 z-10 hidden scrollbar-thin min-h-0 w-56 flex-col gap-3 overflow-x-hidden overflow-y-auto md:flex lg:w-64 xl:w-72">
          {hasActivities && timelinePanel}
          {hasActivities && locationsPanel}
          {hasActivities && filterPanel}
          {hasActivities && <div className="flex min-h-40 flex-1 flex-col">{activityList}</div>}
          {setupPanel}
        </div>
      )}

      {/* Map controls sit above the drawer on mobile. The wrapper lets
          pointer events through to the map; only the controls catch them. */}
      <div className="pointer-events-none absolute right-4 z-10" style={{ bottom: stackBottom }}>
        {mapControls && <div className="pointer-events-auto">{mapControls}</div>}
      </div>

      {showDrawer && (
        <MobileDrawer
          timelinePanel={hasActivities ? timelinePanel : null}
          filterPanel={hasActivities ? filterPanel : null}
          locationsPanel={hasActivities ? locationsPanel : null}
          activityList={hasActivities ? activityList : null}
          setupPanel={setupPanel}
          onHeightChange={handleDrawerHeightChange}
        />
      )}
    </div>
  )
}
