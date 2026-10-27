'use client'

import Link from 'next/link'
import { Suspense, useRef } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

import { Pill } from '@/components/ui'
import { StravaAuthError } from '@/components/ui/strava-auth-error'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/hooks/use-focus-trap'

const DEMO_MAP_PATH = '/walid'

interface WelcomePanelProps {
  open: boolean
  onConnect: () => void
}

const BUTTON =
  'focus-ring inline-flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs-compact tracking-wider transition-colors focus-visible:ring-offset-1 focus-visible:ring-offset-panel md:min-h-0'
const BUTTON_ICON = 'size-3.5 shrink-0'

export function WelcomePanel({ open, onConnect }: WelcomePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus starts on the dialog itself so no ring shows on open.
  useFocusTrap(dialogRef, { active: open, initialFocus: dialogRef })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xs" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className="relative mx-4 w-full max-w-md space-y-5 rounded-xl border border-panel-border bg-panel p-5 focus:outline-hidden"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="welcome-title" className="text-sm-compact tracking-wider">
            welcome to strava—x
          </h2>
        </div>

        <Suspense fallback={null}>
          <StravaAuthError />
        </Suspense>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onConnect}
            className={cn(BUTTON, 'border-foreground bg-foreground text-background hover:bg-foreground/85')}
          >
            <ArrowRight className={BUTTON_ICON} aria-hidden="true" />
            connect your strava
          </button>
          <Link
            href={DEMO_MAP_PATH}
            className={cn(BUTTON, 'border-panel-border hover:border-foreground hover:bg-foreground/5')}
          >
            <ArrowUpRight className={BUTTON_ICON} aria-hidden="true" />
            <span className="flex-1">explore example map</span>
            <Pill>{DEMO_MAP_PATH}</Pill>
          </Link>
        </div>
      </div>
    </div>
  )
}
