import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { encrypt } from '@/lib/encryption'

/**
 * 결제 정보 저장 API
 * POST /api/payment/save
 * 
 * 요청 본문:
 * - oid: string (주문번호)
 * - contentId: number
 * - paymentCode: string
 * - name: string
 * - pay: number
 * - paymentType: 'card' | 'mobile'
 * - userName: string
 * - phoneNumber: string
 * - gender?: 'male' | 'female' | null
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oid, contentId, paymentCode, name, pay, paymentType, userName, phoneNumber, gender, status } = body

    // 필수 파라미터 검증 (status가 update일 땐 일부 생략 가능하지만 일단 단순화)
    // if (!oid || !contentId || !paymentCode || !name || !pay || !paymentType) {
    // pending 저장 시에는 결제 정보가 다 있지만, update 시에는 oid만 있을 수도 있음.
    // 여기서는 pending 저장용으로 다 받는다고 가정.
    if (!oid || !contentId || !paymentCode || !name || !pay || !paymentType) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // user_name과 phone_number 암호화
    let encryptedUserName: string | null = null
    let encryptedPhoneNumber: string | null = null
    
    try {
      if (userName) {
        encryptedUserName = encrypt(userName)
      }
      if (phoneNumber) {
        encryptedPhoneNumber = encrypt(phoneNumber)
      }
    } catch (encryptError: any) {
      console.error('[결제 정보 저장] 암호화 오류:', encryptError)
      return NextResponse.json(
        { success: false, error: '암호화 중 오류가 발생했습니다.', details: encryptError.message },
        { status: 500 }
      )
    }

    // 결제 정보 저장 (Upsert로 변경하여 중복 방지 및 상태 업데이트)
    const { data, error } = await supabase
      .from('payments')
      .upsert({
        oid,
        content_id: contentId,
        payment_code: paymentCode,
        name: name?.substring(0, 200),
        pay: pay ? parseInt(pay.toString()) : 0,
        payment_type: paymentType,
        user_name: encryptedUserName,
        phone_number: encryptedPhoneNumber,
        gender: gender === 'male' || gender === 'female' ? gender : null,
        status: status || 'success',
        completed_at: new Date().toISOString()
      }, { onConflict: 'oid' }) // oid가 같으면 업데이트
      .select()
      .single()

    if (error) {
      console.error('[결제 정보 저장] 오류:', error)
      return NextResponse.json(
        { success: false, error: error.message || '결제 정보 저장에 실패했습니다.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    console.error('[결제 정보 저장] 오류:', error)
    return NextResponse.json(
      { success: false, error: error.message || '결제 정보 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
