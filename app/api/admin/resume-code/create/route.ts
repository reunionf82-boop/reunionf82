import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

const generateCode = () => {
  let result = ''
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    result += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return result
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')
    if (session?.value !== 'authenticated') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const savedId = body?.savedId ? String(body.savedId).trim() : ''
    const requestKey = body?.requestKey ? String(body.requestKey).trim() : ''

    if (!savedId && !requestKey) {
      return NextResponse.json(
        { error: 'savedId 또는 requestKey 중 하나가 필요합니다.' },
        { status: 400 }
      )
    }

    const nowKst = new Date(getKSTNow())
    const expiresAt = new Date(nowKst.getTime() + 60 * 24 * 60 * 60 * 1000)

    let code = ''
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateCode()
      const { data: existing } = await supabase
        .from('resume_codes')
        .select('id')
        .eq('code', candidate)
        .maybeSingle()
      if (!existing) {
        code = candidate
        break
      }
    }

    if (!code) {
      return NextResponse.json(
        { error: '숏코드 생성에 실패했습니다.' },
        { status: 500 }
      )
    }

    const { data, error } = await supabase
      .from('resume_codes')
      .insert({
        code,
        saved_id: savedId ? parseInt(savedId, 10) : null,
        request_key: requestKey || null,
        created_at: getKSTNow(),
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: '숏코드 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      code: data.code,
      expiresAt: data.expires_at
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
