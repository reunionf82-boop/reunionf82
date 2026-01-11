import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(req: NextRequest) {
  try {
    // 환경 변수 확인 (프로덕션 환경에서 문제 진단용)
    if (!supabaseUrl) {
      console.error('[reviews/upload-image] NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.')
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase URL이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    if (!supabaseServiceKey) {
      console.error('[reviews/upload-image] Supabase 서비스 키가 설정되지 않았습니다.')
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase 서비스 키가 설정되지 않았습니다.' },
        { status: 500 }
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

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { error: '이미지 파일만 업로드할 수 있습니다.' },
        { status: 400 }
      )
    }

    // 파일 크기 제한 (10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: '이미지 파일 크기는 10MB를 초과할 수 없습니다.' },
        { status: 400 }
      )
    }

    // 파일명 생성
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
    const fileName = `review-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const filePath = `reviews/${fileName}`

    // Supabase Storage에 업로드
    // 파일을 ArrayBuffer로 변환하여 업로드 (일관성 및 호환성 개선)
    const arrayBuffer = await file.arrayBuffer()
    const body = Buffer.from(arrayBuffer)
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, body, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || `image/${fileExt}`
      })

    if (uploadError) {
      console.error('[reviews/upload-image] upload error:', uploadError)
      console.error('[reviews/upload-image] upload error details:', JSON.stringify(uploadError, null, 2))
      return NextResponse.json(
        { 
          error: uploadError.message || '이미지 업로드에 실패했습니다.',
          details: uploadError
        },
        { status: 500 }
      )
    }

    // 업로드 직후 실제 존재 여부 검증 (프로덕션에서 파일이 안 보이는 이슈 진단용)
    const verifyExists = await supabase.storage
      .from('thumbnails')
      .download(filePath)
      .then(() => true)
      .catch((err) => {
        console.error('[reviews/upload-image] 파일 검증 실패:', err)
        return false
      })

    if (!verifyExists) {
      console.error('[reviews/upload-image] 업로드된 파일을 검증할 수 없습니다:', filePath)
      return NextResponse.json(
        { 
          error: '업로드된 파일을 검증할 수 없습니다.',
          details: '파일이 업로드되었지만 확인할 수 없습니다.'
        },
        { status: 500 }
      )
    }

    // 공개 URL 생성 (더 안전한 방식)
    const { data: urlData } = supabase.storage
      .from('thumbnails')
      .getPublicUrl(filePath)

    if (!urlData?.publicUrl) {
      console.error('[reviews/upload-image] URL 생성 실패:', {
        filePath,
        supabaseUrl,
        uploadData
      })
      return NextResponse.json(
        { 
          error: '이미지 URL을 생성할 수 없습니다.',
          details: '파일은 업로드되었지만 공개 URL을 생성할 수 없습니다.'
        },
        { status: 500 }
      )
    }

    // URL 유효성 검증 (프로덕션 환경에서 URL 형식 확인)
    const publicUrl = urlData.publicUrl
    if (!publicUrl || !publicUrl.startsWith('http')) {
      console.error('[reviews/upload-image] 잘못된 URL 형식:', publicUrl)
      return NextResponse.json(
        { 
          error: '생성된 URL이 유효하지 않습니다.',
          details: `URL 형식 오류: ${publicUrl}`
        },
        { status: 500 }
      )
    }

    console.log('[reviews/upload-image] 업로드 성공:', {
      filePath,
      publicUrl,
      fileSize: file.size,
      fileType: file.type,
      verified: verifyExists
    })

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: filePath
    })
  } catch (error: any) {
    console.error('[reviews/upload-image] exception:', error)
    return NextResponse.json(
      { error: error.message || '이미지 업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
