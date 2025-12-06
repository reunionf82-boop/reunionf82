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

    // 실제 DB 값 확인
    const modelValue = data.selected_model
    const speakerValue = data.selected_speaker

    console.log('=== DB에서 가져온 실제 값 ===')
    console.log('data 객체:', JSON.stringify(data, null, 2))
    console.log('selected_model (원본):', modelValue, '타입:', typeof modelValue)
    console.log('selected_speaker (원본):', speakerValue, '타입:', typeof speakerValue)

    // null, undefined, 빈 문자열 체크
    const finalModel = (modelValue && typeof modelValue === 'string' && modelValue.trim() !== '') 
      ? modelValue.trim() 
      : 'gemini-2.5-flash'
    
    const finalSpeaker = (speakerValue && typeof speakerValue === 'string' && speakerValue.trim() !== '') 
      ? speakerValue.trim() 
      : 'nara'

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
