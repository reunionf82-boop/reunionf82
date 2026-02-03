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
      .select('status, content_id, completed_at, created_at')
      .eq('oid', oid)
      .single()

    if (error) {
      // 아직 데이터가 없을 수도 있음
      return NextResponse.json({ success: false, status: 'not_found', error: error.message })
    }

    if (!data) {
      return NextResponse.json({ success: false, status: 'not_found' })
    }

    // 24시간 유효 기준: success면 completed_at, 아니면 created_at
    const completedAt = (data as any).completed_at || (data as any).created_at || null

    const headers = new Headers()
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')

    // DB에 pending이 아니면 모두 success로 간주 (null/빈값/대소문자 등으로 인한 오판 방지)
    const status = (data as any).status === 'pending' ? 'pending' : 'success'

    return NextResponse.json(
      {
        success: true,
        status,
        contentId: data.content_id,
        completedAt: completedAt || null
      },
      { headers }
    )
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}
