export interface LatLng {
  latitude: number
  longitude: number
}

export async function locateUser(): Promise<LatLng> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error('open this page over HTTPS to use your location')
  }
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('location is not supported by this browser')
  }

  const request = (enableHighAccuracy: boolean) =>
    new Promise<LatLng>((resolve, reject) => {
      const timeout = enableHighAccuracy ? 15_000 : 10_000
      // The browser's timeout does not include waiting for permission.
      const timer = setTimeout(() => reject({ code: 3 }), timeout + 1000)
      const fail = (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      }
      try {
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => {
            clearTimeout(timer)
            resolve({ latitude: coords.latitude, longitude: coords.longitude })
          },
          fail,
          { enableHighAccuracy, timeout, maximumAge: 0 },
        )
      } catch (error) {
        fail(error)
      }
    })

  try {
    try {
      return await request(true)
    } catch (error) {
      if ((error as GeolocationPositionError).code === 1) throw error
      // A network-based fix can still work when GPS is unavailable indoors.
      return await request(false)
    }
  } catch (error) {
    const code = (error as GeolocationPositionError).code
    throw new Error(
      code === 1
        ? 'allow location access in your browser settings, then try again'
        : code === 3
          ? 'finding your location timed out. tap to try again'
          : 'location unavailable. check your device’s location settings and try again',
    )
  }
}
