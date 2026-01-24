import { NextRequest, NextResponse } from 'next/server'
import { getContentById } from '@/lib/supabase-admin'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id)
    
    if (isNaN(id)) {
      return NextResponse.json(
        { error: '유효하지 않은 컨텐츠 ID입니다.' },
        { status: 400 }
      )
    }

    const content = await getContentById(id)
    
    if (!content) {
      return NextResponse.json(
        { error: '컨텐츠를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // URL 파라미터로 full=true가 있으면 전체 content 반환 (다시보기용)
    const url = new URL(req.url)
    const fullContent = url.searchParams.get('full') === 'true'
    
    if (fullContent) {
      // 전체 content 반환 (menu_items 포함)
      return NextResponse.json(content)
    }

    // TTS 설정만 반환 (기존 동작 유지)
    // 중요: contents.tts_provider는 기본값이 naver일 수 있어(명시 설정이 없어도 naver로 내려옴)
    // "컨텐츠가 타입캐스트를 명시한 경우에만" override 신호를 내려준다.
    const typecastVoiceId = String((content as any).typecast_voice_id || '').trim()
    // 중요: voice id가 존재해도 "선택된 제공자"를 강제하지 않는다.
    // provider는 오직 contents.tts_provider가 명시적으로 typecast일 때만 override 신호를 내려준다.
    const provider = (content as any).tts_provider === 'typecast' ? 'typecast' : null

    return NextResponse.json({
      tts_speaker: content.tts_speaker || 'nara',
      tts_provider: provider, // null이면 클라이언트는 app_settings 값을 유지
      typecast_voice_id: typecastVoiceId
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '컨텐츠 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}





















