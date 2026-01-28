import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/encryption'

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

const normalizePhone = (value: string) => String(value || '').replace(/[^0-9]/g, '')

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
    const phone = normalizePhone(body?.phone || '')
    const password = String(body?.password || '').trim()

    if (!phone || phone.length < 8 || !password) {
      return NextResponse.json(
        { error: '휴대폰 번호와 비밀번호를 확인해주세요.' },
        { status: 400 }
      )
    }

    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('user_credentials')
      .select('id, request_key, saved_id, encrypted_phone, encrypted_password, created_at, expires_at')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) {
      return NextResponse.json(
        { error: '복구 정보 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    const rows = data || []
    for (const row of rows) {
      try {
        const decryptedPhone = normalizePhone(decrypt(row.encrypted_phone))
        const decryptedPassword = decrypt(row.encrypted_password)
        if (decryptedPhone === phone && decryptedPassword === password) {
          const savedId = row.saved_id ? String(row.saved_id) : ''
          const requestKey = row.request_key || ''
          return NextResponse.json({
            success: true,
            requestKey: requestKey || null,
            savedId: savedId || null,
            createdAt: row.created_at || null,
            expiresAt: row.expires_at || null
          })
        }
      } catch {
        continue
      }
    }

    return NextResponse.json(
      { error: '일치하는 정보가 없습니다.' },
      { status: 404 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
