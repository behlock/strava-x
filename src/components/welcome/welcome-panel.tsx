'use client'

import Link from 'next/link'
import { useEffect } from 'react'

import { cn } from '@/lib/utils'

interface WelcomePanelProps {
  open: boolean
  onDismiss: () => void
  onConnect: () => void
}

export function WelcomePanel({ open, onDismiss, onConnect }: WelcomePanelProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onDismiss])

  if (!open) return null

  const handleConnectClick = () => {
    onDismiss()
    onConnect()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-background/10" onClick={onDismiss} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        className="relative mx-4 w-full max-w-md rounded-sm border border-panel-border bg-panel"
      >
        <div className="flex items-center justify-between border-b border-panel-border px-4 py-3">
          <span id="welcome-title" className="text-sm-compact tracking-wider">
            [welcome]
          </span>
          <button
            onClick={onDismiss}
            aria-label="Close welcome panel"
            className="text-xs-compact text-panel-muted transition-colors hover:text-foreground"
          >
            [x]
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <p className="text-sm-compact">welcome to strava—x</p>
            <p className="text-xs-compact text-panel-muted">
              a map of your Strava activities. connect your account, or take a look at someone else&apos;s map first
            </p>
          </div>

          <div className="flex flex-col gap-2 border-t border-panel-border pt-2">
            <button
              onClick={handleConnectClick}
              className={cn(
                'min-h-[44px] rounded-sm border px-3 py-2 text-xs-compact tracking-wider transition-colors md:min-h-0',
                'border-foreground bg-foreground/10 hover:bg-foreground/20',
              )}
            >
              [→]—connect strava
            </button>
            <Link
              href="/walid"
              onClick={onDismiss}
              className="inline-flex min-h-[44px] items-center justify-start rounded-sm border border-panel-border px-3 py-2 text-left text-xs-compact tracking-wider transition-colors hover:border-foreground hover:bg-foreground/5 md:min-h-0"
            >
              [↗]—check out walid&apos;s map
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
