import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
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

    const body = await req.json()
    const { review_id, is_visible, is_best } = body

    if (!review_id) {
      return NextResponse.json(
        { error: 'review_id는 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()
    
    const updateData: any = {
      updated_at: getKSTNow() // KST 기준으로 저장
    }

    if (is_visible !== undefined) {
      updateData.is_visible = Boolean(is_visible)
    }

    if (is_best !== undefined) {
      updateData.is_best = Boolean(is_best)
    }

    const { data, error } = await supabase
      .from('reviews')
      .update(updateData)
      .eq('id', parseInt(review_id))
      .select()
      .single()

    if (error) {
      console.error('[admin/reviews/update] error:', error)
      console.error('[admin/reviews/update] error details:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: '리뷰 업데이트에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    console.log('[admin/reviews/update] 업데이트 성공:', {
      review_id,
      updateData,
      updated_review: data
    })

    return NextResponse.json({
      success: true,
      review: data
    })
  } catch (error: any) {
    console.error('[admin/reviews/update] exception:', error)
    return NextResponse.json(
      { error: error.message || '리뷰 업데이트 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
