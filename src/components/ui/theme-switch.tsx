'use client'

import { useTheme } from 'next-themes'

import { useMounted } from '@/hooks/use-mounted'
import { Tooltip } from './tooltip'
import { useKeyboardShortcut } from '@/hooks/use-keyboard-shortcut'
import { SHORTCUTS } from '@/lib/keyboard-shortcuts'

export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useMounted()
  const nextTheme = resolvedTheme === 'dark' ? 'light' : 'dark'
  useKeyboardShortcut('toggle-theme', () => setTheme(nextTheme), mounted)
  const label = mounted ? `Switch to ${nextTheme} mode` : 'Toggle theme'

  return (
    <Tooltip text="theme" shortcut={SHORTCUTS['toggle-theme'].label}>
      <button
        type="button"
        aria-label={label}
        aria-keyshortcuts={SHORTCUTS['toggle-theme'].aria}
        disabled={!mounted}
        onClick={() => setTheme(nextTheme)}
        className="mobile-touch-target inline-flex size-8 shrink-0 items-center justify-center rounded-full floating-control focus-ring disabled:opacity-50 md:size-[35px]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className="transition-[rotate] duration-150 motion-reduce:transition-none dark:rotate-180"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M5 10.0002C2.23875 10 1.95695e-07 7.76151 4.37095e-07 5.00021C0.000201904 2.23908 2.23887 0.000411309 5 0.000210325C7.7613 0.000210566 9.9998 2.23896 10 5.00021C10 7.76163 7.76142 10.0002 5 10.0002ZM5.14323 8.85531L5.14323 1.14697C5.09569 1.14524 5.04797 1.14325 5 1.14325C2.87005 1.14345 1.14325 2.87026 1.14304 5.00021C1.14304 7.13033 2.86993 8.8579 5 8.8581C5.04795 8.8581 5.0957 8.85704 5.14323 8.85531Z"
            fill="currentColor"
          />
        </svg>
      </button>
    </Tooltip>
  )
}
