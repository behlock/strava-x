'use client'

import type { ReactNode } from 'react'

import { useIsMobile } from '@/hooks/use-media-query'
import { MobileDrawer } from './mobile-drawer'

interface AppShellProps {
  header: ReactNode
  /** The map. */
  children: ReactNode
  hasActivities: boolean
  filterPanel: ReactNode
  locationsPanel: ReactNode
  activityList: ReactNode
  statsPanel: ReactNode
  onDrawerHeightChange: (height: number) => void
}

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
  onDrawerHeightChange,
}: AppShellProps) {
  const isMobile = useIsMobile()

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">{children}</div>

      <div className="absolute top-0 right-0 left-0 z-10">{header}</div>

      {hasActivities && !isMobile && (
        <>
          <div className="absolute top-18 bottom-4 left-4 z-10 flex w-56 flex-col gap-3 lg:w-64 xl:w-72">
            {filterPanel}
            {locationsPanel}
            {activityList}
          </div>
          <div className="absolute right-4 bottom-4 z-10 w-64 lg:w-72 xl:w-80">{statsPanel}</div>
        </>
      )}

      {hasActivities && isMobile && (
        <MobileDrawer
          filterPanel={filterPanel}
          locationsPanel={locationsPanel}
          activityList={activityList}
          statsPanel={statsPanel}
          onHeightChange={onDrawerHeightChange}
        />
      )}
    </div>
  )
}
