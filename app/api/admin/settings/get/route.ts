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
      .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune, selected_tts_provider, selected_typecast_voice_id, updated_at')
      .eq('id', 1)
      .maybeSingle() // 레코드가 없어도 에러가 아닌 null 반환
    
    if (error) {
      // 에러 발생 시 기본값 반환
      return NextResponse.json({
        model: 'gemini-3-flash-preview',
        speaker: 'nara',
        tts_provider: 'typecast',
        typecast_voice_id: 'tc_5ecbbc6099979700087711d8'
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
      return NextResponse.json({
        model: 'gemini-3-flash-preview',
        speaker: 'nara',
        tts_provider: 'typecast',
        typecast_voice_id: 'tc_5ecbbc6099979700087711d8'
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // DB 값 사용
    const modelValue = data.selected_model
    const speakerValue = data.selected_speaker
    const fortuneModeValue = (data as any).fortune_view_mode
    const useSequentialFortuneValue = (data as any).use_sequential_fortune
    const ttsProviderValue = (data as any).selected_tts_provider
    const typecastVoiceIdValue = (data as any).selected_typecast_voice_id
    
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

    return NextResponse.json({
      model: finalModel,
      speaker: finalSpeaker,
      fortune_view_mode: finalFortuneMode,
      use_sequential_fortune: finalUseSequentialFortune,
      tts_provider: finalTtsProvider,
      typecast_voice_id: finalTypecastVoiceId,
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
        speaker: 'nara'
      },
      { status: 500 }
    )
  }
}
