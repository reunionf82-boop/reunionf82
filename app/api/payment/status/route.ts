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

    // 12시간 유효 기준: success면 completed_at, 아니면 created_at
    const completedAt = (data as any).completed_at || (data as any).created_at || null

    // 운영자 예외: payment_retry_allowances에 있으면 12시간 경과해도 재시도 허용
    let allowedRetry = false
    let allowedUntil: string | null = null
    const { data: allowance } = await supabase
      .from('payment_retry_allowances')
      .select('allowed_until')
      .eq('oid', oid)
      .maybeSingle()
    if (allowance?.allowed_until) {
      const until = new Date(allowance.allowed_until).getTime()
      if (Number.isFinite(until) && Date.now() < until) {
        allowedRetry = true
        allowedUntil = allowance.allowed_until
      }
    }

    return NextResponse.json({ 
      success: true, 
      status: data.status || 'pending',
      contentId: data.content_id,
      completedAt: completedAt || null,
      allowedRetry: allowedRetry || undefined,
      allowedUntil: allowedUntil || undefined
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}
