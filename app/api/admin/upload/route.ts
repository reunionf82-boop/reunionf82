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

    // 파일 확장자 확인
    const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
    const fileNameLower = file.name.toLowerCase()
    
    // 파일 타입 확인 (MIME 타입과 확장자 모두 확인)
    const isImageByType = file.type.startsWith('image/')
    const isVideoByType = file.type === 'video/webm'
    const isImageByExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)
    const isVideoByExt = ['webm'].includes(fileExt)
    
    const isImage = isImageByType || isImageByExt
    const isVideo = isVideoByType || isVideoByExt
    
    if (!isImage && !isVideo) {
      return NextResponse.json(
        { error: '지원하는 파일 형식: 이미지 (JPEG, PNG, GIF, WebP), 동영상 (WebM)' },
        { status: 400 }
      )
    }

    // 파일 크기 제한 (동영상은 50MB, 이미지는 10MB)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: isVideo ? '동영상 파일 크기는 50MB를 초과할 수 없습니다.' : '이미지 파일 크기는 10MB를 초과할 수 없습니다.' },
        { status: 400 }
      )
    }

    // 파일 확장자와 MIME 타입 일치 확인
    if (isVideo && !isVideoByExt) {
      return NextResponse.json(
        { error: '동영상 파일의 확장자가 올바르지 않습니다. (WebM만 지원)' },
        { status: 400 }
      )
    }
    if (isImage && !isImageByExt) {
      return NextResponse.json(
        { error: '이미지 파일의 확장자가 올바르지 않습니다.' },
        { status: 400 }
      )
    }

    const finalFileExt = fileExt || (isVideo ? 'webm' : 'jpg')
    const baseFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    // 동영상인 경우 확장자를 포함한 파일명 사용 (WebM과 MP4를 구분하기 위해)
    // 이미지인 경우 확장자 포함
    const fileName = `${baseFileName}.${finalFileExt}`
    const filePath = fileName
    
    // 동영상인 경우, 파일명에서 확장자를 제거한 기본 이름도 반환 (WebM/MP4 공통 이름)
    const videoBaseName = isVideo ? baseFileName : null


    // 서비스 롤 키로 업로드 (RLS 우회)
    const supabase = getSupabaseClient()
    
    // 파일을 ArrayBuffer로 변환하여 업로드 (MP4 파일 호환성 개선)
    const arrayBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, arrayBuffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || (isVideo ? (fileExt === 'webm' ? 'video/webm' : 'video/mp4') : `image/${finalFileExt}`)
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        { error: uploadError.message || '파일 업로드에 실패했습니다.', details: uploadError },
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
      path: filePath,
      videoBaseName: videoBaseName, // 동영상인 경우 확장자 제외 파일명
      fileType: isVideo ? 'video' : 'image'
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

