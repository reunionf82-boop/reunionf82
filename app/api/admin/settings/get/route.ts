import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 인증 확인 - cookies() 사용 (로그인 API와 동일한 방식)
    const { cookies: cookieStore } = await import('next/headers')
    const cookies = await cookieStore()
    const session = cookies.get('admin_session')
    
    if (!session || session.value !== 'authenticated') {
      console.error('인증 실패 - session:', session)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    console.log('인증 성공 - session:', session.value)

    // 환경 변수 직접 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    
    console.log('=== 조회 API: Supabase 클라이언트 확인 ===')
    console.log('Supabase URL:', supabaseUrl)
    console.log('Supabase URL 길이:', supabaseUrl.length)
    console.log('Service Key 존재:', !!supabaseServiceKey)
    console.log('Service Key 길이:', supabaseServiceKey.length)
    console.log('Service Key 앞 10자리:', supabaseServiceKey.substring(0, 10))
    
    const supabase = getAdminSupabaseClient()
    
    // 직접 모든 필드를 조회하여 실제 DB 값을 확인
    const { data, error } = await supabase
      .from('app_settings')
      .select('id, selected_model, selected_speaker, updated_at')
      .eq('id', 1)
      .maybeSingle() // 레코드가 없어도 에러가 아닌 null 반환
    
    if (error) {
      console.error('=== 설정 조회 에러 ===')
      console.error('에러:', error)
      // 에러 발생 시 기본값 반환
      return NextResponse.json({
        model: 'gemini-2.5-flash',
        speaker: 'nara'
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // 데이터가 없으면 기본값 반환
    if (!data) {
      console.log('=== 레코드 없음, 기본값 반환 ===')
      return NextResponse.json({
        model: 'gemini-2.5-flash',
        speaker: 'nara'
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // 실제 DB 값 확인 - 직접 접근
    console.log('=== DB에서 가져온 실제 값 ===')
    console.log('data 객체 전체:', JSON.stringify(data, null, 2))
    console.log('data.id:', data.id)
    console.log('data.selected_model:', data.selected_model)
    console.log('data.selected_speaker:', data.selected_speaker)
    console.log('data.updated_at:', data.updated_at)
    
    // 직접 속성 접근
    const modelValue = data.selected_model
    const speakerValue = data.selected_speaker
    
    console.log('modelValue:', modelValue, '타입:', typeof modelValue)
    console.log('speakerValue:', speakerValue, '타입:', typeof speakerValue)
    console.log('modelValue === null:', modelValue === null)
    console.log('modelValue === undefined:', modelValue === undefined)
    console.log('modelValue == null:', modelValue == null)
    console.log('speakerValue === null:', speakerValue === null)
    console.log('speakerValue === undefined:', speakerValue === undefined)
    console.log('speakerValue == null:', speakerValue == null)

    // DB 값이 있으면 무조건 사용 - 기본값 사용 금지
    // modelValue나 speakerValue가 null/undefined/빈 문자열이 아니면 무조건 사용
    let finalModel: string
    let finalSpeaker: string
    
    if (modelValue != null && String(modelValue).trim() !== '') {
      finalModel = String(modelValue).trim()
      console.log('✅ DB model 값 사용:', finalModel)
    } else {
      // 기본값 사용은 절대 안 됨 - 에러 발생
      console.error('❌ DB model 값이 없습니다! modelValue:', modelValue)
      finalModel = String(modelValue || '').trim() || 'ERROR_NO_MODEL'
    }
    
    if (speakerValue != null && String(speakerValue).trim() !== '') {
      finalSpeaker = String(speakerValue).trim()
      console.log('✅ DB speaker 값 사용:', finalSpeaker)
    } else {
      // 기본값 사용은 절대 안 됨 - 에러 발생
      console.error('❌ DB speaker 값이 없습니다! speakerValue:', speakerValue)
      finalSpeaker = String(speakerValue || '').trim() || 'ERROR_NO_SPEAKER'
    }
    
    console.log('=== 최종 값 결정 ===')
    console.log('modelValue 원본:', modelValue, '타입:', typeof modelValue)
    console.log('speakerValue 원본:', speakerValue, '타입:', typeof speakerValue)
    console.log('finalModel 결정:', finalModel)
    console.log('finalSpeaker 결정:', finalSpeaker)

    console.log('=== 최종 반환 값 ===')
    console.log('finalModel:', finalModel)
    console.log('finalSpeaker:', finalSpeaker)

    const response = {
      model: finalModel,
      speaker: finalSpeaker,
      // 디버깅용: 실제 DB 값도 포함
      _debug: {
        dbModel: modelValue,
        dbSpeaker: speakerValue,
        dataObject: data
      }
    }

    console.log('=== 최종 응답 객체 ===')
    console.log('response:', JSON.stringify(response, null, 2))

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error: any) {
    console.error('=== 설정 조회 예외 ===')
    console.error('에러:', error)
    return NextResponse.json(
      { 
        error: error.message || '설정을 가져오는데 실패했습니다.',
        model: 'gemini-2.5-flash',
        speaker: 'nara'
      },
      { status: 500 }
    )
  }
}
