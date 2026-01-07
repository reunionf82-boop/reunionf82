import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

// 서버 사이드에서만 서비스 롤 키 사용
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

export async function POST(req: NextRequest) {
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

    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: '파일이 제공되지 않았습니다.' },
        { status: 400 }
      )
    }

    // 파일 크기 제한 (10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: '파일 크기는 10MB를 초과할 수 없습니다.' },
        { status: 400 }
      )
    }

    // 파일 확장자 확인
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: '지원하는 이미지 형식: JPEG, PNG, GIF, WebP' },
        { status: 400 }
      )
    }

    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = fileName
    // 서비스 롤 키로 업로드 (RLS 우회)
    const supabase = getSupabaseClient()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || '파일 업로드에 실패했습니다.' },
        { status: 500 }
      )
    }
    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(filePath)
    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: filePath
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

