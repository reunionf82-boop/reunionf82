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

export async function GET(request: NextRequest) {
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
    const videoBaseName = searchParams.get('videoBaseName')

    if (!videoBaseName) {
      return NextResponse.json(
        { error: 'videoBaseName은 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseClient()

    // WebM과 MP4 파일 존재 여부 확인
    const webmFileName = `${videoBaseName}.webm`
    const mp4FileName = `${videoBaseName}.mp4`

    // 파일 다운로드 시도로 존재 여부 확인 (가장 정확한 방법)
    // 업로드 직후에는 인덱싱 지연이 있을 수 있으므로 여러 번 시도
    let hasWebm = false
    let hasMp4 = false
    
    // 첫 번째 시도
    const [firstWebm, firstMp4] = await Promise.all([
      supabase.storage.from('thumbnails').download(webmFileName)
        .then(() => true)
        .catch(() => false),
      supabase.storage.from('thumbnails').download(mp4FileName)
        .then(() => true)
        .catch(() => false)
    ])
    
    hasWebm = firstWebm
    hasMp4 = firstMp4
    
    // 첫 번째 시도에서 실패한 경우, 0.5초 후 재시도
    if (!hasWebm || !hasMp4) {
      await new Promise(resolve => setTimeout(resolve, 500))
      const [retryWebm, retryMp4] = await Promise.all([
        !hasWebm ? supabase.storage.from('thumbnails').download(webmFileName)
          .then(() => true)
          .catch(() => false) : Promise.resolve(hasWebm),
        !hasMp4 ? supabase.storage.from('thumbnails').download(mp4FileName)
          .then(() => true)
          .catch(() => false) : Promise.resolve(hasMp4)
      ])
      hasWebm = hasWebm || retryWebm
      hasMp4 = hasMp4 || retryMp4
    }

    return NextResponse.json({
      success: true,
      hasWebm,
      hasMp4,
      videoBaseName
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '파일 확인 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
