import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { content_id } = body

    if (!content_id) {
      return NextResponse.json(
        { error: 'content_id는 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()
    
    // 현재 클릭 수 조회
    const { data: currentData, error: selectError } = await supabase
      .from('contents')
      .select('click_count')
      .eq('id', parseInt(content_id))
      .single()

    if (selectError) {
      console.error('[content/click] select error:', selectError)
      // click_count 필드가 없을 수도 있으므로 기본값 0으로 처리
      console.log('[content/click] click_count 필드가 없거나 조회 실패, 기본값 0으로 시작')
    }

    const currentCount = (currentData?.click_count || 0) as number
    console.log('[content/click] 현재 클릭 수:', currentCount, 'content_id:', content_id)
    
    // 클릭 수 증가
    const { data: updatedData, error: updateError } = await supabase
      .from('contents')
      .update({ click_count: currentCount + 1 })
      .eq('id', parseInt(content_id))
      .select('click_count')
      .single()

    if (updateError) {
      console.error('[content/click] update error:', updateError)
      throw updateError
    }

    console.log('[content/click] 업데이트 성공:', updatedData)

    return NextResponse.json({
      success: true,
      click_count: updatedData.click_count
    })
  } catch (error: any) {
    console.error('[content/click] error:', error)
    return NextResponse.json(
      { error: error.message || '클릭 수 증가에 실패했습니다.' },
      { status: 500 }
    )
  }
}
