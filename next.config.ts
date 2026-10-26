import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    '/api/geocode/reverse': ['./data/urban-centres.json.gz'],
  },
}

export default nextConfig
