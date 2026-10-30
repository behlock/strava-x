// Read production metadata and public snapshots; write only gitignored local files.
import { readFile, mkdir, writeFile, rename, copyFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { neon } from '@neondatabase/serverless'

const env = parseEnv(await readFile('.env.production.local', 'utf8'))
const sql = neon(env.POSTGRES_URL || env.DATABASE_URL || '')
const rows = await sql`SELECT slug, activity_count, updated_at FROM map_shares
  WHERE active AND slug IS NOT NULL AND snapshot_path IS NOT NULL
  ORDER BY activity_count DESC, slug ASC`
const snapshots = []
for (const row of rows) {
  if (!/^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/.test(row.slug)) throw new Error('Invalid published address')
  const response = await fetch(`https://strava-x.com/api/maps/${encodeURIComponent(row.slug)}?view=full`, {
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Snapshot download failed for /${row.slug}: ${response.status}`)
  const payload = await response.json()
  if (payload.version !== 1 || !Array.isArray(payload.activities)) throw new Error(`Invalid snapshot: /${row.slug}`)
  snapshots.push({ row, payload })
}
// Download everything before replacing any local file. Preserve earlier snapshots.
await mkdir('.local-maps', { recursive: true })
const backup = `.local-maps/backups/${Date.now()}`
await mkdir(backup, { recursive: true })
for (const name of [...rows.map((row) => `${row.slug}.json`), 'index.json']) {
  try {
    await copyFile(`.local-maps/${name}`, `${backup}/${name}`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
for (const { row, payload } of snapshots) {
  await writeFile(`.local-maps/${row.slug}.json.tmp`, JSON.stringify(payload), { mode: 0o600 })
  await rename(`.local-maps/${row.slug}.json.tmp`, `.local-maps/${row.slug}.json`)
  console.log(`Copied /${row.slug}: ${payload.activities.length} activities`)
}
await writeFile('.local-maps/index.json.tmp', JSON.stringify(rows, null, 2), { mode: 0o600 })
await rename('.local-maps/index.json.tmp', '.local-maps/index.json')
console.log(`Copied ${rows.length} published production maps locally. Production was read-only.`)
