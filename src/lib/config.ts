export const config = {
  STATS_TRACKING_URL: process.env.NEXT_PUBLIC_STATS_TRACKING_URL || '',
  MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
  MAPBOX_MAP_STYLE_DARK: process.env.NEXT_PUBLIC_MAPBOX_MAP_STYLE_DARK || 'mapbox://styles/mapbox/dark-v11',
  MAPBOX_MAP_STYLE_LIGHT: process.env.NEXT_PUBLIC_MAPBOX_MAP_STYLE_LIGHT || 'mapbox://styles/mapbox/light-v11',
  STRAVA_CLIENT_ID: process.env.NEXT_PUBLIC_STRAVA_CLIENT_ID || '',
} as const
