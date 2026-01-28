'use client'

import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { useMounted } from '@/hooks/use-mounted'

interface HeaderProps {
  className?: string
  onHelpClick?: () => void
  onExportClick?: () => void
  onLogoClick?: () => void
  hasActivities?: boolean
}

export function Header({ className, onHelpClick, onExportClick, onLogoClick, hasActivities }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const mounted = useMounted()

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }

  const isDark = mounted && theme === 'dark'

  return (
    <header
      className={cn(
        'flex items-center justify-between px-4 py-3 bg-panel/90 panel-blur border-b border-panel-border',
        className
      )}
    >
      <button
        onClick={onLogoClick}
        className="text-base-compact font-medium tracking-tight hover:opacity-70 transition-opacity"
      >
        strava—x
      </button>

      <div className="flex items-center gap-1">
        <button
          onClick={toggleTheme}
          className="min-h-[44px] px-3 py-2 md:px-2 md:py-1 md:min-h-0 text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-panel-border rounded-sm"
          disabled={!mounted}
        >
          [{isDark ? 'light' : 'dark'}]
        </button>
        {hasActivities && (
          <button
            onClick={onExportClick}
            className="min-h-[44px] px-3 py-2 md:px-2 md:py-1 md:min-h-0 text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-panel-border rounded-sm"
          >
            [export]
          </button>
        )}
        <button
          onClick={onHelpClick}
          className="min-h-[44px] px-3 py-2 md:px-2 md:py-1 md:min-h-0 text-xs-compact tracking-wider hover:bg-foreground/5 transition-colors border border-transparent hover:border-panel-border rounded-sm text-panel-muted"
        >
          [?]
        </button>
      </div>
    </header>
  )
}
