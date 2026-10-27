import type { Activity, ActivityFeatureCollection } from '@/models/activity'

/** A cancellable worker keeps large libraries off the UI thread. */
export function runRouteComparison(
  publicActivities: Activity[],
  ownActivities: Activity[],
  signal: AbortSignal,
): Promise<ActivityFeatureCollection> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./common-routes.worker.ts', import.meta.url), { type: 'module' })
    const cleanup = () => {
      worker.terminate()
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = (event: MessageEvent<{ data?: ActivityFeatureCollection; error?: string }>) => {
      cleanup()
      if (event.data.data) resolve(event.data.data)
      else reject(new Error(event.data.error ?? 'comparison_failed'))
    }
    worker.onerror = () => {
      cleanup()
      reject(new Error('comparison_failed'))
    }
    try {
      worker.postMessage({ publicActivities, ownActivities })
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}
