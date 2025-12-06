import { NextRequest, NextResponse } from 'next/server'
import { getSelectedModel, getSelectedSpeaker } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 인증 확인
    const authCookie = req.cookies.get('admin_session')
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const model = await getSelectedModel()
    const speaker = await getSelectedSpeaker()

    return NextResponse.json({ 
      model,
      speaker 
    })
  } catch (error: any) {
    console.error('설정 조회 에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 가져오는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

