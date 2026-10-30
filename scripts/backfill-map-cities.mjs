import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { neon } from '@neondatabase/serverless'
import { get } from '@vercel/blob'

// Run with the intended environment loaded; writes require --apply.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.endsWith('/top-running-city.ts') && specifier === './urban-centres')
      return nextResolve('./urban-centres.ts', context)
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/top-running-city.ts') || url.endsWith('/urban-centres.ts')) {
      const result = nextLoad(url, { ...context, format: 'module' })
      return { ...result, source: stripTypeScriptTypes(String(result.source)), format: 'module' }
    }
    return nextLoad(url, context)
  },
})
const { topRunningCity } = await import('../src/lib/top-running-city.ts')
const databaseUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!databaseUrl || !process.env.PRIVATE_BLOB_READ_WRITE_TOKEN)
  throw new Error('Missing database or private blob configuration')
const sql = neon(databaseUrl)
const apply = process.argv.includes('--apply')
let after = 0
for (;;) {
  const rows = await sql`SELECT athlete_id, slug, revision, snapshot_path FROM map_shares
    WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL AND top_city IS NULL
      AND athlete_id > ${after} ORDER BY athlete_id LIMIT 25`
  if (!rows.length) break
  for (const row of rows) {
    after = row.athlete_id
    const blob = await get(row.snapshot_path, {
      access: 'private',
      token: process.env.PRIVATE_BLOB_READ_WRITE_TOKEN,
      abortSignal: AbortSignal.timeout(30_000),
    })
    if (!blob || blob.statusCode !== 200) throw new Error(`Snapshot unavailable: /${row.slug}`)
    const reader = blob.stream.getReader()
    const chunks = []
    let size = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > 32 * 1024 * 1024) throw new Error('Snapshot too large')
        chunks.push(value)
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    if (payload.version !== 1 || !Array.isArray(payload.activities)) throw new Error('Invalid snapshot')
    const city = await topRunningCity(payload.activities)
    if (apply) {
      const changed = await sql`UPDATE map_shares SET top_city=${city}
        WHERE athlete_id=${row.athlete_id} AND revision=${row.revision}::bigint
          AND snapshot_path=${row.snapshot_path} AND active AND top_city IS NULL RETURNING slug`
      console.log(`/${row.slug}: ${changed.length ? (city ?? 'no running city') : 'changed; skipped'}`)
    } else console.log(`/${row.slug}: ${city ?? 'no running city'} (dry run)`)
  }
}
