# strava-x

Visualise your Strava activities on an interactive map, and optionally publish it at a public URL.

Check out my map at https://www.strava-x.com/walid

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in the values in `.env.local`:

| Variable                             | Required    | Description                                                              |
| ------------------------------------ | ----------- | ------------------------------------------------------------------------ |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID`       | Yes         | Strava app client ID                                                     |
| `STRAVA_CLIENT_SECRET`               | Yes         | Strava app client secret (server-only)                                   |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`    | Yes         | [Mapbox access token](https://account.mapbox.com/access-tokens/)         |
| `NEXT_PUBLIC_MAPBOX_MAP_STYLE_DARK`  | Yes         | Mapbox dark style URL                                                    |
| `NEXT_PUBLIC_MAPBOX_MAP_STYLE_LIGHT` | Yes         | Mapbox light style URL                                                   |
| `POSTGRES_URL`                       | For publish | Neon Postgres connection string (`DATABASE_URL` also works)              |
| `BLOB_READ_WRITE_TOKEN`              | For publish | Vercel Blob token; published maps are stored as JSON blobs               |
| `NEXT_PUBLIC_APP_URL`                | No          | Canonical origin for OAuth redirects; derived from Vercel env when unset |
| `NEXT_PUBLIC_STATS_TRACKING_URL`     | No          | Analytics script URL, loaded with `crossOrigin="anonymous"`              |

### Strava OAuth

1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api)
2. Set the authorization callback domain to `localhost` (the redirect URI is `http://localhost:3000/api/auth/strava/callback`)
3. Copy the Client ID and Client Secret into `.env.local`

### Database

Publishing needs the `published_maps` table. Run the SQL in `db/001_published_maps.sql` against your Postgres database once.

## Development

```bash
npm run dev          # Start dev server
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run format       # Prettier (also runs on commit via lint-staged)
npm run build        # Production build
```
