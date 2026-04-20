'use client'

import { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useIsMobile } from '@/hooks/use-media-query'
import { MobileDrawer } from './mobile-drawer'

interface AppShellProps {
  header: ReactNode
  leftPanels: ReactNode
  bottomRightPanel?: ReactNode
  children: ReactNode
  className?: string
  // Mobile-specific props
  statsPanel?: ReactNode
  filterPanel?: ReactNode
  activityList?: ReactNode
  hasActivities?: boolean
  onDrawerHeightChange?: (height: number) => void
}

export function AppShell({
  header,
  leftPanels,
  bottomRightPanel,
  children,
  className,
  // Mobile props
  statsPanel,
  filterPanel,
  activityList,
  hasActivities = false,
  onDrawerHeightChange,
}: AppShellProps) {
  const isMobile = useIsMobile()

  return (
    <div className={cn('relative h-screen w-screen overflow-hidden', className)}>
      {/* Full-screen map as background */}
      <div className="absolute inset-0">{children}</div>

      {/* Header - fixed at top */}
      <div className="absolute top-0 left-0 right-0 z-10">{header}</div>

      {/* Desktop layout */}
      {!isMobile && (
        <>
          {/* Left floating panels */}
          <div className="absolute top-[4.5rem] bottom-4 left-4 z-10 w-56 lg:w-64 xl:w-72 flex flex-col gap-3">
            {leftPanels}
          </div>

          {/* Bottom right statistics panel */}
          {bottomRightPanel && (
            <div className="absolute bottom-4 right-4 z-10 w-64 lg:w-72 xl:w-80">{bottomRightPanel}</div>
          )}
        </>
      )}

      {/* Mobile layout: bottom sheet drawer when activities exist */}
      {isMobile && hasActivities && (
        <MobileDrawer
          statsPanel={statsPanel}
          filterPanel={filterPanel}
          activityList={activityList}
          hasActivities={hasActivities}
          onHeightChange={onDrawerHeightChange}
        />
      )}
    </div>
  )
}
