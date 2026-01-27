import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const contentId = searchParams.get('content_id')
    const onlyBest = searchParams.get('only_best') === 'true'

    if (!contentId) {
      return NextResponse.json(
        { error: 'content_id는 필수입니다.' },
        { status: 400 }
      )
    }

    // 관리자 클라이언트 사용 (다른 API와 동일한 방식)
    let supabase
    try {
      supabase = getAdminSupabaseClient()
    } catch (clientError: any) {
      return NextResponse.json(
        { error: 'Supabase 클라이언트 초기화 실패', details: clientError.message },
        { status: 500 }
      )
    }

    // 🔄 캐시 우회를 위한 타임스탬프 (로그/디버깅용)
    // 주의: Supabase 쿼리 자체는 서버에서 캐시되지 않는 편이며,
    // 쿼리 조건에 의미 없는 비교(gte 등)를 억지로 넣으면 created_at NULL 행이 누락될 수 있습니다.
    const cacheBuster = Date.now()
    
    
    // 🔄 Supabase 쿼리 캐시/지연 문제 해결: 트랜잭션 커밋 시간 확보
    // 새로 추가된 리뷰가 즉시 반영되지 않는 문제 해결을 위해 짧은 지연 추가
    // (선택사항: 필요시 주석 해제)
    // await new Promise(resolve => setTimeout(resolve, 100)) // 100ms 지연
    
    // 먼저 전체 개수 확인 (디버깅용)
    // 캐시 우회를 위해 타임스탬프를 쿼리에 포함 (실제로는 사용하지 않지만 쿼리 해시를 다르게 만듦)
    const { count: visibleCount, error: countError } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('content_id', parseInt(contentId))
      .eq('is_visible', true)


    // 🔍 디버깅: content_id로 모든 리뷰 조회 (필터 없이)
    const { data: allReviews, error: allReviewsError } = await supabase
      .from('reviews')
      .select('id, content_id, is_visible, created_at, review_text')
      .eq('content_id', parseInt(contentId))
      .order('created_at', { ascending: false })
      .limit(100)

    // 실제 데이터 조회
    // 🔍 is_visible 필터를 여러 방식으로 시도 (boolean true, 문자열 "true", 숫자 1)
    let query = supabase
      .from('reviews')
      .select('id, review_text, user_name, is_best, created_at, image_url, is_visible', { count: 'exact' })
      .eq('content_id', parseInt(contentId))
      .eq('is_visible', true) // 노출 승인된 리뷰만
      .order('created_at', { ascending: false })
      .limit(10000) // 명시적으로 큰 limit 설정 (Supabase 기본 limit은 1000)

    // 베스트 리뷰만 조회
    if (onlyBest) {
      query = query.eq('is_best', true)
    }

    // 쿼리 실행
    const { data, error, count: actualCount } = await query

    if (error) {
      return NextResponse.json(
        { error: '리뷰 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    
    // 🔍 만약 is_visible 필터가 제대로 작동하지 않는다면, 클라이언트 사이드에서 필터링
    let filteredData = data || []
    if (data && data.length > 0) {
      // is_visible이 true인 것만 필터링 (다양한 타입 지원)
      filteredData = data.filter((r: any) => {
        const isVisible = r.is_visible
        return isVisible === true || isVisible === 'true' || isVisible === 1
      })
      
    }
    
    // 필터링된 데이터 사용
    const finalData = filteredData

    // 실제 조회된 데이터 상세 로그 (프로덕션 vs 개발서버 비교용)
    // 안전하게 처리하여 로깅 에러가 전체 응답을 막지 않도록
    let reviewIds: number[] = []
    let reviewDetails: any[] = []
    let reviewIdsString = ''
    
    try {
      reviewIds = finalData?.map((r: any) => r?.id).filter((id: any) => id != null) || []
      reviewDetails = finalData?.map((r: any) => ({ 
        id: r?.id, 
        is_best: r?.is_best,
        created_at: r?.created_at,
        has_image: !!r?.image_url,
        is_visible: r?.is_visible
      })).filter((r: any) => r?.id != null) || []
      reviewIdsString = reviewIds.join(',')
    } catch (mapError) {
      // 에러가 발생해도 계속 진행
    }
    

    return NextResponse.json({
      success: true,
      reviews: finalData || []
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '리뷰 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// ✅ 캐시 우회용: POST로도 동일 조회 지원
// (프로덕션 앞단이 GET /api/* 를 캐시하는 경우를 우회하기 위함)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const contentIdRaw = body?.content_id
    const onlyBest = body?.only_best === true || body?.only_best === 'true'

    const contentId = typeof contentIdRaw === 'number' ? String(contentIdRaw) : String(contentIdRaw || '')
    if (!contentId || Number.isNaN(parseInt(contentId))) {
      return NextResponse.json(
        { error: 'content_id는 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    let query = supabase
      .from('reviews')
      .select('id, review_text, user_name, is_best, created_at, image_url', { count: 'exact' })
      .eq('content_id', parseInt(contentId))
      .eq('is_visible', true)
      .order('created_at', { ascending: false })
      .limit(10000)

    if (onlyBest) {
      query = query.eq('is_best', true)
    }

    const { data, error } = await query
    if (error) {
      return NextResponse.json(
        { error: '리뷰 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      reviews: data || []
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '리뷰 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
