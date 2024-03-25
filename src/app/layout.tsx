import type { Metadata } from 'next'
import Script from 'next/script'
import 'mapbox-gl/dist/mapbox-gl.css'

import '@/styles/global.scss'
import { config } from '@/lib/config'

export const metadata: Metadata = {
  title: {
    template: 'strava — x',
    default: 'strava — x',
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full">
        <Script src={config.STATS_TRACKING_URL} />
        {children}
      </body>
    </html>
  )
}
