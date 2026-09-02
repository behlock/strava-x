// Cookie names shared by the auth routes (server) and `useStravaAuth` (client).

// The long-lived Strava refresh_token. httpOnly so JS (including any XSS)
// cannot read it; the access_token can be reminted as long as this cookie
// is present.
export const STRAVA_REFRESH_COOKIE = 'strava_rt'

// Non-httpOnly flag the client uses to know "a session exists". Carries no
// secret — the value is always '1'.
export const STRAVA_CONNECTED_COOKIE = 'strava_connected'

// httpOnly cookie that holds the OAuth `state` value for the duration of the
// authorize round-trip. Compared server-side in the callback to defeat CSRF.
export const STRAVA_OAUTH_STATE_COOKIE = 'strava_oauth_state'

// Strava refresh tokens don't carry an explicit expiry — pin a year.
export const SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 365
