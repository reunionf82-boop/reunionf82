import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStoreHeaders = {
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0',
  // 일부 CDN이 Cache-Control을 무시하는 케이스 대비
  'Surrogate-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
} as const

async function loadHomeHtml() {
  const supabase = getAdminSupabaseClient()
  const { data, error } = await supabase
    .from('app_settings')
    .select('id, home_html, home_bg_color')
    .eq('id', 1)
    .maybeSingle()

  // ✅ 에러는 숨기지 말고 상위에서 500으로 처리(프로덕션에서 "사라짐" 증상 원인)
  if (error) {
    throw new Error(error.message || 'Failed to load home html')
  }

  // 데이터가 없는 경우만 "빈 값"으로 간주 (정상 케이스)
  if (!data) {
    return { home_html: '', home_bg_color: '' }
  }

  return {
    home_html: String((data as any).home_html || ''),
    home_bg_color: String((data as any).home_bg_color || ''),
  }
}

export async function GET() {
  try {
    const result = await loadHomeHtml()
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch (e: any) {
    return NextResponse.json(
      { error: '홈 HTML 조회에 실패했습니다.' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

// ✅ 프로덕션 CDN 캐시 우회용: POST는 보통 캐싱되지 않음
export async function POST(_req: NextRequest) {
  try {
    const result = await loadHomeHtml()
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch (e: any) {
    return NextResponse.json(
      { error: '홈 HTML 조회에 실패했습니다.' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

