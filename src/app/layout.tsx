import type { Metadata } from 'next'
import Script from 'next/script'
import 'mapbox-gl/dist/mapbox-gl.css'

import '@/styles/global.scss'
import { config } from '@/lib/config'

export const metadata: Metadata = {
  title: 'strava — x',
  description: 'strava——x',
  keywords: ['Walid Behlock'],
  authors: [{ name: 'Walid Behlock' }],
  metadataBase: new URL('https://strava—x'),
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body className="h-full">
        <Script src={config.STATS_TRACKING_URL} />
        {children}
      </body>
    </html>
  )
}
