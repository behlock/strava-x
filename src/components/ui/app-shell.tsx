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
  instructions?: ReactNode
  uploadZone?: ReactNode
  statsPanel?: ReactNode
  filterPanel?: ReactNode
  activityList?: ReactNode
  hasActivities?: boolean
}

export function AppShell({
  header,
  leftPanels,
  bottomRightPanel,
  children,
  className,
  // Mobile props
  instructions,
  uploadZone,
  statsPanel,
  filterPanel,
  activityList,
  hasActivities = false,
}: AppShellProps) {
  const isMobile = useIsMobile()

  return (
    <div className={cn('relative h-screen w-screen overflow-hidden', className)}>
      {/* Full-screen map as background */}
      <div className="absolute inset-0">
        {children}
      </div>

      {/* Header - fixed at top */}
      <div className="absolute top-0 left-0 right-0 z-10">
        {header}
      </div>

      {/* Desktop layout */}
      {!isMobile && (
        <>
          {/* Left floating panels */}
          <div className="absolute top-14 left-4 z-10 w-56 lg:w-64 xl:w-72 space-y-3">
            {leftPanels}
          </div>

          {/* Bottom right statistics panel */}
          {bottomRightPanel && (
            <div className="absolute bottom-4 right-4 z-10 w-64 lg:w-72 xl:w-80">
              {bottomRightPanel}
            </div>
          )}
        </>
      )}

      {/* Mobile layout */}
      {isMobile && (
        <>
          {/* Instructions and upload zone float at top when no activities */}
          {!hasActivities && (
            <div className="absolute top-16 left-4 right-4 z-10 space-y-3">
              {instructions}
              {uploadZone}
            </div>
          )}

          {/* Bottom sheet drawer when activities exist */}
          {hasActivities && (
            <MobileDrawer
              statsPanel={statsPanel}
              filterPanel={filterPanel}
              activityList={activityList}
              hasActivities={hasActivities}
            />
          )}
        </>
      )}
    </div>
  )
}
