import Script from 'next/script'
import 'mapbox-gl/dist/mapbox-gl.css'

import '@/styles/global.scss'
import { config } from '@/utils/config'

// @ts-ignore
function MyApp({ Component, pageProps }) {
  return (
    <>
      <Script src={config.STATS_TRACKING_URL} />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
