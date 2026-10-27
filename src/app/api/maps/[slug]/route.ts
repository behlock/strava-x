import { type NextRequest } from 'next/server'
import { findShareBySlug } from '@/lib/sharing-db'
import { readPrivateSnapshot } from '@/lib/sharing-storage'
import { validateSlug } from '@/lib/slug'
import { loadLocalMap } from '@/lib/local-map'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const checked = validateSlug((await params).slug)
  if (!checked.ok) return new Response(null, { status: 404, headers })
  try {
    const local = await loadLocalMap(checked.slug)
    if (local) return Response.json(local, { headers })
    const row = await findShareBySlug(checked.slug)
    if (!row?.snapshot_path) return new Response(null, { status: 404, headers })
    const blob = await readPrivateSnapshot(row.snapshot_path)
    if (!blob || blob.statusCode !== 200) return new Response(null, { status: 503, headers })
    let handedOff = false
    try {
      // Recheck after storage I/O, so a stop/rename during that wait revokes this response.
      const current = await findShareBySlug(checked.slug)
      if (
        !current ||
        current.athlete_id !== row.athlete_id ||
        current.revision !== row.revision ||
        current.snapshot_path !== row.snapshot_path
      ) {
        return new Response(null, { status: 404, headers })
      }
      const response = new Response(blob.stream, {
        headers: { ...headers, 'Content-Type': 'application/json', 'X-Content-Type-Options': 'nosniff' },
      })
      handedOff = true
      return response
    } finally {
      if (!handedOff) await blob.stream.cancel().catch(() => {})
    }
  } catch {
    return new Response(null, { status: 503, headers })
  }
}
