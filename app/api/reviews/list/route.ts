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
    const supabase = getAdminSupabaseClient()
    
    // 프로덕션 vs 개발서버 비교를 위한 Supabase URL 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    console.log('[reviews/list] 쿼리 시작:', {
      contentId,
      onlyBest,
      supabaseUrlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : '없음',
      environment: process.env.NODE_ENV || 'unknown'
    })

    // 먼저 전체 개수 확인 (디버깅용)
    const { count: visibleCount, error: countError } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('content_id', parseInt(contentId))
      .eq('is_visible', true)

    if (countError) {
      console.error('[reviews/list] 개수 조회 에러:', countError)
    }

    console.log('[reviews/list] 리뷰 개수 확인:', {
      contentId,
      totalVisibleCount: visibleCount,
      onlyBest
    })

    // 실제 데이터 조회
    let query = supabase
      .from('reviews')
      .select('id, review_text, user_name, is_best, created_at, image_url', { count: 'exact' })
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
      console.error('[reviews/list] 쿼리 에러:', {
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        contentId,
        onlyBest
      })
      console.error('[reviews/list] error details:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: '리뷰 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // 실제 조회된 데이터 상세 로그 (프로덕션 vs 개발서버 비교용)
    const reviewIds = data?.map((r: any) => r.id) || []
    const reviewDetails = data?.map((r: any) => ({ 
      id: r.id, 
      is_best: r.is_best,
      created_at: r.created_at,
      has_image: !!r.image_url
    })) || []
    
    console.log('[reviews/list] 조회 성공:', {
      contentId,
      onlyBest,
      expectedCount: visibleCount,
      actualCount: actualCount || data?.length || 0,
      returnedDataLength: data?.length || 0,
      reviewIds: reviewIds,
      reviewIdsString: reviewIds.join(','), // 쉼표로 구분된 ID 목록 (비교 용이)
      reviews: reviewDetails
    })
    
    // 프로덕션 vs 개발서버 비교를 위한 상세 로그
    if (visibleCount !== null && visibleCount > 0) {
      console.log('[reviews/list] 상세 비교 정보:', {
        contentId,
        onlyBest,
        dbCount: visibleCount,
        returnedCount: data?.length || 0,
        missingCount: visibleCount - (data?.length || 0),
        allReviewIds: reviewIds,
        firstReviewId: reviewIds[0] || null,
        lastReviewId: reviewIds[reviewIds.length - 1] || null
      })
    }

    // 개수 불일치 시 경고
    if (visibleCount !== null && data) {
      const returnedCount = data.length
      const queryCount = actualCount || returnedCount
      
      if (visibleCount !== queryCount || visibleCount !== returnedCount) {
        console.warn('[reviews/list] ⚠️ 리뷰 개수 불일치:', {
          expectedFromCount: visibleCount,
          queryCount: queryCount,
          returnedDataLength: returnedCount,
          difference: visibleCount - returnedCount,
          possibleCachingIssue: visibleCount > returnedCount
        })
      }
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
    console.error('[reviews/list] exception:', error)
    return NextResponse.json(
      { error: error.message || '리뷰 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
