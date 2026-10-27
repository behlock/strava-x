import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <section
        aria-labelledby="not-found-title"
        className="w-full max-w-md rounded-xl border border-panel-border bg-panel"
      >
        <div className="flex items-center justify-between gap-3 border-b border-panel-border/40 px-5 py-4">
          <span className="text-base-compact font-medium tracking-tight">strava—x</span>
          <span className="rounded-lg border border-panel-border bg-control px-2 py-1 text-xs-compact text-panel-muted">
            404
          </span>
        </div>
        <div className="space-y-5 p-5">
          <div className="space-y-2">
            <h1 id="not-found-title" className="text-lg-compact font-medium tracking-tight">
              map not found
            </h1>
            <p className="text-sm-compact text-panel-muted">
              This link may be incorrect, or the owner has stopped sharing their map.
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg floating-control px-4 py-2 text-xs-compact tracking-wider focus-ring"
          >
            back to strava—x
          </Link>
        </div>
      </section>
    </main>
  )
}
