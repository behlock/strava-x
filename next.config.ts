import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    '/*': ['./.local-maps/**/*'],
  },
  outputFileTracingIncludes: {
    '/api/publish': ['./data/urban-centres.json.gz'],
    '/api/geocode/reverse': ['./data/urban-centres.json.gz'],
  },
}

export default nextConfig
