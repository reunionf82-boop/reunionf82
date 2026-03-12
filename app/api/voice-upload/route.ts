import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
/** 큰 녹음 파일 업로드·스토리지 저장에 시간이 걸릴 수 있음 (정상 종료 시 2분~수 분 허용) */
export const maxDuration = 300 = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다.')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * 음성 상담 녹음 파일 업로드 API
 * POST /api/voice-upload
 * FormData: file (WAV/WebM), folder? (optional)
 * 반환: { success, url }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) {
      return NextResponse.json({ success: false, error: '파일이 제공되지 않았습니다.' }, { status: 400 })
    }

    // 파일 타입 확인 (WAV, WebM, MP3, OGG만 허용)
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'wav'
    const mimeType = (file.type || '').toLowerCase()
    const allowedExts = ['wav', 'webm', 'mp3', 'ogg', 'm4a']
    const isAudio = mimeType.startsWith('audio/') || allowedExts.includes(fileExt)
    if (!isAudio) {
      return NextResponse.json({ success: false, error: '오디오 파일만 업로드할 수 있습니다.' }, { status: 400 })
    }

    // 크기 제한: 150MB (30분 WAV 기준 ~86MB)
    const maxSize = 150 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json({ success: false, error: '파일 크기는 150MB를 초과할 수 없습니다.' }, { status: 400 })
    }

    const fileName = `voice_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`
    const filePath = `voice/${fileName}`

    const supabase = getSupabaseClient()
    const arrayBuffer = await file.arrayBuffer()
    const body = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, body, {
        cacheControl: '3600',
        upsert: false,
        contentType: mimeType || `audio/${fileExt}`,
      })

    if (uploadError) {
      console.error('[voice-upload] upload error:', uploadError)
      return NextResponse.json({ success: false, error: uploadError.message || '업로드 실패' }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(filePath)
    const publicUrl = urlData?.publicUrl || ''

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (error: any) {
    console.error('[voice-upload] error:', error)
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}
