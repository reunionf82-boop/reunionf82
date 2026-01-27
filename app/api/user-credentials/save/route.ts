import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { encrypt } from '@/lib/encryption'
import { getKSTNow } from '@/lib/payment-utils'

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
    const { requestKey, savedId, phone, password } = body

    if (!phone || !password) {
      return NextResponse.json(
        { error: '휴대폰 번호와 비밀번호는 필수입니다.' },
        { status: 400 }
      )
    }

    if (!requestKey && !savedId) {
      return NextResponse.json(
        { error: 'requestKey 또는 savedId 중 하나는 필수입니다.' },
        { status: 400 }
      )
    }

    // 24시간 후 만료 시간 계산 (KST 기준)
    const nowKST = new Date(getKSTNow())
    const expiresAt = new Date(nowKST.getTime() + 24 * 60 * 60 * 1000) // 24시간 후

    // 디버그 로그 (saved_id가 NULL로 들어가는지 확인용)
    // 암호화
    let encryptedPhone: string
    let encryptedPassword: string
    try {
      encryptedPhone = encrypt(phone)
      encryptedPassword = encrypt(password)
    } catch (encryptError: any) {
      return NextResponse.json(
        { error: '암호화 중 오류가 발생했습니다.', details: encryptError.message },
        { status: 500 }
      )
    }

    // DB에 저장 (KST 기준)
    const { data, error } = await supabase
      .from('user_credentials')
      .insert({
        request_key: requestKey || null,
        saved_id: savedId || null,
        encrypted_phone: encryptedPhone,
        encrypted_password: encryptedPassword,
        created_at: getKSTNow(), // KST 기준으로 저장
        expires_at: expiresAt.toISOString() // KST 기준으로 계산된 만료 시간
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: '인증 정보 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }
    return NextResponse.json({
      success: true,
      id: data.id,
      requestKey: data.request_key,
      savedId: data.saved_id
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
