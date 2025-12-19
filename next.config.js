/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['www.fortune82.com'],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Puppeteer 관련 패키지를 외부 의존성으로 처리 (서버리스 함수 크기 제한 대응)
      config.externals.push('puppeteer-core', '@sparticuz/chromium')
    }
    return config
  },
}

module.exports = nextConfig






















