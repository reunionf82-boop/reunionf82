import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

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

    // ⚠️ payments 테이블은 payment_code/name/pay/payment_type 등이 NOT NULL.
    // 여기서 upsert(삽입)를 시도하면 필수 컬럼 누락으로 삽입이 실패할 수 있음.
    // 따라서 "기존 레코드가 존재할 때만" status 업데이트를 수행한다.
    const { data, error } = await supabase
      .from('payments')
      .update({
        status: 'success',
        completed_at: getKSTNow(), // KST 기준으로 저장
      })
      .eq('oid', oid)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    if (!data) {
      return NextResponse.json({ success: false, error: '결제 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
