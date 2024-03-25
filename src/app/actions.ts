'use server'

import { kv } from '@vercel/kv'

export async function getExampleGeoJson() {
  return await kv.get('example-geojson')
}

export async function setExampleGeoJson(data: any) {
  return await kv.set('example-geojson', data)
}
