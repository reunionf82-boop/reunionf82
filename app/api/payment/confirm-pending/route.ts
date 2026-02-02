import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'

/** 관리자 확인용 비밀번호: pending 결제를 success로 전환할 때 사용 */
const PENDING_CONFIRM_PASSWORD = process.env.PENDING_CONFIRM_PASSWORD || '3203'

const normalizePhone = (v: string) => String(v || '').replace(/[^0-9]/g, '')

/**
 * 결제는 완료됐으나 status가 pending으로 남은 경우, 관리자 확인 비밀번호로 success 전환
 * POST /api/payment/confirm-pending
 * body: { phone, password }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const phone = normalizePhone(body?.phone || '')
    const password = String(body?.password || '').trim()

    if (!phone || phone.length < 8) {
      return NextResponse.json(
        { success: false, error: '휴대폰 번호를 확인해주세요.' },
        { status: 400 }
      )
    }

    if (password !== PENDING_CONFIRM_PASSWORD) {
      return NextResponse.json(
        { success: false, error: '일치하는 정보가 없습니다.' },
        { status: 404 }
      )
    }

    const supabase = getAdminSupabaseClient()

    const { data: rows, error } = await supabase
      .from('payments')
      .select('id, oid, content_id, user_name, phone_number, gender, status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    const match = (rows || []).find(
      (r: any) => normalizePhone(r.phone_number || '') === phone
    )

    if (!match) {
      return NextResponse.json(
        { success: false, error: '확인된 pending 결제가 없습니다.' },
        { status: 404 }
      )
    }

    const kstNow = getKSTNow()
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: 'success',
        completed_at: kstNow,
        updated_at: kstNow
      })
      .eq('oid', match.oid)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      oid: match.oid,
      contentId: match.content_id,
      userName: match.user_name || '',
      phoneNumber: match.phone_number || '',
      gender: match.gender || null
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류' },
      { status: 500 }
    )
  }
}
