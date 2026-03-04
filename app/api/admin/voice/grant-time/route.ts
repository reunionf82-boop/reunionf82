import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

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
 * GET /api/admin/voice/grant-time?contentId=123&phone=010-1234-5678
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)()
  if (auth) return auth
  try {
    const contentId = request.nextUrl.searchParams.get('contentId')
    const phone = request.nextUrl.searchParams.get('phone')
    if (!contentId || !phone) {
      return NextResponse.json(
        { success: false, error: 'contentId, phone 쿼리 필수입니다.' },
        { status: 400 }
      )
    }
    const cid = parseInt(String(contentId), 10)
    if (!Number.isFinite(cid)) {
      return NextResponse.json({ success: false, error: 'contentId는 숫자여야 합니다.' }, { status: 400 })
    }
    const phoneStr = String(phone).trim()
    const supabase = getAdminSupabaseClient()
    const { data: row, error } = await supabase
      .from('voice_balance')
      .select('balance_wan, remaining_seconds')
      .eq('content_id', cid)
      .eq('phone', phoneStr)
      .maybeSingle()
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    const balance_wan = (row as any)?.balance_wan ?? 0
    const remaining_seconds = (row as any)?.remaining_seconds ?? 0
    return NextResponse.json({
      success: true,
      balance_wan,
      remaining_seconds,
      found: row != null,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}

/**
 * VOC 보상: 관리자가 고객에게 캐시(원) 충전 (기존 보유캐시에 더하기)
 * POST /api/admin/voice/grant-time
 * body: { contentId: number, phone: string, cache: number, reason?: string }
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
    const addWan = Math.max(0, Math.floor(Number(cache) || 0))
    if (addWan <= 0) {
      return NextResponse.json(
        { success: false, error: '충전할 캐시(원)를 1 이상 입력해주세요.' },
        { status: 400 }
      )
    }

    const phoneStr = String(phone).trim()
    const supabase = getAdminSupabaseClient()

    // 1) 원자적 증가 RPC 사용 (supabase-voice-balance-grant-add.sql 적용 시)
    const { data: rpcData, error: rpcError } = await supabase.rpc('voice_balance_add_wan', {
      p_content_id: cid,
      p_phone: phoneStr,
      p_add_wan: addWan,
    })
    if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0 && typeof (rpcData[0] as any)?.new_balance_wan === 'number') {
      const newBalanceWan = (rpcData[0] as any).new_balance_wan
      if (reason !== undefined && typeof reason === 'string' && reason.trim()) {
        try {
          await supabase.from('voice_balance_grant_log').insert({
            content_id: cid,
            phone: phoneStr,
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
    const { data: row, error: selectError } = await supabase
      .from('voice_balance')
      .select('balance_wan, remaining_seconds')
      .eq('content_id', cid)
      .eq('phone', phoneStr)
      .maybeSingle()

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
          phone: phoneStr,
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
          phone: phoneStr,
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
