'use client'

import { Combine, Layers2, LoaderCircle, ScanLine, Settings2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { HeaderChip } from '@/components/ui/header-bar'
import { Tooltip } from '@/components/ui/tooltip'
import { config } from '@/lib/config'
import type { CommonRoutesState } from '@/hooks/use-common-routes'
import {
  COMPARISON_PALETTES,
  COMPARISON_RENDER_MODES,
  DEFAULT_COMPARISON_ICON,
  DEFAULT_COMPARISON_PALETTE,
  DEFAULT_COMPARISON_RENDER_MODE,
  comparisonColors,
  type ComparisonAppearance,
  type ComparisonIconId,
  type RouteAppearance,
} from '@/lib/comparison-appearance'
import { cn } from '@/lib/utils'
import { personalRouteColor } from '@/lib/comparison-paint'

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
          'mobile-touch-target flex size-7 shrink-0 items-center justify-center border-l border-solid border-panel-border focus-ring-inset transition-colors hover:bg-control-hover disabled:cursor-not-allowed disabled:opacity-50',
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

function AppearancePicker({
  appearance,
  isDark,
  personal = false,
}: {
  appearance: ComparisonAppearance | RouteAppearance
  isDark: boolean
  personal?: boolean
}) {
  return (
    <div className="w-72 max-w-full space-y-3 border-t border-panel-border px-3 py-3">
      <fieldset>
        <legend className="mb-2 text-xs-compact text-panel-muted">render</legend>
        <div className="grid grid-cols-2 gap-1">
          {COMPARISON_RENDER_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              title={personal && mode.id === 'routes' ? 'crisp routes' : mode.description}
              aria-pressed={appearance.renderMode === mode.id}
              onClick={() => appearance.setRenderMode(mode.id)}
              className={cn(
                'min-h-11 rounded-lg border border-transparent px-2 text-left text-xs-compact focus-ring hover:bg-control-hover md:min-h-9',
                appearance.renderMode === mode.id && 'border-panel-border bg-selection text-selection-foreground',
              )}
            >
              {mode.id}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs-compact text-panel-muted">
          {personal && appearance.renderMode === 'routes'
            ? 'crisp routes'
            : COMPARISON_RENDER_MODES.find((mode) => mode.id === appearance.renderMode)?.description}
        </p>
      </fieldset>
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
                  {(personal
                    ? [personalRouteColor(palette.id, isDark)]
                    : [colors.own, colors.other, colors.overlap]
                  ).map((color, i) => (
                    <span key={i} className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
                  ))}
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      {'iconId' in appearance && !personal && (
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
      )}
    </div>
  )
}

export function CommonRoutesNotice({
  state,
  onRetry,
  appearance,
  ownerLabel,
  viewerLabel = 'me',
  heatmapStatus,
}: {
  state: CommonRoutesState
  onRetry?: () => void
  appearance?: ComparisonAppearance
  ownerLabel: string
  viewerLabel?: string
  heatmapStatus?: string
}) {
  const { resolvedTheme } = useTheme()
  const [debugOpen, setDebugOpen] = useState(false)
  const pickerId = useId()
  const isDark = resolvedTheme === 'dark'
  const colors = comparisonColors(appearance?.paletteId ?? DEFAULT_COMPARISON_PALETTE, isDark)
  const showDebug = config.MAP_STYLE_DEBUG && Boolean(appearance)

  if (state.status === 'loading')
    return (
      <span role="status" className="sr-only">
        finding overlap
      </span>
    )

  return (
    <div
      className={cn(
        'absolute right-3 bottom-[calc(var(--map-drawer-height,4rem)+0.75rem)] z-20 max-h-[calc(100dvh-var(--map-drawer-height,4rem)-6rem-env(safe-area-inset-top,0px))] max-w-[calc(100%-1.5rem)] overflow-y-auto overscroll-contain rounded-lg bg-panel/90 text-sm-compact text-foreground backdrop-blur-sm md:right-4 md:bottom-4 md:max-h-[calc(100dvh-6rem)] md:max-w-[calc(100%-2rem)]',
        (state.status === 'error' || (showDebug && debugOpen)) && 'border border-panel-border bg-panel',
      )}
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
                { label: viewerLabel, color: colors.own, width: 1.5 },
                { label: ownerLabel, color: colors.other, width: 1 },
                { label: 'overlap', color: colors.overlap, width: 3 },
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
                      strokeDasharray={
                        index === 0 && (appearance?.renderMode ?? DEFAULT_COMPARISON_RENDER_MODE) === 'routes'
                          ? '6 4'
                          : undefined
                      }
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
          {heatmapStatus && (
            <p role="status" className="px-3 pb-2 text-panel-muted">
              {heatmapStatus}
            </p>
          )}
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

export function PersonalMapAppearance({ appearance, status }: { appearance: RouteAppearance; status?: string }) {
  const { resolvedTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  return (
    <section
      aria-label="Personal map appearance"
      className="absolute top-[calc(4.5rem+env(safe-area-inset-top,0px))] right-4 z-30 max-w-[calc(100%-2rem)] md:top-18"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          trigger.current?.focus()
        }
      }}
    >
      <div
        className={cn(
          open &&
            'max-h-[calc(100dvh-11rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] overflow-y-auto overscroll-contain rounded-lg border border-panel-border bg-panel md:max-h-[calc(100dvh-10rem)]',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-end',
            open && 'sticky top-0 z-10 justify-between gap-3 bg-panel px-3 py-2',
          )}
        >
          {open && <span className="text-xs-compact">map style</span>}
          <HeaderChip
            ref={trigger}
            tooltip="map appearance"
            aria-label="Map appearance"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((value) => !value)}
          >
            <Settings2 className="size-3.5" aria-hidden="true" />
          </HeaderChip>
        </div>
        {open && (
          <div id={panelId}>
            {status && (
              <p role="status" className="px-3 pb-2 text-xs-compact text-panel-muted">
                {status}
              </p>
            )}
            <AppearancePicker appearance={appearance} isDark={resolvedTheme === 'dark'} personal />
          </div>
        )}
      </div>
      {!open && status && (
        <p
          role="status"
          className="mt-2 max-w-64 rounded-lg border border-panel-border bg-panel px-3 py-2 text-xs-compact text-panel-muted"
        >
          {status}
        </p>
      )}
    </section>
  )
}
