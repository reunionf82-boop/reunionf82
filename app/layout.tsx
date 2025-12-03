import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '궁합/애정 - Fortune82',
  description: '대한민국 최고의 궁합 전문 역학자들이 나섰다. 만남부터 연애 이별 재회까지 전반적인 흐름을 풀이해 드립니다.',
  keywords: '궁합, 애정, 운세, 사주, 타로, 재회, 연애',
  openGraph: {
    title: '궁합/애정 - Fortune82',
    description: '대한민국 최고의 궁합 전문 역학자들이 나섰다.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}


