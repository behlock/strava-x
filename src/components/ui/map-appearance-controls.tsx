'use client'

import { Combine, Layers2, LoaderCircle, ScanLine, Settings2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTheme } from 'next-themes'

import { useSwipeGesture } from '@/hooks/use-swipe-gesture'
import { Tooltip } from '@/components/ui/tooltip'
import { config } from '@/lib/config'
import type { CommonRoutesState } from '@/hooks/use-common-routes'
import {
  COMPARISON_PALETTES,
  DEFAULT_COMPARISON_ICON,
  DEFAULT_COMPARISON_PALETTE,
  comparisonColors,
  type ComparisonAppearance,
  type ComparisonIconId,
} from '@/lib/comparison-appearance'
import { cn } from '@/lib/utils'

const ICONS = { layers: Layers2, combine: Combine, scan: ScanLine }
const ICON_OPTIONS = [
  { id: 'layers', name: 'Layers2' },
  { id: 'combine', name: 'Combine' },
  { id: 'scan', name: 'ScanLine' },
] as const

export function CommonRoutesToggle({
  enabled,
  loading,
  disabled,
  onToggle,
  iconId = DEFAULT_COMPARISON_ICON,
}: {
  enabled: boolean
  loading: boolean
  disabled: boolean
  onToggle: () => void
  iconId?: ComparisonIconId
}) {
  const Icon = ICONS[iconId]
  return (
    <Tooltip text="overlap">
      <button
        type="button"
        aria-label="overlap"
        aria-pressed={enabled}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          'mobile-touch-target flex h-[34px] w-8 shrink-0 items-center justify-center border-l border-solid border-panel-border focus-ring-inset transition-colors hover:bg-control-hover disabled:cursor-not-allowed disabled:opacity-50 md:h-[31px] md:w-7',
          enabled && 'bg-selection text-selection-foreground hover:bg-selection',
        )}
      >
        {loading ? (
          <LoaderCircle className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  )
}

function AppearancePicker({ appearance, isDark }: { appearance: ComparisonAppearance; isDark: boolean }) {
  return (
    <div className="w-72 max-w-full space-y-3 border-t border-panel-border px-3 py-3">
      <fieldset>
        <legend className="mb-2 text-xs-compact text-panel-muted">palette</legend>
        <div className="grid grid-cols-2 gap-1">
          {COMPARISON_PALETTES.map((palette) => {
            const colors = isDark ? palette.dark : palette.light
            return (
              <button
                key={palette.id}
                type="button"
                aria-pressed={appearance.paletteId === palette.id}
                onClick={() => appearance.setPalette(palette.id)}
                className={cn(
                  'flex min-h-11 items-center justify-between gap-2 rounded-lg border border-transparent px-2 text-xs-compact focus-ring hover:bg-control-hover md:min-h-9',
                  appearance.paletteId === palette.id && 'border-panel-border bg-selection text-selection-foreground',
                )}
              >
                {palette.id}
                <span className="flex gap-1" aria-hidden="true">
                  {[colors.own, colors.other, colors.overlap].map((color, i) => (
                    <span key={i} className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-xs-compact text-panel-muted">icon</legend>
        <div className="grid grid-cols-3 gap-1">
          {ICON_OPTIONS.map(({ id, name }) => {
            const Icon = ICONS[id]
            return (
              <button
                key={id}
                type="button"
                aria-pressed={appearance.iconId === id}
                onClick={() => appearance.setIcon(id)}
                className={cn(
                  'flex min-h-16 flex-col items-center justify-center gap-2 rounded-lg border border-transparent text-xs-compact focus-ring hover:bg-control-hover',
                  appearance.iconId === id && 'border-panel-border bg-selection text-selection-foreground',
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                {name}
              </button>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

export function CommonRoutesNotice({
  state,
  onRetry,
  appearance,
  ownerLabel,
  viewerLabel = 'me',
}: {
  state: CommonRoutesState
  onRetry?: () => void
  appearance?: ComparisonAppearance
  ownerLabel: string
  viewerLabel?: string
}) {
  const { resolvedTheme } = useTheme()
  const [debugOpen, setDebugOpen] = useState(false)
  const [hiddenWhile, setHiddenWhile] = useState<CommonRoutesState['status'] | null>(null)
  const pickerId = useId()
  const isDark = resolvedTheme === 'dark'
  const colors = comparisonColors(appearance?.paletteId ?? DEFAULT_COMPARISON_PALETTE, isDark)
  const showDebug = config.MAP_STYLE_DEBUG && Boolean(appearance)
  const hidden = state.status === 'ready' && hiddenWhile === 'ready'
  const swipe = useSwipeGesture({
    enabled: state.status === 'ready',
    respectScroll: true,
    onDown: () => {
      setDebugOpen(false)
      setHiddenWhile('ready')
    },
    onUp: () => setHiddenWhile(null),
  })

  if (state.status === 'loading')
    return (
      <span role="status" className="sr-only">
        finding overlap
      </span>
    )

  const positionClass =
    'absolute right-3 bottom-[calc(var(--map-drawer-height,4rem)+0.75rem)] z-20 md:right-4 md:bottom-4'

  if (hidden) {
    return (
      <button
        type="button"
        aria-label="Show route legend"
        className={cn(positionClass, 'touch-none px-3 pt-2 pb-1')}
        {...swipe.handlers}
        onClick={() => {
          if (swipe.guardClick()) setHiddenWhile(null)
        }}
      >
        <span className="block h-1 w-9 rounded-full bg-foreground/25" aria-hidden="true" />
      </button>
    )
  }

  return (
    <div
      className={cn(
        positionClass,
        'max-h-[calc(100dvh-var(--map-drawer-height,4rem)-6rem-env(safe-area-inset-top,0px))] max-w-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain rounded-lg bg-panel/90 text-sm-compact text-foreground backdrop-blur-sm md:max-h-[calc(100dvh-6rem)] md:max-w-[calc(100%-2rem)]',
        (state.status === 'error' || (showDebug && debugOpen)) && 'border border-panel-border bg-panel',
      )}
      {...(state.status === 'ready' ? swipe.handlers : null)}
    >
      {state.status === 'ready' ? (
        <>
          <div
            className={cn(
              'sticky top-0 z-10 flex items-center justify-end gap-3 px-3 py-2',
              showDebug && debugOpen && 'bg-panel px-3',
            )}
          >
            <div
              aria-label="Route legend"
              className="flex min-w-0 items-center gap-3"
              style={{ textShadow: '0 1px 2px var(--background), 0 0 6px var(--background)' }}
            >
              {[
                { label: viewerLabel.toLowerCase(), color: colors.own, width: 1.5 },
                { label: ownerLabel.toLowerCase(), color: colors.other, width: 1 },
                {
                  label: 'overlap',
                  color: colors.overlap,
                  width: 3,
                },
              ].map(({ label, color, width }, index) => (
                <span key={index} className="inline-flex min-w-0 items-center gap-1.5">
                  <svg
                    className="h-3 w-4 shrink-0 md:w-5"
                    viewBox="0 0 24 12"
                    aria-hidden="true"
                    style={{ filter: 'drop-shadow(0 1px 2px var(--background))' }}
                  >
                    <line
                      x1="0"
                      y1="6"
                      x2="24"
                      y2="6"
                      stroke={color}
                      strokeWidth={width}
                      strokeDasharray={index === 0 ? '6 4' : undefined}
                    />
                  </svg>
                  <span className="max-w-20 truncate" title={label}>
                    {label}
                  </span>
                </span>
              ))}
            </div>
            {showDebug && (
              <button
                type="button"
                aria-label="Overlap appearance"
                aria-expanded={debugOpen}
                aria-controls={pickerId}
                onClick={() => setDebugOpen((value) => !value)}
                className="flex size-11 items-center justify-center rounded-lg focus-ring hover:bg-control-hover md:size-7"
              >
                <Settings2 className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
          {config.MAP_STYLE_DEBUG && appearance && debugOpen && (
            <div id={pickerId}>
              <AppearancePicker appearance={appearance} isDark={isDark} />
            </div>
          )}
        </>
      ) : (
        <div className="max-w-64 px-3 py-2">
          <p role="status" className="text-panel-muted">
            {state.message}
          </p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 min-h-8 rounded-lg px-2 focus-ring hover:bg-control-hover"
            >
              try again
            </button>
          )}
        </div>
      )}
    </div>
  )
}
