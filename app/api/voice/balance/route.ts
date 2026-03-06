import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { normalizePhoneForBalance } from '@/lib/payment-utils'

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

    const phoneTrim = String(phone).trim()
    const phoneNorm = normalizePhoneForBalance(phoneTrim)
    const supabase = getAdminSupabaseClient()
    // 조회: 숫자만 정규화·trim 둘 다 시도 후, 같은 content_id면 잔액 큰 쪽 사용 (형식별 중복 행 시 프론트·어드민 불일치 방지)
    let data: any = null
    let err: any = null
    const run = (p: string) =>
      supabase
        .from('voice_balance')
        .select('balance_wan, remaining_seconds')
        .eq('content_id', cid)
        .eq('phone', p)
        .maybeSingle()
    if (phoneNorm) {
      const res = await run(phoneNorm)
      data = res.data
      err = res.error
    }
    if (!err && phoneTrim && phoneTrim !== phoneNorm) {
      const res = await run(phoneTrim)
      if (res.error) err = res.error
      else if (res.data) {
        const a = (data as any)?.balance_wan ?? 0
        const b = (res.data as any)?.balance_wan ?? 0
        if (b > a) data = res.data
      } else if (!data) {
        data = res.data
      }
    }
    if (err) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }

    const balance_wan = (data as any)?.balance_wan ?? 0
    const remaining_seconds = (data as any)?.remaining_seconds ?? 0
    return NextResponse.json({ success: true, balance_wan, remaining_seconds })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}

/**
 * 충전(charge): 결제 성공 건 확인 후 잔액 추가
 * 차감(deduct): 사용 시간을 rate_seconds 단위로 올림 후 rate_won원씩 차감 (1초만 넘겨도 1블록 전체 차감)
 *
 * POST /api/voice/balance
 * - charge: { action: 'charge', oid, contentId, phone [, amount_wan ] } — amount_wan 있으면 해당 캐시 충전, 없으면 결제금액(pay) 사용
 * - deduct: { action: 'deduct', contentId, phone, secondsUsed [, rate_seconds, rate_won ] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body?.action

    if (action === 'charge') {
      const { oid, contentId, phone, amount_wan: bodyAmountWan } = body
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

      // 충전캐시: 클라이언트가 amount_wan 전달 시 해당 값 사용(PG 결제금액과 별도), 없으면 결제금액(pay) 사용
      const amountToAdd =
        typeof bodyAmountWan === 'number' && Number.isFinite(bodyAmountWan) && bodyAmountWan > 0
          ? Math.floor(bodyAmountWan)
          : Math.floor(payAmount)

      const phoneTrim = String(phone).trim()
      const phoneStr = normalizePhoneForBalance(phoneTrim) || phoneTrim

      // 멱등성: 동일 oid로 이미 충전된 적 있으면 잔액만 반환 (중복 충전 방지)
      const { error: logError } = await supabase
        .from('voice_balance_charge_log')
        .insert({
          oid: String(oid),
          content_id: cid,
          phone: phoneStr,
          amount_wan: amountToAdd,
        })

      if (logError) {
        if (logError.code === '23505') {
          // unique_violation: 이미 충전된 oid → 현재 잔액만 반환 (정규화·trim 둘 다 시도)
          const tryRow = (p: string) => supabase.from('voice_balance').select('balance_wan').eq('content_id', cid).eq('phone', p).maybeSingle()
          let row: any = null
          const r1 = await tryRow(phoneStr)
          if (r1.data) row = r1.data
          if (!row && String(phone).trim() !== phoneStr) {
            const r2 = await tryRow(String(phone).trim())
            if (r2.data) row = r2.data
          }
          const current = (row as any)?.balance_wan ?? 0
          return NextResponse.json({ success: true, balance_wan: current })
        }
        if (logError.code === '42P01') {
          // undefined_table: 마이그레이션 미적용 시 기존 동작 유지
        } else {
          return NextResponse.json({ success: false, error: logError.message }, { status: 500 })
        }
      }

      const { data: row } = await supabase
        .from('voice_balance')
        .select('balance_wan')
        .eq('content_id', cid)
        .eq('phone', phoneStr)
        .maybeSingle()
      const current = (row as any)?.balance_wan ?? 0
      const nextBalance = current + amountToAdd

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

    if (action === 'save_remaining') {
      const { contentId, phone, remainingSeconds } = body
      if (contentId == null || !phone || remainingSeconds == null) {
        return NextResponse.json(
          { success: false, error: 'save_remaining 시 contentId, phone, remainingSeconds 필요' },
          { status: 400 }
        )
      }
      const cid = parseInt(String(contentId), 10)
      const sec = Math.max(0, parseInt(String(remainingSeconds), 10))
      if (!Number.isFinite(cid)) {
        return NextResponse.json({ success: false, error: 'contentId 숫자 필요' }, { status: 400 })
      }
      const phoneTrim = String(phone).trim()
      const phoneStr = normalizePhoneForBalance(phoneTrim) || phoneTrim
      const supabase = getAdminSupabaseClient()
      const tryRow = (p: string) => supabase.from('voice_balance').select('balance_wan').eq('content_id', cid).eq('phone', p).maybeSingle()
      let row: any = null
      const r1 = await tryRow(phoneStr)
      if (r1.data) row = r1.data
      if (!row && phoneTrim !== phoneStr) {
        const r2 = await tryRow(phoneTrim)
        if (r2.data) row = r2.data
      }
      const currentWan = (row as any)?.balance_wan ?? 0
      const { error: upsertError } = await supabase
        .from('voice_balance')
        .upsert(
          {
            content_id: cid,
            phone: phoneStr,
            balance_wan: currentWan,
            remaining_seconds: sec,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'content_id,phone' }
        )
      if (upsertError) {
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, remaining_seconds: sec })
    }

    if (action === 'consume_remaining') {
      const { contentId, phone } = body
      if (contentId == null || !phone) {
        return NextResponse.json(
          { success: false, error: 'consume_remaining 시 contentId, phone 필요' },
          { status: 400 }
        )
      }
      const cid = parseInt(String(contentId), 10)
      if (!Number.isFinite(cid)) {
        return NextResponse.json({ success: false, error: 'contentId 숫자 필요' }, { status: 400 })
      }
      const phoneTrim = String(phone).trim()
      const phoneStr = normalizePhoneForBalance(phoneTrim) || phoneTrim
      const supabase = getAdminSupabaseClient()
      const tryRow = (p: string) => supabase.from('voice_balance').select('balance_wan, remaining_seconds').eq('content_id', cid).eq('phone', p).maybeSingle()
      let row: any = null
      const r1 = await tryRow(phoneStr)
      if (r1.data) row = r1.data
      if (!row && phoneTrim !== phoneStr) {
        const r2 = await tryRow(phoneTrim)
        if (r2.data) row = r2.data
      }
      const currentWan = (row as any)?.balance_wan ?? 0
      const { error: updateError } = await supabase
        .from('voice_balance')
        .update({
          remaining_seconds: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('content_id', cid)
        .eq('phone', phoneStr)
      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, remaining_seconds: 0, balance_wan: currentWan })
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
      const phoneTrim = String(phone).trim()
      const phoneStr = normalizePhoneForBalance(phoneTrim) || phoneTrim
      const rateSeconds = Math.max(1, parseInt(String(bodyRateSec), 10) || 12)
      const rateWon = Math.max(1, parseInt(String(bodyRateWon), 10) || DEDUCT_PER_12SEC)
      const deductWan = Math.ceil(sec / rateSeconds) * rateWon
      const supabase = getAdminSupabaseClient()
      const tryRow = (p: string) => supabase.from('voice_balance').select('balance_wan').eq('content_id', cid).eq('phone', p).maybeSingle()
      if (deductWan <= 0) {
        let row: any = null
        const r1 = await tryRow(phoneStr)
        if (r1.data) row = r1.data
        if (!row && phoneTrim !== phoneStr) {
          const r2 = await tryRow(phoneTrim)
          if (r2.data) row = r2.data
        }
        const balance_wan = (row as any)?.balance_wan ?? 0
        return NextResponse.json({ success: true, balance_wan })
      }

      let row: any = null
      const r1 = await tryRow(phoneStr)
      if (r1.data) row = r1.data
      if (!row && phoneTrim !== phoneStr) {
        const r2 = await tryRow(phoneTrim)
        if (r2.data) row = r2.data
      }

      const current = (row as any)?.balance_wan ?? 0
      // VOC 보상 등으로 차감 단위(rate_won)보다 적게 남은 경우: 남은 금액 전부 1블록으로 차감 후 정상 종료 (시스템 팝업 없음)
      const amountToDeduct = current >= deductWan ? deductWan : (current > 0 ? current : 0)
      if (amountToDeduct <= 0) {
        return NextResponse.json({ success: true, balance_wan: current })
      }

      const nextBalance = current - amountToDeduct

      const { error: updateError } = await supabase
        .from('voice_balance')
        .update({
          balance_wan: nextBalance,
          updated_at: new Date().toISOString(),
        })
        .eq('content_id', cid)
        .eq('phone', phoneStr)

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, balance_wan: nextBalance })
    }

    // 이탈 시 남은 잔액·잔여시간 전부 소진 (연장 결제 잔여가 차감 단위 미만일 때 등)
    if (action === 'drain_balance') {
      const { contentId, phone } = body
      if (contentId == null || !phone) {
        return NextResponse.json(
          { success: false, error: 'drain_balance 시 contentId, phone 필요' },
          { status: 400 }
        )
      }
      const cid = parseInt(String(contentId), 10)
      if (!Number.isFinite(cid)) {
        return NextResponse.json({ success: false, error: 'contentId 숫자 필요' }, { status: 400 })
      }
      const phoneTrim = String(phone).trim()
      const phoneStr = normalizePhoneForBalance(phoneTrim) || phoneTrim
      const supabase = getAdminSupabaseClient()
      const tryRow = (p: string) => supabase.from('voice_balance').select('phone').eq('content_id', cid).eq('phone', p).maybeSingle()
      let row: any = null
      const r1 = await tryRow(phoneStr)
      if (r1.data) row = r1.data
      if (!row && phoneTrim !== phoneStr) {
        const r2 = await tryRow(phoneTrim)
        if (r2.data) row = r2.data
      }
      const targetPhone = row ? (row as any).phone : phoneStr
      const { error: updateError } = await supabase
        .from('voice_balance')
        .update({
          balance_wan: 0,
          remaining_seconds: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('content_id', cid)
        .eq('phone', targetPhone)
      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, balance_wan: 0, remaining_seconds: 0 })
    }

    return NextResponse.json({ success: false, error: 'action: charge | deduct | drain_balance 필요' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
