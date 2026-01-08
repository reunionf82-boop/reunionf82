import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export async function DELETE(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const cookieStore = await cookies()
    const session = cookieStore.get('admin_session')

    if (session?.value !== 'authenticated') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const filePath = searchParams.get('filePath')

    if (!filePath) {
      return NextResponse.json(
        { error: 'filePath는 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // filePath에서 thumbnails/ 접두사 제거
    const fileName = filePath.replace(/^thumbnails\//, '')
    
    // 파일 삭제
    const { error } = await supabase.storage
      .from('thumbnails')
      .remove([fileName])

    if (error) {
      return NextResponse.json(
        { error: error.message || '파일 삭제에 실패했습니다.', details: error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: '파일이 삭제되었습니다.'
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
