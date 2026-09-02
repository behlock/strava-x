import type { MetadataRoute } from 'next'

import { SITE_URL } from '@/lib/site'

// Published maps live at /<slug> but are user-controlled and unlisted by
// design, so only the landing page is advertised.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE_URL, changeFrequency: 'weekly', priority: 1 }]
}
