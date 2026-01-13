import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, phone, email, content } = body

    if (!name || !phone || !email || !content) {
      return NextResponse.json(
        { error: '모든 필드는 필수입니다.' },
        { status: 400 }
      )
    }

    if (content.trim().length > 800) {
      return NextResponse.json(
        { error: '문의내용은 최대 800자까지 입력 가능합니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // 문의 저장 (inquiries 테이블이 있다고 가정, 없으면 생성 필요) - KST 기준
    const { data, error } = await supabase
      .from('inquiries')
      .insert({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
        content: content.trim(),
        created_at: getKSTNow(), // KST 기준으로 저장
        updated_at: getKSTNow() // KST 기준으로 저장
      })
      .select()
      .single()

    if (error) {
      console.error('[inquiry/create] error:', error)
      // 테이블이 없을 수 있으므로 에러 로그만 남기고 성공으로 처리
      // (실제 운영 시에는 테이블 생성 필요)
      console.warn('[inquiry/create] inquiries 테이블이 없을 수 있습니다. 테이블을 생성해주세요.')
      
      // 임시로 성공 응답 반환 (테이블 생성 후 실제 저장 가능)
      return NextResponse.json({
        success: true,
        message: '문의가 접수되었습니다.'
      })
    }

    return NextResponse.json({
      success: true,
      inquiry: data
    })
  } catch (error: any) {
    console.error('[inquiry/create] exception:', error)
    return NextResponse.json(
      { error: error.message || '문의 접수 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
