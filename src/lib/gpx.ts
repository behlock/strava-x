import * as fs from 'fs'
import * as xml2js from 'xml2js'

interface TrackPoint {
  latitude: number
  longitude: number
  elevation: number
}

interface Feature {
  type: string
  geometry: {
    type: string
    coordinates: number[][]
  }
}

async function parseGpxFile(fileContent: string): Promise<Feature> {
  const trackPoints: TrackPoint[] = []

  const parser = new xml2js.Parser()
  let feature: Feature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [],
    },
  }

  try {
    const parsedData = await parser.parseStringPromise(fileContent)
    const activityType = parsedData.gpx.trk[0].type[0] // Access activity type

    if (activityType !== 'running') {
      throw new Error('Only running activities are supported')
    }

    const trackSegments = parsedData.gpx.trk[0].trkseg
    trackSegments.forEach((segment: any) => {
      segment.trkpt.forEach((point: any) => {
        const latitude = parseFloat(point.$.lat)
        const longitude = parseFloat(point.$.lon)
        const elevation = parseFloat(point.ele[0])

        trackPoints.push({ latitude, longitude, elevation })
      })
    })

    feature = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: trackPoints.map((point) => [point.longitude, point.latitude]),
      },
    }
  } catch (error) {}

  return feature
}

export async function combineGpxFiles(files: File[]): Promise<Feature[]> {
  const combinedTrackFeatures: Feature[] = []

  for (const file of files) {
    if (file.name.endsWith('.gpx')) {
      const fileContent = await readFile(file)
      const trackFeature = await parseGpxFile(fileContent)
      combinedTrackFeatures.push(trackFeature)
    }
  }

  return combinedTrackFeatures
}

async function readFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      resolve(event.target?.result as string)
    }
    reader.onerror = (event) => {
      reject(event.target?.error)
    }
    reader.readAsText(file)
  })
}
