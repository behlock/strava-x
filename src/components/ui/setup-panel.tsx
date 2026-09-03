'use client'

import { useTheme } from 'next-themes'

import { cn } from '@/lib/utils'
import { useMounted } from '@/hooks/use-mounted'
import { Panel } from './panel'

const THEMES = ['light', 'dark'] as const

interface SetupPanelProps {
  /** Present while a Strava account is connected; shows the account row. */
  onDisconnect?: () => void
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3 text-xs-compact tracking-wider">
      <span className="text-panel-muted">{label}</span>
      {children}
    </div>
  )
}

/** Two-position switch, labelled with the words rather than icons. */
function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  // next-themes can't know the theme during SSR; show nothing selected until hydrated.
  const mounted = useMounted()

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className="inline-flex overflow-hidden rounded-sm border border-panel-border"
    >
      {THEMES.map((theme) => {
        const selected = mounted && resolvedTheme === theme
        return (
          <button
            key={theme}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!mounted}
            onClick={() => setTheme(theme)}
            className={cn(
              'px-2 py-1 text-xs-compact tracking-wider transition-colors focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-hidden focus-visible:ring-inset',
              selected
                ? 'bg-foreground text-background'
                : 'text-panel-muted hover:bg-foreground/5 hover:text-foreground',
            )}
          >
            {theme}
          </button>
        )
      })}
    </div>
  )
}

/** Settings that aren't about the current map: theme and account. */
export function SetupPanel({ onDisconnect }: SetupPanelProps) {
  return (
    <Panel title="setup">
      <div className="space-y-1 p-3">
        <Row label="theme">
          <ThemeSwitch />
        </Row>
        {onDisconnect && (
          <Row label="account">
            <span className="flex items-center gap-2">
              <span>strava</span>
              <button
                type="button"
                onClick={onDisconnect}
                className="text-panel-muted transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-hidden"
              >
                [disconnect]
              </button>
            </span>
          </Row>
        )}
      </div>
    </Panel>
  )
}
