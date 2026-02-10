'use client'

import { useState, useEffect, useCallback } from 'react'

export type DistanceUnit = 'km' | 'mi'

const STORAGE_KEY = 'strava-x-units'

export function useUnits() {
  const [unit, setUnit] = useState<DistanceUnit>('km')

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'km' || stored === 'mi') {
      setUnit(stored)
    }
  }, [])

  const toggleUnit = useCallback(() => {
    setUnit((prev) => {
      const next = prev === 'km' ? 'mi' : 'km'
      localStorage.setItem(STORAGE_KEY, next)
      return next
    })
  }, [])

  const isMiles = unit === 'mi'

  const convertDistance = useCallback((km: number) => isMiles ? km * 0.621371 : km, [isMiles])
  const convertElevation = useCallback((m: number) => isMiles ? m * 3.28084 : m, [isMiles])
  const distanceLabel = isMiles ? 'mi' : 'km'
  const elevationLabel = isMiles ? 'ft' : 'm'

  return { unit, toggleUnit, isMiles, convertDistance, convertElevation, distanceLabel, elevationLabel }
}
