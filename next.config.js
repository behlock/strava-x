/** @type {import('next').NextConfig} */

const dotenv = require('dotenv');

dotenv.config();

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '30mb',
    },
  },
}

module.exports = nextConfig
