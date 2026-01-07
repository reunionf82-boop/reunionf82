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
    const requestKey = searchParams.get('requestKey')

    if (!requestKey) {
      return NextResponse.json(
        { error: 'requestKey는 필수입니다.' },
        { status: 400 }
      )
    }

    // 임시 요청 데이터 조회
    const { data, error } = await supabase
      .from('temp_requests')
      .select('*')
      .eq('id', requestKey)
      .single()

    if (error) {
      return NextResponse.json(
        { error: '임시 요청 데이터를 찾을 수 없습니다.', details: error.message },
        { status: 404 }
      )
    }

    if (!data) {
      return NextResponse.json(
        { error: '임시 요청 데이터를 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 만료 시간 확인
    const now = new Date()
    const expiresAt = new Date(data.expires_at)
    if (now > expiresAt) {
      // 만료된 데이터 삭제
      await supabase
        .from('temp_requests')
        .delete()
        .eq('id', requestKey)

      return NextResponse.json(
        { error: '임시 요청 데이터가 만료되었습니다.' },
        { status: 410 }
      )
    }

    return NextResponse.json({
      success: true,
      payload: data.payload
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
