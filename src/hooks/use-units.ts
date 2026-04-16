'use client'

export function useUnits() {
  return {
    convertDistance: (km: number) => km,
    convertElevation: (m: number) => m,
    distanceLabel: 'km',
    elevationLabel: 'm',
  }
}
