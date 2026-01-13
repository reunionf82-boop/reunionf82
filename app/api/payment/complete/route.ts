import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * 결제 완료 처리 API (성공 페이지에서 호출)
 * POST /api/payment/complete
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { oid } = body

    if (!oid) {
      return NextResponse.json({ success: false, error: '주문번호가 없습니다.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    
    // 먼저 기존 레코드 확인
    const { data: existingData, error: checkError } = await supabase
      .from('payments')
      .select('*')
      .eq('oid', oid)
      .single()
    
    // 상태를 success로 업데이트 (upsert로 변경하여 데이터가 없어도 생성)
    // 기존 레코드가 있으면 업데이트, 없으면 최소한의 정보로 생성
    const updateData: any = {
      oid,
      status: 'success',
      completed_at: new Date().toISOString()
    }
    
    // 기존 레코드가 있으면 기존 필드 유지
    if (existingData && !checkError) {
      // 기존 데이터의 필드들을 유지하면서 status만 업데이트
      Object.keys(existingData).forEach(key => {
        if (key !== 'status' && key !== 'completed_at' && existingData[key] !== null) {
          updateData[key] = existingData[key]
        }
      })
    }
    
    const { data, error } = await supabase
      .from('payments')
      .upsert(updateData, { onConflict: 'oid' })
      .select()
      .single()

    if (error) {
      console.error('[결제 완료 처리] DB 업데이트 오류:', error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    if (!data) {
      console.error('[결제 완료 처리] 데이터가 없음:', oid)
      return NextResponse.json({ success: false, error: '결제 정보를 찾을 수 없습니다.' }, { status: 404 })
    }
    
    console.log('[결제 완료 처리] DB 업데이트 성공:', { oid, status: data.status, hasContentId: !!data.content_id })

    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('[결제 완료 처리] 오류:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
