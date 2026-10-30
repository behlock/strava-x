import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'
import { preconnect } from 'react-dom'
import { ThemeProvider } from 'next-themes'
import { BrowserTheme } from '@/components/ui/browser-theme'

import '@/styles/global.css'
import { config } from '@/lib/config'
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site'

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
})

export const viewport: Viewport = {
  colorScheme: 'light dark',
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f5f5' },
    { media: '(prefers-color-scheme: dark)', color: '#141414' },
  ],
}

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  keywords: ['Walid Behlock', 'Strava', 'map', 'activity map'],
  authors: [{ name: 'Walid Behlock' }],
  metadataBase: new URL(SITE_URL),
  openGraph: {
    type: 'website',
    url: SITE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: `${SITE_NAME} wordmark` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
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

export default function RootLayout({ children, modal }: { children: React.ReactNode; modal?: React.ReactNode }) {
  preconnect('https://api.mapbox.com', { crossOrigin: 'anonymous' })
  return (
    <html lang="en" className={jetbrainsMono.variable} suppressHydrationWarning>
      <body className="h-full">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <BrowserTheme />
          {config.STATS_TRACKING_URL && <Script src={config.STATS_TRACKING_URL} crossOrigin="anonymous" />}
          {children}
          {modal}
        </ThemeProvider>
      </body>
    </html>
  )
}
