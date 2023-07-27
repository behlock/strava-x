import dynamic from 'next/dynamic'

import CustomHead from '@/components/custom-head'

const Header = dynamic(() => import('@/components/header'), {
  ssr: false,
})

function Layout({
  seo = {
    title: 'strava—x',
    description: '',
    keywords: ['Walid Behlock'],
  },
  children = null,
}) {
  return (
    <>
      <CustomHead {...seo} />
      <div className="flex space-y-10 h-full w-full bg-neutral-900 p-5">
        <Header />
        <main>{children}</main>
      </div>
    </>
  )
}

export default Layout
