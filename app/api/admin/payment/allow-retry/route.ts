import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * 결제 재시도 예외 허용 (12시간 경과 후에도 점사보기 허용)
 * POST /api/admin/payment/allow-retry
 * body: { oid: string, hours?: number }  (hours 기본값 24)
 */
export async function POST(request: NextRequest) {
  try {
    const cookies = await request.cookies
    const session = cookies.get('admin_session')?.value
    if (!session || session !== 'authenticated') {
      return NextResponse.json({ success: false, error: '관리자 로그인이 필요합니다.' }, { status: 401 })
    }

    const body = await request.json()
    const oid = String(body?.oid || '').trim()
    const hours = Number(body?.hours)
    const validHours = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 720) : 24 // 최대 30일

    if (!oid) {
      return NextResponse.json({ success: false, error: '주문번호(oid)를 입력해 주세요.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    const now = new Date()
    const allowedUntil = new Date(now.getTime() + validHours * 60 * 60 * 1000)

    const { error } = await supabase
      .from('payment_retry_allowances')
      .upsert(
        {
          oid,
          allowed_until: allowedUntil.toISOString(),
          updated_at: now.toISOString()
        },
        { onConflict: 'oid' }
      )

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || '저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      oid,
      allowedUntil: allowedUntil.toISOString(),
      hours: validHours
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '서버 오류' },
      { status: 500 }
    )
  }
}
