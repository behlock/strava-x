'use client'

import { createContext } from 'react'

export const SidebarContext = createContext<{
  open: boolean
  mobile: boolean
  controlsId: string
  toggle: () => void
} | null>(null)
