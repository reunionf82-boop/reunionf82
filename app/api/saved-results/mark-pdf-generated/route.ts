import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: 'ID가 제공되지 않았습니다.' },
        { status: 400 }
      )
    }

    // PDF 생성 여부를 saved_results 테이블에 저장
    // pdf_generated 필드가 없으면 추가해야 함 (마이그레이션 필요)
    const { data, error } = await supabase
      .from('saved_results')
      .update({ pdf_generated: true, updated_at: getKSTNow() }) // KST 기준으로 저장
      .eq('id', id)
      .select()
      .single()

    if (error) {
      // pdf_generated 필드가 없을 수 있으므로 에러를 무시하거나 필드 추가 필요
      return NextResponse.json(
        { error: 'PDF 생성 여부 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
