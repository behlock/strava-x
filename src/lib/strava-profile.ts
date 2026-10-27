import { suggestMapAddress } from './slug'

export interface StravaProfile {
  name: string | null
  photoUrl: string | null
  suggestedAddress: string
}

export async function fetchStravaProfile(accessToken: string, signal: AbortSignal): Promise<StravaProfile | null> {
  const response = await fetch('https://www.strava.com/api/v3/athlete', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal,
  })
  if (!response.ok) return null

  const athlete: unknown = await response.json()
  if (!athlete || typeof athlete !== 'object') return null

  const details = athlete as Record<string, unknown>
  const name = [details.firstname, details.lastname].filter((value) => typeof value === 'string').join(' ')
  const suggestedAddress = suggestMapAddress(name)
  let photoUrl: string | null = null
  for (const key of ['profile', 'profile_medium'] as const) {
    const value = (athlete as Record<string, unknown>)[key]
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:') {
        photoUrl = url.href
        break
      }
    } catch {
      // Strava can return a placeholder rather than an absolute photo URL.
    }
  }
  return {
    name: typeof details.firstname === 'string' ? details.firstname.trim() || null : null,
    photoUrl,
    suggestedAddress,
  }
}
