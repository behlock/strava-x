'use client'

import { useEffect } from 'react'
import { cn } from '@/lib/utils'

interface TEHelpModalProps {
  open: boolean
  onClose: () => void
  className?: string
}

export function TEHelpModal({ open, onClose, className }: TEHelpModalProps) {
  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (open) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/80 te-backdrop" onClick={onClose} />

      {/* Modal */}
      <div className={cn('relative bg-te-panel border border-te-border rounded-te w-full max-w-md mx-4', className)}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-te-border">
          <span className="text-te-sm tracking-wider">[?]—about</span>
          <button onClick={onClose} className="text-te-xs text-te-muted hover:text-foreground transition-colors">
            [x]
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <h3 className="text-te-base font-medium">strava—x</h3>
            <p className="text-te-sm text-te-muted">visualize your strava activity data on an interactive map</p>
          </div>

          <div className="space-y-2">
            <h4 className="text-te-xs tracking-wider text-te-muted">how to use</h4>
            <ol className="text-te-sm space-y-1 list-decimal list-inside">
              <li>request and upload your data archive</li>
              <li>filter by activity type and date</li>
              <li>explore your activities</li>
            </ol>
          </div>

          <div className="pt-2 border-t border-te-border">
            <p className="text-te-xs text-te-muted">your data stays local and is never uploaded to any server</p>
          </div>
        </div>
      </div>
    </div>
  )
}
