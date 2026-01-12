import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

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

    // Content-Type 확인: JSON이면 삭제 요청, FormData면 업로드 요청
    const contentType = req.headers.get('content-type') || ''
    
    if (contentType.includes('application/json')) {
      // JSON 요청은 삭제 처리
      const body = await req.json()
      if (body.action === 'delete' || body.url) {
        return await handleImageDelete(req)
      }
      return NextResponse.json(
        { error: '잘못된 요청입니다.' },
        { status: 400 }
      )
    }

    // FormData 요청은 업로드 처리
    const formData = await req.formData()
    const file = formData.get('file') as File
    const folderRaw = formData.get('folder')
    const folder =
      typeof folderRaw === 'string'
        ? folderRaw
            .trim()
            .replace(/^\/*/, '') // leading /
            .replace(/\.\./g, '') // block ..
            .replace(/[^a-zA-Z0-9/_-]/g, '') // safe chars
            .replace(/\/{2,}/g, '/') // collapse //
        : ''

    if (!file) {
      return NextResponse.json(
        { error: '파일이 제공되지 않았습니다.' },
        { status: 400 }
      )
    }

    // 파일 확장자/MIME 확인
    const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
    const fileNameLower = file.name.toLowerCase()
    const mimeType = (file.type || '').toLowerCase()
    
    // 파일 타입 확인 (MIME 타입과 확장자 모두 확인)
    const isImageByType = mimeType.startsWith('image/')
    const isVideoByType = mimeType === 'video/webm'
    // iPhone/카톡 등에서 자주 오는 확장자까지 허용
    const isImageByExt = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'jfif', 'bmp', 'heic', 'heif', 'svg'].includes(fileExt)
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

    // 동영상은 확장자 엄격 체크 (WebM만 지원)
    if (isVideo && !isVideoByExt) {
      return NextResponse.json(
        { error: '동영상 파일의 확장자가 올바르지 않습니다. (WebM만 지원)' },
        { status: 400 }
      )
    }
    // 이미지는 MIME으로 충분히 판단 가능하므로 확장자 불일치로 막지 않음

    const mimeExtRaw = isImageByType ? mimeType.split('/')[1] : ''
    const mimeExt = mimeExtRaw
      ? (mimeExtRaw.includes('+xml') ? 'svg' : mimeExtRaw).replace('jpeg', 'jpg')
      : ''
    const finalFileExt = fileExt || (isVideo ? 'webm' : (mimeExt || 'jpg'))
    const baseFileName = `${Date.now()}-${Math.random().toString(36).substring(7)}`
    
    // 동영상인 경우 확장자를 포함한 파일명 사용 (WebM과 MP4를 구분하기 위해)
    // 이미지인 경우 확장자 포함
    const fileName = `${baseFileName}.${finalFileExt}`
    const filePath = folder ? `${folder}/${fileName}` : fileName
    
    // 동영상인 경우, 파일명에서 확장자를 제거한 기본 이름도 반환 (WebM/MP4 공통 이름)
    const videoBaseName = isVideo ? baseFileName : null


    // 서비스 롤 키로 업로드 (RLS 우회)
    const supabase = getSupabaseClient()
    const supabaseHost = supabaseUrl ? (() => { try { return new URL(supabaseUrl).host } catch { return supabaseUrl } })() : ''
    
    // 파일을 ArrayBuffer로 변환하여 업로드 (MP4 파일 호환성 개선)
    const arrayBuffer = await file.arrayBuffer()
    const body = Buffer.from(arrayBuffer)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, body, {
        cacheControl: '3600',
        upsert: false,
        contentType: mimeType || (isVideo ? 'video/webm' : `image/${finalFileExt}`)
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json(
        {
          error: uploadError.message || '파일 업로드에 실패했습니다.',
          details: uploadError,
          _debug: {
            supabaseHost,
            bucket: 'thumbnails',
            filePath,
            folder: folder || null,
            fileName: file.name,
            fileExt,
            mimeType,
            size: file.size,
            isImage,
            isVideo,
          },
        },
        { status: 500 }
      )
    }

    // 업로드 직후 실제 존재 여부 검증(대시보드에서 안 보이는 이슈 진단용)
    const verifyExists = await supabase.storage
      .from('thumbnails')
      .download(filePath)
      .then(() => true)
      .catch(() => false)

    if (!verifyExists) {
      return NextResponse.json(
        {
          error: '업로드는 완료되었지만, 파일 존재 검증에 실패했습니다. (Storage에서 파일을 확인할 수 없음)',
          _debug: {
            supabaseHost,
            bucket: 'thumbnails',
            filePath,
            folder: folder || null,
          },
        },
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
      fileType: isVideo ? 'video' : 'image',
      _debug: {
        supabaseHost,
        bucket: 'thumbnails',
        filePath,
        folder: folder || null,
        contentType: mimeType || (isVideo ? 'video/webm' : `image/${finalFileExt}`),
        verified: true,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '업로드 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

// 이미지 삭제 핸들러 (공통 함수)
async function handleImageDelete(req: NextRequest) {
  // 관리자 인증 확인
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')

  if (session?.value !== 'authenticated') {
    return NextResponse.json(
      { error: '관리자 권한이 필요합니다.' },
      { status: 401 }
    )
  }

  const body = await req.json()
  const { url } = body

  if (!url || typeof url !== 'string') {
    return NextResponse.json(
      { error: '이미지 URL이 제공되지 않았습니다.' },
      { status: 400 }
    )
  }

  // URL에서 파일 경로 추출
  // 예: https://xxx.supabase.co/storage/v1/object/public/thumbnails/path/to/file.jpg
  // -> path/to/file.jpg
  let filePath = ''
  try {
    const urlObj = new URL(url)
    const pathMatch = urlObj.pathname.match(/\/storage\/v1\/object\/public\/thumbnails\/(.+)$/)
    if (pathMatch && pathMatch[1]) {
      filePath = decodeURIComponent(pathMatch[1])
    } else {
      // 직접 경로가 제공된 경우 (예: "folder/file.jpg")
      filePath = url.replace(/^\/+/, '').replace(/\.\./g, '')
    }
  } catch {
    // URL 파싱 실패 시 전체를 경로로 간주 (보안상 위험하지만 fallback)
    filePath = url.replace(/^\/+/, '').replace(/\.\./g, '')
  }

  if (!filePath) {
    return NextResponse.json(
      { error: '유효한 파일 경로를 추출할 수 없습니다.' },
      { status: 400 }
    )
  }

  // 서비스 롤 키로 삭제 (RLS 우회)
  const supabase = getSupabaseClient()
  const { error: deleteError } = await supabase.storage
    .from('thumbnails')
    .remove([filePath])

  if (deleteError) {
    console.error('Delete error:', deleteError)
    return NextResponse.json(
      {
        error: deleteError.message || '파일 삭제에 실패했습니다.',
        details: deleteError,
      },
      { status: 500 }
    )
  }

  // 캐시 방지 헤더 설정
  return NextResponse.json(
    {
      success: true,
      message: '파일이 삭제되었습니다.',
    },
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    }
  )
}

// 이미지 삭제 (DELETE 메서드 지원)
export async function DELETE(req: NextRequest) {
  try {
    return await handleImageDelete(req)
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '삭제 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

