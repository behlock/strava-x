import assert from 'node:assert/strict'
import test from 'node:test'
import { NextRequest } from 'next/server.js'
import { loadTs } from './load-ts.mjs'

process.env.STRAVA_CLIENT_SECRET = 'isolated-test-secret'
const config = {
  getAppUrl: () => 'http://localhost',
  getStravaCredentials: () => ({ clientId: 'test', clientSecret: 'test' }),
  setSessionCookies: (response, token, verified) => {
    response.cookies.set('strava_rt', token)
    response.headers.set('x-test-routes', String(verified))
  },
  clearSessionCookies: (response) => response.cookies.set('strava_rt', '', { maxAge: 0 }),
  clearOAuthStateCookie: () => {},
}
function request(origin = 'http://localhost') {
  return new NextRequest('http://localhost/api/auth/strava/refresh', {
    method: 'POST',
    headers: { origin, cookie: 'strava_rt=old' },
  })
}
const refreshRoute = () => loadTs('src/app/api/auth/strava/refresh/route.ts', { '@/lib/server-config': config }).POST

test('cross-origin refresh is rejected before contacting Strava', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('must not fetch')
  })
  assert.equal((await refreshRoute()(request('https://attacker.example'))).status, 403)
})
test('concurrent refreshes coalesce and return rotated cookies to every caller', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => {
    calls++
    return Response.json({
      access_token: 'new-access',
      refresh_token: 'new-refresh',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      scope: 'read,activity:read',
    })
  })
  const POST = refreshRoute()
  const responses = await Promise.all([POST(request()), POST(request())])
  assert.equal(calls, 1)
  for (const response of responses) {
    assert.equal(response.status, 200)
    assert.equal(response.cookies.get('strava_rt').value, 'new-refresh')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.equal(response.headers.get('x-test-routes'), 'true')
    assert.equal(typeof (await response.json()).routeAccessProof, 'string')
  }
})
test('refresh failures are retriable; transient failures keep cookies, revoked grants clear them', async (t) => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: ++calls === 1 ? 503 : 401 }))
  const POST = refreshRoute()
  const transient = await POST(request())
  assert.equal(transient.status, 502)
  assert.equal(transient.headers.get('set-cookie'), null)
  const revoked = await POST(request())
  assert.equal(revoked.status, 401)
  assert.match(revoked.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal(calls, 2)
})
test('malformed or expired token responses never establish a session', async (t) => {
  const POST = refreshRoute()
  for (const payload of [null, {}, { access_token: 'a', refresh_token: 'b', expires_at: 1 }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload))
    const response = await POST(request())
    assert.equal(response.status, 502)
    assert.equal(response.headers.get('set-cookie'), null)
  }
})
test('OAuth state with equal character length but unequal UTF-8 length fails safely', async (t) => {
  t.mock.method(globalThis, 'fetch', () => {
    throw new Error('must not fetch')
  })
  const { GET } = loadTs('src/app/api/auth/strava/callback/route.ts', { '@/lib/server-config': config })
  const response = await GET(
    new NextRequest('http://localhost/api/auth/strava/callback?code=test&state=%C3%A9', {
      headers: { cookie: 'strava_oauth_state=a' },
    }),
  )
  assert.match(response.headers.get('location'), /invalid_state/)
})

test('missing refresh cookie clears the stale connected session', async () => {
  const response = await refreshRoute()(
    new NextRequest('http://localhost/api/auth/strava/refresh', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    }),
  )
  assert.equal(response.status, 401)
  assert.match(response.headers.get('set-cookie'), /Max-Age=0/)
})
