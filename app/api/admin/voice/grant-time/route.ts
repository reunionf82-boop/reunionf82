import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { normalizePhoneForBalance } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'

function requireAdmin(request: NextRequest) {
  return async () => {
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    if (!session || session.value !== 'authenticated') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    return null
  }
}

/**
 * VOC 보상 - 보유캐시 조회 (어드민)
 * GET /api/admin/voice/grant-time?contentId=123&phone=010-1234-5678  → 해당 콘텐츠 잔액
 * GET /api/admin/voice/grant-time?phone=010-1234-5678 (contentId 없음) → 해당 번호의 콘텐츠별 잔액 목록 (프론트와 불일치 시 어떤 콘텐츠에 잔액이 있는지 확인용)
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)()
  if (auth) return auth
  try {
    const contentId = request.nextUrl.searchParams.get('contentId')
    const phone = request.nextUrl.searchParams.get('phone')
    if (!phone) {
      return NextResponse.json(
        { success: false, error: 'phone 쿼리 필수입니다.' },
        { status: 400 }
      )
    }
    const phoneTrim = String(phone).trim()
    const phoneNorm = normalizePhoneForBalance(phoneTrim)
    const supabase = getAdminSupabaseClient()

    const trySelect = async (p: string) =>
      contentId != null && contentId !== ''
        ? supabase
            .from('voice_balance')
            .select('balance_wan, remaining_seconds')
            .eq('content_id', parseInt(String(contentId), 10))
            .eq('phone', p)
            .maybeSingle()
        : supabase
            .from('voice_balance')
            .select('content_id, balance_wan, remaining_seconds')
            .eq('phone', p)

    let data: any = null
    let err: any = null
    if (phoneNorm) {
      const res = await trySelect(phoneNorm)
      data = contentId != null && contentId !== '' ? res.data : (res.data as any[] ?? [])
      err = res.error
    }
    const noData = data == null || (Array.isArray(data) && data.length === 0)
    if (!err && noData && phoneTrim && phoneTrim !== phoneNorm) {
      const res = await trySelect(phoneTrim)
      data = contentId != null && contentId !== '' ? res.data : (res.data as any[] ?? [])
      err = res.error
    }
    // contentId 없이 번호만 조회 시: 정규화·trim 둘 다 조회해 합친 뒤 content_id별 최대 잔액만 사용
    if (!err && (contentId == null || contentId === '') && phoneTrim && phoneTrim !== phoneNorm && phoneNorm) {
      const [resNorm, resTrim] = await Promise.all([trySelect(phoneNorm), trySelect(phoneTrim)])
      const arrNorm = (resNorm.data as any[]) ?? []
      const arrTrim = (resTrim.data as any[]) ?? []
      const byCid = new Map<number, { content_id: number; balance_wan: number; remaining_seconds: number }>()
      for (const r of [...arrNorm, ...arrTrim]) {
        const cid = Number(r?.content_id)
        if (!Number.isFinite(cid)) continue
        const wan = Number(r?.balance_wan) || 0
        const sec = Number(r?.remaining_seconds) || 0
        const ex = byCid.get(cid)
        if (!ex || ex.balance_wan < wan) byCid.set(cid, { content_id: cid, balance_wan: wan, remaining_seconds: sec })
      }
      data = Array.from(byCid.values())
    }
    // contentId 단일 조회 시: 정규화/trim 각각 조회해 잔액이 더 큰 행 사용 (동일 번호가 형식 차이로 두 행이면 200 표시)
    if (!err && contentId != null && contentId !== '' && phoneTrim && phoneTrim !== phoneNorm && phoneNorm) {
      const [resNorm, resTrim] = await Promise.all([trySelect(phoneNorm), trySelect(phoneTrim)])
      const rowNorm = resNorm.data as any
      const rowTrim = resTrim.data as any
      const wanNorm = rowNorm?.balance_wan ?? 0
      const wanTrim = rowTrim?.balance_wan ?? 0
      if (rowTrim && wanTrim > wanNorm) data = rowTrim
      else if (rowNorm && wanNorm >= wanTrim) data = rowNorm
    }

    if (err) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 })
    }

    if (contentId != null && contentId !== '') {
      const cid = parseInt(String(contentId), 10)
      if (!Number.isFinite(cid)) {
        return NextResponse.json({ success: false, error: 'contentId는 숫자여야 합니다.' }, { status: 400 })
      }
      const row = data
      const balance_wan = (row as any)?.balance_wan ?? 0
      const remaining_seconds = (row as any)?.remaining_seconds ?? 0
      return NextResponse.json({
        success: true,
        balance_wan,
        remaining_seconds,
        found: row != null,
      })
    }

    const rows = Array.isArray(data) ? data : []
    // 동일 content_id가 전화번호 형식 차이(하이픈 유무 등)로 여러 행이면, 잔액이 큰 것 하나만 사용 (프론트·어드민 불일치 방지)
    const byContentId = new Map<number, { content_id: number; balance_wan: number; remaining_seconds: number }>()
    for (const r of rows) {
      const cid = Number((r as any).content_id)
      if (!Number.isFinite(cid)) continue
      const wan = Number((r as any).balance_wan) || 0
      const sec = Number((r as any).remaining_seconds) || 0
      const existing = byContentId.get(cid)
      if (!existing || existing.balance_wan < wan) {
        byContentId.set(cid, { content_id: cid, balance_wan: wan, remaining_seconds: sec })
      }
    }
    const deduped = Array.from(byContentId.values())
    return NextResponse.json({
      success: true,
      by_content: deduped.map((r) => ({
        content_id: r.content_id,
        balance_wan: r.balance_wan,
        remaining_seconds: r.remaining_seconds,
      })),
      found: deduped.length > 0,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}

/**
 * VOC 보상: 관리자가 고객에게 캐시(원) 충전 또는 차감
 * POST /api/admin/voice/grant-time
 * body: { contentId: number, phone: string, cache_won?: number, action?: 'add'|'deduct', reason?: string }
 * - action 'add' 또는 생략: 기존 보유캐시에 더하기 (cache_won 필수)
 * - action 'deduct': 기존 보유캐시에서 빼기 (cache_won 필수, 결과는 0 미만이 되지 않음)
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)()
  if (auth) return auth
  try {
    const body = await request.json().catch(() => ({}))
    const contentId = body?.contentId
    const phone = body?.phone
    const cache = body?.cache_won ?? body?.cache ?? body?.minutes
    const reason = body?.reason
    const action = body?.action === 'deduct' ? 'deduct' : 'add'

    if (contentId == null || !phone) {
      return NextResponse.json(
        { success: false, error: 'contentId, phone 필수입니다.' },
        { status: 400 }
      )
    }
    const cid = parseInt(String(contentId), 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ success: false, error: 'contentId는 숫자여야 합니다.' }, { status: 400 })
    }
    const wan = Math.max(0, Math.floor(Number(cache) || 0))
    if (wan <= 0) {
      return NextResponse.json(
        { success: false, error: action === 'deduct' ? '차감할 캐시(원)를 1 이상 입력해주세요.' : '충전할 캐시(원)를 1 이상 입력해주세요.' },
        { status: 400 }
      )
    }

    const phoneStr = String(phone).trim()
    const phoneNorm = normalizePhoneForBalance(phoneStr) || phoneStr
    const supabase = getAdminSupabaseClient()

    if (action === 'deduct') {
      const tryRow = async (p: string) => supabase
        .from('voice_balance')
        .select('balance_wan, remaining_seconds')
        .eq('content_id', cid)
        .eq('phone', p)
        .maybeSingle()
      let row: any = null
      let selectError: any = null
      const r1 = await tryRow(phoneNorm)
      if (r1.data) row = r1.data; else selectError = r1.error
      if (!row && phoneStr !== phoneNorm) {
        const r2 = await tryRow(phoneStr)
        if (r2.data) row = r2.data; else selectError = r2.error
      }
      if (selectError) {
        return NextResponse.json({ success: false, error: selectError.message }, { status: 500 })
      }
      const currentWan = (row as any)?.balance_wan ?? 0
      const newBalanceWan = Math.max(0, currentWan - wan)
      const { error: upsertError } = await supabase
        .from('voice_balance')
        .upsert(
        {
          content_id: cid,
          phone: phoneNorm,
          balance_wan: newBalanceWan,
          remaining_seconds: (row as any)?.remaining_seconds ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'content_id,phone' }
        )
      if (upsertError) {
        return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        balance_wan: newBalanceWan,
        deducted_wan: wan,
        message: `-${wan}캐시 차감 완료. 보유캐시 ${newBalanceWan}캐시`,
      })
    }

    // action === 'add' (기존 충전 로직)
    const addWan = wan

    // 1) 원자적 증가 RPC 사용 (supabase-voice-balance-grant-add.sql 적용 시)
    const { data: rpcData, error: rpcError } = await supabase.rpc('voice_balance_add_wan', {
      p_content_id: cid,
      p_phone: phoneNorm,
      p_add_wan: addWan,
    })
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0 && typeof (rpcData[0] as any)?.new_balance_wan === 'number') {
      const newBalanceWan = (rpcData[0] as any).new_balance_wan
      if (reason !== undefined && typeof reason === 'string' && reason.trim()) {
        try {
          await supabase.from('voice_balance_grant_log').insert({
            content_id: cid,
            phone: phoneNorm,
            granted_wan: addWan,
            reason: reason.trim().slice(0, 500),
            created_at: new Date().toISOString(),
          })
        } catch {
          /* 테이블 없으면 무시 */
        }
      }
      return NextResponse.json({
        success: true,
        balance_wan: newBalanceWan,
        granted_wan: addWan,
        message: `+${addWan}캐시 충전 완료. 보유캐시 ${newBalanceWan}캐시`,
      })
    }

    // 2) RPC 없을 때 폴백: 기존 잔액 조회 후 더해서 upsert (반드시 더하기)
    const tryRow = (p: string) => supabase
      .from('voice_balance')
      .select('balance_wan, remaining_seconds')
      .eq('content_id', cid)
      .eq('phone', p)
      .maybeSingle()
    let row: any = null
    let selectError: any = null
    const r1 = await tryRow(phoneNorm)
    if (r1.data) row = r1.data; else selectError = r1.error
    if (!row && phoneStr !== phoneNorm) {
      const r2 = await tryRow(phoneStr)
      if (r2.data) row = r2.data; else selectError = r2.error
    }

    if (selectError) {
      return NextResponse.json({ success: false, error: selectError.message }, { status: 500 })
    }

    const currentWan = (row as any)?.balance_wan ?? 0
    const newBalanceWan = currentWan + addWan

    const { error: upsertError } = await supabase
      .from('voice_balance')
      .upsert(
        {
          content_id: cid,
          phone: phoneNorm,
          balance_wan: newBalanceWan,
          remaining_seconds: (row as any)?.remaining_seconds ?? 0,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'content_id,phone' }
      )

    if (upsertError) {
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
    }

    if (reason !== undefined && typeof reason === 'string' && reason.trim()) {
      try {
        await supabase.from('voice_balance_grant_log').insert({
          content_id: cid,
          phone: phoneNorm,
          granted_wan: addWan,
          reason: reason.trim().slice(0, 500),
          created_at: new Date().toISOString(),
        })
      } catch {
        /* 테이블 없으면 무시 */
      }
    }

    return NextResponse.json({
      success: true,
      balance_wan: newBalanceWan,
      granted_wan: addWan,
      message: `+${addWan}캐시 충전 완료. 보유캐시 ${newBalanceWan}캐시`,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
