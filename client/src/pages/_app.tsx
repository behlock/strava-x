import Script from 'next/script'
import { SessionProvider } from 'next-auth/react'
import 'mapbox-gl/dist/mapbox-gl.css'

import '@/styles/global.scss'
import { config } from '@/utils/config'

// @ts-ignore
function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <>
      <Script src={config.STATS_TRACKING_URL} />
      <SessionProvider session={session}>
        <Component {...pageProps} />
      </SessionProvider>
    </>
  )
}

export default MyApp
