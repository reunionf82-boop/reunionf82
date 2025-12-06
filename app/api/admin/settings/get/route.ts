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

    // DB 값이 있으면 무조건 사용 - 단순화된 로직
    let finalModel = 'gemini-2.5-flash'
    let finalSpeaker = 'nara'
    
    // modelValue 처리 - null, undefined, 빈 문자열이 아니면 사용
    if (modelValue != null && modelValue !== '' && String(modelValue).trim() !== '') {
      finalModel = String(modelValue).trim()
      console.log('✅ DB model 값 사용:', finalModel)
    } else {
      console.log('❌ DB model 값이 없어 기본값 사용. modelValue:', modelValue)
    }
    
    // speakerValue 처리 - null, undefined, 빈 문자열이 아니면 사용
    if (speakerValue != null && speakerValue !== '' && String(speakerValue).trim() !== '') {
      finalSpeaker = String(speakerValue).trim()
      console.log('✅ DB speaker 값 사용:', finalSpeaker)
    } else {
      console.log('❌ DB speaker 값이 없어 기본값 사용. speakerValue:', speakerValue)
    }

    console.log('=== 최종 반환 값 ===')
    console.log('finalModel:', finalModel)
    console.log('finalSpeaker:', finalSpeaker)

    const response = {
      model: finalModel,
      speaker: finalSpeaker
    }

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
