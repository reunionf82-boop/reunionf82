import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/** 12초당 차감 금액(원) - 콘텐츠별 설정이 없을 때 fallback */
const DEDUCT_PER_12SEC = 19

/**
 * 잔액 조회
 * GET /api/voice/balance?contentId=1&phone=010-1234-5678
 */
export async function GET(request: NextRequest) {
  try {
    const contentId = request.nextUrl.searchParams.get('contentId')
    const phone = request.nextUrl.searchParams.get('phone')
    if (!contentId || !phone) {
      return NextResponse.json(
        { success: false, error: 'contentId, phone 필요' },
        { status: 400 }
      )
    }
    const cid = parseInt(contentId, 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ success: false, error: 'contentId 숫자 필요' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('voice_balance')
      .select('balance_wan')
      .eq('content_id', cid)
      .eq('phone', String(phone).trim())
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    const balance_wan = data?.balance_wan ?? 0
    return NextResponse.json({ success: true, balance_wan })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}

/**
 * 충전(charge): 결제 성공 건 확인 후 잔액 추가
 * 차감(deduct): 사용 시간을 rate_seconds 단위로 올림 후 rate_won원씩 차감 (1초만 넘겨도 1블록 전체 차감)
 *
 * POST /api/voice/balance
 * - charge: { action: 'charge', oid, contentId, phone }
 * - deduct: { action: 'deduct', contentId, phone, secondsUsed [, rate_seconds, rate_won ] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body?.action

    if (action === 'charge') {
      const { oid, contentId, phone } = body
      if (!oid || contentId == null || !phone) {
        return NextResponse.json(
          { success: false, error: 'charge 시 oid, contentId, phone 필요' },
          { status: 400 }
        )
      }
      const cid = parseInt(String(contentId), 10)
      if (!Number.isFinite(cid)) {
        return NextResponse.json({ success: false, error: 'contentId 숫자 필요' }, { status: 400 })
      }

      const supabase = getAdminSupabaseClient()
      const { data: payment } = await supabase
        .from('payments')
        .select('id, pay, status')
        .eq('oid', String(oid))
        .eq('content_id', cid)
        .single()

      const payAmount = Number((payment as any)?.pay)
      if (!payment || (payment as any).status !== 'success' || !Number.isFinite(payAmount) || payAmount <= 0) {
        return NextResponse.json(
          { success: false, error: '결제 완료 건이 없거나 금액이 올바르지 않습니다.' },
          { status: 400 }
        )
      }

      const phoneStr = String(phone).trim()
      const { data: row } = await supabase
        .from('voice_balance')
        .select('balance_wan')
        .eq('content_id', cid)
        .eq('phone', phoneStr)
        .maybeSingle()

      const current = (row as any)?.balance_wan ?? 0
      const nextBalance = current + payAmount

      const { error: upsertError } = await supabase
        .from('voice_balance')
        .upsert(
          {
            content_id: cid,
            phone: phoneStr,
            balance_wan: nextBalance,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'content_id,phone' }
        )

      if (upsertError) {
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, balance_wan: nextBalance })
    }

    if (action === 'deduct') {
      const { contentId, phone, secondsUsed, rate_seconds: bodyRateSec, rate_won: bodyRateWon } = body
      if (contentId == null || !phone || secondsUsed == null) {
        return NextResponse.json(
          { success: false, error: 'deduct 시 contentId, phone, secondsUsed 필요' },
          { status: 400 }
        )
      }
      const cid = parseInt(String(contentId), 10)
      const sec = Math.max(0, parseInt(String(secondsUsed), 10))
      if (!Number.isFinite(cid)) {
        return NextResponse.json({ success: false, error: 'contentId 숫자 필요' }, { status: 400 })
      }
      const rateSeconds = Math.max(1, parseInt(String(bodyRateSec), 10) || 12)
      const rateWon = Math.max(1, parseInt(String(bodyRateWon), 10) || DEDUCT_PER_12SEC)
      const deductWan = Math.ceil(sec / rateSeconds) * rateWon
      if (deductWan <= 0) {
        const supabase = getAdminSupabaseClient()
        const { data: row } = await supabase
          .from('voice_balance')
          .select('balance_wan')
          .eq('content_id', cid)
          .eq('phone', String(phone).trim())
          .maybeSingle()
        const balance_wan = (row as any)?.balance_wan ?? 0
        return NextResponse.json({ success: true, balance_wan })
      }

      const supabase = getAdminSupabaseClient()
      const { data: row } = await supabase
        .from('voice_balance')
        .select('balance_wan')
        .eq('content_id', cid)
        .eq('phone', String(phone).trim())
        .maybeSingle()

      const current = (row as any)?.balance_wan ?? 0
      if (current < deductWan) {
        return NextResponse.json(
          { success: false, error: '잔액 부족', balance_wan: current, required: deductWan },
          { status: 402 }
        )
      }

      const nextBalance = current - deductWan

      const { error: updateError } = await supabase
        .from('voice_balance')
        .update({
          balance_wan: nextBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('content_id', cid)
        .eq('phone', String(phone).trim())

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, balance_wan: nextBalance })
    }

    return NextResponse.json({ success: false, error: 'action: charge | deduct 필요' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
