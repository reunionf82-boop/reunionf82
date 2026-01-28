import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = String(searchParams.get('code') || '').trim().toUpperCase()
    if (!code) {
      return NextResponse.json(
        { error: 'code가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('resume_codes')
      .select('code, saved_id, request_key, expires_at')
      .eq('code', code)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: '유효하지 않은 코드입니다.' },
        { status: 404 }
      )
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at) : null
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      return NextResponse.json(
        { error: '코드 만료 정보를 확인할 수 없습니다.' },
        { status: 400 }
      )
    }
    if (Date.now() > expiresAt.getTime()) {
      return NextResponse.json(
        { error: '코드가 만료되었습니다.' },
        { status: 410 }
      )
    }

    const savedId = data.saved_id ? String(data.saved_id) : ''
    const requestKey = data.request_key ? String(data.request_key) : ''

    if (!savedId && !requestKey) {
      return NextResponse.json(
        { error: '복구 가능한 정보가 없습니다.' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      savedId: savedId || null,
      requestKey: requestKey || null,
      expiresAt: expiresAt.toISOString()
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
