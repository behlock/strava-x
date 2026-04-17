import type { Metadata } from 'next'
import Script from 'next/script'

import '@/styles/global.scss'
import { config } from '@/lib/config'
import ThemeProvider from '@/components/theme-provider'

export const metadata: Metadata = {
  title: 'strava—x',
  description: 'Visualize your Strava activities on an interactive map',
  keywords: ['Walid Behlock', 'Strava', 'map', 'activity map', 'GPX', 'FIT'],
  authors: [{ name: 'Walid Behlock' }],
  metadataBase: new URL('https://strava-x.com'),
  openGraph: {
    type: 'website',
    url: 'https://strava-x.com',
    title: 'strava—x',
    description: 'Visualize your Strava activities on an interactive map',
    siteName: 'strava—x',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'strava—x — activity map preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'strava—x',
    description: 'Visualize your Strava activities on an interactive map',
    images: ['/og-image.png'],
  },
  icons: {
    icon: [
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <Script src={config.STATS_TRACKING_URL} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
