import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await req.cookies
    const session = cookieStore.get('admin_session')
    if (session?.value !== 'authenticated') {
      return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })
    }

    const body = await req.json()
    const id = body?.id != null ? Number(body.id) : NaN
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: '유효한 컨텐츠 id가 필요합니다.' }, { status: 400 })
    }
    const typecastEnabled = body?.typecast_enabled === true

    const supabase = getSupabaseClient()
    const { data, error } = await supabase
      .from('contents')
      .update({ typecast_enabled: typecastEnabled })
      .eq('id', id)
      .select('id, typecast_enabled')
      .single()

    if (error) {
      return NextResponse.json(
        { error: error.message || '타입캐스트 설정 저장에 실패했습니다.' },
        { status: 500 }
      )
    }
    return NextResponse.json({
      success: true,
      id: data?.id,
      typecast_enabled: (data as any)?.typecast_enabled === true,
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || '타입캐스트 설정 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
