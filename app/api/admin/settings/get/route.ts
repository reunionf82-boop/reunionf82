import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// 서버 사이드에서만 서비스 롤 키 사용
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

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

export async function GET(req: NextRequest) {
  try {
    // 인증 확인
    const authCookie = req.cookies.get('admin_session')
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseClient()
    
    const { data, error } = await supabase
      .from('app_settings')
      .select('selected_model, selected_speaker')
      .eq('id', 1)
      .single()
    
    console.log('=== 설정 조회 API ===')
    console.log('에러:', error)
    console.log('데이터:', data)
    
    if (error) {
      // 테이블이 없거나 레코드가 없으면 기본값 반환
      console.log('설정 조회 실패, 기본값 사용:', error.message)
      return NextResponse.json({
        model: 'gemini-2.5-flash',
        speaker: 'nara'
      })
    }
    
    // 데이터가 있으면 그대로 반환 (null이어도 반환)
    // 빈 문자열 체크도 포함
    const modelValue = data?.selected_model
    const speakerValue = data?.selected_speaker
    
    const response = {
      model: (modelValue && modelValue.trim() !== '') ? modelValue : 'gemini-2.5-flash',
      speaker: (speakerValue && speakerValue.trim() !== '') ? speakerValue : 'nara'
    }
    
    console.log('반환할 응답:', response)
    console.log('원본 데이터 - selected_model:', modelValue, 'selected_speaker:', speakerValue)
    return NextResponse.json(response)
  } catch (error: any) {
    console.error('설정 조회 에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 가져오는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

