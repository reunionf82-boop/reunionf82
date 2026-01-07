import { NextRequest, NextResponse } from 'next/server'
import { deleteContent } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function DELETE(req: NextRequest) {
  try {
    // 인증 확인
    const authCookie = req.cookies.get('admin_session')
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json(
        { error: 'ID가 필요합니다.' },
        { status: 400 }
      )
    }

    // deleteContent 함수를 사용하여 썸네일도 함께 삭제
    await deleteContent(parseInt(id))

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || '삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}















