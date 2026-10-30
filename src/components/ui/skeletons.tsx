'use client'

export function MapSkeleton() {
  return (
    <div className="absolute inset-0 bg-background motion-safe:animate-pulse">
      <div className="absolute inset-0 bg-muted/20" />
    </div>
  )
}
