import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'
import { normalizeVoiceMessagesToKorean } from '@/lib/voice-transcript-korean'
import { summarizeVoiceConversation, normalizePhoneForVoice, getAlreadyAskedSummaryTexts } from '@/lib/voice-summary'

// Next.js 캐싱 방지 설정 (프로덕션 환경에서 항상 최신 데이터 가져오기)
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
    const body = await request.json()
    const {
      title, html, content, model, processingTime, userName,
      // 음성형 결과 필드
      result_type, voice_messages, voice_audio_url, voice_duration_seconds, content_id,
      phone,
      injected_summary_item_refs,
      voice_pay_amount,
    } = body

    const isVoice = result_type === 'voice'

    // 점사형: title + html 필수 / 음성형: title 필수
    if (!title || (!isVoice && !html)) {
      return NextResponse.json(
        { error: isVoice ? '제목은 필수입니다.' : '제목과 HTML 내용은 필수입니다.' },
        { status: 400 }
      )
    }

    // KST 시간으로 저장
    const savedAtKST = getKSTNow()

    // 저장된 결과를 Supabase에 저장 (KST 시간으로 저장)
    const insertData: Record<string, any> = {
      title,
      html: html || (isVoice ? '' : null),
      content: content || null,
      model: model || 'gemini-3-flash-preview',
      processing_time: processingTime || null,
      user_name: userName || null,
      saved_at: savedAtKST,
      created_at: savedAtKST, // KST 기준으로 저장
    }

    let data: any
    if (isVoice) {
      // 음성형: saved_results_voice 전용 테이블에 저장 (점사형과 분리)
      let finalVoiceMessages = voice_messages || null
      if (Array.isArray(finalVoiceMessages) && finalVoiceMessages.length > 0) {
        try {
          finalVoiceMessages = await normalizeVoiceMessagesToKorean(finalVoiceMessages)
        } catch {
          /* 실패 시 원본 유지 */
        }
      }
      const voiceInsert: Record<string, any> = {
        title: title,
        html: html || '',
        user_name: userName || null,
        saved_at: savedAtKST,
        created_at: savedAtKST,
        voice_messages: finalVoiceMessages,
        voice_audio_url: voice_audio_url || null,
        voice_duration_seconds: voice_duration_seconds || null,
        content_id: content_id || null,
      }
      if (voice_pay_amount != null && Number.isFinite(Number(voice_pay_amount))) {
        voiceInsert.voice_pay_amount = Number(voice_pay_amount)
      }
      const { data: voiceData, error: voiceError } = await supabase
        .from('saved_results_voice')
        .insert(voiceInsert)
        .select()
        .single()
      if (voiceError) {
        return NextResponse.json(
          { error: '음성 결과 저장에 실패했습니다.', details: voiceError.message },
          { status: 500 }
        )
      }
      data = voiceData

      // 음성형: 대화 요약 → voice_conversation_summaries (saved_result_id = saved_results_voice.id)
      let summaryStored = false
      if (Array.isArray(finalVoiceMessages) && finalVoiceMessages.length > 0) {
        const phoneRaw = String(body.phone ?? body.phoneForSave ?? phone ?? '').trim()
        const phoneNorm = normalizePhoneForVoice(phoneRaw)
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
              summaryStored = true
            }
          } catch {
            /* 요약 실패해도 저장 결과는 이미 성공 */
          }
        }
      }
      // 안부로 물어본 항목 기록
      const refsToMark = Array.isArray(injected_summary_item_refs) ? injected_summary_item_refs : []
      for (const ref of refsToMark) {
        const s = String(ref).trim()
        if (!s) continue
        const numPart = s.split('_')[0]
        const summaryId = parseInt(numPart, 10)
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

      const savedDateUTC = new Date(data.saved_at)
      const kstOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }
      const formatter = new Intl.DateTimeFormat('en-US', kstOptions)
      const parts = formatter.formatToParts(savedDateUTC)
      const year = parts.find(p => p.type === 'year')?.value || ''
      const month = parts.find(p => p.type === 'month')?.value || ''
      const day = parts.find(p => p.type === 'day')?.value || ''
      const hour = parts.find(p => p.type === 'hour')?.value || ''
      const minute = parts.find(p => p.type === 'minute')?.value || ''
      const second = parts.find(p => p.type === 'second')?.value || ''
      const savedAtKSTFormatted = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`

      return NextResponse.json(
        {
          success: true,
          data: {
            id: data.id.toString(),
            title: data.title,
            html: data.html,
            savedAt: savedAtKSTFormatted,
            savedAtISO: data.saved_at,
            content: null,
            model: null,
            processingTime: null,
            userName: data.user_name,
            resultType: 'voice',
            voiceMessages: data.voice_messages || null,
            voiceAudioUrl: data.voice_audio_url || null,
            voiceDurationSeconds: data.voice_duration_seconds || null,
            contentId: data.content_id || null,
            summaryStored,
          },
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      )
    }

    // 점사형: content_id 저장
    const fortuneContentId = content?.id ?? content_id
    if (fortuneContentId != null) insertData.content_id = Number(fortuneContentId)

    const { data: fortuneData, error } = await supabase
      .from('saved_results')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: '저장된 결과 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }
    data = fortuneData

    // 저장된 UTC 시간을 한국 시간(KST, UTC+9)으로 변환하여 포맷팅
    const savedDateUTC = new Date(data.saved_at)
    // 한국 시간으로 변환 (UTC + 9시간)
    const kstOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }
    const formatter = new Intl.DateTimeFormat('en-US', kstOptions)
    const parts = formatter.formatToParts(savedDateUTC)
    
    const year = parts.find(p => p.type === 'year')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const day = parts.find(p => p.type === 'day')?.value || ''
    const hour = parts.find(p => p.type === 'hour')?.value || ''
    const minute = parts.find(p => p.type === 'minute')?.value || ''
    const second = parts.find(p => p.type === 'second')?.value || ''
    const savedAtKSTFormatted = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`

    // 캐싱 방지 헤더 설정 (프로덕션 환경에서 브라우저/CDN 캐싱 방지)
    return NextResponse.json(
      {
        success: true,
        data: {
          id: data.id.toString(),
          title: data.title,
          html: data.html,
          savedAt: savedAtKSTFormatted,
          savedAtISO: data.saved_at, // UTC로 저장된 원본 날짜 (12시간/60일 경과 여부 확인용)
          content: data.content,
          model: data.model,
          processingTime: data.processing_time,
          userName: data.user_name,
          resultType: data.result_type || 'fortune',
          voiceMessages: data.voice_messages || null,
          voiceAudioUrl: data.voice_audio_url || null,
          voiceDurationSeconds: data.voice_duration_seconds || null,
          contentId: data.content_id || null,
        }
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

