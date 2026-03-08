![map](/assets/map.png?raw=true "map")
*An interactive map for your Strava activity data*

# strava—x

strava—x visualizes your Strava activity data on an interactive map. There's no OAuth flow or direct Strava API connection, you export your data archive from Strava, then drag and drop the `.gpx`, `.fit`, and `.fit.gz` files into your browser.

From there you can:

- Filter activities by type and date range
- View stats like total distance, elevation, and activity counts
- Export and share your map as a nice polaroid-like preview

All processing happens entirely in the browser. No data is uploaded or leaves your machine. Activities are persisted locally via IndexedDB so they survive page reloads.

## Setup

Add your [Mapbox access token](https://account.mapbox.com/access-tokens/) to `.env.local` and run `npm run dev`.
