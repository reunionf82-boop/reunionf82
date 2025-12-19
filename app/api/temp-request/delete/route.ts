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

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const requestKey = searchParams.get('requestKey')

    if (!requestKey) {
      return NextResponse.json(
        { error: 'requestKey는 필수입니다.' },
        { status: 400 }
      )
    }

    // 임시 요청 데이터 삭제
    const { error } = await supabase
      .from('temp_requests')
      .delete()
      .eq('id', requestKey)

    if (error) {
      console.error('임시 요청 데이터 삭제 실패:', error)
      return NextResponse.json(
        { error: '임시 요청 데이터 삭제에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '임시 요청 데이터가 삭제되었습니다.'
    })
  } catch (error: any) {
    console.error('임시 요청 데이터 삭제 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
