'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { buildManseBundle, type BirthInput, type CalendarType } from '@/lib/voice-mvp/manse'
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
  const [manseBlockHtml, setManseBlockHtml] = useState('')
  const [manseText, setManseText] = useState('')
  const [showManse, setShowManse] = useState(true)

  /* ── 음성 상태 ─────────────────────────── */
  const [connected, setConnected] = useState(false)
  const [muted, setMuted] = useState(false)
  const [inVolume, setInVolume] = useState(0)
  const [outVolume, setOutVolume] = useState(0)
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

  // 효과음
  const startSoundRef = useRef<HTMLAudioElement | null>(null)
  const bubbleSoundRef = useRef<HTMLAudioElement | null>(null)
  const bubbleProbRef = useRef(0)
  const startSoundPlayedRef = useRef(false)

  messagesRef.current = messages

  /* ── 결제/콘텐츠 정보 로드 ─────────────── */
  const contentIdRef = useRef<string | null>(null)
  const voiceMinutesRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(async () => {
      try {
        const cid = sessionStorage.getItem('result_content_id') || sessionStorage.getItem('payment_content_id')
        const storedVoiceMin = sessionStorage.getItem('payment_voice_minutes')
        if (!cid) {
          setError('결제 정보를 찾을 수 없습니다.')
          setLoading(false)
          return
        }
        contentIdRef.current = cid

        // 콘텐츠 상세 로드
        const res = await fetch(`/api/content/${cid}?full=true`, { cache: 'no-store' })
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
        setRemainingSeconds(secs)
        console.log('[VoiceResult] voiceMinutes:', voiceMin, '(source:', storedVoiceMin ? 'sessionStorage' : 'voice_time_options[0]', ')')

        setContentData(c)

        // 효과음 세팅
        console.log('[VoiceResult] sound setup: start_url=', c?.voice_start_sound_url, 'bubble_url=', c?.voice_bubble_sound_url, 'prob_pct=', c?.voice_bubble_sound_probability_pct)
        if (c?.voice_start_sound_url) {
          const startAudio = new Audio(c.voice_start_sound_url)
          startAudio.preload = 'auto'
          startAudio.addEventListener('canplaythrough', () => console.log('[VoiceResult] start sound loaded & ready'))
          startAudio.addEventListener('error', (e) => console.error('[VoiceResult] start sound load error:', e))
          startSoundRef.current = startAudio

          // 페이지 진입 시 시작소리 자동 재생 시도
          const tryPlayStartSound = () => {
            if (startSoundPlayedRef.current) return
            startSoundPlayedRef.current = true
            startAudio.play().then(() => {
              console.log('[VoiceResult] start sound auto-played successfully')
            }).catch(() => {
              console.log('[VoiceResult] auto-play blocked, waiting for user interaction...')
              startSoundPlayedRef.current = false // 리셋해서 interaction에서 재시도
              // 사용자 첫 터치/클릭 시 재생
              const playOnInteraction = () => {
                if (startSoundPlayedRef.current) return
                startSoundPlayedRef.current = true
                startAudio.play().then(() => {
                  console.log('[VoiceResult] start sound played on user interaction')
                }).catch((e) => { console.warn('[VoiceResult] start sound play failed even on interaction:', e?.message) })
                document.removeEventListener('click', playOnInteraction)
                document.removeEventListener('touchstart', playOnInteraction)
              }
              document.addEventListener('click', playOnInteraction, { once: true })
              document.addEventListener('touchstart', playOnInteraction, { once: true })
            })
          }
          // canplaythrough이 이미 발생했을 수 있으므로 readyState도 체크
          if (startAudio.readyState >= 4) {
            tryPlayStartSound()
          } else {
            startAudio.addEventListener('canplaythrough', tryPlayStartSound, { once: true })
          }
        }
        if (c?.voice_bubble_sound_url) {
          bubbleSoundRef.current = new Audio(c.voice_bubble_sound_url)
          bubbleSoundRef.current.preload = 'auto'
          bubbleSoundRef.current.addEventListener('canplaythrough', () => console.log('[VoiceResult] bubble sound loaded & ready'))
          bubbleSoundRef.current.addEventListener('error', (e) => console.error('[VoiceResult] bubble sound load error:', e))
        }
        bubbleProbRef.current = (c?.voice_bubble_sound_probability_pct || 0) / 100

        // 만세력 계산
        const gender = sessionStorage.getItem('payment_user_gender') || 'male'
        const year = parseInt(sessionStorage.getItem('payment_user_year') || '0', 10)
        const month = parseInt(sessionStorage.getItem('payment_user_month') || '0', 10)
        const day = parseInt(sessionStorage.getItem('payment_user_day') || '0', 10)
        const calendarType = (sessionStorage.getItem('payment_user_calendar_type') || 'solar') as CalendarType
        const birthHour = sessionStorage.getItem('payment_user_birth_hour') || null
        const userName = sessionStorage.getItem('payment_user_name') || ''

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
      // 시작소리 오디오 정리
      if (startSoundRef.current) {
        startSoundRef.current.pause()
        startSoundRef.current = null
      }
      if (bubbleSoundRef.current) {
        bubbleSoundRef.current.pause()
        bubbleSoundRef.current = null
      }
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

    const counselorName = String(contentData.voice_counselor_name || '').trim()
    const systemText = `당신은 한국어로 대답하는 실시간 음성 상담사입니다.
${persona ? `\n[페르소나]\n${persona}\n` : ''}
- ${styleInstruction(style)}
- 목표: 공감 + 구체적 조언 + 마지막에 질문 1개
- 길이: 6~12문장

[첫 인사 규칙]
- 상담이 시작되면 유저가 말하기 전에 당신이 먼저 인사를 건네세요.
- "${counselorName || '상담사'}"로서 따뜻하고 신비로운 분위기로 내담자의 이름을 부르며 짧게 인사하세요.
- 첫 인사는 2~3문장으로 짧게, 내담자가 편안함을 느끼도록 합니다.
- 예시: "어서 오세요, [이름]님. 제가 기다리고 있었어요. 무엇이 궁금하신가요?"
`
    const contextText = `### 내담자 정보
이름: ${userName}

### 만세력
${manseText || '(만세력 없음)'}
`
    return { systemText, contextText }
  }, [contentData, manseText])

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
  function disconnectInternal() {
    manualDisconnectRef.current = true
    recorderRef.current?.stop()
    streamerRef.current?.stop()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }))
      wsRef.current.close()
    }
    setConnected(false)
    isAiSpeakingRef.current = false
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null }
  }

  /* ── connect ───────────────────────────── */
  const connect = useCallback(async () => {
    setError('')
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
      unlockAudio(bubbleSoundRef.current)

      // audio output
      if (!streamerRef.current) {
        const outCtx = await audioContext({ id: 'voice-result-out' })
        const streamer = new AudioStreamer(outCtx)
        await streamer.addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
          setOutVolume(ev.data.volume)
        })
        streamerRef.current = streamer
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
            // 시작 사운드는 페이지 진입 시 자동 재생됨 (connect 시점 제거)
            // 타이머 시작
            startTimer()

            // AI 첫 인사 트리거 (proactiveAudio + sendClientContent)
            const userName2 = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : ''
            let greetTrigger: string
            if (isResumedSession) {
              // 추가 결제 후 이어서 상담
              greetTrigger = userName2
                ? `[시스템] 내담자 "${userName2}"님이 추가 결제 후 다시 접속했습니다. "다시 오셨군요" 등의 자연스러운 인사와 함께, 이전 대화 맥락을 기억하면서 이어서 상담해 주세요.`
                : `[시스템] 내담자가 추가 결제 후 다시 접속했습니다. 이전 대화 맥락을 기억하면서 자연스럽게 이어서 상담해 주세요.`
            } else {
              // 첫 상담
              greetTrigger = userName2
                ? `[시스템] 내담자 "${userName2}"님이 접속했습니다. 먼저 따뜻하게 인사한 후 만세력을 기반으로 약 20초가량 사주 재물운 운세 재회운을 얘기해 주세요.`
                : `[시스템] 내담자가 접속했습니다. 먼저 따뜻하게 인사한 후 만세력을 기반으로 약 20초가량 사주 재물운 운세 재회운을 얘기해 주세요.`
            }
            console.log('[VoiceResult] sending greet trigger (resumed=%s):', isResumedSession, greetTrigger)
            setTimeout(() => {
              try {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'text', text: greetTrigger }))
                }
              } catch (e: any) {
                console.warn('[VoiceResult] greet trigger failed:', e?.message)
              }
            }, 300) // ready 후 300ms 대기 후 전송 (세션 안정화)
            return
          }
          if (msg.type === 'audio' && msg.data) {
            const buf = base64ToArrayBuffer(msg.data)
            if (audioTimeoutRef.current) { clearTimeout(audioTimeoutRef.current); audioTimeoutRef.current = null }
            if (!isAiSpeakingRef.current) {
              isAiSpeakingRef.current = true
              // 방울 소리 (확률적)
              const roll = Math.random()
              const prob = bubbleProbRef.current
              console.log('[VoiceResult] bubble check: roll=', roll.toFixed(3), 'prob=', prob, 'hasSound=', !!bubbleSoundRef.current)
              if (bubbleSoundRef.current && roll < prob) {
                bubbleSoundRef.current.currentTime = 0
                bubbleSoundRef.current.play().catch((e) => { console.warn('[VoiceResult] bubble play failed:', e?.message) })
              }
            }
            streamerRef.current?.addPCM16(new Uint8Array(buf))
            audioTimeoutRef.current = setTimeout(() => { isAiSpeakingRef.current = false; audioTimeoutRef.current = null }, 500)
            return
          }
          if (msg.type === 'text' && msg.text) {
            setMessages((prev) => [...prev, { role: 'assistant', text: String(msg.text).trim() }])
            return
          }
          if (msg.type === 'interrupted') {
            streamerRef.current?.stop()
            isAiSpeakingRef.current = false
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

      // mic
      if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
      const recorder = recorderRef.current
      const onData = (base64: string) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64, mimeType: 'audio/pcm;rate=16000' }))
      }
      recorder.off('data', onData as any).off('volume', setInVolume as any)
      if (!muted) recorder.on('data', onData as any).on('volume', setInVolume as any).start()

      setMessages([])
    } catch (e: any) {
      setError(e?.message || '연결 실패')
    }
  }, [systemAndContext, model, voiceName, muted, startFailoverCheckInterval, startTimer])

  /* ── disconnect ─────────────────────────── */
  const disconnect = useCallback(() => {
    disconnectInternal()
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
    // 시간이 이미 0 이하이면 상담 종료
    if (remainingSeconds <= 0) {
      disconnectInternal()
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

  /* ── 시간 종료 후 폼 이동 (점사형 전용 — 음성형은 미사용) ── */
  const goBackToForm = useCallback(() => {
    router.push('/form')
  }, [router])

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
  }
}
