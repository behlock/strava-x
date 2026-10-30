'use client'

import { usePathname } from 'next/navigation'
import { Suspense, useRef } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

import { StravaAuthError } from '@/components/ui/strava-auth-error'
import { cn } from '@/lib/utils'
import { SITE_NAME } from '@/lib/site'
import { useFocusTrap } from '@/hooks/use-focus-trap'

interface WelcomePanelProps {
  open: boolean
  onConnect: () => void
}

const BUTTON =
  'focus-ring inline-flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs-compact tracking-wider transition-colors focus-visible:ring-offset-1 focus-visible:ring-offset-panel md:min-h-0'
const BUTTON_ICON = 'size-3.5 shrink-0'

export function WelcomePanel({ open, onConnect }: WelcomePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const pathname = usePathname()
  const visible = open && pathname !== '/maps'

  // Focus starts on the dialog itself so no ring shows on open.
  useFocusTrap(dialogRef, { active: visible, initialFocus: dialogRef, modalRoot: rootRef })

  if (!visible) return null

  return (
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xs" aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        aria-describedby="welcome-description"
        tabIndex={-1}
        className="relative mx-4 w-full max-w-md space-y-5 rounded-xl border border-panel-border bg-panel p-5 focus:outline-hidden"
      >
        <div className="flex items-center justify-between gap-4">
          <h2 id="welcome-title" className="text-sm-compact tracking-wider">
            welcome to {SITE_NAME}
          </h2>
        </div>

        <div id="welcome-description" className="space-y-3 text-xs-compact leading-relaxed text-panel-muted">
          <p>{SITE_NAME} lets you see your activities on an interactive map</p>
          <p>you can share your map with anyone, and compare maps to see which routes you&apos;ve both taken</p>
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
          {/* Keep the community directory code available for a future launch. */}
          {/* Native navigation requests a new random redirect on every click, without router prefetch/cache. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/explore"
            className={cn(BUTTON, 'border-panel-border hover:border-foreground hover:bg-foreground/5')}
          >
            <ArrowUpRight className={BUTTON_ICON} aria-hidden="true" />
            <span className="flex-1">explore</span>
          </a>
        </div>
      </div>
    </div>
  )
}
