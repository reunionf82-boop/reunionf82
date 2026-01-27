/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // API 중복 호출 방지 (개발 모드에서 useEffect 2번 실행 방지)
  images: {
    domains: ['www.fortune82.com'],
  },
}

module.exports = nextConfig

