import { NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('app_settings')
      .select('id, selected_tts_provider, selected_typecast_voice_id')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) {
      return NextResponse.json({
        // 안전한 기본값: 네이버 (설정 조회 실패 시 Typecast 결제 오류 방지)
        tts_provider: 'naver',
        typecast_voice_id: 'tc_5ecbbc6099979700087711d8',
      }, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
      })
    }

    const provider = (data as any).selected_tts_provider === 'typecast' ? 'typecast' : 'naver'
    const voiceId = String((data as any).selected_typecast_voice_id || '').trim() || 'tc_5ecbbc6099979700087711d8'

    return NextResponse.json({
      tts_provider: provider,
      typecast_voice_id: voiceId,
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-TTS-Settings-Provider': provider,
      },
    })
  } catch (e) {
    return NextResponse.json({
      // 안전한 기본값: 네이버 (설정 조회 실패 시 Typecast 결제 오류 방지)
      tts_provider: 'naver',
      typecast_voice_id: 'tc_5ecbbc6099979700087711d8',
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-TTS-Settings-Provider': 'naver',
      },
    })
  }
}

