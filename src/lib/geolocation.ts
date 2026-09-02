export interface LatLng {
  latitude: number
  longitude: number
}

/** Asks the browser for the user's position; silently does nothing when unavailable or denied. */
export function locateUser(onFound: (position: LatLng) => void): void {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => onFound({ latitude: coords.latitude, longitude: coords.longitude }),
    () => {},
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 300_000 },
  )
}
