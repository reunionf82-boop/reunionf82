import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

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
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oid, contentId, paymentCode, name, pay, paymentType, userName, phoneNumber } = body

    // 필수 파라미터 검증
    if (!oid || !contentId || !paymentCode || !name || !pay || !paymentType) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터가 누락되었습니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // 결제 정보 저장
    const { data, error } = await supabase
      .from('payments')
      .insert({
        oid,
        content_id: contentId,
        payment_code: paymentCode,
        name: name.substring(0, 200), // 최대 200자
        pay: parseInt(pay.toString()),
        payment_type: paymentType,
        user_name: userName || null,
        phone_number: phoneNumber || null,
        status: 'success',
        completed_at: new Date().toISOString()
      })
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
