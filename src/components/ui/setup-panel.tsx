'use client'

import { useTheme } from 'next-themes'

import { useMounted } from '@/hooks/use-mounted'
import { Panel } from './panel'
import { SegmentedControl } from './segmented-control'

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

/**
 * Picks the stored theme setting (light, dark or system), labelled with words
 * rather than icons. `system` follows the OS, so it is offered explicitly.
 */
function ThemeSwitch() {
  const { theme, themes, setTheme } = useTheme()
  // next-themes can't know the setting during SSR; show nothing selected until hydrated.
  const mounted = useMounted()

  return (
    <SegmentedControl
      options={themes}
      value={mounted ? (theme ?? null) : null}
      onChange={setTheme}
      aria-label="Theme"
    />
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
                className="flex min-h-11 items-center text-panel-muted focus-ring transition-colors hover:text-foreground md:min-h-0"
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
