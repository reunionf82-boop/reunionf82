import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * 결제 완료 처리 API (성공 페이지에서 호출)
 * POST /api/payment/complete
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oid } = body

    if (!oid) {
      return NextResponse.json({ success: false, error: '주문번호가 없습니다.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    
    // 상태를 success로 업데이트
    const { data, error } = await supabase
      .from('payments')
      .update({ 
        status: 'success',
        completed_at: new Date().toISOString()
      })
      .eq('oid', oid)
      .select()
      .single()

    if (error) {
      console.error('[결제 완료 처리] DB 업데이트 오류:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[결제 완료 처리] 오류:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
