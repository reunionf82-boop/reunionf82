import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * 결제 상태 조회 API
 * GET /api/payment/status?oid=...
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const oid = searchParams.get('oid')

    if (!oid) {
      return NextResponse.json({ success: false, error: '주문번호가 없습니다.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .select('status, content_id')
      .eq('oid', oid)
      .single()

    if (error) {
      // 아직 데이터가 없을 수도 있음
      return NextResponse.json({ success: false, status: 'not_found', error: error.message })
    }

    if (!data) {
      return NextResponse.json({ success: false, status: 'not_found' })
    }

    return NextResponse.json({ 
      success: true, 
      status: data.status || 'pending',
      contentId: data.content_id 
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}
