# strava-x

Explore and share your Strava activity map

[Live app](https://strava-x.com)

## Development

```sh
npm ci
cp .env.local.example .env.local
npm run dev
```

Register `localhost` as the Strava callback domain. The callback path is `/api/auth/strava/callback`
