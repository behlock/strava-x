'use client'

import { createContext } from 'react'

export const SidebarContext = createContext<{
  open: boolean
  controlsId: string
  toggle: () => void
} | null>(null)
