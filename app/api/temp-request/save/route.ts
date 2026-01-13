import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
    const { requestKey, payload } = body

    if (!requestKey || !payload) {
      return NextResponse.json(
        { error: 'requestKey와 payload는 필수입니다.' },
        { status: 400 }
      )
    }

    // 24시간 후 만료 시간 계산 (KST 기준)
    const nowKST = new Date(getKSTNow())
    const expiresAt = new Date(nowKST.getTime() + 24 * 60 * 60 * 1000) // 24시간 후

    // 임시 요청 데이터를 Supabase에 저장 (KST 기준)
    const { data, error } = await supabase
      .from('temp_requests')
      .upsert({
        id: requestKey,
        payload: payload,
        created_at: getKSTNow(), // KST 기준으로 저장
        expires_at: expiresAt.toISOString() // KST 기준으로 계산된 만료 시간
      }, {
        onConflict: 'id'
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: '임시 요청 데이터 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      requestKey: data.id
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
