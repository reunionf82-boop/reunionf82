'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildManseBundle, type BirthInput, type CalendarType } from '@/lib/voice-mvp/manse'
import {
  getKstTimeInstructionBlock,
  getKoreaContextVars,
  getAndIncrementVisitCountToday,
  getVisitGuidanceText,
  sanitizeForTts,
} from '@/lib/voice-mvp/ppoing-rules'
import { buildResultStyleManseBlock } from '@/lib/manse-ryeok-display'
import { AudioRecorder } from '@/lib/voice-mvp/genai-live/audio-recorder'
import { AudioStreamer } from '@/lib/voice-mvp/genai-live/audio-streamer'
import { audioContext, base64ToArrayBuffer } from '@/lib/voice-mvp/genai-live/utils'
import VolMeterWorket from '@/lib/voice-mvp/genai-live/worklets/vol-meter'
import { Modality } from '@google/genai/web'

/* ── 상수 ────────────────────────────────── */
const LIVE_MODEL_FALLBACK = 'gemini-2.5-flash-native-audio-preview-12-2025'

const AUTO_RECONNECT_MAX = 3
const AUTO_RECONNECT_DELAYS = [2000, 4000, 6000]
/** 정적 깨기: 이 볼륨 이상이면 사용자가 말하는 것으로 간주. micSensitivity(0-100)로 조정. */
const SPEECH_THRESHOLD_MIN = 0.01
const SPEECH_THRESHOLD_MAX = 0.05

const PRIMARY_REGION =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VERTEX_LIVE_PRIMARY_REGION) || 'us-central1'
const FAILOVER_REGIONS = PRIMARY_REGION === 'us-central1' ? ['us-central1'] : ['us-central1']
const REGIONS = [PRIMARY_REGION, ...FAILOVER_REGIONS]
const SESSION_FAILOVER_AFTER_MS = 9 * 60 * 1000
const FAILOVER_CHECK_INTERVAL_MS = 60 * 1000

function getNextRegion(current: string) {
  const i = REGIONS.indexOf(current)
  if (i < 0) return PRIMARY_REGION
  return REGIONS[(i + 1) % REGIONS.length]
}

function normalizeLiveModel(base: string) {
  const trimmed = String(base || '').trim()
  if (!trimmed) return LIVE_MODEL_FALLBACK
  const model = trimmed.replace(/^models\//, '')
  if (model.includes('-exp')) return LIVE_MODEL_FALLBACK
  if (model.includes('native-audio')) return model
  return LIVE_MODEL_FALLBACK
}

/* ── PCM16 base64 → WAV Blob 변환 ────────── */
function pcm16Base64ToWavBlob(chunks: string[], sampleRate = 24000): Blob {
  // base64 → raw PCM bytes
  const binaryStrings = chunks.map((b64) => atob(b64))
  let totalLen = 0
  for (const s of binaryStrings) totalLen += s.length
  const pcm = new Uint8Array(totalLen)
  let offset = 0
  for (const s of binaryStrings) {
    for (let i = 0; i < s.length; i++) pcm[offset++] = s.charCodeAt(i)
  }
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)
  const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }
  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeStr(36, 'data')
  view.setUint32(40, dataSize, true)
  new Uint8Array(buffer, 44).set(pcm)
  return new Blob([buffer], { type: 'audio/wav' })
}

/** Supabase 스토리지 등 외부 오디오 URL을 같은 오리진 프록시로 바꿔, AudioContext/녹음 믹스 시 CORS 오류를 방지합니다. */
function getAudioSrc(url: string): string {
  if (typeof url !== 'string' || !url.trim()) return url
  try {
    const u = new URL(url)
    const base = typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_SUPABASE_URL : ''
    if (!base) return url
    const host = u.hostname.toLowerCase()
    const allowed = new URL(base).hostname.toLowerCase()
    if (host === allowed || host.endsWith('.supabase.co') || host.endsWith('.supabase.in')) {
      // Supabase CDN 캐시 무효화: 원본 URL에 v= 쿼리 추가 → 변경된 파일이 바로 반영되도록
      const sep = u.search ? '&' : '?'
      const bustedUrl = `${url}${sep}v=${Date.now()}`
      return `/api/proxy/audio?url=${encodeURIComponent(bustedUrl)}`
    }
  } catch {
    // ignore
  }
  return url
}

function styleInstruction(style: string) {
  switch (style) {
    case 'bright':
      return '말투: 밝고 경쾌하게. 문장은 짧게, 긍정적인 표현을 사용하되 과장하지 마세요.'
    case 'firm':
      return '말투: 단호하고 명확하게. 핵심을 먼저 말하고, 불필요한 수식어를 줄이세요.'
    case 'empathetic':
      return '말투: 공감적으로. 먼저 감정을 인정하고, 그 다음 현실적인 조언을 제시하세요.'
    case 'warm':
      return '말투: 다정하고 따뜻하게. 부드러운 표현과 배려하는 어조로 이야기하세요.'
    case 'calm':
    default:
      return '말투: 차분하고 안정감 있게. 속도는 너무 빠르지 않게, 정리된 흐름으로 말하세요.'
  }
}

export type Msg = { role: 'user' | 'assistant' | 'system'; text: string }

export function useVoiceResult() {
  const router = useRouter()

  /* ── 기본 상태 ─────────────────────────── */
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [contentData, setContentData] = useState<any>(null)
  const [visitCountToday, setVisitCountToday] = useState(1)
  const [manseBlockHtml, setManseBlockHtml] = useState('')
  const [manseText, setManseText] = useState('')
  const [showManse, setShowManse] = useState(true)

  /* ── 음성 상태 ─────────────────────────── */
  const [connected, setConnected] = useState(false)
  const [muted, setMuted] = useState(false)
  const [inVolume, setInVolume] = useState(0)
  const [outVolume, setOutVolume] = useState(0)
  const [micSensitivity, setMicSensitivity] = useState(50) // 0=낮음, 100=높음
  const [messages, setMessages] = useState<Msg[]>([])

  /* ── 타이머 ────────────────────────────── */
  const [totalSeconds, setTotalSeconds] = useState(0) // 구매한 총 초
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [showExtendPopup, setShowExtendPopup] = useState(false)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const extendPopupShownRef = useRef(false)
  const sessionStartedRef = useRef(false)

  /* ── WS / 오디오 refs ──────────────────── */
  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const streamerRef = useRef<AudioStreamer | null>(null)
  const isAiSpeakingRef = useRef(false)
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const manualDisconnectRef = useRef(false)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasConnectedRef = useRef(false)
  const autoReconnectCountRef = useRef(0)
  const autoReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionStartTimeRef = useRef<number | null>(null)
  const failoverCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const plannedFailoverRef = useRef(false)
  const currentRegionRef = useRef(PRIMARY_REGION)
  const failoverRegionRef = useRef<string | null>(null)
  const conversationContextForReconnectRef = useRef<string | null>(null)
  const messagesRef = useRef<Msg[]>([])
  const pendingWsRef = useRef<WebSocket | null>(null)
  const closingForSwapRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* ── 음성 대화 저장용 refs ──────────────── */
  const audioChunksRef = useRef<string[]>([]) // AI 오디오 base64 청크 누적 (fallback용)
  const [savingConversation, setSavingConversation] = useState(false)
  const conversationSavedRef = useRef(false) // 중복 저장 방지
  const leaveAfterSaveRef = useRef(false) // 저장 후 /form 이동용
  /** 이번 세션에서 안부로 물어본 항목 ref (저장 시 injected_summary_item_refs로 전달해 재질문 방지) */
  const injectedSummaryItemRefsRef = useRef<string[]>([])

  /* ── 나가기 전 저장 확인 모달 ───────────── */
  const [showLeaveConfirmModal, setShowLeaveConfirmModal] = useState(false)
  const [isNavigatingAway, setIsNavigatingAway] = useState(false)

  /* ── 종료 버튼 클릭 시 확인 팝업 (남은 시간 + 계속/정말 종료) ── */
  const [showExitConfirmPopup, setShowExitConfirmPopup] = useState(false)

  /* ── 점사 진행 중 이전/홈 클릭 시 나가기 방지 팝업 ── */
  const [showInProgressBlockModal, setShowInProgressBlockModal] = useState(false)

  // 양방향 오디오 녹음 (MediaRecorder: 마이크 + AI 출력 믹스)
  const mixedMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mixedChunksRef = useRef<Blob[]>([])
  const mixedDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)

  // 효과음
  const startSoundRef = useRef<HTMLAudioElement | null>(null)
  const conversationSoundsRef = useRef<(HTMLAudioElement | null)[]>([])
  const bubbleProbRef = useRef(0)
  const startSoundPlayedRef = useRef(false)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const micSensitivityRef = useRef(micSensitivity)
  micSensitivityRef.current = micSensitivity

  messagesRef.current = messages

  /* ── 결제/콘텐츠 정보 로드 ─────────────── */
  const contentIdRef = useRef<string | null>(null)
  const voiceMinutesRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(async () => {
      try {
        const cid =
          sessionStorage.getItem('result_content_id') ||
          sessionStorage.getItem('payment_content_id') ||
          localStorage.getItem('voice_content_id') ||
          null
        const storedVoiceMin = sessionStorage.getItem('payment_voice_minutes')
        if (!cid) {
          setError('결제 정보를 찾을 수 없습니다.')
          setLoading(false)
          return
        }
        contentIdRef.current = cid

        // 콘텐츠 상세 로드 (캐시 무효화: 저장 후 소리 설정이 바로 반영되도록)
        const res = await fetch(`/api/content/${cid}?full=true&_t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('콘텐츠를 불러올 수 없습니다.')
        const data = await res.json()
        const c = data?.data || data?.content || data
        console.log('[VoiceResult] contentId:', cid, 'voice_advisor_video_url:', c?.voice_advisor_video_url, 'content_type:', c?.content_type)

        // voice_time_options: JSONB가 문자열로 내려올 수 있으므로 파싱 보장
        if (c && c.voice_time_options) {
          try {
            const raw = c.voice_time_options
            c.voice_time_options = typeof raw === 'string' ? JSON.parse(raw) : raw
          } catch { c.voice_time_options = [] }
        }
        console.log('[VoiceResult] voice_time_options:', c?.voice_time_options)

        // 시간 결정: sessionStorage 값 → voice_time_options 첫 번째 → fallback 5분
        let voiceMin = 5
        if (storedVoiceMin) {
          voiceMin = parseInt(storedVoiceMin, 10)
        } else if (Array.isArray(c?.voice_time_options) && c.voice_time_options.length > 0) {
          voiceMin = c.voice_time_options[0].minutes || 5
        }
        voiceMinutesRef.current = voiceMin
        const secs = voiceMin * 60
        setTotalSeconds(secs)
        // 이전에 시간이 0이 된 적 있으면 재진입 시에도 0 유지 (이전/홈 후 다시 5분으로 복구 방지)
        const expired = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('voice_time_expired') === '1'
        setRemainingSeconds(expired ? 0 : secs)
        console.log('[VoiceResult] voiceMinutes:', voiceMin, '(source:', storedVoiceMin ? 'sessionStorage' : 'voice_time_options[0]', ')', expired ? ', expired: remaining=0' : '')

        setContentData(c)

        // 방문 빈도 (당일 localStorage 기준)
        const count = getAndIncrementVisitCountToday()
        setVisitCountToday(count)

        // 효과음 세팅
        const convSounds = c?.voice_conversation_sounds
        const soundList = Array.isArray(convSounds) && convSounds.length > 0
          ? convSounds
          : (c?.voice_bubble_sound_url ? [{ label: '방울 소리', url: c.voice_bubble_sound_url }] : [])
        const probPct = typeof c?.voice_conversation_sound_probability_pct === 'number'
          ? c.voice_conversation_sound_probability_pct
          : (c?.voice_bubble_sound_probability_pct ?? 0)
        console.log('[VoiceResult] sound setup: start_url=', c?.voice_start_sound_url, 'conversation_sounds=', soundList.length, 'prob_pct=', probPct)
        if (c?.voice_start_sound_url) {
          const startAudio = new Audio()
          startAudio.crossOrigin = 'anonymous'
          startAudio.src = getAudioSrc(c.voice_start_sound_url)
          startAudio.preload = 'auto'
          startAudio.addEventListener('canplaythrough', () => console.log('[VoiceResult] start sound loaded & ready'))
          startAudio.addEventListener('error', (e) => console.error('[VoiceResult] start sound load error:', e))
          startSoundRef.current = startAudio
          // 시작 소리는 상담 연결(ready) 시 한 번 재생하여 녹음에 포함됨 (페이지 로드 시 재생 제거)
        }
        conversationSoundsRef.current = soundList
          .filter((s: any) => s?.url)
          .map((s: any) => {
            const a = new Audio()
            a.crossOrigin = 'anonymous'
            a.src = getAudioSrc(s.url)
            a.preload = 'auto'
            a.addEventListener('error', (e) => console.error('[VoiceResult] conversation sound load error:', e))
            return a
          })
        bubbleProbRef.current = probPct / 100

        // 만세력 계산: sessionStorage → 없으면 oid로 API 조회 (모바일 팝업 등 fallback)
        let gender = sessionStorage.getItem('payment_user_gender') || 'male'
        let year = parseInt(sessionStorage.getItem('payment_user_year') || '0', 10)
        let month = parseInt(sessionStorage.getItem('payment_user_month') || '0', 10)
        let day = parseInt(sessionStorage.getItem('payment_user_day') || '0', 10)
        let calendarType = (sessionStorage.getItem('payment_user_calendar_type') || 'solar') as CalendarType
        let birthHour = sessionStorage.getItem('payment_user_birth_hour') || null
        let userName = sessionStorage.getItem('payment_user_name') || ''

        if (!year || !month || !day) {
          // oid를 여러 소스에서 탐색 (모바일에서 sessionStorage가 유실될 수 있으므로)
          const oid =
            sessionStorage.getItem('payment_oid') ||
            (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('oid') : null) ||
            localStorage.getItem('payment_success_oid') ||
            localStorage.getItem('voice_payment_oid') ||
            null
          console.log('[VoiceResult] manse fallback oid:', oid, '(year/month/day missing)')
          if (oid) {
            try {
              const manseRes = await fetch(`/api/payment/manse-data?oid=${encodeURIComponent(oid)}`, { cache: 'no-store' })
              if (manseRes.ok) {
                const manseJson = await manseRes.json()
                const d = manseJson?.data
                if (d?.birthYear != null && d?.birthMonth != null && d?.birthDay != null) {
                  year = Number(d.birthYear)
                  month = Number(d.birthMonth)
                  day = Number(d.birthDay)
                  birthHour = d.birthHour ?? null
                  gender = d.gender === 'female' ? 'female' : 'male'
                  calendarType = (d.calendarType || 'solar') as CalendarType
                  userName = d.userName || ''
                  console.log('[VoiceResult] manse data from API (oid fallback)')
                }
              }
            } catch (err) {
              console.warn('[VoiceResult] manse-data fetch failed:', err)
            }
          }
        }

        if (year && month && day) {
          const input: BirthInput = { name: userName, gender: gender as 'male' | 'female', year, month, day, calendarType, birthHour }
          const bundle = buildManseBundle(input)
          setManseBlockHtml(buildResultStyleManseBlock(bundle.manse_table))
          setManseText(bundle.manse_text)
        }
      } catch (e: any) {
        setError(e?.message || '로딩 중 오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /* ── 자동 연결 (페이지 진입 시 버튼 없이 바로 시작) ── */
  const autoConnectTriedRef = useRef(false)
  useEffect(() => {
    if (loading || !contentData || connected || autoConnectTriedRef.current) return
    if (remainingSeconds <= 0) return // 시간 이미 종료
    autoConnectTriedRef.current = true
    // 약간의 딜레이 후 자동 연결 (렌더링 안정화)
    const t = setTimeout(() => { connect() }, 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, contentData])

  /* ── 페이지 이탈 시 대화 저장 (뒤로가기, 탭 닫기 등) ── */
  useEffect(() => {
    // sendBeacon으로 텍스트 대화만 빠르게 저장 (오디오 업로드는 불가)
    const saveViaBeacon = () => {
      if (conversationSavedRef.current) return
      if (!sessionStartedRef.current) return // 상담이 시작된 적 없으면 skip
      conversationSavedRef.current = true
      const msgs = messagesRef.current.filter((m) => m.role !== 'system' && m.text !== 'pong' && m.text !== 'ping')
      const userName = sessionStorage.getItem('payment_user_name') || ''
      const phone = sessionStorage.getItem('payment_phone') || ''
      const password = sessionStorage.getItem('payment_password') || ''
      const contentTitle = contentData?.content_name || '음성 상담'
      const cid = contentIdRef.current ? parseInt(contentIdRef.current, 10) : null
      // sendBeacon은 FormData 또는 Blob만 가능 → JSON Blob 사용
      const payload = JSON.stringify({
        title: contentTitle,
        html: '', // NOT NULL 제약 대응
        result_type: 'voice',
        voice_messages: msgs.map((m) => ({ role: m.role, text: m.text })),
        voice_audio_url: null, // beacon에서는 오디오 업로드 불가
        voice_duration_seconds: totalSeconds - remainingSeconds > 0 ? totalSeconds - remainingSeconds : null,
        content_id: cid,
        userName,
        // 추가: credentials 정보 (서버에서 user_credentials 생성용)
        _beacon_phone: phone,
        _beacon_password: password,
        // 이번 세션에서 안부로 물어본 항목 (서버에서 voice_summary_asked 기록용)
        _beacon_injected_summary_item_refs: injectedSummaryItemRefsRef.current || [],
      })
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/saved-results/save-voice-beacon', blob)
      console.log('[VoiceResult] beacon save sent')
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!conversationSavedRef.current && sessionStartedRef.current) {
        saveViaBeacon()
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const handlePageHide = () => {
      if (!conversationSavedRef.current && sessionStartedRef.current) {
        saveViaBeacon()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [contentData, totalSeconds, remainingSeconds])

  /* ── 브라우저 뒤로가기 시 저장 확인 모달 ── */
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = 'voice-leave-confirm'
    history.pushState({ [key]: true }, '', window.location.href)
    const onPopState = () => {
      if (!sessionStartedRef.current || conversationSavedRef.current) return
      history.pushState({ [key]: true }, '', window.location.href)
      setShowLeaveConfirmModal(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /* ── 저장 완료 후 나가기 처리 ───────────── */
  useEffect(() => {
    if (!savingConversation && leaveAfterSaveRef.current) {
      leaveAfterSaveRef.current = false
      setIsNavigatingAway(true)
      router.push('/form')
    }
  }, [savingConversation, router])

  /* ── 정리 ──────────────────────────────── */
  useEffect(() => {
    return () => {
      if (autoReconnectTimeoutRef.current) clearTimeout(autoReconnectTimeoutRef.current)
      if (failoverCheckIntervalRef.current) clearInterval(failoverCheckIntervalRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      pendingWsRef.current?.close()
      wsRef.current?.close()
      recorderRef.current?.stop()
      streamerRef.current?.stop()
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current)
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
      // 시작소리 오디오 정리
      if (startSoundRef.current) {
        startSoundRef.current.pause()
        startSoundRef.current = null
      }
      conversationSoundsRef.current.forEach((a) => { a?.pause(); try { (a as any).src = '' } catch { /* ignore */ } })
      conversationSoundsRef.current = []
    }
  }, [])

  /* ── 모델/시스템 프롬프트 ──────────────── */
  const model = useMemo(() => {
    return normalizeLiveModel(contentData?.voice_model || '')
  }, [contentData])

  const systemAndContext = useMemo(() => {
    if (!contentData) return { systemText: '', contextText: '' }
    const persona = String(contentData.voice_persona_prompt || '').trim()
    const style = String(contentData.voice_style || 'calm').trim()
    const userName = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : ''
    const isPpoing = String(contentData?.payment_code || '') === '8006'

    const counselorName = String(contentData.voice_counselor_name || '').trim()
    const pitch = contentData.voice_pitch != null && contentData.voice_pitch !== ''
    const rate = contentData.voice_speaking_rate != null && contentData.voice_speaking_rate !== ''
    const gain = contentData.voice_volume_gain != null && contentData.voice_volume_gain !== ''
    const speechParams: string[] = []
    if (pitch && Number.isFinite(Number(contentData.voice_pitch))) speechParams.push(`음높이 ${contentData.voice_pitch} semitone`)
    if (rate && Number.isFinite(Number(contentData.voice_speaking_rate))) speechParams.push(`말하는 속도 ${contentData.voice_speaking_rate}배`)
    if (gain && Number.isFinite(Number(contentData.voice_volume_gain))) speechParams.push(`음량 gain ${contentData.voice_volume_gain}dB`)
    const speechLine = speechParams.length > 0 ? `\n[음성 연출] ${speechParams.join(', ')}로 전달해 주세요.\n` : ''

    const systemText = `당신은 한국어로 대답하는 실시간 음성 상담사입니다.
- 시간/날짜 질문 시 context의 한국 시각(KST)만 사용. UTC·GMT 언급 절대 금지.
${persona ? `\n[페르소나]\n${persona}\n` : ''}
- ${styleInstruction(style)}
- 목표: 공감 + 구체적 조언 + 마지막에 질문 1개
- 길이: 6~12문장
${speechLine}
[첫 인사 규칙]
- 상담이 시작되면 유저가 말하기 전에 당신이 먼저 인사를 건네세요.
- "${counselorName || '상담사'}"로서 따뜻하고 신비로운 분위기로 내담자의 이름을 부르며 짧게 인사하세요.
- 첫 인사는 2~3문장으로 짧게, 내담자가 편안함을 느끼도록 합니다.
- 예시: "어서 오세요, [이름]님. 제가 기다리고 있었어요. 무엇이 궁금하신가요?"
`
    const kst = getKoreaContextVars()
    const gender = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_gender') || 'female' : 'female'
    const isMale = gender === 'male'
    const honorificLine = isMale
      ? '내담자 성별: 남성. 반드시 오빠 또는 삼촌으로 호칭할 것. 언니/이모 사용 금지.'
      : '내담자 성별: 여성. 반드시 언니 또는 이모로 호칭할 것. 오빠/삼촌 사용 금지.'
    const commonContextBlock = `${getKstTimeInstructionBlock()}

### 호칭 규칙(필수)
${honorificLine}
- 요일: ${kst.weekdayKo}요일, 시간대: ${kst.timeSlotHint}

`
    // 방문 빈도: 8006(뿌잉) 첫방문=인사+20초 운세, 재방문=인사만
    let visitBlock = ''
    if (isPpoing) {
      const visitGuidance = getVisitGuidanceText(visitCountToday)
      visitBlock = `
### 방문 빈도(오늘 ${visitCountToday}번째 방문)
${visitCountToday <= 1
  ? `- 내담자 "${userName || '손님'}"님이 당일 첫 방문으로 접속했습니다. 먼저 따뜻하게 인사한 후 신점으로 약 20초가량 오늘의 운세(재물운, 애정운)를 얘기해 주시오.`
  : `- 내담자 "${userName || '손님'}"님이 재접속했습니다. 인사만 간단히 하시오.`}
- 입구 테마: ${visitGuidance.openingTheme} — ${visitGuidance.openingHint}
- 출구 테마: ${visitGuidance.closingTheme} — ${visitGuidance.closingHint}

`
    }
    const contextText = `${commonContextBlock}${visitBlock}### 내담자 정보
이름: ${userName}

### 만세력
${manseText || '(만세력 없음)'}
`
    return { systemText, contextText }
  }, [contentData, manseText, visitCountToday])

  const voiceName = useMemo(() => {
    return String(contentData?.voice_name || 'Aoede').trim()
  }, [contentData])

  /* ── 타이머 ────────────────────────────── */
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) return
    sessionStartedRef.current = true
    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        const next = prev - 1
        // 30초 전 추가결제 팝업
        if (next === 30 && !extendPopupShownRef.current) {
          extendPopupShownRef.current = true
          setShowExtendPopup(true)
        }
        // 시간 종료 — 즉시 disconnect 하지 않고 연장 기회 제공
        if (next <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
          }
          try {
            sessionStorage.setItem('voice_time_expired', '1')
          } catch { /* ignore */ }
          // 연장 팝업이 아직 표시되지 않았으면 표시
          if (!extendPopupShownRef.current) {
            extendPopupShownRef.current = true
          }
          setShowExtendPopup(true)
          // disconnect는 팝업 닫기 시 수행 (dismissExtendPopup에서 처리)
          return 0
        }
        return next
      })
    }, 1000)
  }, [])

  /* ── 침묵 깨기 ─────────────────────────── */
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const sendSilenceBreakRef = useRef<(sec: number, onTtsEnd?: () => void) => Promise<void>>(async () => {})

  const sendSilenceBreak = useCallback(async (silenceSeconds: number, onTtsEnd?: () => void) => {
    clearSilenceTimer()
    const cid = contentIdRef.current
    if (!cid) return
    try {
      const res = await fetch('/api/voice/silence-break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentId: cid, silenceSeconds }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!data?.success || !data?.text) return
      const text = String(data.text).trim()
      setMessages((prev) => [...prev, { role: 'assistant', text }])

      // Live API로 전달해 AI 캐릭터 목소리로 재생 (speechSynthesis 로봇 음성 대체)
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        const instruction = `[침묵 깨기] 사용자가 ${silenceSeconds}초간 말이 없습니다. 당신이 먼저 말을 걸어야 합니다. 반드시 아래 문장만 음성으로 말하세요. 다른 설명이나 추가 말 금지: "${text}"`
        ws.send(JSON.stringify({ type: 'text', text: instruction }))
        // Live API는 비동기 응답이므로, AI가 1~2문장 말하는 데 걸리는 시간(약 4초) 후 다음 침묵 타이머 시작
        setTimeout(() => onTtsEnd?.(), 4000)
      } else if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(sanitizeForTts(text) || text)
        u.lang = 'ko-KR'
        u.rate = 1.05
        u.onend = () => { onTtsEnd?.() }
        window.speechSynthesis.speak(u)
      } else {
        onTtsEnd?.()
      }
    } catch {
      onTtsEnd?.()
    }
  }, [clearSilenceTimer])

  sendSilenceBreakRef.current = sendSilenceBreak

  /* ── Failover ──────────────────────────── */
  const connectPendingFailoverRef = useRef<() => void>(() => {})

  const startFailoverCheckInterval = useCallback(() => {
    if (failoverCheckIntervalRef.current) clearInterval(failoverCheckIntervalRef.current)
    failoverCheckIntervalRef.current = setInterval(() => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
      if (pendingWsRef.current != null) return
      const start = sessionStartTimeRef.current
      if (start == null || Date.now() - start < SESSION_FAILOVER_AFTER_MS) return
      clearInterval(failoverCheckIntervalRef.current!)
      failoverCheckIntervalRef.current = null
      plannedFailoverRef.current = true
      const list = messagesRef.current.filter((m) => m.role === 'assistant' || m.role === 'system')
      const contextLines = list.map((m) => (m.role === 'assistant' ? `상담사: ${m.text}` : `시스템: ${m.text}`))
      conversationContextForReconnectRef.current = contextLines.slice(-50).join('\n')
      failoverRegionRef.current = getNextRegion(currentRegionRef.current)
      setError('리전 전환 중... (상담은 계속됩니다)')
      connectPendingFailoverRef.current()
    }, FAILOVER_CHECK_INTERVAL_MS)
  }, [])

  const connectPendingFailover = useCallback(() => {
    const region = failoverRegionRef.current
    const priorContext = conversationContextForReconnectRef.current
    if (!region) return
    const wsUrl = resolveWsUrl()
    const pendingWs = new WebSocket(wsUrl)
    pendingWsRef.current = pendingWs

    let sysText = systemAndContext.systemText
    if (priorContext) sysText = `${sysText}\n\n[이전 상담 맥락 (이어서 상담해 주세요)]\n${priorContext}`
    const config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      systemInstruction: { parts: [{ text: `${sysText}\n\n${systemAndContext.contextText}` }] },
    }

    pendingWs.onopen = () => {
      pendingWs.send(JSON.stringify({ type: 'ping' }))
      setTimeout(() => {
        try { pendingWs.send(JSON.stringify({ type: 'init', model, config, region })) }
        catch { pendingWsRef.current = null; plannedFailoverRef.current = false }
      }, 60)
    }
    pendingWs.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(String(event.data || '{}'))
        if (msg.type === 'ready') {
          closingForSwapRef.current = true
          const oldWs = wsRef.current
          wsRef.current = pendingWsRef.current
          pendingWsRef.current = null
          if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null }
          oldWs?.close()
          sessionStartTimeRef.current = Date.now()
          currentRegionRef.current = region
          conversationContextForReconnectRef.current = null
          failoverRegionRef.current = null
          pingIntervalRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'ping' }))
          }, 30000)
          startFailoverCheckInterval()
          setError('')
          setMessages((prev) => [...prev, { role: 'system', text: '리전 전환 완료.' }])
          return
        }
        if (msg.type === 'audio' && msg.data) {
          const buf = base64ToArrayBuffer(msg.data)
          streamerRef.current?.addPCM16(new Uint8Array(buf))
          return
        }
        if (msg.type === 'interrupted') { streamerRef.current?.stop(); isAiSpeakingRef.current = false }
      } catch { /* ignore */ }
    }
    pendingWs.onerror = () => { pendingWsRef.current = null; plannedFailoverRef.current = false; setError('리전 전환 실패.') }
    pendingWs.onclose = () => { if (pendingWsRef.current === pendingWs) { pendingWsRef.current = null; plannedFailoverRef.current = false } }
  }, [systemAndContext, model, voiceName, startFailoverCheckInterval])

  connectPendingFailoverRef.current = connectPendingFailover

  /* ── WS URL 해석 ───────────────────────── */
  function resolveWsUrl() {
    const envProxy = String(process.env.NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL || '').trim()
    if (envProxy) {
      if (envProxy.startsWith('ws://') || envProxy.startsWith('wss://')) return envProxy
      if (envProxy.startsWith('http://') || envProxy.startsWith('https://')) return envProxy.replace(/^http/, 'ws')
      return `${window.location.origin}${envProxy.startsWith('/') ? '' : '/'}${envProxy}`.replace(/^http/, 'ws')
    }
    return `${window.location.origin.replace(/^http/, 'ws')}/api/voice-mvp/live-proxy`
  }

  /* ── 내부 disconnect ───────────────────── */
  const saveConversationRef = useRef<() => Promise<void>>()

  function disconnectInternal(skipSave = false) {
    manualDisconnectRef.current = true
    clearSilenceTimer()
    recorderRef.current?.stop()
    streamerRef.current?.stop()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }))
      wsRef.current.close()
    }
    setConnected(false)
    isAiSpeakingRef.current = false
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
    // 나가기 직후 폼 화면에서 소리 안 나도록 모든 오디오 즉시 정지
    if (startSoundRef.current) {
      startSoundRef.current.pause()
      startSoundRef.current.currentTime = 0
    }
    conversationSoundsRef.current.forEach((a) => {
      if (a) {
        a.pause()
        try { (a as HTMLAudioElement).src = '' } catch { /* ignore */ }
      }
    })
    // MediaRecorder 중지 (양방향 녹음)
    try {
      if (mixedMediaRecorderRef.current && mixedMediaRecorderRef.current.state !== 'inactive') {
        mixedMediaRecorderRef.current.stop()
      }
    } catch { /* ignore */ }
    // 마이크 소스 정리
    try { micSourceNodeRef.current?.disconnect() } catch { /* ignore */ }
    // 상담 종료 시 대화 저장 (skipSave=true: 추가 결제 후 재진입용)
    if (!skipSave && !conversationSavedRef.current) {
      setTimeout(() => { saveConversationRef.current?.() }, 100)
    }
  }

  /* ── connect ───────────────────────────── */
  const connect = useCallback(async () => {
    setError('')
    startSoundPlayedRef.current = false // 이번 연결에서 ready 시 종소리 1회 재생
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) return

      // 브라우저 오디오 잠금 해제 (사용자 클릭 컨텍스트에서 호출되어야 함)
      // 방울소리를 volume=0으로 짧게 play → pause 하여 브라우저가 재생 허용하도록 등록
      const unlockAudio = (audio: HTMLAudioElement | null) => {
        if (!audio) return
        const origVol = audio.volume
        audio.volume = 0
        audio.play().then(() => {
          audio.pause()
          audio.currentTime = 0
          audio.volume = origVol
        }).catch(() => {})
      }
      conversationSoundsRef.current.forEach((a) => unlockAudio(a))

      // audio output
      if (!streamerRef.current) {
        const outCtx = await audioContext({ id: 'voice-result-out' })
        const streamer = new AudioStreamer(outCtx)
        await streamer.addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
          setOutVolume(ev.data.volume)
        })
        streamerRef.current = streamer

        // 양방향 오디오 녹음 설정: AI 출력 + 마이크 → MediaRecorder
        try {
          const dest = outCtx.createMediaStreamDestination()
          mixedDestinationRef.current = dest
          // AI 출력(gainNode)을 녹음 destination에도 연결 (stop() 시 재연결도 자동)
          streamer.connectExtraDestination(dest)
          // 마이크 스트림을 AI 출력 AudioContext에 소스로 연결
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
          const micSource = outCtx.createMediaStreamSource(micStream)
          micSource.connect(dest) // 마이크 → 녹음 destination
          micSourceNodeRef.current = micSource
          // 시작 소리·방울 소리도 녹음에 포함 (재생은 그대로 들리도록 destination에도 연결)
          if (startSoundRef.current) {
            try {
              const startSource = outCtx.createMediaElementSource(startSoundRef.current)
              startSource.connect(dest)
              startSource.connect(outCtx.destination)
            } catch (e: any) {
              console.warn('[VoiceResult] start sound to mix failed:', e?.message)
            }
          }
          conversationSoundsRef.current.forEach((audio) => {
            if (!audio) return
            try {
              const source = outCtx.createMediaElementSource(audio)
              source.connect(dest)
              source.connect(outCtx.destination)
            } catch (e: any) {
              console.warn('[VoiceResult] conversation sound to mix failed:', e?.message)
            }
          })
          // MediaRecorder 시작
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm'
          const mr = new MediaRecorder(dest.stream, { mimeType })
          mixedChunksRef.current = []
          mr.ondataavailable = (e) => {
            if (e.data.size > 0) mixedChunksRef.current.push(e.data)
          }
          mr.start(1000) // 1초마다 데이터 수집
          mixedMediaRecorderRef.current = mr
          console.log('[VoiceResult] Mixed audio recording started (mic + AI)')
        } catch (recErr: any) {
          console.warn('[VoiceResult] Mixed recording setup failed:', recErr?.message)
        }
      }
      await streamerRef.current.resume()

      let sysText = systemAndContext.systemText
      const contextText = systemAndContext.contextText
      // 1) 리전 전환(failover) 맥락
      const priorContext = conversationContextForReconnectRef.current
      if (priorContext) {
        sysText = `${sysText}\n\n[이전 상담 맥락 (이어서 상담해 주세요)]\n${priorContext}`
        conversationContextForReconnectRef.current = null
      }
      // 2) 추가 결제 후 재진입 — sessionStorage에서 대화 맥락 복원
      let isResumedSession = false
      try {
        const savedContext = sessionStorage.getItem('voice_conversation_context')
        if (savedContext && !priorContext) {
          sysText = `${sysText}\n\n[이전 상담 대화 내역 — 추가 결제 후 이어서 상담 중입니다. 이전 맥락을 기억하고 자연스럽게 이어가세요.]\n${savedContext}`
          isResumedSession = true
          sessionStorage.removeItem('voice_conversation_context') // 한 번 사용 후 제거
          console.log('[VoiceResult] resumed session with saved conversation context')
        }
      } catch { /* ignore */ }

      const config: any = {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
        systemInstruction: { parts: [{ text: `${sysText}\n\n${contextText}` }] },
        // AI가 먼저 말하도록 Proactive Audio 활성화
        proactivity: { proactiveAudio: true },
      }

      const envProxy = String(process.env.NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL || '').trim()
      if (!envProxy) {
        const initUrl = `${window.location.origin}/api/voice-mvp/live-proxy`
        try { await fetch(initUrl, { method: 'GET', cache: 'no-store' }) } catch (e: any) { throw new Error(e?.message || 'Live 프록시 초기화 실패') }
      }
      const wsUrl = resolveWsUrl()
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
          const region = failoverRegionRef.current || currentRegionRef.current
          if (failoverRegionRef.current) failoverRegionRef.current = null
          currentRegionRef.current = region
          setTimeout(() => {
            try { ws.send(JSON.stringify({ type: 'init', model, config, region })) }
            catch (e: any) { setError(e?.message || 'init 전송 실패') }
          }, 60)
        } catch (e: any) { setError(e?.message || 'init 전송 실패') }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data || '{}'))
          if (msg.type === 'ready') {
            wasConnectedRef.current = true
            autoReconnectCountRef.current = 0
            sessionStartTimeRef.current = Date.now()
            setConnected(true)
            isAiSpeakingRef.current = false
            if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null }
            pingIntervalRef.current = setInterval(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: 'ping' }))
            }, 30000)
            startFailoverCheckInterval()
            // 시작 종소리 재생 (녹음에 포함되도록 연결 후 재생)
            if (startSoundRef.current && !startSoundPlayedRef.current) {
              startSoundPlayedRef.current = true
              startSoundRef.current.currentTime = 0
              startSoundRef.current.play().catch((e: unknown) => console.warn('[VoiceResult] start sound play on ready:', (e as Error)?.message))
            }
            // 타이머 시작
            startTimer()

            // AI 첫 인사 트리거: 콘텐츠(어드민) 설정 우선, 없으면 API/기본값. {{userName}} 치환
            const userName2 = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : ''
            const defaultInitial =
              userName2
                ? `[시스템] 내담자 "${userName2}"님이 접속했습니다. 먼저 따뜻하게 인사한 후 만세력을 기반으로 약 20초가량 사주 재물운 운세 재회운을 얘기해 주세요.`
                : `[시스템] 내담자가 접속했습니다. 먼저 따뜻하게 인사한 후 만세력을 기반으로 약 20초가량 사주 재물운 운세 재회운을 얘기해 주세요.`
            const defaultResumed =
              userName2
                ? `[시스템] 내담자 "${userName2}"님이 추가 결제 후 다시 접속했습니다. "다시 오셨군요" 등의 자연스러운 인사와 함께, 이전 대화 맥락을 기억하면서 이어서 상담해 주세요.`
                : `[시스템] 내담자가 추가 결제 후 다시 접속했습니다. 이전 대화 맥락을 기억하면서 자연스럽게 이어서 상담해 주세요.`
            ;(async () => {
              let greetTrigger: string
              const fromContent = isResumedSession
                ? String(contentData?.voice_resumed_greet_prompt ?? '').trim()
                : String(contentData?.voice_initial_greet_prompt ?? '').trim()
              if (fromContent) {
                greetTrigger = fromContent.replace(/\{\{userName\}\}/g, userName2 || '')
              } else {
                try {
                  const res = await fetch('/api/voice-mvp/initial-greet', { cache: 'no-store' })
                  const data = await res.json().catch(() => ({} as { initial?: string | null; resumed?: string | null }))
                  const raw = isResumedSession
                    ? (data.resumed ?? defaultResumed)
                    : (data.initial ?? defaultInitial)
                  greetTrigger = typeof raw === 'string' && raw.trim()
                    ? raw.replace(/\{\{userName\}\}/g, userName2 || '')
                    : (isResumedSession ? defaultResumed : defaultInitial)
                } catch {
                  greetTrigger = isResumedSession ? defaultResumed : defaultInitial
                }
              }
              // 같은 전화번호 과거 상담 요약 중 아직 안부로 안 물어본 항목 조회 → 인사 직후 자연스럽게 안부 물어보기
              const phoneForContext = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') || '' : ''
              const contentIdForContext = contentIdRef.current ? parseInt(contentIdRef.current, 10) : null
              if (phoneForContext) {
                try {
                  const ctxRes = await fetch('/api/voice/context-for-greet', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: phoneForContext, content_id: Number.isFinite(contentIdForContext) ? contentIdForContext : null }),
                    cache: 'no-store',
                  })
                  const ctxData = await ctxRes.json().catch(() => ({} as { promptAddition?: string; itemRefs?: string[] }))
                  const promptAddition = typeof ctxData.promptAddition === 'string' ? ctxData.promptAddition.trim() : ''
                  const itemRefs = Array.isArray(ctxData.itemRefs) ? ctxData.itemRefs : []
                  if (promptAddition) greetTrigger = greetTrigger + '\n\n' + promptAddition
                  if (itemRefs.length > 0) injectedSummaryItemRefsRef.current = itemRefs
                } catch {
                  /* 실패해도 인사는 그대로 진행 */
                }
              }
              const sendGreet = () => {
                try {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'text', text: greetTrigger }))
                  }
                } catch (e: any) {
                  console.warn('[VoiceResult] greet trigger failed:', e?.message)
                }
              }
              sendGreet()
              setTimeout(sendGreet, 100)
              setTimeout(() => {
                if (recorderRef.current && wsRef.current?.readyState === WebSocket.OPEN && !muted) {
                  recorderRef.current.start().catch(() => {})
                }
              }, 1500)
            })()
            return
          }
          if (msg.type === 'audio' && msg.data) {
            const buf = base64ToArrayBuffer(msg.data)
            if (audioTimeoutRef.current) { clearTimeout(audioTimeoutRef.current); audioTimeoutRef.current = null }
            if (!isAiSpeakingRef.current) {
              isAiSpeakingRef.current = true
              // 대화중 소리 (확률적, 목록 중 랜덤 1개)
              const list = conversationSoundsRef.current.filter(Boolean) as HTMLAudioElement[]
              const roll = Math.random()
              const prob = bubbleProbRef.current
              if (list.length > 0 && roll < prob) {
                const chosen = list[Math.floor(Math.random() * list.length)]
                chosen.currentTime = 0
                chosen.play().catch((e) => { console.warn('[VoiceResult] conversation sound play failed:', e?.message) })
              }
            }
            streamerRef.current?.addPCM16(new Uint8Array(buf))
            // AI 오디오 청크 누적 (다시듣기용)
            audioChunksRef.current.push(msg.data)
            // AI 발화 종료 감지: 500ms → 1500ms (청크 간 간격 500ms 초과 시 인사 중 오인 방지)
            audioTimeoutRef.current = setTimeout(() => {
              isAiSpeakingRef.current = false
              audioTimeoutRef.current = null
              clearSilenceTimer()
              // 첫 인사(약 20초) 동안 침묵 깨기 비활성화
              const sessionStart = sessionStartTimeRef.current
              if (sessionStart != null && Date.now() - sessionStart < 25000) return
              if (!mutedRef.current) {
                const doSend = sendSilenceBreakRef.current
                // 3초 재촉형 → TTS 후 5초 관찰형 → TTS 후 5초 환기형 (최대 3회)
                silenceTimerRef.current = setTimeout(() => {
                  silenceTimerRef.current = null
                  doSend(3, () => {
                    if (!mutedRef.current && !silenceTimerRef.current) {
                      silenceTimerRef.current = setTimeout(() => {
                        silenceTimerRef.current = null
                        doSend(5, () => {
                          if (!mutedRef.current && !silenceTimerRef.current) {
                            silenceTimerRef.current = setTimeout(() => {
                              silenceTimerRef.current = null
                              doSend(1, undefined)
                            }, 5000)
                          }
                        })
                      }, 5000)
                    }
                  })
                }, 3000)
              }
            }, 1500)
            return
          }
          if (msg.type === 'text' && msg.text) {
            const txt = String(msg.text).trim()
            // ping/pong 시스템 메시지 필터링
            if (txt !== 'pong' && txt !== 'ping') {
              setMessages((prev) => [...prev, { role: 'assistant', text: txt }])
            }
            return
          }
          // 음성 전사(transcription): AI 출력 + 사용자 입력 텍스트
          // 같은 role의 연속 전사 → 마지막 메시지에 이어 붙임 (토큰 단위로 오므로)
          if (msg.type === 'transcript' && msg.text) {
            const role = msg.role === 'user' ? 'user' : 'assistant'
            const txt = String(msg.text).trim()
            if (txt) {
              setMessages((prev) => {
                const last = prev.length > 0 ? prev[prev.length - 1] : null
                if (last && last.role === role) {
                  // 같은 role → 기존 메시지에 이어 붙임
                  const updated = [...prev]
                  updated[updated.length - 1] = { ...last, text: last.text + ' ' + txt }
                  return updated
                }
                // 다른 role → 새 메시지
                return [...prev, { role, text: txt }]
              })
            }
            return
          }
          if (msg.type === 'interrupted') {
            streamerRef.current?.stop()
            isAiSpeakingRef.current = false
            clearSilenceTimer()
            if (audioTimeoutRef.current) { clearTimeout(audioTimeoutRef.current); audioTimeoutRef.current = null }
            return
          }
          if (msg.type === 'error') {
            const errMsg = String(msg.message || 'Live 연결 오류')
            setError(errMsg)
            if (msg.code === 'SESSION_END') wsRef.current?.close()
            return
          }
        } catch { /* ignore */ }
      }
      ws.onerror = () => { setError('Live 연결 오류') }
      ws.onclose = (event) => {
        clearSilenceTimer()
        if (failoverCheckIntervalRef.current) { clearInterval(failoverCheckIntervalRef.current); failoverCheckIntervalRef.current = null }
        sessionStartTimeRef.current = null
        if (pingIntervalRef.current) { clearInterval(pingIntervalRef.current); pingIntervalRef.current = null }
        setConnected(false)
        isAiSpeakingRef.current = false
        recorderRef.current?.stop()
        streamerRef.current?.stop()
        if (manualDisconnectRef.current) { manualDisconnectRef.current = false; wasConnectedRef.current = false; return }
        if (plannedFailoverRef.current) return
        if (closingForSwapRef.current) { closingForSwapRef.current = false; return }
        setError('연결이 종료되었습니다.')

        if (wasConnectedRef.current && autoReconnectCountRef.current < AUTO_RECONNECT_MAX) {
          const attempt = autoReconnectCountRef.current
          autoReconnectCountRef.current += 1
          const delay = AUTO_RECONNECT_DELAYS[Math.min(attempt, AUTO_RECONNECT_DELAYS.length - 1)]
          setError(`연결이 끊겼습니다. ${delay / 1000}초 후 재연결 중... (${autoReconnectCountRef.current}/${AUTO_RECONNECT_MAX})`)
          autoReconnectTimeoutRef.current = setTimeout(() => {
            autoReconnectTimeoutRef.current = null
            wsRef.current = null
            connect()
          }, delay)
        }
      }

      // mic — 핸들러만 등록, start()는 'ready' 수신 후 1.8초 뒤에 호출 (AI가 먼저 말하도록)
      if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
      const recorder = recorderRef.current
      const onData = (base64: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64, mimeType: 'audio/pcm;rate=16000' }))
      }
      const onVolume = (vol: number) => {
        setInVolume(vol)
        const sens = micSensitivityRef.current
        const threshold = SPEECH_THRESHOLD_MAX - (sens / 100) * (SPEECH_THRESHOLD_MAX - SPEECH_THRESHOLD_MIN)
        if (vol > threshold) clearSilenceTimer()
      }
      recorder.off('data', onData as any).off('volume', onVolume as any).on('data', onData as any).on('volume', onVolume as any)

      setMessages([])
    } catch (e: any) {
      setError(e?.message || '연결 실패')
    }
  }, [systemAndContext, model, voiceName, muted, startFailoverCheckInterval, startTimer, clearSilenceTimer, sendSilenceBreak])

  /* ── disconnect ─────────────────────────── */
  const disconnect = useCallback(async () => {
    disconnectInternal(true) // skipSave=true, 직접 saveConversation 호출
    // disconnect 후 바로 saveConversation 실행 (await으로 완료 대기)
    if (!conversationSavedRef.current) {
      await saveConversationRef.current?.()
    }
  }, [])

  /* ── toggleMute ─────────────────────────── */
  const toggleMute = useCallback(() => {
    const next = !muted
    setMuted(next)
    if (next) {
      recorderRef.current?.stop()
    } else {
      if (connected) recorderRef.current?.start().catch(() => {})
    }
  }, [muted, connected])

  /* ── 추가 결제 닫기 ─────────────────────── */
  const dismissExtendPopup = useCallback(() => {
    setShowExtendPopup(false)
    // 시간이 이미 0 이하이면 상담 종료 (대화 저장 포함)
    if (remainingSeconds <= 0) {
      disconnectInternal() // 기본적으로 대화 저장 트리거됨
    }
  }, [remainingSeconds])

  /* ── 보이스 화면 내 추가 결제 (In-Page Payment) ── */
  const [selectedExtendOption, setSelectedExtendOption] = useState<{ minutes: number; price: number; label: string } | null>(null)
  const [extendPaymentProcessing, setExtendPaymentProcessing] = useState(false)
  const paymentWindowRef = useRef<Window | null>(null)

  const handleExtendPayment = useCallback(async (option: { minutes: number; price: number; label: string }) => {
    if (extendPaymentProcessing) return
    setExtendPaymentProcessing(true)
    try {
      // 0원 무료 추가: 모빌리언스는 1원 이상만 결제 가능하므로 즉시 연장
      if (option.price <= 0) {
        setRemainingSeconds((prev) => prev + option.minutes * 60)
        setTotalSeconds((prev) => prev + option.minutes * 60)
        if (!timerIntervalRef.current && connected) startTimer()
        extendPopupShownRef.current = false
        setShowExtendPopup(false)
        setSelectedExtendOption(null)
        setExtendPaymentProcessing(false)
        return
      }

      const { generateOrderId } = await import('@/lib/payment-utils')
      const oid = generateOrderId()
      const cid = contentIdRef.current
      const paymentMethod = sessionStorage.getItem('payment_method') || 'card'
      const userName = sessionStorage.getItem('payment_user_name') || ''
      const phoneNumber = sessionStorage.getItem('payment_phone') || ''
      const gender = sessionStorage.getItem('payment_user_gender') || null
      const calendarType = sessionStorage.getItem('payment_user_calendar_type') || undefined
      const birthYear = sessionStorage.getItem('payment_user_year') || undefined
      const birthMonth = sessionStorage.getItem('payment_user_month') || undefined
      const birthDay = sessionStorage.getItem('payment_user_day') || undefined
      const birthHour = sessionStorage.getItem('payment_user_birth_hour') || undefined

      // 1) pending 저장
      const saveRes = await fetch('/api/payment/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oid,
          contentId: cid ? parseInt(cid, 10) : 0,
          paymentCode: contentData?.payment_code || '',
          name: contentData?.content_name || '',
          pay: option.price,
          paymentType: paymentMethod,
          userName,
          phoneNumber,
          gender,
          password: sessionStorage.getItem('payment_password') || null,
          status: 'pending',
          calendarType: calendarType || undefined,
          birthYear: birthYear ? parseInt(birthYear, 10) : undefined,
          birthMonth: birthMonth ? parseInt(birthMonth, 10) : undefined,
          birthDay: birthDay ? parseInt(birthDay, 10) : undefined,
          birthHour: birthHour || undefined,
          voice_minutes: option.minutes,
          voice_time_option: JSON.stringify(option),
        }),
      })
      if (!saveRes.ok) throw new Error('결제 정보 저장 실패')

      // 2) 결제 URL 요청
      const reqRes = await fetch('/api/payment/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod,
          contentId: cid ? parseInt(cid, 10) : 0,
          paymentCode: contentData?.payment_code || '',
          name: contentData?.content_name || '',
          pay: option.price,
          userName,
          phoneNumber,
          oid,
        }),
      })
      if (!reqRes.ok) throw new Error('결제 요청 실패')
      const reqData = await reqRes.json()
      const { paymentUrl, formData, successUrl, failUrl } = reqData.data

      // 3) handlePaymentSuccess 콜백 등록
      const processExtendSuccess = async (successOid: string) => {
        console.log('[VoiceResult] extend payment success:', successOid)
        // 서버에서 결제 상태 확인
        let confirmed = false
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const statusRes = await fetch(`/api/payment/status?oid=${successOid}`, { cache: 'no-store' })
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.success && statusData.status === 'success') {
                confirmed = true
                break
              }
            }
          } catch { /* retry */ }
          if (attempt < 2) await new Promise((r) => setTimeout(r, 1000))
        }
        // localStorage 신호 체크
        if (!confirmed) {
          const lsOid = localStorage.getItem('payment_success_oid')
          if (lsOid === successOid) {
            try {
              await fetch('/api/payment/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oid: successOid }),
              })
              confirmed = true
            } catch { /* ignore */ }
          }
        }
        if (confirmed) {
          // 시간 연장
          setRemainingSeconds((prev) => prev + option.minutes * 60)
          setTotalSeconds((prev) => prev + option.minutes * 60)
          // 타이머가 멈춰있으면 다시 시작
          if (!timerIntervalRef.current && connected) {
            startTimer()
          }
          extendPopupShownRef.current = false // 다음 30초 남을 때 다시 팝업 표시
          setShowExtendPopup(false)
          setSelectedExtendOption(null)
          console.log('[VoiceResult] time extended by', option.minutes, 'minutes')
        }
        setExtendPaymentProcessing(false)
        // cleanup
        localStorage.removeItem('payment_success_oid')
        localStorage.removeItem('payment_success_timestamp')
        localStorage.removeItem('payment_success_signal')
      }

      ;(window as any).handlePaymentSuccess = async (successOid: string) => {
        await processExtendSuccess(successOid)
      }

      // localStorage, postMessage, BroadcastChannel 폴백
      const handleMessage = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.type === 'PAYMENT_SUCCESS' && event.data?.oid) {
          await processExtendSuccess(event.data.oid)
        }
      }
      const handleStorage = async (e: StorageEvent) => {
        if (!e.key) return
        if (e.key === 'payment_success_signal' || e.key === 'payment_success_oid') {
          const lsOid = localStorage.getItem('payment_success_oid')
          if (lsOid === oid) await processExtendSuccess(oid)
        }
      }
      window.addEventListener('message', handleMessage)
      window.addEventListener('storage', handleStorage)
      let bc: BroadcastChannel | null = null
      try {
        bc = new BroadcastChannel('payment_success')
        bc.addEventListener('message', async (event: MessageEvent) => {
          const data: any = event.data
          if (data?.type === 'PAYMENT_SUCCESS' && data?.oid) await processExtendSuccess(data.oid)
        })
      } catch { bc = null }

      // 4) 팝업 열기 + 폼 제출
      const redirectFields: Record<string, string> = {
        successUrl, failUrl,
        success_url: successUrl, fail_url: failUrl,
        returnUrl: successUrl, return_url: successUrl,
        ret_url: successUrl, nextUrl: successUrl,
      }
      const fullFormData: Record<string, string> = {
        ...Object.fromEntries(Object.entries(formData).map(([k, v]: [string, any]) => [k, String(v)])),
        ...redirectFields,
      }
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = paymentUrl
      form.style.display = 'none'
      Object.entries(fullFormData).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = String(value)
        form.appendChild(input)
      })
      document.body.appendChild(form)

      const paymentWindowName = `payment_extend_${oid}`
      const paymentWindow = window.open('about:blank', paymentWindowName, 'width=800,height=600')
      paymentWindowRef.current = paymentWindow

      if (!paymentWindow) {
        alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.')
        setExtendPaymentProcessing(false)
        document.body.removeChild(form)
        return
      }

      form.target = paymentWindowName
      paymentWindow.focus()
      setTimeout(() => {
        try { form.submit() } catch { /* ignore */ }
      }, 100)

      // 5) 창 모니터링
      let checkCount = 0
      const checkInterval = setInterval(async () => {
        checkCount++
        try {
          // 서버 상태 확인 (매 2초)
          if (checkCount % 2 === 0) {
            const statusRes = await fetch(`/api/payment/status?oid=${oid}`, { cache: 'no-store' })
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.success && statusData.status === 'success') {
                clearInterval(checkInterval)
                await processExtendSuccess(oid)
                cleanup()
                return
              }
            }
          }
          // localStorage 확인 (매 3초)
          if (checkCount % 3 === 0) {
            const lsOid = localStorage.getItem('payment_success_oid')
            if (lsOid === oid) {
              clearInterval(checkInterval)
              await processExtendSuccess(oid)
              cleanup()
              return
            }
          }
          // 창 닫힘 확인
          if (paymentWindow.closed) {
            clearInterval(checkInterval)
            // 마지막 상태 확인
            const statusRes = await fetch(`/api/payment/status?oid=${oid}`, { cache: 'no-store' })
            if (statusRes.ok) {
              const statusData = await statusRes.json()
              if (statusData.success && statusData.status === 'success') {
                await processExtendSuccess(oid)
              } else {
                setExtendPaymentProcessing(false)
              }
            } else {
              setExtendPaymentProcessing(false)
            }
            cleanup()
          }
        } catch { /* ignore */ }
      }, 1000)

      // cleanup 함수
      const cleanup = () => {
        window.removeEventListener('message', handleMessage)
        window.removeEventListener('storage', handleStorage)
        try { bc?.close() } catch { /* ignore */ }
        try { document.body.removeChild(form) } catch { /* ignore */ }
        if (typeof window !== 'undefined') {
          delete (window as any).handlePaymentSuccess
        }
      }

    } catch (e: any) {
      console.error('[VoiceResult] extend payment error:', e)
      alert(e?.message || '결제 처리 중 오류가 발생했습니다.')
      setExtendPaymentProcessing(false)
    }
  }, [contentData, connected, extendPaymentProcessing, startTimer])

  /* ── 상담 종료 시 대화 + 오디오 저장 ────── */
  const saveConversation = useCallback(async () => {
    if (conversationSavedRef.current) return
    if (savingConversation) return
    conversationSavedRef.current = true
    setSavingConversation(true)
    const msgs = messagesRef.current.filter((m) => m.role !== 'system' && m.text !== 'pong' && m.text !== 'ping')
    console.log('[VoiceResult] saveConversation start: msgs=', msgs.length, 'audioChunks=', audioChunksRef.current.length)

    try {
      let voiceAudioUrl: string | null = null

      // 1) 양방향 오디오 녹음 (마이크+AI) 업로드 우선, 없으면 AI 전용 PCM fallback
      if (mixedChunksRef.current.length > 0) {
        // 양방향 믹스 녹음이 있는 경우 (WebM/Opus)
        try {
          const mixedBlob = new Blob(mixedChunksRef.current, { type: mixedChunksRef.current[0]?.type || 'audio/webm' })
          console.log('[VoiceResult] Mixed audio size:', (mixedBlob.size / 1024 / 1024).toFixed(2), 'MB')
          const ext = mixedBlob.type.includes('webm') ? 'webm' : 'ogg'
          const formData = new FormData()
          formData.append('file', mixedBlob, `voice_${Date.now()}.${ext}`)
          const uploadRes = await fetch('/api/voice-upload', { method: 'POST', body: formData })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            voiceAudioUrl = uploadData.url || null
            console.log('[VoiceResult] mixed audio uploaded:', voiceAudioUrl)
          } else {
            console.warn('[VoiceResult] mixed audio upload failed:', uploadRes.status)
          }
        } catch (e: any) {
          console.warn('[VoiceResult] mixed audio upload error:', e?.message)
        }
      }
      // fallback: 양방향 녹음 실패 시 AI 전용 PCM 청크 사용
      if (!voiceAudioUrl && audioChunksRef.current.length > 0) {
        try {
          const wavBlob = pcm16Base64ToWavBlob(audioChunksRef.current)
          console.log('[VoiceResult] WAV fallback size:', (wavBlob.size / 1024 / 1024).toFixed(2), 'MB')
          const formData = new FormData()
          formData.append('file', wavBlob, `voice_${Date.now()}.wav`)
          const uploadRes = await fetch('/api/voice-upload', { method: 'POST', body: formData })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            voiceAudioUrl = uploadData.url || null
            console.log('[VoiceResult] WAV fallback uploaded:', voiceAudioUrl)
          } else {
            console.warn('[VoiceResult] WAV upload failed:', uploadRes.status)
          }
        } catch (e: any) {
          console.warn('[VoiceResult] WAV conversion/upload error:', e?.message)
        }
      }

      // 2) 상담 시간(초) 계산
      const durationSeconds = totalSeconds - remainingSeconds

      // 3) saved_results에 voice 타입으로 저장
      const userName = sessionStorage.getItem('payment_user_name') || ''
      const contentTitle = contentData?.content_name || '음성 상담'

      // voice 전용 필드로 저장 (phone: 요약 연동용, injected_summary_item_refs: 안부로 물어본 항목 기록)
      const phoneForSave = sessionStorage.getItem('payment_phone') || ''
      let savedId: string | null = null
      const voicePayload = {
        title: contentTitle,
        html: '', // NOT NULL 제약 대응: 빈 문자열
        result_type: 'voice',
        voice_messages: msgs.map((m) => ({ role: m.role, text: m.text })),
        voice_audio_url: voiceAudioUrl,
        voice_duration_seconds: durationSeconds > 0 ? durationSeconds : null,
        content_id: contentIdRef.current ? parseInt(contentIdRef.current, 10) : null,
        userName,
        phone: phoneForSave,
        injected_summary_item_refs: injectedSummaryItemRefsRef.current || [],
      }

      let saveRes = await fetch('/api/saved-results/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voicePayload),
      })

      if (!saveRes.ok) {
        // voice 컬럼이 아직 없을 수 있음 → 기본 필드 + result_type으로 재시도 (phone, voice_messages 포함해 요약 저장 가능하도록)
        const errDetail = await saveRes.text().catch(() => '')
        console.warn('[VoiceResult] voice save failed (status:', saveRes.status, errDetail, '), retrying with basic fields...')
        const fallbackPayload = {
          title: contentTitle,
          html: `<p>음성 상담 기록</p><p>상담시간: ${durationSeconds > 0 ? `${Math.floor(durationSeconds / 60)}분 ${durationSeconds % 60}초` : '알 수 없음'}</p>${msgs.length > 0 ? `<h3>대화 내용</h3>${msgs.map((m) => `<p><strong>${m.role === 'assistant' ? '상담사' : userName || '나'}:</strong> ${m.text}</p>`).join('')}` : ''}`,
          result_type: 'voice',
          userName,
          phone: phoneForSave,
          voice_messages: msgs.map((m) => ({ role: m.role, text: m.text })),
          voice_audio_url: voiceAudioUrl,
          voice_duration_seconds: durationSeconds > 0 ? durationSeconds : null,
          content_id: contentIdRef.current ? parseInt(contentIdRef.current, 10) : null,
          injected_summary_item_refs: injectedSummaryItemRefsRef.current || [],
        }
        saveRes = await fetch('/api/saved-results/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPayload),
        })
        if (!saveRes.ok) {
          const errText = await saveRes.text().catch(() => '')
          console.error('[VoiceResult] fallback save also failed:', saveRes.status, errText)
          return
        }
      }

      const saveData = await saveRes.json()
      savedId = saveData?.data?.id || null
      console.log('[VoiceResult] conversation saved, savedId:', savedId)
      if (saveData?.data?.summaryStored === false && voicePayload.voice_messages?.length) {
        console.warn('[VoiceResult] 요약이 DB에 저장되지 않았습니다. 전화번호가 전달되었는지, 또는 대화에 일정/포인트가 포함되었는지 확인하세요.')
      }

      // 4) user_credentials에 savedId 연결 (나의 이용내역에서 조회 가능하도록)
      if (savedId) {
        const phone = sessionStorage.getItem('payment_phone') || ''
        const password = sessionStorage.getItem('payment_password') || ''
        const requestKey = sessionStorage.getItem('result_request_key') || sessionStorage.getItem('payment_request_key') || ''
        console.log('[VoiceResult] linking credentials: phone=', phone ? 'YES' : 'NO', 'password=', password ? 'YES' : 'NO', 'requestKey=', requestKey || '(none)')
        if (phone && password) {
          try {
            const credRes = await fetch('/api/user-credentials/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                savedId: parseInt(savedId, 10),
                phone,
                password,
                requestKey: requestKey || undefined,
              }),
            })
            if (credRes.ok) {
              console.log('[VoiceResult] user credentials linked to savedId:', savedId)
            } else {
              const credErr = await credRes.text().catch(() => '')
              console.error('[VoiceResult] user-credentials save failed:', credRes.status, credErr)
            }
          } catch (e: any) {
            console.error('[VoiceResult] user-credentials save error:', e?.message)
          }
        } else {
          console.warn('[VoiceResult] phone or password missing in sessionStorage, cannot link credentials')
        }
      }
    } catch (e: any) {
      console.error('[VoiceResult] saveConversation error:', e?.message)
    } finally {
      setSavingConversation(false)
    }
  }, [contentData, totalSeconds, remainingSeconds, savingConversation])

  // ref 업데이트 (disconnectInternal에서 사용)
  saveConversationRef.current = saveConversation

  /* ── 시간 종료 후 폼 이동 (점사형 전용 — 음성형은 미사용) ── */
  const goBackToForm = useCallback(() => {
    router.push('/form')
  }, [router])

  /* ── 나가기 전 저장 확인: 이전/홈 시 모달 표시 ── */
  const requestLeave = useCallback(() => {
    // 연결 중(점사 진행 중)이면 나가면 점사가 중지되므로 팝업만 표시
    if (connected) {
      setShowInProgressBlockModal(true)
      return
    }
    if (conversationSavedRef.current) {
      setIsNavigatingAway(true)
      router.push('/form')
      return
    }
    if (sessionStartedRef.current) {
      setShowLeaveConfirmModal(true)
      return
    }
    setIsNavigatingAway(true)
    router.push('/form')
  }, [router, connected])

  const handleLeaveWithSave = useCallback(() => {
    setShowLeaveConfirmModal(false)
    setIsNavigatingAway(true)
    leaveAfterSaveRef.current = true
    disconnect()
  }, [disconnect])

  const handleLeaveWithoutSave = useCallback(() => {
    setShowLeaveConfirmModal(false)
    setIsNavigatingAway(true)
    disconnectInternal(true) // 폼으로 나가기 전 오디오·연결 즉시 정리 (저장 없음)
    router.push('/form')
  }, [router])

  const handleLeaveCancel = useCallback(() => {
    setShowLeaveConfirmModal(false)
  }, [])

  /* ── 종료 버튼 확인 팝업: 계속하기 / 정말 종료 → 폼 이동 ── */
  const onExitClick = useCallback(() => {
    setShowExitConfirmPopup(true)
  }, [])

  const handleExitConfirmContinue = useCallback(() => {
    setShowExitConfirmPopup(false)
  }, [])

  const handleExitConfirmExit = useCallback(async () => {
    setShowExitConfirmPopup(false)
    setIsNavigatingAway(true)
    await disconnect()
    router.push('/form')
  }, [disconnect, router])

  /* ── 시간 포맷 ──────────────────────────── */
  const formatTime = useCallback((sec: number) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }, [])

  return {
    loading,
    error,
    contentData,
    manseBlockHtml,
    showManse,
    setShowManse,
    connected,
    muted,
    inVolume,
    outVolume,
    micSensitivity,
    setMicSensitivity,
    messages,
    totalSeconds,
    remainingSeconds,
    showExtendPopup,
    connect,
    disconnect,
    toggleMute,
    dismissExtendPopup,
    goBackToForm,
    formatTime,
    model,
    voiceName,
    // 추가 결제 (In-Page)
    selectedExtendOption,
    setSelectedExtendOption,
    extendPaymentProcessing,
    handleExtendPayment,
    // 대화 저장
    savingConversation,
    saveConversation,
    // 나가기 전 저장 확인 모달
    showLeaveConfirmModal,
    isNavigatingAway,
    requestLeave,
    handleLeaveWithSave,
    handleLeaveWithoutSave,
    handleLeaveCancel,
    // 종료 버튼 확인 팝업
    showExitConfirmPopup,
    onExitClick,
    handleExitConfirmContinue,
    handleExitConfirmExit,
    // 점사 진행 중 나가기 방지 팝업
    showInProgressBlockModal,
    handleInProgressBlockClose: () => setShowInProgressBlockModal(false),
  }
}
