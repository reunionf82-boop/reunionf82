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
    const { data, error } = await supabase
      .from('app_settings')
      .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune, selected_tts_provider, selected_typecast_voice_id, home_html, updated_at')
      .eq('id', 1)
      .maybeSingle() // 레코드가 없어도 에러가 아닌 null 반환
    
    // 에러가 발생하면 상세 정보 로깅
    if (error) {
      console.error('[API] app_settings SELECT 에러 상세:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      })
    }
    
    if (error) {
      // 에러 발생 시 기본값 반환
      console.error('[API] app_settings 조회 에러:', error)
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
    if (!data) {
      console.log('[API] app_settings 데이터가 없음, 기본값 반환')
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
    
    console.log('[API] app_settings 데이터 존재:', {
      hasData: !!data,
      selected_model: data.selected_model,
      selected_speaker: data.selected_speaker,
      fortune_view_mode: (data as any).fortune_view_mode,
      use_sequential_fortune: (data as any).use_sequential_fortune,
      selected_tts_provider: (data as any).selected_tts_provider,
      allKeys: Object.keys(data || {})
    })
    
    // 데이터가 있지만 필드가 없는 경우를 대비해 전체 데이터 확인
    if (data) {
      console.log('[API] 전체 data 객체:', JSON.stringify(data, null, 2))
    }

    // DB 값 사용
    const modelValue = data.selected_model
    const speakerValue = data.selected_speaker
    const fortuneModeValue = (data as any).fortune_view_mode
    const useSequentialFortuneValue = (data as any).use_sequential_fortune
    const ttsProviderValue = (data as any).selected_tts_provider
    const typecastVoiceIdValue = (data as any).selected_typecast_voice_id
    
    // 디버깅: DB에서 가져온 원본 값 확인
    console.log('[API] DB 원본 값:', {
      selected_model: modelValue,
      use_sequential_fortune: useSequentialFortuneValue,
      fortune_view_mode: fortuneModeValue,
      selected_speaker: speakerValue,
      selected_tts_provider: ttsProviderValue
    })
    
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
    console.log('[API] 최종 반환 값:', {
      model: finalModel,
      use_sequential_fortune: finalUseSequentialFortune,
      fortune_view_mode: finalFortuneMode
    })

    return NextResponse.json({
      model: finalModel,
      speaker: finalSpeaker,
      fortune_view_mode: finalFortuneMode,
      use_sequential_fortune: finalUseSequentialFortune,
      tts_provider: finalTtsProvider,
      typecast_voice_id: finalTypecastVoiceId,
      home_html: String((data as any).home_html || ''),
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
    console.error('[API] 예외 발생:', error)
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
