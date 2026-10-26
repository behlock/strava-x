import type { UrbanCentre } from './urban-centres'

export interface GeocodeAddress {
  city?: string
  town?: string
  village?: string
  municipality?: string
  county?: string
  state?: string
  country_code?: string
}

export interface ResolvedCity {
  id: string
  name: string
}

const normalizeName = (name: string) => name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim()

export function resolveCity(address: GeocodeAddress | undefined, urban: UrbanCentre | null): ResolvedCity | null {
  const settlement = address?.city || address?.town || address?.village || address?.municipality
  if (urban) {
    // A continuous urban area can contain distinct cities; retain names recorded in its source data.
    const member = settlement && urban.names.find((name) => normalizeName(name) === normalizeName(settlement))
    const name = member || urban.name
    return { id: `ghsl:${urban.id}:${normalizeName(name)}`, name }
  }
  if (!settlement) return null
  // Administrative context distinguishes same-named settlements without treating regions as cities.
  return {
    id: `locality:${JSON.stringify([address?.country_code, address?.state, address?.county, settlement])}`,
    name: settlement,
  }
}
