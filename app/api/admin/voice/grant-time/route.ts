import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * VOC 보상: 관리자가 고객에게 음성형·다자형 이용 시간을 충전(부여)
 * POST /api/admin/voice/grant-time
 * body: { contentId: number, phone: string, minutes: number, reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    if (!session || session.value !== 'authenticated') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const contentId = body?.contentId
    const phone = body?.phone
    const minutes = body?.minutes
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
    const addSec = Math.max(0, Math.min(24 * 60 * 60, Math.floor(Number(minutes) || 0) * 60)) // 최대 24시간
    if (addSec <= 0) {
      return NextResponse.json(
        { success: false, error: '충전할 시간(분)을 1 이상 입력해주세요.' },
        { status: 400 }
      )
    }

    const phoneStr = String(phone).trim()
    const supabase = getAdminSupabaseClient()

    const { data: row, error: selectError } = await supabase
      .from('voice_balance')
      .select('balance_wan, remaining_seconds')
      .eq('content_id', cid)
      .eq('phone', phoneStr)
      .maybeSingle()

    if (selectError) {
      return NextResponse.json({ success: false, error: selectError.message }, { status: 500 })
    }

    const existedInDb = row != null
    const currentWan = (row as any)?.balance_wan ?? 0
    const currentRem = (row as any)?.remaining_seconds ?? 0
    const newRemainingSeconds = currentRem + addSec

    const { error: upsertError } = await supabase
      .from('voice_balance')
      .upsert(
        {
          content_id: cid,
          phone: phoneStr,
          balance_wan: currentWan,
          remaining_seconds: newRemainingSeconds,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'content_id,phone' }
      )

    if (upsertError) {
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
    }

    // 로그용 (선택): voice_balance_grant_log 테이블이 있으면 기록
    if (reason !== undefined && typeof reason === 'string' && reason.trim()) {
      try {
        await supabase.from('voice_balance_grant_log').insert({
          content_id: cid,
          phone: phoneStr,
          granted_seconds: addSec,
          reason: reason.trim().slice(0, 500),
          created_at: new Date().toISOString(),
        })
      } catch {
        // 테이블 없으면 무시
      }
    }

    return NextResponse.json({
      success: true,
      remaining_seconds: newRemainingSeconds,
      granted_seconds: addSec,
      existed_in_db: existedInDb,
      message: existedInDb
        ? `${addSec / 60}분 충전 완료. 잔여시간 ${Math.floor(newRemainingSeconds / 60)}분`
        : 'DB에 없습니다. 전화번호를 다시 확인하세요.',
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
