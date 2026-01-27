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
          <div className="absolute top-14 left-4 z-10 w-64 space-y-3 max-h-[calc(100vh-5rem)] overflow-y-auto scrollbar-hide">
            {leftPanels}
          </div>

          {/* Bottom right statistics panel */}
          {bottomRightPanel && (
            <div className="absolute bottom-4 right-4 z-10 w-72">
              {bottomRightPanel}
            </div>
          )}
        </>
      )}

      {/* Mobile layout */}
      {isMobile && (
        <>
          {/* Upload zone floats at top-center when no activities */}
          {!hasActivities && uploadZone && (
            <div className="absolute top-16 left-4 right-4 z-10">
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
