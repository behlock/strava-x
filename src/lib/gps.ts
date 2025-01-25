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
        console.error('FIT parse timeout')
        resolve({ type: '', feature: null })
      }, 5000)

      try {
        // Check for FIT header magic bytes
        if (fileContent.length < 14 || fileContent.toString('ascii', 8, 12) !== '.FIT') {
          console.error('Error parsing fit file: Invalid FIT header')
          clearTimeout(timeoutId)
          resolve({ type: '', feature: null })
          return
        }

        fitParser.parse(fileContent, (error: any, data: any) => {
          clearTimeout(timeoutId)
          if (error) {
            console.error('Error parsing fit file:', error)
            resolve({ type: '', feature: null })
            return
          }

          const trackPoints: TrackPoint[] = []
          for (const record of data.records) {
            if (!record.position_lat || !record.position_long) {
              continue
            }

            const latitude = record.position_lat
            const longitude = record.position_long

            if (isFinite(latitude) && isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
              trackPoints.push({
                latitude,
                longitude,
                elevation: record.altitude ?? 0,
              })
            }
          }

          if (trackPoints.length === 0) {
            console.error('No valid track points found')
            resolve({ type: '', feature: null })
            return
          }

          const feature: Feature = {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: trackPoints.map((point) => [point.longitude, point.latitude]),
            },
          }

          const sportType = data?.sport || data?.sessions?.[0]?.sport || data?.activity?.sport || 'unknown'

          resolve({
            type: sportType.toLowerCase(),
            date: data?.activity?.timestamp || new Date(),
            feature,
          })
        })
      } catch (parseError) {
        clearTimeout(timeoutId)
        console.error('Parse error:', parseError)
        resolve({ type: '', feature: null })
      }
    } catch (error) {
      console.error('Unexpected error:', error)
      resolve({ type: '', feature: null })
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
        console.error('Error decompressing gzip file', err)
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
      console.log(`Processing GPX file: ${fileName}`)
      const fileContent = await readFileAsString(file)
      const result = await parseGpxFile(fileContent)
      if (result.feature && result.type) {
        console.log(`Successfully parsed GPX: ${fileName} (${result.type})`)
      } else {
        console.log(`Failed to parse GPX: ${fileName}`)
      }
      return result
    } else if (fileName.endsWith('.fit.gz')) {
      console.log(`Processing compressed FIT file: ${fileName}`)
      const compressedContent = await readFileAsBuffer(file)
      const decompressedContent = await decompressGzip(compressedContent)
      if (!decompressedContent || decompressedContent.length === 0) {
        console.error('Failed to decompress file:', fileName)
        return { type: '', feature: null }
      }
      const result = await parseFitFile(decompressedContent)
      if (result.feature && result.type) {
        console.log(`Successfully parsed FIT.GZ: ${fileName} (${result.type})`)
      } else {
        console.log(`Failed to parse FIT.GZ: ${fileName}`)
      }
      return result
    } else if (fileName.endsWith('.fit')) {
      console.log(`Processing FIT file: ${fileName}`)
      const fileContent = await readFileAsBuffer(file)
      if (!fileContent || fileContent.length === 0) {
        console.error('Empty file content:', fileName)
        return { type: '', feature: null }
      }
      const result = await parseFitFile(fileContent)
      if (result.feature && result.type) {
        console.log(`Successfully parsed FIT: ${fileName} (${result.type})`)
      } else {
        console.log(`Failed to parse FIT: ${fileName}`)
      }
      return result
    }
  } catch (error) {
    console.error(`Failed to process file ${fileName}:`, error)
  }

  return { type: '', feature: null }
}

export async function combineFiles(files: File[]): Promise<Activity[]> {
  const activities: Activity[] = []
  console.log(`Processing ${files.length} total files`)
  let processed = 0,
    successful = 0

  for (const file of files) {
    processed++
    const activity = await extractAndParseFile(file)
    if (activity.feature && activity.type) {
      activities.push(activity)
      successful++
      if (successful % 10 === 0) {
        console.log(`Successfully processed ${successful}/${processed} files`)
      }
    }
  }

  console.log(`Final results: ${successful} valid activities from ${processed} files`)
  return activities.sort((a, b) => {
    if (a.date && b.date) {
      return a.date.getTime() - b.date.getTime()
    } else {
      return 0
    }
  })
}
