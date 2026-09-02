import type { Activity } from '@/models/activity'
import { sortActivitiesByDateDesc } from '@/lib/activities'
import { deserializeActivity, type SerializedActivity, serializeActivity } from '@/lib/activities-serialize'

const DB_NAME = 'strava-x'
const DB_VERSION = 1
const STORE_NAME = 'activities'

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
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
    const result = await run(tx.objectStore(STORE_NAME))
    await done
    return result
  } finally {
    db.close()
  }
}

// Entries written by older builds can lack an id or carry a feature without
// geometry; drop them rather than crash the map.
function isUsable(activity: Activity): boolean {
  if (!activity.id) return false
  if (activity.feature && !activity.feature.geometry?.coordinates?.length) {
    console.warn('[activities-db] Dropping activity with invalid feature:', activity.id)
    return false
  }
  return true
}

/** Upserts activities by id. */
export function saveActivities(activities: Activity[]): Promise<void> {
  return withStore('readwrite', async (store) => {
    for (const activity of activities) store.put(serializeActivity(activity))
  })
}

/** Loads every stored activity, newest first. Resolves with `[]` on any failure. */
export async function loadActivities(): Promise<Activity[]> {
  try {
    const rows = await withStore('readonly', (store) =>
      awaitRequest(store.getAll() as IDBRequest<SerializedActivity[]>),
    )
    return sortActivitiesByDateDesc(rows.map(deserializeActivity).filter(isUsable))
  } catch (error) {
    console.error('[activities-db] Failed to load activities from IndexedDB:', error)
    return []
  }
}

/** Best-effort wipe of the store. */
export async function clearActivities(): Promise<void> {
  try {
    await withStore('readwrite', async (store) => {
      store.clear()
    })
  } catch (error) {
    console.error('[activities-db] Failed to clear activities:', error)
  }
}
