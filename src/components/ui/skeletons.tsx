'use client'

export function MapSkeleton() {
  return (
    <div className="absolute inset-0 animate-pulse bg-background">
      <div className="absolute inset-0 bg-muted/20" />
    </div>
  )
}
