import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const contentIdRaw = req.nextUrl.searchParams.get('content_id')
    const contentId = contentIdRaw ? parseInt(contentIdRaw, 10) : NaN
    const supabase = getAdminSupabaseClient()

    console.log(`[ReviewEvent Public] 요청: contentId=${contentIdRaw}, parsed=${contentId}`)

    // content_id가 없으면 모든 contents에서 배너가 있는 첫 번째 컨텐츠의 배너 반환
    if (!contentIdRaw || Number.isNaN(contentId)) {
      // 전체 컬럼 선택 (JSONB 파싱 문제 회피)
      const { data: allContents, error: contentsError } = await supabase
        .from('contents')
        .select('*')
        .order('id', { ascending: true })
      
      if (contentsError) {
        console.error(`[ReviewEvent Public] DB 에러:`, contentsError)
        return NextResponse.json({ review_event_banners: { basic: '', details: [] } })
      }

      console.log(`[ReviewEvent Public] 전체 contents 조회 결과: ${allContents?.length || 0}개`)
      
      // 실제로 배너 데이터가 있는 첫 번째 컨텐츠 찾기
      let contentsData: any = null
      if (allContents && Array.isArray(allContents)) {
        for (const content of allContents) {
          const banners = (content as any)?.review_event_banners
          if (banners && banners !== null) {
            // 빈 객체나 빈 배열이 아닌지 확인
            let hasData = false
            
            // 문자열인 경우 파싱 시도
            let parsedBanners = banners
            if (typeof banners === 'string') {
              try {
                parsedBanners = JSON.parse(banners)
              } catch (e) {
                // 파싱 실패 시 원본 사용 혹은 무시
              }
            }

            if (typeof parsedBanners === 'object') {
              if (Array.isArray(parsedBanners)) {
                hasData = parsedBanners.length > 0
              } else {
                hasData = !!(parsedBanners.basic || (Array.isArray(parsedBanners.details) && parsedBanners.details.length > 0))
              }
            }

            if (hasData) {
              contentsData = content
              console.log(`[ReviewEvent Public] 배너 데이터 발견 - content_id=${content.id}`)
              break
            }
          }
        }
      }

      if (!contentsData || !contentsData.review_event_banners) {
        console.log(`[ReviewEvent Public] 배너 데이터가 있는 컨텐츠를 찾지 못함`)
        return NextResponse.json({ review_event_banners: { basic: '', details: [] } })
      }

      const raw = contentsData.review_event_banners
      const banners = parseBanners(raw)
      
      return NextResponse.json({ review_event_banners: banners })
    }

    // content_id가 있으면 해당 컨텐츠의 리뷰 이벤트 배너 반환
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .eq('id', contentId)
      .maybeSingle()

    if (error) {
      console.error(`[ReviewEvent Public] 단일 조회 DB 에러:`, error)
      return NextResponse.json({ review_event_banners: { basic: '', details: [] } })
    }

    if (!data) {
      console.log(`[ReviewEvent Public] 컨텐츠를 찾을 수 없음: id=${contentId}`)
      return NextResponse.json({ review_event_banners: { basic: '', details: [] } })
    }

    const raw = (data as any)?.review_event_banners
    const banners = parseBanners(raw)

    return NextResponse.json({ review_event_banners: banners })

  } catch (e: any) {
    console.error(`[ReviewEvent Public] 서버 내부 에러:`, e)
    return NextResponse.json(
      { review_event_banners: { basic: '', details: [] }, error: e.message },
      { status: 500 }
    )
  }
}

// 배너 데이터 파싱 헬퍼 함수
function parseBanners(raw: any): { basic: string; details: string[] } {
  let parsed: any = raw
  
  // 문자열인 경우 파싱 시도
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = raw
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw
  }

  // 기본값 설정
  let banners: { basic: string; details: string[] } = { basic: '', details: [] }

  if (Array.isArray(parsed)) {
    // 레거시 배열 호환: 첫 번째가 basic, 나머지가 details
    const arr = parsed.filter((u: any) => typeof u === 'string' && u.trim() !== '')
    banners = {
      basic: arr.length > 0 ? arr[0] : '',
      details: arr.length > 1 ? arr.slice(1) : []
    }
  } else if (parsed && typeof parsed === 'object' && parsed !== null) {
    // 신규 객체 구조: { basic: string, details: string[] }
    // 객체 필드 안전하게 추출
    const basicVal = parsed.basic
    const detailsVal = parsed.details

    banners = {
      basic: typeof basicVal === 'string' ? basicVal : '',
      details: Array.isArray(detailsVal) 
        ? detailsVal.filter((u: any) => typeof u === 'string' && u.trim() !== '') 
        : []
    }
  }

  return banners
}
