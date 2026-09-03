'use client'

import { type ReactNode, useCallback, useState } from 'react'

import { useIsMobile } from '@/hooks/use-media-query'
import { DRAWER_COLLAPSED_HEIGHT, MobileDrawer } from './mobile-drawer'

interface AppShellProps {
  header: ReactNode
  /** The map. */
  children: ReactNode
  hasActivities: boolean
  filterPanel: ReactNode
  locationsPanel: ReactNode
  activityList: ReactNode
  statsPanel: ReactNode
  /** Floating map controls (e.g. locate), anchored bottom-right above the panels. */
  mapControls?: ReactNode
  onDrawerHeightChange: (height: number) => void
}

const EDGE_GAP = 16
// Keep the bottom-right stack clear of the header even when the drawer is
// fully expanded on a short viewport: header height + control + gap.
const STACK_MAX_BOTTOM = 'calc(100% - 120px)'

/**
 * Full-screen map with floating panels: a left column and a bottom-right
 * stats panel on desktop, a bottom-sheet drawer on mobile.
 */
export function AppShell({
  header,
  children,
  hasActivities,
  filterPanel,
  locationsPanel,
  activityList,
  statsPanel,
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
  const showDrawer = hasActivities && isMobile
  const stackBottom = showDrawer ? `min(${drawerHeight + EDGE_GAP}px, ${STACK_MAX_BOTTOM})` : EDGE_GAP

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">{children}</div>

      {/* Above the mobile drawer (z-20) so header menus never paint under it. */}
      <div className="absolute top-0 right-0 left-0 z-30">{header}</div>

      {hasActivities && !isMobile && (
        <div className="absolute top-18 bottom-4 left-4 z-10 flex w-56 flex-col gap-3 lg:w-64 xl:w-72">
          {filterPanel}
          {locationsPanel}
          {activityList}
        </div>
      )}

      {/* Bottom-right stack: map controls above the stats panel on desktop,
          above the drawer on mobile. The stack itself lets pointer events
          through to the map; only its children catch them. */}
      <div
        className="pointer-events-none absolute right-4 z-10 flex w-64 flex-col items-end gap-3 lg:w-72 xl:w-80"
        style={{ bottom: stackBottom }}
      >
        {mapControls && <div className="pointer-events-auto">{mapControls}</div>}
        {hasActivities && !isMobile && <div className="pointer-events-auto w-full">{statsPanel}</div>}
      </div>

      {showDrawer && (
        <MobileDrawer
          filterPanel={filterPanel}
          locationsPanel={locationsPanel}
          activityList={activityList}
          statsPanel={statsPanel}
          onHeightChange={handleDrawerHeightChange}
        />
      )}
    </div>
  )
}
