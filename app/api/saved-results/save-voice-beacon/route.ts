import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

/**
 * 페이지 이탈(뒤로가기/탭닫기) 시 sendBeacon으로 호출되는 음성 대화 저장 API
 * POST /api/saved-results/save-voice-beacon
 * - saved_results에 voice 타입으로 저장
 * - _beacon_phone, _beacon_password가 있으면 user_credentials도 생성
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title, html, result_type, voice_messages, voice_audio_url,
      voice_duration_seconds, content_id, userName,
      _beacon_phone, _beacon_password,
    } = body

    if (!title && !voice_messages) {
      return NextResponse.json({ success: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    }

    const savedAtKST = getKSTNow()

    const isVoice = result_type === 'voice'
    const insertData: Record<string, any> = {
      title: title || '음성 상담',
      html: html || (isVoice ? '' : null),
      user_name: userName || null,
      saved_at: savedAtKST,
      created_at: savedAtKST,
    }

    // voice 필드 추가 (컬럼이 있을 때만 동작)
    if (result_type === 'voice') {
      insertData.result_type = 'voice'
      insertData.voice_messages = voice_messages || null
      insertData.voice_audio_url = voice_audio_url || null
      insertData.voice_duration_seconds = voice_duration_seconds || null
      insertData.content_id = content_id || null
    }

    const { data, error } = await supabase
      .from('saved_results')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      // voice 컬럼이 없을 수 있음 → 기본 필드만으로 재시도
      const fallbackData: Record<string, any> = {
        title: title || '음성 상담',
        html: `<p>음성 상담 기록 (자동 저장)</p>`,
        user_name: userName || null,
        saved_at: savedAtKST,
        created_at: savedAtKST,
      }
      const { data: fbData, error: fbError } = await supabase
        .from('saved_results')
        .insert(fallbackData)
        .select('id')
        .single()

      if (fbError || !fbData) {
        return NextResponse.json({ success: false, error: fbError?.message || '저장 실패' }, { status: 500 })
      }

      // fallback 저장 성공 → credentials 연결
      if (_beacon_phone && _beacon_password) {
        await linkCredentials(fbData.id, _beacon_phone, _beacon_password)
      }

      return NextResponse.json({ success: true, id: fbData.id })
    }

    // voice 저장 성공 → credentials 연결
    if (data && _beacon_phone && _beacon_password) {
      await linkCredentials(data.id, _beacon_phone, _beacon_password)
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}

async function linkCredentials(savedId: number, phone: string, password: string) {
  try {
    const nowKST = new Date(getKSTNow())
    const expiresAt = new Date(nowKST.getTime() + 60 * 24 * 60 * 60 * 1000) // 60일

    await supabase
      .from('user_credentials')
      .insert({
        request_key: null,
        saved_id: savedId,
        encrypted_phone: String(phone).trim(),
        encrypted_password: String(password).trim(),
        created_at: getKSTNow(),
        expires_at: expiresAt.toISOString(),
      })
  } catch {
    // 실패해도 무시 (beacon이므로 에러 전달 불가)
  }
}
