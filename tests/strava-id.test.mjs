import assert from 'node:assert/strict'
import test from 'node:test'
import { types } from '@neondatabase/serverless'
import { loadTs } from './load-ts.mjs'

const { normalizeStravaId, stravaObjectId, athleteIdForJson } = loadTs('src/lib/strava-id.ts')
const { parseStravaWebhookJson } = loadTs('src/lib/strava-webhook-json.ts')
const max = '9223372036854775807'

test('the installed database driver returns int8 values as exact strings', () => {
  for (const id of ['42', '9007199254740992', '9007199254740993', max])
    assert.equal(types.getTypeParser(20, 'text')(id), id)
})

test('IDs retain every digit at the safe-number boundary and the int64 maximum', () => {
  for (const id of ['1', '9007199254740991', '9007199254740992', '9007199254740993', max])
    assert.equal(normalizeStravaId(id), id)
  assert.equal(normalizeStravaId(42), '42')
  for (const id of [
    null,
    undefined,
    {},
    true,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    Number(max),
    9007199254740992,
    '',
    '0',
    '-1',
    '01',
    ' 1',
    '1 ',
    '+1',
    '1e3',
    '1.0',
    '9223372036854775808',
    '9'.repeat(100),
  ])
    assert.equal(normalizeStravaId(id), null)
})

test('id_str takes precedence over rounded numeric IDs; malformed strings never fall back', () => {
  assert.equal(stravaObjectId(JSON.parse(`{"id":${max},"id_str":"${max}"}`)), max)
  assert.equal(stravaObjectId({ id: 42 }), '42')
  assert.equal(stravaObjectId({ id: 42, id_str: '42' }), '42')
  for (const id_str of [42, null, '', '1e3', '0', '9223372036854775808'])
    assert.equal(stravaObjectId({ id: 42, id_str }), null)
  assert.equal(stravaObjectId({ id: Number(max) }), null)
})

test('API compatibility never rounds large IDs and retains the old safe numeric representation', () => {
  assert.deepEqual(athleteIdForJson({ athleteId: '42', revision: '3' }), { athleteId: 42, revision: '3' })
  assert.equal(athleteIdForJson({ athleteId: '9007199254740991' }).athleteId, Number.MAX_SAFE_INTEGER)
  for (const id of ['9007199254740992', '9007199254740993', max])
    assert.equal(JSON.parse(JSON.stringify(athleteIdForJson({ athleteId: id }))).athleteId, id)
})

test('numeric webhook IDs use the original token; escaped keys and ID-like text cannot confuse parsing', () => {
  const value = parseStravaWebhookJson(
    `{"owner_id":${max},"object_\\u0069d":9007199254740993,"event_time":123,"updates":{"title":"\\\"owner_id\\\":123"}}`,
  )
  assert.equal(value.owner_id, max)
  assert.equal(value.object_id, '9007199254740993')
  assert.equal(value.event_time, 123)
  assert.equal(value.updates.title, '"owner_id":123')
  for (const token of ['-1', '0', '1.5', '1e3', '"7"', 'null', 'true', '9223372036854775808'])
    assert.equal(parseStravaWebhookJson(`{"owner_id":${token}}`).owner_id, null)
  assert.throws(() => parseStravaWebhookJson('{"owner_id":01}'))
})

test('athlete verification preserves large identities and rejects unsafe legacy numbers', async (t) => {
  const { verifyStravaToken } = loadTs('src/lib/strava-verify.ts')
  let body
  const previousFetch = globalThis.fetch
  t.after(() => {
    globalThis.fetch = previousFetch
  })
  globalThis.fetch = async () => new Response(body)
  for (const id of ['9007199254740992', '9007199254740993', max]) {
    body = `{"id":${id},"id_str":"${id}","firstname":"Test"}`
    assert.deepEqual(await verifyStravaToken(`token-${id}`), { athleteId: id, displayName: 'Test' })
  }
  body = '{"id":42}'
  assert.equal((await verifyStravaToken('legacy')).athleteId, '42')
  for (const [index, raw] of [`{"id":${max}}`, '{"id":42,"id_str":null}', 'null'].entries()) {
    body = raw
    await assert.rejects(verifyStravaToken(`invalid-${index}`), /strava_auth_malformed/)
  }
})

test('database reads and query parameters retain large athlete IDs', async () => {
  const calls = []
  const { ensureShare, findShareBySlug } = loadTs('src/lib/sharing-db.ts', {
    '@neondatabase/serverless': {
      neon:
        () =>
        async (parts, ...values) => {
          calls.push({ sql: parts.join('?'), values })
          return [{ athlete_id: max, revision: '1' }]
        },
    },
  })
  assert.equal((await ensureShare(max)).athlete_id, max)
  assert.equal((await findShareBySlug('test')).athlete_id, max)
  assert.deepEqual(
    calls.slice(0, 2).map((call) => call.values),
    [[max], [max]],
  )
})
