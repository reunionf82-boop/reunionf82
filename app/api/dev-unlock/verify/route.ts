import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const password = String(body?.password || '').trim()
    if (!password) {
      return NextResponse.json(
        { error: '비밀번호가 필요합니다.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('app_settings')
      .select('dev_unlock_password_hash, dev_unlock_duration_minutes')
      .eq('id', 1)
      .limit(1)

    if (error) {
      return NextResponse.json(
        { error: '설정을 확인할 수 없습니다.', details: error.message },
        { status: 500 }
      )
    }

    const row = Array.isArray(data) ? data[0] : null
    const storedHash = (row as any)?.dev_unlock_password_hash
    if (!storedHash) {
      return NextResponse.json(
        { error: '비밀번호가 설정되어 있지 않습니다.' },
        { status: 404 }
      )
    }

    const hashed = crypto.createHash('sha256').update(password).digest('hex')
    if (hashed !== storedHash) {
      return NextResponse.json(
        { error: '비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      )
    }

    const durationMinutes = Number((row as any)?.dev_unlock_duration_minutes || 60)
    return NextResponse.json({ success: true, durationMinutes })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
