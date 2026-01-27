import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const title = searchParams.get('title')

    if (!title || title.trim() === '') {
      return NextResponse.json(
        { error: '제목이 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // title로 contents 테이블에서 ID 찾기 (content_name 컬럼과 비교)
    const { data, error } = await supabase
      .from('contents')
      .select('id, content_name')
      .ilike('content_name', `%${title.trim()}%`)
      .limit(1)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: '컨텐츠 검색 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    if (!data || !data.id) {
      return NextResponse.json(
        { success: false, error: '컨텐츠를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      content_id: data.id,
      content_name: data.content_name
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '컨텐츠 검색 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
