import * as xml2js from 'xml2js'
import FitParser from 'fit-file-parser'
import zlib from 'zlib'

import { Activity, Feature, TrackPoint } from '@/models/activity'

async function parseGpxFile(fileContent: string): Promise<Activity> {
  const trackPoints: TrackPoint[] = []

  const parser = new xml2js.Parser()
  let activityType: string | null = null
  let activityDate: Date | undefined = undefined
  let feature: Feature | null = null

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

    activityType = parsedData.gpx.trk[0].type[0].toLowerCase()
    activityDate = new Date(parsedData.gpx.metadata[0].time[0])
  } catch (error) {}

  return { type: activityType, date: activityDate, feature: feature }
}

async function parseFitFile(fileContent: Buffer): Promise<Activity> {
  return new Promise<Activity>((resolve, reject) => {
    const fitParser = new FitParser({
      force: true,
      speedUnit: 'km/h',
      lengthUnit: 'm',
      temperatureUnit: 'celsius',
      elapsedRecordField: true,
      mode: 'list',
    })

    fitParser.parse(fileContent, (error: any, data: any) => {
      if (error) {
        reject(error)
        return
      }

      const trackPoints: TrackPoint[] = []

      for (const record of data.records) {
        const latitude = record.position_lat
        const longitude = record.position_long
        const elevation = record.altitude

        if (latitude !== undefined && longitude !== undefined) {
          // Check if elevation is defined before adding a track point
          if (elevation !== undefined) {
            trackPoints.push({ latitude, longitude, elevation })
          } else {
            trackPoints.push({ latitude, longitude, elevation: 0 })
          }
        }
      }

      const feature: Feature = {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: trackPoints.map((point) => [point.longitude, point.latitude]),
        },
      }

      const activityType = data?.sport?.toLowerCase()
      const activityDate = data?.activity?.timestamp

      resolve({ type: activityType, date: activityDate, feature: feature })
    })
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

async function extractAndParseFile(file: File): Promise<Activity> {
  const fileExtension = file.name.split('.').pop()?.toLowerCase()

  if (fileExtension === 'gpx') {
    const fileContent = await readFileAsString(file)
    return parseGpxFile(fileContent)
  } else if (fileExtension === 'gz') {
    const compressedContent = await readFileAsBuffer(file)
    const fileContent = await decompressGzip(compressedContent)
    return extractAndParseFileFromBuffer(fileContent)
  } else {
    return { type: '', feature: null }
  }
}

async function extractAndParseFileFromBuffer(buffer: Buffer): Promise<Activity> {
  const fileSignature = buffer.slice(0, 2).toString('hex')
  if (fileSignature === '1f8b') {
    // Check if the buffer appears to be gzip compressed
    const decompressedBuffer = await decompressGzip(buffer)
    return extractAndParseFileFromBuffer(decompressedBuffer)
  } else {
    return parseFitFile(buffer)
  }
}

async function decompressGzip(buffer: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    zlib.gunzip(buffer, (err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

export async function combineFiles(files: File[]): Promise<Activity[]> {
  const activities: Activity[] = []

  for (const file of files) {
    const activity = await extractAndParseFile(file)
    if (activity.feature && activity.type) {
      activities.push(activity)
    }
  }

  return activities.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.getTime() - b.date.getTime()
    } else {
      return 0
    }
  })
}
