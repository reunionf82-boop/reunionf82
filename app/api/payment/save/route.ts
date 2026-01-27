import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

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
    const missingPay = pay === undefined || pay === null || Number.isNaN(Number(pay))
    if (!oid || !contentId || !paymentCode || !name || missingPay || !paymentType) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // ⚠️ 요청에 따라 암호화 없이 원문 저장
    const plainUserName: string | null = userName ? String(userName) : null
    const plainPhoneNumber: string | null = phoneNumber ? String(phoneNumber) : null

    // 결제 정보 저장 (Upsert로 변경하여 중복 방지 및 상태 업데이트)
    const paymentStatus = status || 'pending' // 기본값을 pending으로 변경
    const kstNow = getKSTNow()
    
    // 기존 레코드 존재 여부 확인 (created_at 보존을 위해)
    const { data: existingRecord } = await supabase
      .from('payments')
      .select('id, created_at')
      .eq('oid', oid)
      .maybeSingle()
    
    const upsertData: any = {
      oid,
      content_id: contentId,
      payment_code: String(paymentCode).slice(0, 4),
      name: name?.substring(0, 200),
      pay: parseInt(String(pay)),
      payment_type: paymentType,
      user_name: plainUserName,
      phone_number: plainPhoneNumber,
      gender: gender === 'male' || gender === 'female' ? gender : null,
      status: paymentStatus,
      updated_at: kstNow // KST 기준으로 저장 (트리거보다 명시적 값이 우선)
    }
    
    // 새 레코드인 경우에만 created_at 설정 (KST 기준)
    if (!existingRecord) {
      upsertData.created_at = kstNow
    }
    // 기존 레코드인 경우 created_at은 유지 (설정하지 않음)
    
    // success 상태일 때만 completed_at 설정 (KST 기준)
    if (paymentStatus === 'success') {
      upsertData.completed_at = kstNow
    }
    
    // 1) 우선 Upsert 시도 (oid UNIQUE 제약이 있을 때 가장 안정적/빠름)
    let data: any = null
    let error: any = null
    {
      const res = await supabase
        .from('payments')
        .upsert(upsertData, { onConflict: 'oid' }) // oid가 같으면 업데이트
        .select()
        .single()
      data = res.data
      error = res.error
    }

    // 2) 만약 DB에 UNIQUE 제약이 없어서 upsert가 실패(42P10)하는 경우:
    //    select → 있으면 update / 없으면 insert 로 우회
    if (error?.code === '42P10') {

      const { data: existingRows, error: existingError } = await supabase
        .from('payments')
        .select('id')
        .eq('oid', oid)
        .limit(1)

      if (existingError) {

        return NextResponse.json(
          { success: false, error: existingError.message || '결제 정보 저장에 실패했습니다.' },
          { status: 500 }
        )
      }

      if (existingRows && existingRows.length > 0) {
        const upd = await supabase
          .from('payments')
          .update(upsertData)
          .eq('oid', oid)
          .select()
          .single()
        data = upd.data
        error = upd.error
      } else {
        const ins = await supabase
          .from('payments')
          .insert(upsertData)
          .select()
          .single()
        data = ins.data
        error = ins.error
      }
    }

    if (error) {

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

    return NextResponse.json(
      { success: false, error: error.message || '결제 정보 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
