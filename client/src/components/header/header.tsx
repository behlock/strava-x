import ThemeToggle from "@/components/theme-toggle"

const Header = () => {
  return (
    <header className="flex flex-row items-center">
      <div className="flex-grow text-center">
      <h1 className="font-bold">strava—x</h1>
      </div>
      <ThemeToggle />
    </header>
  )
}

export default Header
