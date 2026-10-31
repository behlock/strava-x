'use client'

import { DialRoot, useDialKitController } from 'dialkit'
import { useTheme } from 'next-themes'
import 'dialkit/styles.css'

export default function DesignTuner() {
  const { resolvedTheme } = useTheme()
  const dial = useDialKitController(
    'strava—x design',
    {
      panels: {
        radius: [8, 0, 24, 1],
        headerPaddingX: [12, 8, 24, 1],
        headerPaddingY: [8, 4, 20, 1],
        opacity: [100, 30, 100, 1],
        blur: [0, 0, 24, 1],
        shadow: [0, 0, 30, 1],
      },
      typography: {
        size: [1, 0.9, 1.3, 0.05],
        lineHeight: [1, 1, 1.2, 0.05],
        tracking: [1, 0, 2, 0.1],
      },
      reset: { type: 'action', label: 'Reset to app defaults' },
    },
    {
      id: 'strava-x-design-v1',
      persist: true,
      onAction: (action) => {
        if (action === 'reset') dial.resetValues()
      },
    },
  )
  const { panels, typography } = dial.values
  return (
    <>
      <style>{`
        :root {
          --ui-radius: ${panels.radius}px;
          --ui-type-scale: ${typography.size};
          --ui-line-scale: ${typography.lineHeight};
          --ui-tracking-scale: ${typography.tracking};
        }
        .floating-sidebar, .mobile-sheet {
          background: color-mix(in srgb, var(--panel) ${panels.opacity}%, transparent);
          backdrop-filter: blur(${panels.blur}px);
          ${panels.shadow > 0 ? `box-shadow: 0 8px ${panels.shadow * 2}px rgb(0 0 0 / ${panels.shadow / 100});` : ''}
        }
        .floating-sidebar .collapsible-panel { background: transparent; }
        .collapsible-panel > button {
          padding: ${panels.headerPaddingY}px ${panels.headerPaddingX + 8}px ${panels.headerPaddingY}px ${panels.headerPaddingX}px;
        }
      `}</style>
      <DialRoot position="bottom-right" theme={resolvedTheme === 'dark' ? 'dark' : 'light'} versions="menu" />
    </>
  )
}
