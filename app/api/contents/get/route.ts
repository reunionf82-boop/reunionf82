import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const idRaw = request.nextUrl.searchParams.get('id')
    const idNum = idRaw ? parseInt(idRaw, 10) : NaN

    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()

    // PDF 북커버 보강용: 민감 필드 노출 방지 위해 최소 컬럼만 반환
    const { data, error } = await supabase
      .from('contents')
      .select(
        'id, content_name, book_cover_thumbnail, book_cover_thumbnail_video, ending_book_cover_thumbnail, ending_book_cover_thumbnail_video'
      )
      .eq('id', idNum)
      .maybeSingle()

    if (error) {
      return NextResponse.json(
        { error: '컨텐츠 조회 중 오류가 발생했습니다.', details: error.message },
        { status: 500 }
      )
    }

    if (!data) {
      return NextResponse.json({ success: false, error: '컨텐츠를 찾을 수 없습니다.' }, { status: 404 })
    }

    return NextResponse.json({ success: true, content: data }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || '컨텐츠 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

