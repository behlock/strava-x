'use client'

import type { Statistics } from '@/hooks/use-statistics'
import { Panel, PanelSkeleton } from './panel'

interface StatsPanelProps {
  statistics: Statistics
  loading?: boolean
}

function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-xs-compact text-panel-muted">{label}</span>
      <span className="text-lg-compact tabular-nums">{children}</span>
    </div>
  )
}

export function StatsPanel({ statistics, loading = false }: StatsPanelProps) {
  return (
    <Panel title="statistics">
      {loading ? (
        <PanelSkeleton />
      ) : (
        <div className="space-y-2 p-3">
          <Stat label="activities">{formatNumber(statistics.totalActivities)}</Stat>
          <Stat label="distance">{formatNumber(statistics.totalDistance, 1)} km</Stat>
          <Stat label="elevation">{formatNumber(statistics.totalElevation)} m</Stat>

          {statistics.breakdown.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-panel-border pt-2">
              {statistics.breakdown.map((item) => (
                <div key={item.type} className="flex items-center gap-2 text-xs-compact">
                  <div className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
                  <span className="flex-1 text-panel-muted">{item.type}</span>
                  <span className="tabular-nums">{item.count.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  )
}
