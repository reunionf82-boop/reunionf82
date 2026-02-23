/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // API 중복 호출 방지 (개발 모드에서 useEffect 2번 실행 방지)
  images: {
    domains: ['www.fortune82.com'],
  },
  // ws는 bufferutil 네이티브 모듈을 사용. 번들 시 mask is not a function 오류 방지
  experimental: {
    serverComponentsExternalPackages: ['ws', 'bufferutil', 'utf-8-validate'],
  },
}

module.exports = nextConfig

