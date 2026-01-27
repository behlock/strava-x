import * as xml2js from 'xml2js'
import FitParser from 'fit-file-parser'
import zlib from 'zlib'

import { Activity, Feature, TrackPoint } from '@/models/activity'
import { calculateTotalDistance, calculateElevationGain } from '@/lib/geo-utils'

let activityIdCounter = 0

function generateActivityId(): string {
  return `activity-${Date.now()}-${activityIdCounter++}`
}

// FIT epoch offset: seconds from Unix epoch (Jan 1, 1970) to FIT epoch (Dec 31, 1989)
const FIT_EPOCH_OFFSET_SECONDS = 631065600

/**
 * Parse timestamp from various formats including FIT epoch timestamps.
 * FIT files use seconds since Dec 31, 1989, not Unix epoch.
 */
const parseTimestamp = (ts: unknown): Date | undefined => {
  if (ts instanceof Date) return ts
  if (typeof ts === 'string') return new Date(ts)
  if (typeof ts === 'number') {
    // Determine format by magnitude
    if (ts > 1e12) {
      // Already Unix milliseconds (> year 2001 in ms)
      return new Date(ts)
    } else if (ts > 1e9) {
      // Unix seconds (> year 2001 in seconds)
      return new Date(ts * 1000)
    } else {
      // FIT epoch seconds - add offset then convert to ms
      return new Date((ts + FIT_EPOCH_OFFSET_SECONDS) * 1000)
    }
  }
  return undefined
}

async function parseGpxFile(fileContent: string): Promise<Activity> {
  const trackPoints: TrackPoint[] = []

  const parser = new xml2js.Parser()
  let activityType: string | null = null
  let activityDate: Date | undefined = undefined
  let feature: Feature | null = null
  let distance = 0
  let elevationGain = 0

  try {
    const parsedData = await parser.parseStringPromise(fileContent)

    if (!parsedData || !parsedData.gpx || !parsedData.gpx.trk || !parsedData.gpx.trk[0]) {
      throw new Error('Invalid GPX file format')
    }

    const trackSegments = parsedData.gpx.trk[0].trkseg
    trackSegments.forEach((segment: any) => {
      segment.trkpt.forEach((point: any) => {
        const latitude = parseFloat(point.$.lat)
        const longitude = parseFloat(point.$.lon)
        const elevation = point.ele?.[0] ? parseFloat(point.ele[0]) : 0

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

    // Calculate distance and elevation
    distance = calculateTotalDistance(feature.geometry.coordinates)
    elevationGain = calculateElevationGain(trackPoints.map((p) => p.elevation))

    activityType = parsedData.gpx.trk[0].type?.[0]?.toLowerCase() || null
    activityDate = parsedData.gpx.metadata?.[0]?.time?.[0]
      ? new Date(parsedData.gpx.metadata[0].time[0])
      : undefined
  } catch {}

  return {
    id: generateActivityId(),
    type: activityType,
    date: activityDate,
    feature: feature,
    distance,
    elevationGain,
  }
}

async function parseFitFile(fileContent: Buffer): Promise<Activity> {
  return new Promise<Activity>((resolve) => {
    try {
      const fitParser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'm',
        temperatureUnit: 'celsius',
        elapsedRecordField: true,
        mode: 'list',
      })

      const timeoutId = setTimeout(() => {
        resolve({
          id: generateActivityId(),
          type: '',
          feature: null,
          distance: 0,
          elevationGain: 0,
        })
      }, 5000)

      try {
        // Check for FIT header magic bytes
        if (fileContent.length < 14 || fileContent.toString('ascii', 8, 12) !== '.FIT') {
          clearTimeout(timeoutId)
          resolve({
            id: generateActivityId(),
            type: '',
            feature: null,
            distance: 0,
            elevationGain: 0,
          })
          return
        }

        fitParser.parse(fileContent, (error: any, data: any) => {
          clearTimeout(timeoutId)
          if (error) {
            resolve({
              id: generateActivityId(),
              type: '',
              feature: null,
              distance: 0,
              elevationGain: 0,
            })
            return
          }

          const trackPoints: TrackPoint[] = []

          // Try to get records from different possible locations
          const records = data.records || data.activity?.sessions?.[0]?.laps?.[0]?.records || []

          for (const record of records) {
            // Handle different field name variations
            const lat = record.position_lat || record.positionLat || record.lat || record.latitude
            const lon = record.position_long || record.positionLong || record.lon || record.lng || record.longitude

            if (!lat || !lon) {
              continue
            }

            const latitude = lat
            const longitude = lon

            if (isFinite(latitude) && isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
              trackPoints.push({
                latitude,
                longitude,
                elevation: record.altitude || record.elevation || record.enhanced_altitude || 0,
              })
            }
          }

          if (trackPoints.length === 0) {
            // Indoor activities (treadmill, etc.) don't have GPS data - this is expected
            resolve({
              id: generateActivityId(),
              type: '',
              feature: null,
              distance: 0,
              elevationGain: 0,
            })
            return
          }

          const feature: Feature = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: trackPoints.map((point) => [point.longitude, point.latitude]),
            },
          }

          // Calculate distance and elevation
          const distance = calculateTotalDistance(feature.geometry.coordinates)
          const elevationGain = calculateElevationGain(trackPoints.map((p) => p.elevation))

          const sportType = data?.sport || data?.sessions?.[0]?.sport || data?.activity?.sport || 'unknown'

          // Try multiple possible locations for timestamp
          const timestamp =
            data?.activity?.timestamp ||
            data?.sessions?.[0]?.start_time ||
            data?.sessions?.[0]?.timestamp ||
            data?.activity?.local_timestamp ||
            data?.file_id?.time_created ||
            undefined

          resolve({
            id: generateActivityId(),
            type: sportType.toLowerCase(),
            date: parseTimestamp(timestamp),
            feature,
            distance,
            elevationGain,
          })
        })
      } catch {
        clearTimeout(timeoutId)
        resolve({
          id: generateActivityId(),
          type: '',
          feature: null,
          distance: 0,
          elevationGain: 0,
        })
      }
    } catch {
      resolve({
        id: generateActivityId(),
        type: '',
        feature: null,
        distance: 0,
        elevationGain: 0,
      })
    }
  })
}

async function readFileAsString(file: File): Promise<string> {
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

async function readFileAsBuffer(file: File): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (event) => {
      const arrayBuffer = event.target?.result as ArrayBuffer
      resolve(Buffer.from(arrayBuffer))
    }
    reader.onerror = (event) => {
      reject(event.target?.error)
    }
    reader.readAsArrayBuffer(file)
  })
}

async function decompressGzip(buffer: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    zlib.gunzip(buffer, (err, result) => {
      if (err) {
        resolve(null)
      } else {
        resolve(result)
      }
    })
  })
}

async function extractAndParseFile(file: File): Promise<Activity> {
  const fileName = file.name.toLowerCase()

  try {
    if (fileName.endsWith('.gpx')) {
      return await parseGpxFile(await readFileAsString(file))
    } else if (fileName.endsWith('.fit.gz')) {
      const compressedContent = await readFileAsBuffer(file)
      const decompressedContent = await decompressGzip(compressedContent)
      if (!decompressedContent || decompressedContent.length === 0) {
        return {
          id: generateActivityId(),
          type: '',
          feature: null,
          distance: 0,
          elevationGain: 0,
        }
      }
      return await parseFitFile(decompressedContent)
    } else if (fileName.endsWith('.fit')) {
      const fileContent = await readFileAsBuffer(file)
      if (!fileContent || fileContent.length === 0) {
        return {
          id: generateActivityId(),
          type: '',
          feature: null,
          distance: 0,
          elevationGain: 0,
        }
      }
      return await parseFitFile(fileContent)
    }
  } catch {}

  return {
    id: generateActivityId(),
    type: '',
    feature: null,
    distance: 0,
    elevationGain: 0,
  }
}

export type ProgressCallback = (processed: number, total: number) => void

export async function combineFiles(files: File[], onProgress?: ProgressCallback): Promise<Activity[]> {
  const activities: Activity[] = []
  let processed = 0

  for (const file of files) {
    processed++
    const activity = await extractAndParseFile(file)
    if (activity.feature && activity.type) {
      activities.push(activity)
    }
    onProgress?.(processed, files.length)
  }

  return activities.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.getTime() - b.date.getTime()
    } else {
      return 0
    }
  })
}
