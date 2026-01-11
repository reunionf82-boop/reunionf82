import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const contentId = searchParams.get('content_id')
    const onlyBest = searchParams.get('only_best') === 'true'

    if (!contentId) {
      return NextResponse.json(
        { error: 'content_id는 필수입니다.' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('reviews')
      .select('id, review_text, user_name, is_best, created_at, image_url')
      .eq('content_id', parseInt(contentId))
      .eq('is_visible', true) // 노출 승인된 리뷰만
      .order('created_at', { ascending: false })

    // 베스트 리뷰만 조회
    if (onlyBest) {
      query = query.eq('is_best', true)
    }

    const { data, error } = await query

    if (error) {
      console.error('[reviews/list] error:', error)
      console.error('[reviews/list] error details:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { error: '리뷰 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    console.log('[reviews/list] 조회 성공:', {
      contentId,
      onlyBest,
      count: data?.length || 0,
      reviews: data?.map((r: any) => ({ id: r.id, is_visible: r.is_visible, is_best: r.is_best }))
    })

    return NextResponse.json({
      success: true,
      reviews: data || []
    }, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (error: any) {
    console.error('[reviews/list] exception:', error)
    return NextResponse.json(
      { error: error.message || '리뷰 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
