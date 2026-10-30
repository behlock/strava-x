'use client'

import styles from './maps.module.css'
import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMounted } from '@/hooks/use-mounted'
import { useRouter } from 'next/navigation'
import { useFocusTrap } from '@/hooks/use-focus-trap'

export function MapsOverlay({ children, intercepted = false }: { children: ReactNode; intercepted?: boolean }) {
  const router = useRouter()
  const mounted = useMounted()
  const panel = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const close = () => {
    if (intercepted && !document.querySelector('[data-maps-background]')) router.back()
    else router.replace('/')
  }
  useFocusTrap(panel, { active: mounted, initialFocus: panel, modalRoot: root })
  if (!mounted) return null
  return createPortal(
    <div
      ref={root}
      className={styles.root}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.defaultPrevented) {
          event.stopPropagation()
          close()
        }
      }}
    >
      <div className={styles.backdrop} onClick={close} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Published maps"
        tabIndex={-1}
        className={styles.panel}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
