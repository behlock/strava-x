export const config: { [key: string]: string  } = {
  STATS_TRACKING_URL: process.env.NEXT_PUBLIC_STATS_TRACKING_URL || '',
  MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
  MAPBOX_MAP_STYLE_DARK: process.env.NEXT_PUBLIC_MAPBOX_MAP_STYLE_DARK || '',
  MAPBOX_MAP_STYLE_LIGHT: process.env.NEXT_PUBLIC_MAPBOX_MAP_STYLE_LIGHT || '',
}