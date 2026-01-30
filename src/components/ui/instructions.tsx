'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface InstructionsProps {
  className?: string
  defaultExpanded?: boolean
}

export function Instructions({ className, defaultExpanded = true }: InstructionsProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  useEffect(() => {
    if (!defaultExpanded) {
      setExpanded(false)
    }
  }, [defaultExpanded])

  return (
    <div className={cn('bg-panel/90 panel-blur border border-panel-border rounded-sm', className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-panel-border hover:bg-foreground/5 transition-colors"
      >
        <span className="text-xs-compact tracking-wider">[01]—download</span>
        <span className="text-panel-muted text-xs-compact">{expanded ? '[-]' : '[+]'}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          <div className="text-sm-compact">
            request your data archive from{' '}
            <a
              href="https://www.strava.com/athlete/delete_your_account"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-panel-muted transition-colors"
            >
              strava's download page
            </a>
          </div>
          <div className="text-xs-compact text-panel-muted">
            look for "Download Request" → click "Request Your Archive"
          </div>
        </div>
      )}
    </div>
  )
}
