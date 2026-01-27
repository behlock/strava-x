'use client'

import Link from 'next/link'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TEHeaderProps {
  className?: string
  onHelpClick?: () => void
}

export function TEHeader({ className, onHelpClick }: TEHeaderProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const isDark = mounted && theme === 'dark'

  return (
    <header
      className={cn(
        'flex items-center justify-between px-4 py-3 bg-te-panel/90 te-backdrop border-b border-te-border',
        className
      )}
    >
      <Link href="/">
        <span className="text-te-base font-medium tracking-tight">strava—x</span>
      </Link>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="min-h-[44px] px-3 py-2 md:px-2 md:py-1 md:min-h-0 text-te-xs tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-te-border rounded-te"
          disabled={!mounted}
        >
          [{isDark ? 'light' : 'dark'}]
        </button>
        <button
          onClick={onHelpClick}
          className="min-h-[44px] px-3 py-2 md:px-2 md:py-1 md:min-h-0 text-te-xs tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-te-border rounded-te text-te-muted"
        >
          [?]
        </button>
      </div>
    </header>
  )
}
