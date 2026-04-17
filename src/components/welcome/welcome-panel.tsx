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
        className="relative bg-panel border border-panel-border rounded-sm w-full max-w-md mx-4"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-panel-border">
          <span id="welcome-title" className="text-sm-compact tracking-wider">
            [welcome]
          </span>
          <button
            onClick={onDismiss}
            aria-label="Close welcome panel"
            className="text-xs-compact text-panel-muted hover:text-foreground transition-colors"
          >
            [x]
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <p className="text-sm-compact">welcome to strava—x</p>
            <p className="text-xs-compact text-panel-muted">
              a map of your Strava activities. connect your account, or take a look at someone else&apos;s map first
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-panel-border">
            <button
              onClick={handleConnectClick}
              className={cn(
                'min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border rounded-sm transition-colors',
                'border-foreground bg-foreground/10 hover:bg-foreground/20',
              )}
            >
              [→]—connect strava
            </button>
            <Link
              href="/walid"
              onClick={onDismiss}
              className="min-h-[44px] md:min-h-0 px-3 py-2 text-xs-compact tracking-wider border border-panel-border hover:border-foreground hover:bg-foreground/5 transition-colors rounded-sm text-left inline-flex items-center justify-start"
            >
              [↗]—check out walid&apos;s map
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
