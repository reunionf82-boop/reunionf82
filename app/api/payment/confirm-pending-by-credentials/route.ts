import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'

const normalizePhone = (v: string) => String(v || '').replace(/[^0-9]/g, '')

/**
 * pending 결제를 본인정보(user_credentials)로 검증 후 success 전환
 * 재시도 시 휴대폰+비밀번호로 본인 확인되면 3203 없이 진행 가능
 * POST /api/payment/confirm-pending-by-credentials
 * body: { oid, phone, password }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const oid = String(body?.oid || '').trim()
    const phone = normalizePhone(body?.phone || '')
    const password = String(body?.password || '').trim()

    if (!oid || !phone || phone.length < 8 || !password) {
      return NextResponse.json(
        { success: false, error: '주문번호, 휴대폰 번호, 비밀번호를 확인해주세요.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()
    const requestKey = `pending_${oid}`

    const { data: credRows, error: credError } = await supabase
      .from('user_credentials')
      .select('id, request_key, encrypted_phone, encrypted_password')
      .eq('request_key', requestKey)
      .limit(1)

    if (credError || !credRows?.length) {
      return NextResponse.json(
        { success: false, error: '일치하는 본인정보가 없습니다.' },
        { status: 404 }
      )
    }

    const row = credRows[0] as { encrypted_phone: string; encrypted_password: string }
    let decryptedPhone: string
    let decryptedPassword: string
    try {
      decryptedPhone = normalizePhone(decrypt(row.encrypted_phone))
      decryptedPassword = decrypt(row.encrypted_password)
    } catch {
      return NextResponse.json(
        { success: false, error: '본인정보 확인에 실패했습니다.' },
        { status: 500 }
      )
    }

    if (decryptedPhone !== phone || decryptedPassword !== password) {
      return NextResponse.json(
        { success: false, error: '일치하는 정보가 없습니다.' },
        { status: 404 }
      )
    }

    const { data: paymentRow, error: payError } = await supabase
      .from('payments')
      .select('id, oid, content_id, user_name, phone_number, gender, status')
      .eq('oid', oid)
      .maybeSingle()

    if (payError || !paymentRow) {
      return NextResponse.json(
        { success: false, error: '결제 정보를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    if ((paymentRow as any).status !== 'pending') {
      return NextResponse.json({
        success: true,
        oid: (paymentRow as any).oid,
        contentId: (paymentRow as any).content_id,
        userName: (paymentRow as any).user_name || '',
        phoneNumber: (paymentRow as any).phone_number || '',
        gender: (paymentRow as any).gender || null
      })
    }

    const kstNow = getKSTNow()
    const { error: updateError } = await supabase
      .from('payments')
      .update({
        status: 'success',
        completed_at: kstNow,
        updated_at: kstNow
      })
      .eq('oid', oid)

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      oid: (paymentRow as any).oid,
      contentId: (paymentRow as any).content_id,
      userName: (paymentRow as any).user_name || '',
      phoneNumber: (paymentRow as any).phone_number || '',
      gender: (paymentRow as any).gender || null
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || '서버 오류' },
      { status: 500 }
    )
  }
}
