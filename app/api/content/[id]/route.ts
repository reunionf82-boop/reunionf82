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

    // tts_speaker만 반환
    return NextResponse.json({
      tts_speaker: content.tts_speaker || 'nara'
    })
  } catch (error: any) {
    console.error('컨텐츠 조회 에러:', error)
    return NextResponse.json(
      { error: error?.message || '컨텐츠 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}





















