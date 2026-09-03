import Link from 'next/link'

export default function SlugNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-panel px-6">
      <div className="space-y-4 text-center">
        <p className="text-xs-compact tracking-wider text-panel-muted">[404]</p>
        <h1 className="text-lg-compact font-medium tracking-tight">no map published here</h1>
        <p className="max-w-md text-sm-compact text-panel-muted">
          nothing has been published at this address, or the owner has since unpublished their map
        </p>
        <Link href="/" className="inline-block text-xs-compact tracking-wider underline underline-offset-4">
          ← back to strava—x
        </Link>
      </div>
    </main>
  )
}
