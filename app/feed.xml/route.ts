import { NextResponse } from 'next/server'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.fortune82.com'
  const siteName = '포춘82 재회'
  const description = '대한민국 최고의 궁합 전문 역학자들이 나섰다. 만남부터 연애 이별 재회까지 전반적인 흐름을 풀이해 드립니다.'

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${siteName}</title>
    <link>${baseUrl}</link>
    <description>${description}</description>
    <language>ko-KR</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
    <item>
      <title>${siteName} - 운세 서비스</title>
      <link>${baseUrl}</link>
      <description>${description}</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}</guid>
    </item>
    <item>
      <title>${siteName} - 점사 신청</title>
      <link>${baseUrl}/form</link>
      <description>궁합, 사주명식, 택일 등 다양한 운세 서비스를 신청하세요.</description>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <guid isPermaLink="true">${baseUrl}/form</guid>
    </item>
  </channel>
</rss>`

  return new NextResponse(feed, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}
