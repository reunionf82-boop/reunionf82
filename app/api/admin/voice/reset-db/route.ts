import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * 음성형 서비스 정식 런칭용 DB 초기화
 * voice_balance, voice_balance_charge_log, voice_balance_grant_log(있으면),
 * voice_summary_asked, voice_conversation_summaries 테이블 전체 삭제
 * POST /api/admin/voice/reset-db
 * body: { confirm: '음성형 초기화' } 필수
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    if (!session || session.value !== 'authenticated') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const confirm = body?.confirm
    if (confirm !== '음성형 초기화') {
      return NextResponse.json(
        { success: false, error: 'body.confirm 값이 "음성형 초기화"와 정확히 일치해야 합니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // voice_balance: 모든 행 삭제 (content_id >= 0 으로 전체 매칭)
    const { error: errBalance } = await supabase
      .from('voice_balance')
      .delete()
      .gte('content_id', 0)

    if (errBalance) {
      return NextResponse.json(
        { success: false, error: `voice_balance 초기화 실패: ${errBalance.message}` },
        { status: 500 }
      )
    }

    // voice_balance_charge_log: 모든 행 삭제 (content_id >= 0)
    const { error: errChargeLog } = await supabase
      .from('voice_balance_charge_log')
      .delete()
      .gte('content_id', 0)

    if (errChargeLog) {
      // 테이블 없을 수 있음 (마이그레이션 미적용)
      if (errChargeLog.code !== '42P01') {
        return NextResponse.json(
          { success: false, error: `voice_balance_charge_log 초기화 실패: ${errChargeLog.message}` },
          { status: 500 }
        )
      }
    }

    // voice_balance_grant_log: 테이블 있으면 전체 삭제 (테이블 없으면 무시)
    try {
      const { error: errGrantLog } = await supabase
        .from('voice_balance_grant_log')
        .delete()
        .gte('content_id', 0)
      const grantLogMsg = errGrantLog?.message || ''
      const isMissingTable =
        errGrantLog?.code === '42P01' ||
        /schema cache|find the table|voice_balance_grant_log|does not exist/i.test(grantLogMsg)
      if (errGrantLog && !isMissingTable) {
        return NextResponse.json(
          { success: false, error: `voice_balance_grant_log 초기화 실패: ${grantLogMsg}` },
          { status: 500 }
        )
      }
    } catch (grantLogErr: any) {
      const msg = grantLogErr?.message || ''
      if (!/schema cache|find the table|voice_balance_grant_log|does not exist/i.test(msg)) {
        return NextResponse.json(
          { success: false, error: `voice_balance_grant_log 초기화 실패: ${msg}` },
          { status: 500 }
        )
      }
    }

    // voice_summary_asked: FK로 voice_conversation_summaries 참조 → 먼저 삭제
    const { error: errAsked } = await supabase.from('voice_summary_asked').delete().gte('id', 0)
    if (errAsked && errAsked.code !== '42P01') {
      return NextResponse.json(
        { success: false, error: `voice_summary_asked 초기화 실패: ${errAsked.message}` },
        { status: 500 }
      )
    }

    // voice_conversation_summaries: 대화 요약(안부 문맥) 전체 삭제
    const { error: errSummaries } = await supabase
      .from('voice_conversation_summaries')
      .delete()
      .gte('id', 0)
    if (errSummaries && errSummaries.code !== '42P01') {
      return NextResponse.json(
        { success: false, error: `voice_conversation_summaries 초기화 실패: ${errSummaries.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message:
        '음성형 관련 테이블(voice_balance, voice_balance_charge_log, voice_balance_grant_log, voice_summary_asked, voice_conversation_summaries)이 초기화되었습니다.',
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
