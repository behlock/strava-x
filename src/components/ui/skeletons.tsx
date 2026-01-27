'use client'

import { cn } from '@/lib/utils'

interface SkeletonProps {
  className?: string
}

export function MapSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('absolute inset-0 bg-background animate-pulse', className)}>
      <div className="absolute inset-0 bg-muted/20" />
    </div>
  )
}
