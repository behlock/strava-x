![map](/assets/map.gif?raw=true "map")

*An interactive map for your Strava activity data*

# strava—x

strava—x visualizes your Strava activity data on an interactive map. There's no OAuth flow or direct Strava API connection, you export your data archive from Strava, then drag and drop the `.gpx`, `.fit`, and `.fit.gz` files into your browser.

All processing happens entirely in the browser. No data is uploaded or leaves your machine. Activities are persisted
locally via IndexedDB so they survive page reloads.

From there you can:

a) Filter activities by type and date range
b) View stats like total distance, elevation, and activity counts
c) Export and share your map as a nice polaroid-like preview
