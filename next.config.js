/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['www.fortune82.com'],
  },
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Puppeteer 관련 패키지를 외부 의존성으로 처리하지 않음 (Vercel에서 필요)
      // config.externals.push('puppeteer-core', '@sparticuz/chromium')
      // Vercel에서는 번들에 포함되어야 함
    }
    return config
  },
}

module.exports = nextConfig






















