// Transactional migrations under an advisory lock; previews skip automatic migration.

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, neonConfig } from '@neondatabase/serverless'

const MIGRATIONS_DIR = path.dirname(fileURLToPath(import.meta.url))
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/
// Arbitrary constant; only has to be the same for every runner instance.
const LOCK_KEY = 734_590_112
// 001 predates this runner and was applied by hand. When its table already
// exists and nothing has been recorded yet, mark it applied instead of
// re-running it.
const BASELINE = { file: '001_published_maps.sql', table: 'published_maps' }

const statusOnly = process.argv.includes('--status')
const vercelEnv = process.env.VERCEL_ENV

if (vercelEnv && vercelEnv !== 'production') {
  console.log(`[migrate] skipping on VERCEL_ENV=${vercelEnv}; migrations only run for production deploys`)
  process.exit(0)
}

const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL
if (!connectionString) {
  console.error('[migrate] POSTGRES_URL / DATABASE_URL is not set')
  process.exit(1)
}

// Node 22+ ships a global WebSocket, which the Neon driver needs for a real
// (transactional) connection rather than the one-shot HTTP mode.
if (typeof WebSocket !== 'undefined') neonConfig.webSocketConstructor = WebSocket

const files = (await readdir(MIGRATIONS_DIR)).filter((name) => MIGRATION_FILE.test(name)).sort()

const client = new Client({ connectionString })
await client.connect()
try {
  if (statusOnly) {
    await printStatus()
  } else {
    await applyPending()
  }
} catch (error) {
  console.error('[migrate] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await client.end()
}

async function tableExists(name) {
  const { rows } = await client.query('SELECT to_regclass($1) AS oid', [`public.${name}`])
  return rows[0]?.oid !== null
}

async function appliedNames() {
  if (!(await tableExists('schema_migrations'))) return new Set()
  const { rows } = await client.query('SELECT name FROM schema_migrations')
  return new Set(rows.map((row) => row.name))
}

async function printStatus() {
  const applied = await appliedNames()
  const baselined = !applied.size && (await tableExists(BASELINE.table))
  for (const file of files) {
    const state = applied.has(file) ? 'applied' : baselined && file === BASELINE.file ? 'baseline' : 'pending'
    console.log(`${state.padEnd(9)} ${file}`)
  }
}

async function applyPending() {
  await client.query('BEGIN')
  try {
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK_KEY])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)

    const applied = await appliedNames()
    if (!applied.size && (await tableExists(BASELINE.table))) {
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [BASELINE.file])
      applied.add(BASELINE.file)
      console.log(`[migrate] recorded ${BASELINE.file} as already applied`)
    }

    let count = 0
    for (const file of files) {
      if (applied.has(file)) continue
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8')
      // No parameters, so the simple query protocol runs every statement in
      // the file.
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file])
      console.log(`[migrate] applied ${file}`)
      count++
    }

    await client.query('COMMIT')
    console.log(count ? `[migrate] ${count} migration(s) applied` : '[migrate] up to date')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
}
