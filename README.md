# strava-x

Visualise your Strava activities on an interactive map

## Setup

```bash
npm install
cp .env.local.example .env.local
```

Fill in the values in `.env.local`:

| Variable                             | Required | Description                                                      |
| ------------------------------------ | -------- | ---------------------------------------------------------------- |
| `NEXT_PUBLIC_STRAVA_CLIENT_ID`       | Yes      | Strava app client ID                                             |
| `STRAVA_CLIENT_SECRET`               | Yes      | Strava app client secret (server-only)                           |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`    | Yes      | [Mapbox access token](https://account.mapbox.com/access-tokens/) |
| `NEXT_PUBLIC_MAPBOX_MAP_STYLE_DARK`  | No       | Custom Mapbox dark style URL                                     |
| `NEXT_PUBLIC_MAPBOX_MAP_STYLE_LIGHT` | No       | Custom Mapbox light style URL                                    |

### Strava OAuth

1. Create an app at [strava.com/settings/api](https://www.strava.com/settings/api)
2. Set the redirect URI to `http://localhost:3000/api/auth/strava/callback`
3. Copy the Client ID and Client Secret into `.env.local`

## Development

```bash
npm run dev       # Start dev server
```
