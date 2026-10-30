import { pickExploreMap } from '@/lib/explore'
import { validateSlug } from '@/lib/slug'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex' }

export async function GET(request: Request) {
  const from = new URL(request.url).searchParams.get('from')
  const checked = from ? validateSlug(from) : null
  const current = checked?.ok ? checked.slug : null
  const cookie =
    request.headers
      .get('cookie')
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('explore_seen='))
      ?.slice('explore_seen='.length) ?? ''
  // A bounded, session-only history of public addresses; never an authorization signal.
  const visited = [
    ...new Set([
      ...cookie
        .slice(0, 3100)
        .split(',')
        .filter((slug) => validateSlug(slug).ok),
      ...(current ? [current] : []),
    ]),
  ].slice(-100)
  try {
    const slug = await pickExploreMap(current, visited)
    // Only validated internal map addresses can become redirect destinations.
    const destination = slug && validateSlug(slug).ok ? `/${slug}` : '/'
    const history =
      slug && destination !== '/'
        ? [...(visited.includes(slug) ? (current ? [current] : []) : visited), slug].slice(-100)
        : []
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location: destination,
        'Set-Cookie': `explore_seen=${history.join(',')}; Path=/explore; HttpOnly; SameSite=Lax${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`,
      },
    })
  } catch {
    return new Response('Maps are temporarily unavailable. Please go back and try again.', { status: 503, headers })
  }
}
