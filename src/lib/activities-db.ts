'use client'

import { Activity } from '@/models/activity'

const DB_NAME = 'strava-x'
const DB_VERSION = 1
const STORE_NAME = 'activities'

interface SerializedActivity extends Omit<Activity, 'date'> {
  date?: string // ISO string
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function saveActivities(activities: Activity[]): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  // Clear existing and add new
  store.clear()

  for (const activity of activities) {
    const serialized: SerializedActivity = {
      ...activity,
      date: activity.date?.toISOString(),
    }
    store.add(serialized)
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}

export async function loadActivities(): Promise<Activity[]> {
  try {
    const db = await openDB()
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        db.close()
        const serialized: SerializedActivity[] = request.result
        const activities = serialized.map((a) => ({
          ...a,
          date: a.date ? new Date(a.date) : undefined,
        }))
        // Sort by date
        activities.sort((a, b) => {
          if (a.date && b.date) return a.date.getTime() - b.date.getTime()
          return 0
        })
        resolve(activities)
      }
      request.onerror = () => {
        db.close()
        reject(request.error)
      }
    })
  } catch {
    return []
  }
}

export async function clearActivities(): Promise<void> {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  tx.objectStore(STORE_NAME).clear()

  return new Promise((resolve) => {
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      resolve() // Resolve anyway, clearing is best-effort
    }
  })
}
