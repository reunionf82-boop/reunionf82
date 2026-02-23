import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Next.js 캐싱 방지 설정 (프로덕션 환경에서 항상 최신 데이터 가져오기)
export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID는 필수입니다.' },
        { status: 400 }
      )
    }

    // 점사형 saved_results 또는 음성형 saved_results_voice 삭제
    const idNum = parseInt(id, 10)
    if (!Number.isFinite(idNum)) {
      return NextResponse.json(
        { success: false, error: '유효한 결과 ID가 아닙니다.' },
        { status: 400 }
      )
    }
    const { error: errFortune } = await supabase.from('saved_results').delete().eq('id', idNum)
    const { error: errVoice } = await supabase.from('saved_results_voice').delete().eq('id', idNum)
    if (errFortune && errVoice) {
      return NextResponse.json(
        { success: false, error: '저장된 결과 삭제에 실패했습니다.', details: errFortune?.message || errVoice?.message },
        { status: 500 }
      )
    }

    // 캐싱 방지 헤더 설정 (프로덕션 환경에서 브라우저/CDN 캐싱 방지)
    return NextResponse.json(
      {
        success: true
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

