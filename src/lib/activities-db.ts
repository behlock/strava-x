import type { Activity } from '@/models/activity'
import { sortActivitiesByDateDesc } from '@/lib/activities'
import { deserializeActivity, type SerializedActivity, serializeActivity } from '@/lib/activities-serialize'
import type { ActivitySyncStamp } from '@/lib/activity-sync'

export interface ActivityLibrary {
  activities: Activity[]
  sync: ActivitySyncStamp | null
}

const DB_NAME = 'strava-x'
const DB_VERSION = 2
const STORE_NAME = 'libraries'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (db.objectStoreNames.contains('activities')) db.deleteObjectStore('activities')
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

function awaitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

function awaitRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE_NAME, mode)
    const done = awaitTransaction(tx)
    try {
      const [result] = await Promise.all([run(tx.objectStore(STORE_NAME)), done])
      return result
    } catch (error) {
      try {
        tx.abort()
      } catch {
        /* Already aborted or complete. */
      }
      await done.catch(() => {})
      throw error
    }
  } finally {
    db.close()
  }
}

/** Replace one account's entire library atomically, including a successful empty sync. */
export function replaceActivities(
  athleteId: number,
  activities: Activity[],
  sync: ActivitySyncStamp | null = null,
): Promise<void> {
  return withStore('readwrite', async (store) => {
    store.put({ id: String(athleteId), activities: activities.map(serializeActivity), sync })
  })
}

/** A verified account id is required; unscoped legacy rows are never restored. */
export async function loadActivities(athleteId: number): Promise<ActivityLibrary | null> {
  try {
    const row = (await withStore('readonly', (store) => awaitRequest(store.get(String(athleteId))))) as
      { activities: SerializedActivity[]; sync?: ActivitySyncStamp | null } | undefined
    return row
      ? { activities: sortActivitiesByDateDesc(row.activities.map(deserializeActivity)), sync: row.sync ?? null }
      : null
  } catch {
    return null
  }
}

export async function clearActivities(): Promise<void> {
  await withStore('readwrite', async (store) => {
    store.clear()
  }).catch(() => {})
}
