import type { ActivityType } from '@/models/activity'

export const ACTIVITY_TYPE_COLORS: Record<ActivityType, string> = {
  running: '#FF5500', // signature orange
  cycling: '#FFE600', // electric yellow
  hiking: '#00FF87', // neon green
  walking: '#00D4FF', // electric cyan
}

/** Anything outside `ACTIVITY_TYPES`. */
export const DEFAULT_ACTIVITY_COLOR = '#FF0080' // hot pink

export function getActivityColor(type: string | null): string {
  return (type && (ACTIVITY_TYPE_COLORS as Record<string, string>)[type]) || DEFAULT_ACTIVITY_COLOR
}
