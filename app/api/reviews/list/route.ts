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
      console.error('[reviews/list] Supabase 클라이언트 생성 실패:', clientError)
      return NextResponse.json(
        { error: 'Supabase 클라이언트 초기화 실패', details: clientError.message },
        { status: 500 }
      )
    }
    
    // 프로덕션 vs 개발서버 비교를 위한 Supabase URL 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    try {
      console.log('[reviews/list] 쿼리 시작:', {
        contentId,
        onlyBest,
        supabaseUrlPrefix: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : '없음',
        environment: process.env.NODE_ENV || 'unknown'
      })
    } catch (logError) {
      // 로깅 에러는 무시하고 계속 진행
      console.error('[reviews/list] 로깅 에러:', logError)
    }

    // 먼저 전체 개수 확인 (디버깅용)
    const { count: visibleCount, error: countError } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('content_id', parseInt(contentId))
      .eq('is_visible', true)

    if (countError) {
      console.error('[reviews/list] 개수 조회 에러:', countError)
    }

    // 🔍 디버깅: content_id로 모든 리뷰 조회 (필터 없이)
    const { data: allReviews, error: allReviewsError } = await supabase
      .from('reviews')
      .select('id, content_id, is_visible, created_at, review_text')
      .eq('content_id', parseInt(contentId))
      .order('created_at', { ascending: false })
      .limit(100)

    if (!allReviewsError && allReviews) {
      console.log('[reviews/list] 🔍 디버깅 - content_id로 모든 리뷰:', {
        contentId,
        totalReviews: allReviews.length,
        reviews: allReviews.map((r: any) => ({
          id: r.id,
          content_id: r.content_id,
          is_visible: r.is_visible,
          is_visible_type: typeof r.is_visible,
          created_at: r.created_at,
          review_text_preview: r.review_text?.substring(0, 50) || ''
        }))
      })
      
      // is_visible이 true인 리뷰만 필터링
      const visibleReviews = allReviews.filter((r: any) => {
        // boolean true 또는 문자열 "true" 모두 처리
        return r.is_visible === true || r.is_visible === 'true' || r.is_visible === 1
      })
      
      console.log('[reviews/list] 🔍 디버깅 - is_visible 필터링 결과:', {
        totalReviews: allReviews.length,
        visibleReviewsCount: visibleReviews.length,
        visibleReviewIds: visibleReviews.map((r: any) => r.id)
      })
    }

    console.log('[reviews/list] 리뷰 개수 확인:', {
      contentId,
      totalVisibleCount: visibleCount,
      onlyBest
    })

    // 실제 데이터 조회
    // 🔍 is_visible 필터를 여러 방식으로 시도 (boolean true, 문자열 "true", 숫자 1)
    let query = supabase
      .from('reviews')
      .select('id, review_text, user_name, is_best, created_at, image_url, is_visible', { count: 'exact' })
      .eq('content_id', parseInt(contentId))
      .order('created_at', { ascending: false })
      .limit(10000) // 명시적으로 큰 limit 설정 (Supabase 기본 limit은 1000)
    
    // is_visible 필터 적용
    // Supabase는 boolean true를 직접 지원하지만, 혹시 모를 경우를 대비
    query = query.eq('is_visible', true)

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

    // 🔍 디버깅: 조회된 데이터의 is_visible 값 확인
    if (data && data.length > 0) {
      console.log('[reviews/list] 🔍 조회된 리뷰의 is_visible 값:', {
        totalReturned: data.length,
        reviews: data.map((r: any) => ({
          id: r.id,
          is_visible: r.is_visible,
          is_visible_type: typeof r.is_visible
        }))
      })
    }
    
    // 🔍 만약 is_visible 필터가 제대로 작동하지 않는다면, 클라이언트 사이드에서 필터링
    let filteredData = data || []
    if (data && data.length > 0) {
      // is_visible이 true인 것만 필터링 (다양한 타입 지원)
      filteredData = data.filter((r: any) => {
        const isVisible = r.is_visible
        return isVisible === true || isVisible === 'true' || isVisible === 1
      })
      
      if (filteredData.length !== data.length) {
        console.warn('[reviews/list] ⚠️ is_visible 필터링 필요:', {
          beforeFilter: data.length,
          afterFilter: filteredData.length,
          filteredOut: data.length - filteredData.length
        })
      }
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
      console.error('[reviews/list] 데이터 매핑 에러:', mapError)
      // 에러가 발생해도 계속 진행
    }
    
    try {
      console.log('[reviews/list] 조회 성공:', {
        contentId,
        onlyBest,
        expectedCount: visibleCount,
        actualCount: actualCount || finalData?.length || 0,
        returnedDataLength: finalData?.length || 0,
        rawDataLength: data?.length || 0,
        filteredDataLength: finalData?.length || 0,
        reviewIds: reviewIds,
        reviewIdsString: reviewIdsString,
        reviews: reviewDetails
      })
    } catch (logError) {
      console.error('[reviews/list] 로깅 에러:', logError)
    }
    
    // 프로덕션 vs 개발서버 비교를 위한 상세 로그
    try {
      if (visibleCount !== null && visibleCount > 0) {
        console.log('[reviews/list] 상세 비교 정보:', {
          contentId,
          onlyBest,
          dbCount: visibleCount,
          rawReturnedCount: data?.length || 0,
          filteredReturnedCount: finalData?.length || 0,
          missingCount: visibleCount - (finalData?.length || 0),
          allReviewIds: reviewIds,
          firstReviewId: reviewIds[0] || null,
          lastReviewId: reviewIds[reviewIds.length - 1] || null
        })
      }
    } catch (logError) {
      console.error('[reviews/list] 상세 로깅 에러:', logError)
    }

    // 개수 불일치 시 경고
    try {
      if (visibleCount !== null && finalData) {
        const returnedCount = finalData.length
        const queryCount = actualCount || returnedCount
        
        if (visibleCount !== queryCount || visibleCount !== returnedCount) {
          console.warn('[reviews/list] ⚠️ 리뷰 개수 불일치:', {
            expectedFromCount: visibleCount,
            queryCount: queryCount,
            returnedDataLength: returnedCount,
            rawDataLength: data?.length || 0,
            difference: visibleCount - returnedCount,
            possibleCachingIssue: visibleCount > returnedCount
          })
        }
      }
    } catch (warnError) {
      console.error('[reviews/list] 경고 로깅 에러:', warnError)
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
    console.error('[reviews/list] exception:', error)
    return NextResponse.json(
      { error: error.message || '리뷰 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
