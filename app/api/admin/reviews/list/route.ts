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

    const searchParams = req.nextUrl.searchParams
    const contentId = searchParams.get('content_id')

    const supabase = getAdminSupabaseClient()
    
    let query = supabase
      .from('reviews')
      .select('id, content_id, review_text, user_name, is_visible, is_best, created_at, image_url')
      .order('created_at', { ascending: false })

    if (contentId) {
      query = query.eq('content_id', parseInt(contentId))
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: '리뷰 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      reviews: data || []
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '리뷰 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
