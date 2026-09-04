'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { ArrowRight, ArrowUpRight } from 'lucide-react'

import { DialogCloseButton } from '@/components/ui'
import { cn } from '@/lib/utils'
import { useFocusTrap } from '@/hooks/use-focus-trap'

/** The public map offered to first-time visitors who don't want to connect yet. */
const DEMO_MAP = { href: '/walid', label: "check out walid's map" }

interface WelcomePanelProps {
  open: boolean
  onDismiss: () => void
  onConnect: () => void
}

const BUTTON =
  'focus-ring inline-flex min-h-11 w-full items-center gap-2 rounded-sm border px-3 py-2 text-left text-xs-compact tracking-wider transition-colors focus-visible:ring-offset-1 focus-visible:ring-offset-panel md:min-h-0'
const BUTTON_ICON = 'size-3.5 shrink-0'

export function WelcomePanel({ open, onDismiss, onConnect }: WelcomePanelProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Focus starts on the dialog itself so no ring shows on open; the first
  // Tab lands on the primary action, since the close button comes last in
  // DOM order.
  useFocusTrap(dialogRef, { active: open, onEscape: onDismiss, initialFocus: dialogRef })

  if (!open) return null

  const handleConnectClick = () => {
    onDismiss()
    onConnect()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xs" onClick={onDismiss} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className="relative mx-4 w-full max-w-md space-y-5 rounded-sm border border-panel-border bg-panel p-5 focus:outline-hidden"
      >
        <div className="space-y-2 pr-8">
          <h2 id="welcome-title" className="text-sm-compact tracking-wider">
            welcome to strava—x
          </h2>
          <p className="text-xs-compact text-panel-muted">
            a map of everything you&apos;ve recorded on strava. connect your account, or browse someone else&apos;s map
            first
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={handleConnectClick}
            className={cn(BUTTON, 'border-foreground bg-foreground text-background hover:bg-foreground/85')}
          >
            <ArrowRight className={BUTTON_ICON} aria-hidden="true" />
            connect strava
          </button>
          <Link
            href={DEMO_MAP.href}
            onClick={onDismiss}
            className={cn(BUTTON, 'border-panel-border hover:border-foreground hover:bg-foreground/5')}
          >
            <ArrowUpRight className={BUTTON_ICON} aria-hidden="true" />
            {DEMO_MAP.label}
          </Link>
        </div>

        <DialogCloseButton onClick={onDismiss} aria-label="Close welcome panel" className="absolute top-3 right-3" />
      </div>
    </div>
  )
}
