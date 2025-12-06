import { NextRequest, NextResponse } from 'next/server'
import { saveSelectedModel, saveSelectedSpeaker } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const authCookie = req.cookies.get('admin-auth')
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { model, speaker } = await req.json()

    if (model) {
      await saveSelectedModel(model)
    }
    
    if (speaker) {
      await saveSelectedSpeaker(speaker)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('설정 저장 에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 저장하는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

