import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site'
import { config } from '@/lib/config'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'weekly', priority: 1 },
    ...(config.COMMUNITY_DIRECTORY
      ? [{ url: `${SITE_URL}/maps`, changeFrequency: 'daily' as const, priority: 0.8 }]
      : []),
  ]
}
