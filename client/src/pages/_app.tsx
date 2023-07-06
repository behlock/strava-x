import Script from 'next/script'
import { Provider } from 'react-redux'

import initStore from '@/store/store'
import '@/styles/global.scss'

const store = initStore()

// @ts-ignore
function MyApp({ Component, pageProps }) {
  return (
    <Provider store={store}>
      <Script
        src="https://stats-peach-alpha.vercel.app/api/stats.js"
        onLoad={() => {
          // @ts-ignore
          collect('page_view')
        }}
      />
      <Component {...pageProps} />
    </Provider>
  )
}

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

export default MyApp
