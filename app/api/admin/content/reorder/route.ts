import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다.')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

/** POST body: { ids: number[] } — 리스트에 보이는 순서대로 id 배열 (위→아래) */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ids = Array.isArray(body?.ids) ? body.ids.map((x: unknown) => Number(x)).filter(Number.isFinite) : []
    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: 'ids 배열이 필요합니다.' }, { status: 400 })
    }
    const supabase = getSupabaseClient()
    for (let i = 0; i < ids.length; i++) {
      const { error } = await supabase.from('contents').update({ sort_order: i }).eq('id', ids[i])
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
      }
    }
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '순서 저장 실패' }, { status: 500 })
  }
}
