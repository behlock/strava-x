'use client'

import { useCallback, useRef, useState } from 'react'
import { validateSlug } from '@/lib/slug'
import type { ShareState, VerifiedSnapshot } from '@/lib/share-snapshot'
import { clearPublishedOwner, getPublishedOwnerEpoch, rememberPublishedOwner } from '@/lib/published-owner'

const PUBLISH_ERRORS = [
  'invalid_slug',
  'slug_reserved',
  'slug_taken',
  'strava_auth_failed',
  'payload_too_large',
  'network',
  'server',
  'busy',
  'publication_changed',
  'cancelled',
  'sync_required',
  'sharing_not_configured',
  'invalid_snapshot',
] as const
export type PublishError = (typeof PUBLISH_ERRORS)[number]
export interface CheckResult {
  available: boolean
  reason?: string
  ownedByMe?: boolean
}
export interface PublishResult extends ShareState {
  slug: string
  url: string
  activityCount: number
  sizeBytes: number
}
const errorCode = (value: unknown): PublishError =>
  typeof value === 'string' && (PUBLISH_ERRORS as readonly string[]).includes(value)
    ? (value as PublishError)
    : 'server'

export function usePublish({ getAccessToken }: { getAccessToken: () => Promise<string | null> }) {
  // Ownership and proofs are session-only. Never trust a globally cached address.
  const [currentSlug, setCurrentSlug] = useState<string | null>(null)
  const [isPublishing, setIsPublishing] = useState(false)
  const state = useRef<ShareState | null>(null)
  const snapshot = useRef<VerifiedSnapshot | null>(null)
  const generation = useRef(0)
  const writing = useRef(false)
  const acceptState = useCallback((next: ShareState, ownerEpoch: number) => {
    state.current = next
    setCurrentSlug(next.slug)
    rememberPublishedOwner(next, ownerEpoch)
  }, [])
  const refreshCurrentSlug = useCallback(
    async (signal?: AbortSignal) => {
      const version = generation.current
      const ownerEpoch = getPublishedOwnerEpoch()
      const token = await getAccessToken()
      if (!token || signal?.aborted) return
      const res = await fetch('/api/publish/me', {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token }),
        cache: 'no-store',
      })
      if (!res.ok) return
      const next = (await res.json()) as ShareState
      if (signal?.aborted || generation.current !== version) return
      if (state.current?.athleteId === next.athleteId && BigInt(next.revision) < BigInt(state.current.revision)) return
      if (snapshot.current?.athleteId !== next.athleteId || snapshot.current?.revision !== next.revision)
        snapshot.current = null
      acceptState(next, ownerEpoch)
      return next
    },
    [getAccessToken, acceptState],
  )

  const mutate = useCallback(
    async (
      action: 'create' | 'update' | 'rename' | 'stop',
      slug?: string,
      signal?: AbortSignal,
    ): Promise<PublishResult | { error: PublishError }> => {
      if (writing.current) return { error: 'busy' }
      const before = state.current
      if (!before) return { error: 'sync_required' }
      let verified = snapshot.current
      if (signal?.aborted) return { error: 'cancelled' }
      writing.current = true
      const version = ++generation.current
      const ownerEpoch = getPublishedOwnerEpoch()
      setIsPublishing(true)
      try {
        const accessToken = await getAccessToken()
        if (!accessToken) return { error: 'strava_auth_failed' }
        if (signal?.aborted || version !== generation.current) return { error: 'cancelled' }
        if (
          (action === 'create' || action === 'update') &&
          (!verified ||
            verified.expiresAt <= Date.now() ||
            verified.athleteId !== before.athleteId ||
            verified.revision !== before.revision)
        ) {
          const response = await fetch('/api/activities/sync', {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken }),
          })
          if (signal?.aborted || version !== generation.current) return { error: 'cancelled' }
          if (!response.ok) return { error: 'sync_required' }
          const result = (await response.json()) as { snapshot: VerifiedSnapshot | null; share: ShareState | null }
          if (signal?.aborted || version !== generation.current) return { error: 'cancelled' }
          if (!result.share || !result.snapshot) return { error: 'sync_required' }
          if (
            result.share.athleteId !== before.athleteId ||
            result.share.revision !== before.revision ||
            result.snapshot.athleteId !== before.athleteId ||
            result.snapshot.revision !== before.revision
          ) {
            await refreshCurrentSlug(signal).catch(() => {})
            return { error: 'publication_changed' }
          }
          verified = result.snapshot
          snapshot.current = verified
        }
        const content =
          action === 'create' || action === 'update'
            ? {
                proof: verified!.proof,
                activities:
                  action === 'update' && before.fingerprint === verified!.fingerprint
                    ? undefined
                    : verified!.activities,
              }
            : {}
        const json = JSON.stringify({ accessToken, revision: before.revision, action, slug, ...content })
        const gzip = typeof CompressionStream !== 'undefined'
        const body = gzip
          ? await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob()
          : json
        if (signal?.aborted || version !== generation.current) return { error: 'cancelled' }
        const res = await fetch('/api/publish', {
          method: action === 'stop' ? 'DELETE' : 'POST',
          signal,
          headers: { 'Content-Type': gzip ? 'application/gzip' : 'application/json' },
          body,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          if (version === generation.current && ['sync_required', 'invalid_snapshot'].includes(data?.error))
            snapshot.current = null
          if (res.status === 409 && version === generation.current) {
            snapshot.current = null
            await refreshCurrentSlug(signal).catch(() => {})
          }
          return { error: errorCode(data?.error) }
        }
        const next = (await res.json()) as PublishResult
        if (!signal?.aborted && version === generation.current) {
          acceptState(next, ownerEpoch)
          // A proof is bound to exactly one revision, never rebase it silently.
          if (next.revision !== before.revision) snapshot.current = null
        }
        return next
      } catch {
        return { error: signal?.aborted ? 'cancelled' : 'network' }
      } finally {
        writing.current = false
        setIsPublishing(false)
      }
    },
    [getAccessToken, acceptState, refreshCurrentSlug],
  )

  const publish = useCallback(
    async (rawSlug: string) => {
      const checked = validateSlug(rawSlug)
      if (!checked.ok)
        return { error: (checked.error === 'reserved' ? 'slug_reserved' : 'invalid_slug') as PublishError }
      return mutate(state.current?.slug ? 'rename' : 'create', checked.slug)
    },
    [mutate],
  )
  const unpublish = useCallback(async (): Promise<{ ok: true } | { ok: false; error: PublishError }> => {
    const result = await mutate('stop')
    return 'error' in result ? { ok: false, error: result.error } : { ok: true }
  }, [mutate])
  const checkSlug = useCallback(
    async (slug: string): Promise<CheckResult> => {
      try {
        const accessToken = await getAccessToken()
        const res = await fetch('/api/publish/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, accessToken }),
        })
        return res.ok ? await res.json() : { available: false, reason: 'server' }
      } catch {
        return { available: false, reason: 'network' }
      }
    },
    [getAccessToken],
  )
  const forgetCurrentSlug = useCallback(() => {
    generation.current++
    snapshot.current = null
    state.current = null
    setCurrentSlug(null)
    clearPublishedOwner()
  }, [])
  const beginSync = useCallback(() => {
    snapshot.current = null
    return generation.current
  }, [])
  const updatePublishedMap = useCallback(
    async (verified: VerifiedSnapshot, next: ShareState, version: number, signal: AbortSignal) => {
      if (signal.aborted || generation.current !== version || writing.current) return
      if (state.current?.athleteId === next.athleteId && BigInt(state.current.revision) > BigInt(next.revision)) return
      acceptState(next, getPublishedOwnerEpoch())
      snapshot.current = verified
      if (!next.slug) return
      return mutate('update', undefined, signal)
    },
    [acceptState, mutate],
  )
  const estimatePayloadSize = useCallback(
    () => (snapshot.current ? new Blob([JSON.stringify(snapshot.current.activities)]).size : 0),
    [],
  )
  return {
    currentSlug,
    isPublishing,
    publish,
    unpublish,
    checkSlug,
    forgetCurrentSlug,
    refreshCurrentSlug,
    beginSync,
    updatePublishedMap,
    estimatePayloadSize,
  }
}
