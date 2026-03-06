import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

const POLL_INTERVAL_MS = 100
const MAX_POLL_COUNT = 25

/**
 * 결제 success 될 때까지 서버에서 대기 후 한 번에 응답 (long-poll)
 * GET /api/payment/wait-status?oid=...
 * - success 나오면 즉시 200 { success: true, status: 'success', ... }
 * - max 25회 x 100ms 후에도 pending이면 200 { success: true, status: 'pending' }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const oid = searchParams.get('oid')

    if (!oid) {
      return NextResponse.json({ success: false, error: '주문번호가 없습니다.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()

    for (let i = 0; i < MAX_POLL_COUNT; i++) {
      const { data, error } = await supabase
        .from('payments')
        .select('status, content_id, completed_at, created_at')
        .eq('oid', oid)
        .single()

      if (!error && data) {
        const status = (data as any).status === 'pending' ? 'pending' : 'success'
        if (status === 'success') {
          const completedAt = (data as any).completed_at || (data as any).created_at || null
          return NextResponse.json({
            success: true,
            status: 'success',
            contentId: data.content_id,
            completedAt: completedAt || null
          }, { headers: { 'Cache-Control': 'no-store' } })
        }
      }

      if (i < MAX_POLL_COUNT - 1) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
    }

    return NextResponse.json(
      { success: true, status: 'pending' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}
