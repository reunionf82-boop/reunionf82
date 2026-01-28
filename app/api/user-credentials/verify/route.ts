import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/encryption'

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

const normalizePhone = (value: string) => String(value || '').replace(/[^0-9]/g, '')

export async function POST(request: NextRequest) {
  try {
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
    const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
    const { data, error } = await supabase
      .from('user_credentials')
      .select('id, request_key, saved_id, encrypted_phone, encrypted_password, created_at, expires_at')
      .gt('expires_at', nowIso)
      .gte('created_at', twelveHoursAgo)
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
          if (!savedId && !requestKey) {
            return NextResponse.json(
              { error: '복구 가능한 기록이 없습니다.' },
              { status: 404 }
            )
          }
          return NextResponse.json({
            success: true,
            requestKey: requestKey || null,
            savedId: savedId || null,
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
