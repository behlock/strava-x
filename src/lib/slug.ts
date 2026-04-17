// 2–30 chars, must start and end with alphanumeric, dashes allowed in the middle.
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,28}[a-z0-9]$/

// Blocks slugs that would shadow existing top-level routes or look wrong in a URL bar.
// Keep in sync with any new top-level App Router entries added under src/app.
export const RESERVED_SLUGS = new Set([
  'api',
  'auth',
  'publish',
  'admin',
  'about',
  'privacy',
  'terms',
  'login',
  'logout',
  'signin',
  'signout',
  'signup',
  'settings',
  'account',
  'home',
  'index',
  '_next',
  'favicon',
  'robots',
  'sitemap',
  'health',
  'status',
  'public',
  'assets',
  'strava',
  'oauth',
  'new',
  'edit',
  'delete',
  'null',
  'undefined',
  'www',
])

export type SlugValidationError = 'invalid_format' | 'reserved'

export function normalizeSlug(input: string): string {
  return input.trim().toLowerCase()
}

export function validateSlug(input: string): { ok: true; slug: string } | { ok: false; error: SlugValidationError } {
  const slug = normalizeSlug(input)
  if (!SLUG_REGEX.test(slug)) return { ok: false, error: 'invalid_format' }
  if (RESERVED_SLUGS.has(slug)) return { ok: false, error: 'reserved' }
  return { ok: true, slug }
}
