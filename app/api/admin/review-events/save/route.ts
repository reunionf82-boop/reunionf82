import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

// 서버 사이드에서만 서비스 롤 키 사용
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    // 관리자 인증 확인
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')

    if (session?.value !== 'authenticated') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await req.json()
    const { content_id, review_event_banners } = body

    if (!content_id) {
      return NextResponse.json(
        { error: '컨텐츠 ID가 필요합니다.' },
        { status: 400 }
      )
    }

    if (!review_event_banners) {
      return NextResponse.json(
        { error: '리뷰 이벤트 배너 데이터가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // review_event_banners 데이터를 JSON 문자열로 변환하지 않고 그대로 저장 (JSONB 타입이면 객체 그대로 저장 가능)
    // 하지만 기존 코드 호환성을 위해 JSON.stringify를 사용하는 것이 안전할 수 있음
    // contents 테이블의 review_event_banners 컬럼 타입이 jsonb인지 text인지 확인 필요
    // 보통 Supabase에서 jsonb 컬럼은 객체를 그대로 전달하면 됨.
    
    // 안전하게 객체 구조 검증
    const bannerData = {
      basic: review_event_banners.basic || '',
      details: Array.isArray(review_event_banners.details) ? review_event_banners.details : []
    }

    const { error } = await supabase
      .from('contents')
      .update({ review_event_banners: bannerData })
      .eq('id', content_id)

    if (error) {
      console.error('Update error:', error)
      return NextResponse.json(
        { error: error.message || '리뷰 이벤트 배너 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      review_event_banners: bannerData
    })
  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
