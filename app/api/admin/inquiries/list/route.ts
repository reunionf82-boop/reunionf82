import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // 관리자 인증 확인
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    
    if (!session || session.value !== 'authenticated') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = getAdminSupabaseClient()
    
    // 모든 문의 조회 (최신순)
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[admin/inquiries/list] error:', error)
      return NextResponse.json(
        { error: '문의 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      inquiries: data || []
    })
  } catch (error: any) {
    console.error('[admin/inquiries/list] exception:', error)
    return NextResponse.json(
      { error: error.message || '문의 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
