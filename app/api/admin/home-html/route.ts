import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleRequest() {
  const supabase = getAdminSupabaseClient()

  // app_settings에서 home_html 조회
  const { data, error } = await supabase
    .from('app_settings')
    .select('home_html, home_bg_color')
    .maybeSingle()

  if (error) {
    console.error('[HomeHtml] 조회 에러:', error)
    return { home_html: '', home_bg_color: '' }
  }

  const homeHtml = typeof data?.home_html === 'string' ? data.home_html : ''
  const homeBgColor = typeof (data as any)?.home_bg_color === 'string' ? String((data as any).home_bg_color) : ''
  return { home_html: homeHtml, home_bg_color: homeBgColor }
}

// ✅ POST 방식으로 조회 (캐시 우회)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    
    // 저장 요청인지 확인
    if (body.action === 'save' && body.home_html !== undefined) {
      // 저장 처리
      const supabase = getAdminSupabaseClient()
      const { error: updateError } = await supabase
        .from('app_settings')
        .update({ home_html: body.home_html, home_bg_color: body.home_bg_color ?? null })
        .eq('id', 1) // app_settings는 단일 행

      if (updateError) {
        console.error('[HomeHtml] 저장 에러:', updateError)
        return NextResponse.json(
          { error: '홈 HTML 저장에 실패했습니다.', details: updateError.message },
          { status: 500 }
        )
      }

      return NextResponse.json(
        { success: true, home_html: body.home_html, home_bg_color: body.home_bg_color ?? '' },
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      )
    }

    // 조회 요청
    const result = await handleRequest()
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (e: any) {
    console.error('[HomeHtml][POST] 서버 내부 에러:', e)
    return NextResponse.json(
      { home_html: '', error: e.message },
      { status: 500 }
    )
  }
}
