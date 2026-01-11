import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Supabase 클라이언트 생성 함수 (매번 새로 생성하여 캐시 문제 방지)
const getSupabaseClient = () => {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: {
        'x-client-info': 'reviews-list-api'
      }
    }
  })
}

export async function GET(req: NextRequest) {
  try {
    // 환경 변수 확인 및 디버깅 (프로덕션 환경 진단용)
    const hasSupabaseUrl = !!supabaseUrl
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKeyLength = process.env.SUPABASE_SERVICE_ROLE_KEY?.length || 0
    const anonKeyLength = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.length || 0

    console.log('[reviews/list] 환경 변수 확인:', {
      hasSupabaseUrl,
      hasServiceKey,
      hasAnonKey,
      serviceKeyLength,
      anonKeyLength,
      supabaseUrlPrefix: supabaseUrl ? supabaseUrl.substring(0, 20) + '...' : '없음'
    })

    if (!supabaseUrl) {
      console.error('[reviews/list] NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.')
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase URL이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    if (!supabaseServiceKey) {
      console.error('[reviews/list] Supabase 서비스 키가 설정되지 않았습니다.', {
        hasServiceKey,
        hasAnonKey,
        fallbackUsed: !hasServiceKey && hasAnonKey
      })
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase 서비스 키가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const searchParams = req.nextUrl.searchParams
    const contentId = searchParams.get('content_id')
    const onlyBest = searchParams.get('only_best') === 'true'

    if (!contentId) {
      return NextResponse.json(
        { error: 'content_id는 필수입니다.' },
        { status: 400 }
      )
    }

    console.log('[reviews/list] 쿼리 시작:', {
      contentId,
      onlyBest,
      supabaseUrl: supabaseUrl.substring(0, 30) + '...'
    })

    // 매번 새로운 클라이언트 생성 (캐시 문제 방지)
    const supabase = getSupabaseClient()

    // 먼저 전체 개수 확인 (디버깅용) - 캐시 우회를 위해 직접 쿼리
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

    // 실제 데이터 조회 - 새로운 클라이언트로 쿼리 (캐시 우회)
    const queryClient = getSupabaseClient()
    
    let query = queryClient
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

    // 쿼리 실행 (새로운 클라이언트로 캐시 우회)
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

    // 실제 조회된 데이터 상세 로그
    console.log('[reviews/list] 조회 성공:', {
      contentId,
      onlyBest,
      expectedCount: visibleCount,
      actualCount: actualCount || data?.length || 0,
      returnedDataLength: data?.length || 0,
      reviewIds: data?.map((r: any) => r.id) || [],
      reviews: data?.map((r: any) => ({ 
        id: r.id, 
        is_best: r.is_best,
        created_at: r.created_at 
      })) || []
    })

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
