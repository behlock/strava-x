export const config: { [key: string]: string  } = {
  MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '',
  STATS_TRACKING_URL: process.env.NEXT_PUBLIC_STATS_TRACKING_URL || '',
}
