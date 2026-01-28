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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const supabase = getAdminSupabaseClient()
    
    // 직접 모든 필드를 조회하여 실제 DB 값을 확인
    const { data: rows, error } = await supabase
      .from('app_settings')
      .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune, selected_tts_provider, selected_typecast_voice_id, home_html, updated_at, dev_unlock_password_hash, dev_unlock_duration_minutes, dev_unlock_hide_enabled')
      .eq('id', 1)
      // ✅ id=1 행이 중복이어도 single-coercion 에러를 피하기 위해 배열로 받고 첫 행만 사용
      .limit(1)
    
    // 에러가 발생하면 상세 정보 로깅
    if (error) {

    }
    
    if (error) {
      // 에러 발생 시 기본값 반환

      return NextResponse.json({
        model: 'gemini-3-flash-preview',
        speaker: 'nara',
        tts_provider: 'typecast',
        typecast_voice_id: 'tc_5ecbbc6099979700087711d8',
        fortune_view_mode: 'batch',
        use_sequential_fortune: false
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // 데이터가 없으면 기본값 반환
    const data = Array.isArray(rows) ? rows[0] : null

    if (!data) {

      return NextResponse.json({
        model: 'gemini-3-flash-preview',
        speaker: 'nara',
        tts_provider: 'typecast',
        typecast_voice_id: 'tc_5ecbbc6099979700087711d8',
        fortune_view_mode: 'batch',
        use_sequential_fortune: false
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }
    
    // 데이터가 있지만 필드가 없는 경우를 대비해 전체 데이터 확인
    if (data) {

    }

    // DB 값 사용
    const modelValue = data.selected_model
    const speakerValue = data.selected_speaker
    const fortuneModeValue = (data as any).fortune_view_mode
    const useSequentialFortuneValue = (data as any).use_sequential_fortune
    const ttsProviderValue = (data as any).selected_tts_provider
    const typecastVoiceIdValue = (data as any).selected_typecast_voice_id
    
    // 디버깅: DB에서 가져온 원본 값 확인

    const finalModel = (modelValue != null && String(modelValue).trim() !== '') 
      ? String(modelValue).trim() 
      : 'gemini-3-flash-preview'
    
    const finalSpeaker = (speakerValue != null && String(speakerValue).trim() !== '') 
      ? String(speakerValue).trim() 
      : 'nara'
    
    const finalFortuneMode = (fortuneModeValue != null && String(fortuneModeValue).trim() !== '')
      ? String(fortuneModeValue).trim()
      : 'batch'

    const finalUseSequentialFortune = useSequentialFortuneValue !== null && useSequentialFortuneValue !== undefined
      ? Boolean(useSequentialFortuneValue)
      : false

    const finalTtsProvider = (ttsProviderValue != null && String(ttsProviderValue).trim() === 'typecast') ? 'typecast' : 'naver'
    const finalTypecastVoiceId = (typecastVoiceIdValue != null && String(typecastVoiceIdValue).trim() !== '')
      ? String(typecastVoiceIdValue).trim()
      : 'tc_5ecbbc6099979700087711d8'

    // 디버깅: 최종 반환 값 확인

    return NextResponse.json({
      model: finalModel,
      speaker: finalSpeaker,
      fortune_view_mode: finalFortuneMode,
      use_sequential_fortune: finalUseSequentialFortune,
      tts_provider: finalTtsProvider,
      typecast_voice_id: finalTypecastVoiceId,
      home_html: String((data as any).home_html || ''),
      dev_unlock_password_set: Boolean((data as any).dev_unlock_password_hash),
      dev_unlock_duration_minutes: (data as any).dev_unlock_duration_minutes ?? null,
      dev_unlock_hide_enabled: Boolean((data as any).dev_unlock_hide_enabled),
      // review_event_banners는 컬럼이 없을 수 있으므로 선택적으로 포함
      review_event_banners: Array.isArray((data as any).review_event_banners) ? (data as any).review_event_banners : [],
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error: any) {

    return NextResponse.json(
      { 
        error: error.message || '설정을 가져오는데 실패했습니다.',
        model: 'gemini-3-flash-preview',
        speaker: 'nara',
        fortune_view_mode: 'batch',
        use_sequential_fortune: false
      },
      { status: 500 }
    )
  }
}
