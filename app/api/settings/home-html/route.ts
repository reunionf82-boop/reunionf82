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

  if (error || !data) {
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
  } catch {
    return NextResponse.json({ home_html: '', home_bg_color: '' }, { headers: noStoreHeaders })
  }
}

// ✅ 프로덕션 CDN 캐시 우회용: POST는 보통 캐싱되지 않음
export async function POST(_req: NextRequest) {
  try {
    const result = await loadHomeHtml()
    return NextResponse.json(result, { headers: noStoreHeaders })
  } catch {
    return NextResponse.json({ home_html: '', home_bg_color: '' }, { headers: noStoreHeaders })
  }
}

