import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'

/**
 * 점사 상태/실패 원인 기록 API
 * POST /api/payment/fortune-status
 * body: { requestKey: string, fortuneStatus: 'failed' | 'interrupted', fortuneFailureReason?: string }
 * 또는 { oid: string, ... } (request_key = pending_{oid} 로 매칭)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { requestKey, oid, fortuneStatus, fortuneFailureReason } = body

    const key = (requestKey || (oid ? `pending_${oid}` : '')).toString().trim()
    if (!key) {
      return NextResponse.json(
        { success: false, error: 'requestKey 또는 oid가 필요합니다.' },
        { status: 400 }
      )
    }

    const status = fortuneStatus === 'failed' || fortuneStatus === 'interrupted' ? fortuneStatus : 'failed'
    const reason = fortuneFailureReason != null ? String(fortuneFailureReason).trim().substring(0, 500) : null

    const supabase = getAdminSupabaseClient()
    const updatePayload: Record<string, unknown> = {
      fortune_status: status,
      updated_at: getKSTNow()
    }
    if (reason) updatePayload.fortune_failure_reason = reason

    const { data, error } = await supabase
      .from('payments')
      .update(updatePayload)
      .eq('request_key', key)
      .select('id, oid, fortune_status, fortune_failure_reason')
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || '점사 상태 업데이트에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data || undefined
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
