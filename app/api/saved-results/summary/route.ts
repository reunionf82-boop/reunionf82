import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/** 저장된 점사 요약만 조회 (있으면 표시, 없으면 생성 요청용) */
export async function GET(request: NextRequest) {
  try {
    const idParam = request.nextUrl.searchParams.get('id')
    const id = idParam != null ? Number(idParam) : NaN
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ success: false, summary: null }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data, error } = await supabase
      .from('saved_results')
      .select('fortune_summary')
      .eq('id', id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ success: false, summary: null }, { status: 500 })
    }

    const summary =
      data?.fortune_summary != null && String(data.fortune_summary).trim()
        ? String(data.fortune_summary).trim()
        : null

    return NextResponse.json({ success: true, summary })
  } catch {
    return NextResponse.json({ success: false, summary: null }, { status: 500 })
  }
}
