import Link from 'next/link'

import ThemeToggle from '@/components/theme-toggle'

const Header = () => {
  return (
    <header className="flex items-center justify-between  space-x-4">
      <Link href="/">
        <h1 className="font-bold">strava—x</h1>
      </Link>
      <ThemeToggle />
    </header>
  )
}

export default Header
