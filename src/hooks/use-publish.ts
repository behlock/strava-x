'use client'

import { useCallback, useEffect, useState } from 'react'

import { Activity } from '@/models/activity'
import { serializeActivities } from '@/lib/activities-serialize'
import { validateSlug } from '@/lib/slug'

const CURRENT_SLUG_KEY = 'strava-x:published-slug'

export type PublishError =
  | 'invalid_slug'
  | 'slug_reserved'
  | 'slug_taken'
  | 'strava_auth_failed'
  | 'payload_too_large'
  | 'no_activities'
  | 'network'
  | 'server'

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
  getActivities: () => Activity[]
}

function readCurrentSlug(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(CURRENT_SLUG_KEY)
  } catch {
    return null
  }
}

function writeCurrentSlug(slug: string | null) {
  if (typeof window === 'undefined') return
  try {
    if (slug) window.localStorage.setItem(CURRENT_SLUG_KEY, slug)
    else window.localStorage.removeItem(CURRENT_SLUG_KEY)
  } catch {
    // no-op
  }
}

export function usePublish({ getAccessToken, getActivities }: UsePublishOptions) {
  const [currentSlug, setCurrentSlug] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)

  useEffect(() => {
    setCurrentSlug(readCurrentSlug())
  }, [])

  const checkSlug = useCallback(
    async (rawSlug: string): Promise<CheckResult> => {
      const local = validateSlug(rawSlug)
      if (!local.ok) {
        return { available: false, reason: local.error === 'reserved' ? 'slug_reserved' : 'invalid_slug' }
      }

      const token = await getAccessToken().catch(() => null)
      const res = await fetch('/api/publish/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: local.slug, accessToken: token ?? undefined }),
      })
      if (!res.ok) return { available: false, reason: 'server' }
      return (await res.json()) as CheckResult
    },
    [getAccessToken],
  )

  const publish = useCallback(
    async (rawSlug: string): Promise<PublishResult | { error: PublishError }> => {
      const local = validateSlug(rawSlug)
      if (!local.ok) {
        return { error: local.error === 'reserved' ? 'slug_reserved' : 'invalid_slug' }
      }

      const activities = getActivities()
      if (activities.length === 0) {
        return { error: 'no_activities' }
      }

      const token = await getAccessToken()
      if (!token) {
        return { error: 'strava_auth_failed' }
      }

      setIsPublishing(true)
      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: local.slug,
            accessToken: token,
            activities: serializeActivities(activities),
          }),
        })

        if (!res.ok) {
          let errorCode: PublishError = 'server'
          try {
            const body = (await res.json()) as { error?: string }
            if (
              body.error === 'invalid_slug' ||
              body.error === 'slug_reserved' ||
              body.error === 'slug_taken' ||
              body.error === 'strava_auth_failed' ||
              body.error === 'payload_too_large' ||
              body.error === 'no_activities'
            ) {
              errorCode = body.error
            }
          } catch {
            // ignore; fall through to 'server'
          }
          return { error: errorCode }
        }

        const result = (await res.json()) as PublishResult
        setCurrentSlug(result.slug)
        writeCurrentSlug(result.slug)
        return result
      } catch {
        return { error: 'network' }
      } finally {
        setIsPublishing(false)
      }
    },
    [getAccessToken, getActivities],
  )

  const unpublish = useCallback(async (): Promise<{ ok: boolean; error?: PublishError }> => {
    const token = await getAccessToken()
    if (!token) {
      return { ok: false, error: 'strava_auth_failed' }
    }
    setIsPublishing(true)
    try {
      const res = await fetch('/api/publish', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
      })
      if (!res.ok) {
        return { ok: false, error: 'server' }
      }
      setCurrentSlug(null)
      writeCurrentSlug(null)
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
      setCurrentSlug(body.slug)
      writeCurrentSlug(body.slug)
    } catch {
      // leave current state as-is
    }
  }, [getAccessToken])

  // Called from the parent after Strava disconnect clears local state so the
  // UI doesn't keep claiming the user owns a slug we can no longer verify.
  const forgetCurrentSlug = useCallback(() => {
    setCurrentSlug(null)
    writeCurrentSlug(null)
  }, [])

  return {
    currentSlug,
    isPublishing,
    checkSlug,
    publish,
    unpublish,
    refreshCurrentSlug,
    forgetCurrentSlug,
  }
}
