import dynamic from 'next/dynamic'

import CustomHead from '@/components/custom-head'

const Header = dynamic(() => import('@/components/header'), {
  ssr: false,
})

function Layout({
  seo = {
    title: 'strava—x',
    description: 'A place for my thoughts and experiments',
    keywords: ['Walid Behlock'],
  },
  children = null,
}) {
  return (
    <>
      <CustomHead {...seo} />
      <div className="flex h-full w-full bg-neutral-900 p-5">
        <Header />
        <main>{children}</main>
      </div>
    </>
  )
}

export default Layout
