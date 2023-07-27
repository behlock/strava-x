import Script from 'next/script'

import '@/styles/global.scss'

// @ts-ignore
function MyApp({ Component, pageProps }) {
  return (
    <>
      <Script
        src="https://stats-peach-alpha.vercel.app/api/stats.js"
        onLoad={() => {
          // @ts-ignore
          collect('page_view')
        }}
      />
      <Component {...pageProps} />
    </>
  )
}

export default MyApp
