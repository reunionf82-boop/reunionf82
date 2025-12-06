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
    
    console.log('=== 설정 조회 API 시작 ===')
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...')
    console.log('Service Key 존재:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    
    // 직접 SQL 쿼리로 확인 (디버깅용)
    const { data: rawData, error: rawError } = await supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .single()
    
    console.log('=== 원본 SQL 조회 결과 ===')
    console.log('rawError:', rawError)
    console.log('rawData 전체:', JSON.stringify(rawData, null, 2))
    console.log('rawData?.selected_model:', rawData?.selected_model)
    console.log('rawData?.selected_speaker:', rawData?.selected_speaker)
    
    const { data, error } = await supabase
      .from('app_settings')
      .select('selected_model, selected_speaker')
      .eq('id', 1)
      .single()
    
    console.log('=== 설정 조회 API ===')
    console.log('에러:', error)
    console.log('데이터:', data)
    console.log('원본 selected_model:', data?.selected_model)
    console.log('원본 selected_speaker:', data?.selected_speaker)
    console.log('rawData와 data 비교:')
    console.log('  - selected_model:', rawData?.selected_model, 'vs', data?.selected_model)
    console.log('  - selected_speaker:', rawData?.selected_speaker, 'vs', data?.selected_speaker)
    
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
    
    console.log('=== 원본 DB 값 확인 ===')
    console.log('data 객체 전체:', JSON.stringify(data, null, 2))
    console.log('data?.selected_model:', data?.selected_model)
    console.log('data?.selected_speaker:', data?.selected_speaker)
    console.log('modelValue:', modelValue, '타입:', typeof modelValue)
    console.log('speakerValue:', speakerValue, '타입:', typeof speakerValue)
    
    const response = {
      model: (modelValue && modelValue.trim() !== '') ? modelValue : 'gemini-2.5-flash',
      speaker: (speakerValue && speakerValue.trim() !== '') ? speakerValue : 'nara'
    }
    
    console.log('=== 최종 응답 생성 ===')
    console.log('반환할 응답:', response)
    console.log('원본 데이터 - selected_model:', modelValue, 'selected_speaker:', speakerValue)
    console.log('응답 model:', response.model, '응답 speaker:', response.speaker)
    
    // 캐시 방지 헤더 추가
    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error: any) {
    console.error('설정 조회 에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 가져오는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

