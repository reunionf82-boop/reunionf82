import type { Metadata } from 'next'
import GlobalProtection from '@/components/GlobalProtection'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://reunionf82.vercel.app'),
  title: '포춘82 재회',
  description: '대한민국 최고의 궁합 전문 역학자들이 나섰다. 만남부터 연애 이별 재회까지 전반적인 흐름을 풀이해 드립니다.',
  keywords: '궁합, 애정, 운세, 사주, 타로, 재회, 연애',
  icons: {
    icon: [
      { url: '/Favicon.ico', sizes: 'any' },
      { url: '/Favicon.png', type: 'image/png' },
    ],
    apple: [
      { url: '/Favicon.png', type: 'image/png' },
    ],
  },
  openGraph: {
    title: '포춘82 재회',
    description: '대한민국 최고의 궁합 전문 역학자들이 나섰다.',
    type: 'website',
    images: [
      {
        url: '/opengraph.jpg',
        width: 1200,
        height: 630,
        alt: '포춘82 재회',
      },
    ],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>
        <GlobalProtection />
        {children}
      </body>
    </html>
  )
}

