'use client'

import { useCallback, useRef, useState } from 'react'

import type { Activity } from '@/models/activity'
import { serializeActivities } from '@/lib/activities-serialize'
import { validateSlug } from '@/lib/slug'
import { useLocalStorageItem, writeLocalStorage } from '@/hooks/use-local-storage'

const CURRENT_SLUG_KEY = 'strava-x:published-slug'

const PUBLISH_ERRORS = [
  'invalid_slug',
  'slug_reserved',
  'slug_taken',
  'strava_auth_failed',
  'payload_too_large',
  'no_activities',
  'network',
  'server',
] as const
export type PublishError = (typeof PUBLISH_ERRORS)[number]

function isPublishError(value: unknown): value is PublishError {
  return typeof value === 'string' && (PUBLISH_ERRORS as readonly string[]).includes(value)
}

export interface PublishResult {
  slug: string
  url: string
  blobUrl: string
  activityCount: number
  sizeBytes: number
}

export interface CheckResult {
  available: boolean
  reason?: string
  ownedByMe?: boolean
}

interface UsePublishOptions {
  getAccessToken: () => Promise<string | null>
  activities: Activity[]
}

// Activity payloads can exceed Vercel's ~4.5 MB serverless request body limit
// uncompressed. CompressionStream is available in all modern browsers; if it
// isn't, we fall back to plain JSON (and may 413 — but on supported browsers
// gzip cuts the payload by ~5x for this data shape).
async function gzipString(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return new Response(stream).blob()
}

function slugError(error: 'invalid_format' | 'reserved'): PublishError {
  return error === 'reserved' ? 'slug_reserved' : 'invalid_slug'
}

export function usePublish({ getAccessToken, activities }: UsePublishOptions) {
  // Mirrors the server's record for this athlete; rehydrated by
  // `refreshCurrentSlug` and cleared by `forgetCurrentSlug`.
  const currentSlug = useLocalStorageItem(CURRENT_SLUG_KEY)
  const [isPublishing, setIsPublishing] = useState(false)

  // Serializing the whole library is the expensive part of publishing, so
  // the JSON is computed lazily and kept for as long as `activities` is the
  // same array — the size estimate taken when the dialog opens and the
  // upload that follows then share one string.
  const serializedRef = useRef<{ activities: Activity[]; json: string } | null>(null)
  const serializedActivitiesJson = useCallback((): string => {
    const cached = serializedRef.current
    if (cached && cached.activities === activities) return cached.json
    const json = JSON.stringify(serializeActivities(activities))
    serializedRef.current = { activities, json }
    return json
  }, [activities])

  /** Rough size of the publish payload, so the dialog can warn before upload. */
  const estimatePayloadSize = useCallback(
    (): number => (activities.length === 0 ? 0 : new Blob([serializedActivitiesJson()]).size),
    [activities, serializedActivitiesJson],
  )

  const checkSlug = useCallback(
    async (rawSlug: string): Promise<CheckResult> => {
      const local = validateSlug(rawSlug)
      if (!local.ok) return { available: false, reason: slugError(local.error) }

      const token = await getAccessToken().catch(() => null)
      try {
        const res = await fetch('/api/publish/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: local.slug, accessToken: token ?? undefined }),
        })
        if (!res.ok) return { available: false, reason: 'server' }
        return (await res.json()) as CheckResult
      } catch {
        return { available: false, reason: 'network' }
      }
    },
    [getAccessToken],
  )

  const publish = useCallback(
    async (rawSlug: string): Promise<PublishResult | { error: PublishError }> => {
      const local = validateSlug(rawSlug)
      if (!local.ok) return { error: slugError(local.error) }
      if (activities.length === 0) return { error: 'no_activities' }

      const token = await getAccessToken()
      if (!token) return { error: 'strava_auth_failed' }

      setIsPublishing(true)
      try {
        // Splice the pre-serialized activities in rather than stringifying
        // the whole body object, which would serialize the library again.
        const json = `{"slug":${JSON.stringify(local.slug)},"accessToken":${JSON.stringify(token)},"activities":${serializedActivitiesJson()}}`
        const supportsGzip = typeof CompressionStream !== 'undefined'
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': supportsGzip ? 'application/gzip' : 'application/json' },
          body: supportsGzip ? await gzipString(json) : json,
        })

        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const code = (body as { error?: unknown } | null)?.error
          return { error: isPublishError(code) && code !== 'network' && code !== 'server' ? code : 'server' }
        }

        const result = (await res.json()) as PublishResult
        writeLocalStorage(CURRENT_SLUG_KEY, result.slug)
        return result
      } catch {
        return { error: 'network' }
      } finally {
        setIsPublishing(false)
      }
    },
    [getAccessToken, activities, serializedActivitiesJson],
  )

  const unpublish = useCallback(async (): Promise<{ ok: true } | { ok: false; error: PublishError }> => {
    const token = await getAccessToken()
    if (!token) return { ok: false, error: 'strava_auth_failed' }

    setIsPublishing(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      })
      if (!res.ok) return { ok: false, error: 'server' }
      writeLocalStorage(CURRENT_SLUG_KEY, null)
      return { ok: true }
    } catch {
      return { ok: false, error: 'network' }
    } finally {
      setIsPublishing(false)
    }
  }, [getAccessToken])

  // Call on Strava connect to rehydrate `currentSlug` from the server in case
  // the user has a publish that isn't in this browser's localStorage (e.g.
  // signed in on a new device, or cleared storage).
  const refreshCurrentSlug = useCallback(async () => {
    const token = await getAccessToken().catch(() => null)
    if (!token) return
    try {
      const res = await fetch('/api/publish/me', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      })
      if (!res.ok) return
      const body = (await res.json()) as { slug: string | null }
      writeLocalStorage(CURRENT_SLUG_KEY, body.slug)
    } catch {
      // leave current state as-is
    }
  }, [getAccessToken])

  // Called after Strava disconnect so the UI doesn't keep claiming the user
  // owns a slug we can no longer verify.
  const forgetCurrentSlug = useCallback(() => writeLocalStorage(CURRENT_SLUG_KEY, null), [])

  return {
    currentSlug,
    isPublishing,
    estimatePayloadSize,
    checkSlug,
    publish,
    unpublish,
    refreshCurrentSlug,
    forgetCurrentSlug,
  }
}
