import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { plainOrDecrypt } from '@/lib/encryption'

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
    const requestKey = searchParams.get('requestKey')
    const savedId = searchParams.get('savedId')

    if (!requestKey && !savedId) {
      return NextResponse.json(
        { error: 'requestKey 또는 savedId 중 하나는 필수입니다.' },
        { status: 400 }
      )
    }

    // DB에서 조회
    let query = supabase
      .from('user_credentials')
      .select('*')
      .gt('expires_at', new Date().toISOString()) // 만료되지 않은 것만

    if (requestKey) {
      query = query.eq('request_key', requestKey)
    } else if (savedId) {
      query = query.eq('saved_id', parseInt(savedId))
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(1).single()

    if (error || !data) {
      return NextResponse.json(
        { error: '인증 정보를 찾을 수 없습니다.', details: error?.message },
        { status: 404 }
      )
    }

    const phone = plainOrDecrypt(data.encrypted_phone)
    const password = plainOrDecrypt(data.encrypted_password)
    return NextResponse.json({
      success: true,
      phone,
      password
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
