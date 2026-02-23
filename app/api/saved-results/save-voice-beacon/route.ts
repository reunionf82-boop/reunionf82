import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'
import { normalizeVoiceMessagesToKorean } from '@/lib/voice-transcript-korean'
import { summarizeVoiceConversation, normalizePhoneForVoice, getAlreadyAskedSummaryTexts } from '@/lib/voice-summary'

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
 * - saved_results_voice 테이블에 저장 (점사형 saved_results와 분리)
 * - _beacon_phone, _beacon_password가 있으면 user_credentials에 voice_saved_id로 연결
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      title, voice_messages, voice_audio_url,
      voice_duration_seconds, content_id, userName,
      _beacon_phone, _beacon_password,
      _beacon_injected_summary_item_refs,
    } = body

    if (!title && !voice_messages) {
      return NextResponse.json({ success: false, error: '저장할 데이터가 없습니다.' }, { status: 400 })
    }

    const savedAtKST = getKSTNow()
    let finalVoiceMessages = voice_messages || null
    if (Array.isArray(finalVoiceMessages) && finalVoiceMessages.length > 0) {
      try {
        finalVoiceMessages = await normalizeVoiceMessagesToKorean(finalVoiceMessages)
      } catch {
        /* 실패 시 원본 유지 */
      }
    }

    const insertData: Record<string, any> = {
      title: title || '음성 상담',
      html: '',
      user_name: userName || null,
      saved_at: savedAtKST,
      created_at: savedAtKST,
      voice_messages: finalVoiceMessages,
      voice_audio_url: voice_audio_url || null,
      voice_duration_seconds: voice_duration_seconds || null,
      content_id: content_id || null,
    }

    const { data, error } = await supabase
      .from('saved_results_voice')
      .insert(insertData)
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message || '저장 실패' }, { status: 500 })
    }

    if (data && _beacon_phone && _beacon_password) {
      await linkCredentialsVoice(data.id, _beacon_phone, _beacon_password)
    }

    // 음성형: 대화 요약 생성 후 voice_conversation_summaries에 저장 (이미 물어본 항목은 LLM이 다시 넣지 않도록 제외)
    if (data && Array.isArray(finalVoiceMessages) && finalVoiceMessages.length > 0) {
      const phoneNorm = normalizePhoneForVoice(_beacon_phone ?? '')
      if (phoneNorm) {
        try {
          const excludeAlreadyAsked = await getAlreadyAskedSummaryTexts(
            supabase,
            phoneNorm,
            content_id != null ? Number(content_id) : null
          )
          const summary = await summarizeVoiceConversation(finalVoiceMessages, {
            excludeAlreadyAsked: excludeAlreadyAsked.length > 0 ? excludeAlreadyAsked : undefined,
          })
          if (summary.corePoints.length > 0 || summary.keyDates.length > 0) {
            await supabase.from('voice_conversation_summaries').insert({
              phone_normalized: phoneNorm,
              saved_result_id: data.id,
              content_id: content_id != null ? Number(content_id) : null,
              summary_json: summary,
              created_at: savedAtKST,
            })
          }
        } catch {
          /* 요약 실패해도 저장은 성공 */
        }
      }
      // 이번 세션에서 안부로 물어본 항목 기록
      const refs = _beacon_injected_summary_item_refs
      if (Array.isArray(refs) && refs.length > 0) {
        for (const ref of refs) {
          const s = String(ref).trim()
          if (!s) continue
          const summaryId = parseInt(s.split('_')[0], 10)
          if (!Number.isFinite(summaryId) || summaryId < 1) continue
          try {
            await supabase.from('voice_summary_asked').upsert(
              { summary_id: summaryId, item_ref: s, asked_at: savedAtKST },
              { onConflict: 'summary_id,item_ref' }
            )
          } catch {
            /* 무시 */
          }
        }
      }
    }

    return NextResponse.json({ success: true, id: data?.id })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}

async function linkCredentialsVoice(voiceSavedId: number, phone: string, password: string) {
  try {
    const nowKST = new Date(getKSTNow())
    const expiresAt = new Date(nowKST.getTime() + 60 * 24 * 60 * 60 * 1000) // 60일

    await supabase
      .from('user_credentials')
      .insert({
        request_key: null,
        saved_id: null,
        voice_saved_id: voiceSavedId,
        encrypted_phone: String(phone).trim(),
        encrypted_password: String(password).trim(),
        created_at: getKSTNow(),
        expires_at: expiresAt.toISOString(),
      })
  } catch {
    // 실패해도 무시 (beacon이므로 에러 전달 불가)
  }
}
