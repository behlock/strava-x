'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TEInstructionsProps {
  className?: string
}

export function TEInstructions({ className }: TEInstructionsProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div
      className={cn(
        'bg-te-panel/90 te-backdrop border border-te-border rounded-te',
        className
      )}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-te-border hover:bg-foreground/5 transition-colors"
      >
        <span className="text-te-xs tracking-wider">
          [01]—download
        </span>
        <span className="text-te-muted text-te-xs">
          {expanded ? '[-]' : '[+]'}
        </span>
      </button>

      {expanded && (
        <div className="p-3 space-y-2">
          <div className="text-te-sm">
            request your data archive from{' '}
            <a
              href="https://www.strava.com/athlete/delete_your_account"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-te-muted transition-colors"
            >
              strava settings
            </a>
          </div>
          <div className="text-te-xs text-te-muted">
            available within a few minutes
          </div>
        </div>
      )}
    </div>
  )
}
