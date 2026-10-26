// Read-only by default. --scan-legacy queues every legacy file (run only after
// disabling old deployments). --apply deletes queued files and acknowledges
// only successful deletions. No credentials or URLs are printed.
import { neon } from '@neondatabase/serverless'
import { del, list } from '@vercel/blob'

const sql = neon(process.env.POSTGRES_URL || process.env.DATABASE_URL || '')
const apply = process.argv.includes('--apply')
if (process.argv.includes('--scan-legacy')) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Legacy store token is required to scan')
  let cursor
  do {
    const page = await list({ prefix: 'published/', cursor, token: process.env.BLOB_READ_WRITE_TOKEN })
    for (const blob of page.blobs)
      await sql`INSERT INTO sharing_blob_cleanup (pathname,store) VALUES (${blob.pathname},'legacy') ON CONFLICT DO NOTHING`
    cursor = page.hasMore ? page.cursor : undefined
  } while (cursor)
}
const rows = await sql`SELECT pathname,store FROM sharing_blob_cleanup
  WHERE store='legacy' OR NOT EXISTS (SELECT 1 FROM map_shares WHERE active AND snapshot_path=pathname)
  ORDER BY queued_at LIMIT 1000`
console.log(`[sharing] ${rows.length} queued files in this batch${apply ? '' : ' (read-only; pass --apply to delete)'}`)
let failed = 0,
  deleted = 0
if (apply)
  for (const row of rows) {
    try {
      const token =
        row.store === 'legacy' ? process.env.BLOB_READ_WRITE_TOKEN : process.env.PRIVATE_BLOB_READ_WRITE_TOKEN
      if (!token) throw new Error('Missing storage token')
      await del(row.pathname, { token })
      await sql`DELETE FROM sharing_blob_cleanup WHERE pathname=${row.pathname}`
      deleted++
    } catch {
      failed++
    }
  }
const remaining = await sql`SELECT count(*)::integer AS count FROM sharing_blob_cleanup`
console.log(`[sharing] deleted=${deleted}, failed=${failed}, remaining=${remaining[0].count}`)
if (failed) process.exitCode = 1
