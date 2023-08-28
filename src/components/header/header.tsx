import ThemeToggle from '@/components/theme-toggle'

const Header = () => {
  return (
    <header className="flex items-center justify-between  space-x-4">
      <h1 className="font-bold">strava—x</h1>
      <ThemeToggle />
    </header>
  )
}

export default Header
