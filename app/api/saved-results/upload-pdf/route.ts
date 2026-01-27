import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Next.js 캐싱 방지 설정
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
    const formData = await request.formData()
    const file = formData.get('file') as File
    const savedResultId = formData.get('savedResultId') as string

    if (!file) {
      return NextResponse.json(
        { error: 'PDF 파일이 제공되지 않았습니다.' },
        { status: 400 }
      )
    }

    if (!savedResultId) {
      return NextResponse.json(
        { error: '저장된 결과 ID가 제공되지 않았습니다.' },
        { status: 400 }
      )
    }

    // 파일 크기 제한 (200MB)
    const maxSize = 200 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'PDF 파일 크기는 200MB를 초과할 수 없습니다.' },
        { status: 400 }
      )
    }

    // 파일 타입 확인
    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'PDF 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      )
    }

    const fileName = `${savedResultId}.pdf`
    const filePath = fileName

    // Supabase Storage에 업로드 (pdfs 버킷 사용)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true // 같은 ID의 PDF가 있으면 덮어쓰기
      })

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || 'PDF 업로드에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(filePath)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: filePath
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

