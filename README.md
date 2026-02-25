# strava—x


![map](/assets/map.png?raw=true "map")

strava—x is visualizes your Strava activity data on an interactive map. There's no OAuth flow or direct Strava API connection , you export your data archive from Strava, then drag and drop the `.gpx` and `.fit` files into your browser.

From there you can:

- Filter activities by type and date range
- View stats like total distance, elevation, and activity counts
- Export and share your map as a nice polaroid like preview

All processing happens entirely in the browser. No data is uploaded or leaves your machine. Activities are persisted locally via IndexedDB so they survive page reloads.
