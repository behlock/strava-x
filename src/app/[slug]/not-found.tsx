import Link from 'next/link'

export default function SlugNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-panel px-6">
      <div className="text-center space-y-4">
        <p className="text-xs-compact tracking-wider opacity-60">404</p>
        <h1 className="text-lg font-medium tracking-tight">No map published at this URL</h1>
        <p className="text-sm opacity-60 max-w-md">
          Either nothing has ever been published here, or the owner has unpublished their map.
        </p>
        <Link href="/" className="inline-block text-xs-compact tracking-wider underline underline-offset-4">
          ← back to strava—x
        </Link>
      </div>
    </main>
  )
}
