import dynamic from 'next/dynamic'

import CustomHead from '@/components/custom-head'
import ThemeProvider from '@/components/theme-provider'

function Layout({
  seo = {
    title: 'strava—x',
    description: 'Strava heatmap',
    keywords: ['Walid Behlock'],
  },
  children = null,
}) {
  return (
    <>
      <CustomHead {...seo} />
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        <main className="p-8 flex flex-col space-y-4">{children}</main>
      </ThemeProvider>
    </>
  )
}

export default Layout
