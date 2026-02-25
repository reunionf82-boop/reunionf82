'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  getKstTimeInstructionBlock,
  getKoreaContextVars,
  getAndIncrementVisitCountToday,
  getVisitGuidanceText,
  getSeasonContextBlock,
  sanitizeForTts,
  detectEtiquetteViolation,
  detectCrisisKeywords,
  getMannerWarningMessage,
  getEtiquetteReprimandInstruction,
  CRISIS_EXPERT_INSTRUCTION,
  isPpoingAttributes,
  type EtiquetteViolationType,
} from '@/lib/voice-mvp/ppoing-rules'
import { AudioRecorder, AUDIO_CONSTRAINTS } from '@/lib/voice-mvp/genai-live/audio-recorder'
import { AudioStreamer } from '@/lib/voice-mvp/genai-live/audio-streamer'
import { audioContext, base64ToArrayBuffer } from '@/lib/voice-mvp/genai-live/utils'
import VolMeterWorket from '@/lib/voice-mvp/genai-live/worklets/vol-meter'
import { Modality } from '@google/genai/web'
import { computeManseFromFormInput } from '@/lib/manse-ryeok'
import { generateOrderId } from '@/lib/payment-utils'

/* ── 상수 ────────────────────────────────── */
const LIVE_MODEL_FALLBACK = 'gemini-live-2.5-flash-native-audio'

const AUTO_RECONNECT_MAX = 3
const AUTO_RECONNECT_DELAYS = [2000, 4000, 6000]
/** 정적 깨기: 이 볼륨 이상이면 사용자가 말하는 것으로 간주. micSensitivity(0-100)로 조정. */
const SPEECH_THRESHOLD_MIN = 0.01
const SPEECH_THRESHOLD_MAX = 0.05
/** TTS 중단용: 볼륨이 (threshold * 이 값) 이상일 때 TTS 멈춤. 1.0=말 시작 감지와 동일, 높이면 에코 방지. */
const TTS_INTERRUPT_VOLUME_FACTOR = 1.2
/** TTS 중단 디바운스(ms): 이 시간 이상 연속으로 기준 초과 시에만 중단 (순간 스파이크 무시). */
const TTS_INTERRUPT_DEBOUNCE_MS = 120
/** DCC 연속 대화: 화자 종료 인지시간(ms). 이 침묵 길이 지나면 한 턴으로 전송. 낮으면 말 끊김, 높으면 반응이 느려짐. */
const DCC_SILENCE_END_MS = 700
/** DCC 스트리밍 PCM 샘플레이트 (백엔드 Cartesia와 동일해야 함) */
const DCC_PCM_SAMPLE_RATE = 24000
/** 대화중 소리 연타 방지 쿨타임(ms). 이 간격 동안은 재생하지 않음 */
const CONVERSATION_SOUND_COOLDOWN_MS = 20 * 1000

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
  
  // GPT, Grok, Hume 등 타사 모델은 그대로 통과
  if (/^gpt/i.test(model)) return model
  if (/^grok/i.test(model)) return model
  if (/^hume/i.test(model) || /^evi/i.test(model)) return model
  
  // Gemini 모델
  if (model.includes('gemini')) return model
  
  return LIVE_MODEL_FALLBACK
}

function isGptRealtimeModel(model: string) {
  return /^gpt/i.test(String(model || '').trim())
}

/** Hume EVI: audio_output이 WAV base64이므로 PCM 스트리머 대신 큐+Audio 재생 */
function isHumeModel(model: string) {
  return /^hume/i.test(String(model || '').trim()) || /^evi/i.test(String(model || '').trim())
}

function isIOSDevice() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const isIPhoneOrIPad = /iPhone|iPad|iPod/i.test(ua)
  const isIPadOSDesktopUA = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1
  return isIPhoneOrIPad || isIPadOSDesktopUA
}

function isAndroidDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent || '')
}

/** Android: 시간연장 팝업 등으로 오디오가 이어피스로 바뀌는 것 완화 — AudioContext.setSinkId로 출력 재지정 시도.
 * iOS에서는 audioSession.type = 'playback'을 쓰면 소리가 안 나는 경우가 있어 적용하지 않음. */
function forceSpeakerOutput(audioContextRef: AudioContext | null) {
  if (typeof window === 'undefined' || !isAndroidDevice() || !audioContextRef) return
  const ctx = audioContextRef as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  if (typeof ctx.setSinkId === 'function') {
    ctx.setSinkId('').catch(() => {})
  }
}

function setPlaysInlineForSpeaker(el: HTMLAudioElement) {
  el.setAttribute('playsinline', 'true')
  el.setAttribute('webkit-playsinline', 'true')
}

/* ── PCM16 base64 → WAV Blob 변환 ────────── */
function pcm16Base64ToWavBlob(chunks: string[], sampleRate = DCC_PCM_SAMPLE_RATE): Blob {
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

/** Blob(녹음 파일)의 실제 재생 시간(초). 이용내역 표시·플레이바와 일치시키기 위함. */
function getBlobDurationSeconds(blob: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null)
      return
    }
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(audio.duration) ? Math.round(audio.duration) : null)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    audio.src = url
  })
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
  const remainingSecondsRef = useRef(0)
  useEffect(() => {
    remainingSecondsRef.current = remainingSeconds
  }, [remainingSeconds])
  const [showExtendPopup, setShowExtendPopup] = useState(false)
  /** 연장 팝업을 '상담시간 연장하기' 버튼으로 연 경우 true → 종료 메시지 박스 숨김 */
  const [extendPopupOpenedByButton, setExtendPopupOpenedByButton] = useState(false)
  /** 1분 무료 연장 팝업 (무료시작/이용가능시간 1회만, 팝업 떠 있을 때 타이머 계속) */
  const [showFreeExtendPopup, setShowFreeExtendPopup] = useState(false)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const extendPopupShownRef = useRef(false)
  const sessionStartedRef = useRef(false)
  /** 무료시작(또는 이용가능시간) 진입이면 true, 바로이용하기 결제 후면 false */
  const isFreeStartSessionRef = useRef(true)
  /** 1분 무료 연장 팝업을 이번 세션에서 이미 띄웠으면 true (1회만 표시) */
  const freeExtendPopupShownThisSessionRef = useRef(false)
  /** 시간 0이 됐는데 연장 팝업을 띄우지 않은 경우(무료 연장 24h 사용함): 자동 저장 후 폼으로 가기 위함 */
  const timeHitZeroNoExtendPopupRef = useRef(false)
  /** 시간 0 전환 시 세션 1회만 끊었는지 (오디오 즉시 정지용) */
  const disconnectedAtZeroRef = useRef(false)
  /* ── WS / 오디오 refs ──────────────────── */
  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const streamerRef = useRef<AudioStreamer | null>(null)
  const isAiSpeakingRef = useRef(false)
  /** iOS: 클릭 제스처 시점에 미리 요청한 마이크 스트림(권한 팝업 안정화) */
  const iosMicStreamPromiseRef = useRef<Promise<MediaStream> | null>(null)
  /** iOS: 클릭 제스처 시점에 만든 녹음용 AudioContext (Safari 제약 대응) */
  const iosRecorderContextRef = useRef<AudioContext | null>(null)
  /** iOS 17+: 첫 오디오 수신 시 1회 suspend→resume 워크어라운드 */
  const iosContextWorkaroundDoneRef = useRef(false)
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const manualDisconnectRef = useRef(false)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasConnectedRef = useRef(false)
  const autoReconnectCountRef = useRef(0)
  const initRetryCountRef = useRef(0)
  const autoReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sessionStartTimeRef = useRef<number | null>(null)
  const failoverCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const plannedFailoverRef = useRef(false)
  const currentRegionRef = useRef(PRIMARY_REGION)
  const failoverRegionRef = useRef<string | null>(null)
  const lastSocketErrorRef = useRef<string>('')
  const conversationContextForReconnectRef = useRef<string | null>(null)
  const messagesRef = useRef<Msg[]>([])
  const pendingWsRef = useRef<WebSocket | null>(null)
  /** Deepgram+Claude+Cartesia: 세션 ID, 녹음 청크(base64), 대화 이력 */
  const dccSessionIdRef = useRef<string>('')
  const dccChunksRef = useRef<string[]>([])
  const dccHistoryRef = useRef<{ role: 'user' | 'assistant'; content: string }[]>([])
  const dccSendingRef = useRef(false)
  /** DCC 재생 중 아웃풋 파형용 인터벌 (스트리머 미사용이라 직접 setOutVolume 호출) */
  const dccOutVolumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** DCC 현재 재생 중인 오디오 (폼 팝업 시 즉시 정지용) */
  const dccCurrentAudioRef = useRef<HTMLAudioElement | null>(null)
  /** DCC 스트리밍 raw PCM 재생용 AudioContext (barge-in 시 suspend) */
  const dccPcmContextRef = useRef<AudioContext | null>(null)
  /** DCC PCM 재생: AudioStreamer */
  const dccStreamerRef = useRef<AudioStreamer | null>(null)
  /** DCC 재생 즉시 중단 플래그 (바지인) */
  const dccStopPlaybackRef = useRef(false)
  const dccAbortControllerRef = useRef<AbortController | null>(null)
  /** DCC 최초 인사 턴 재생 중 여부. 이 구간에는 스피커 에코로 TTS 중단하지 않음(20초 전 일관 끊김 방지) */
  const dccFirstTurnPlayingRef = useRef(false)
  /** DCC 연속 대화: 턴 경계(마지막 전송 시점의 청크 인덱스), VAD 침묵 시작 시각, 말하는 중 여부 */
  const dccLastTurnEndIndexRef = useRef(0)
  const dccSilenceStartRef = useRef<number | null>(null)
  const dccInSpeechRef = useRef(false)
  const dccVadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** 볼륨이 interruptThreshold 초과한 시각. DEBOUNCE_MS 이상 유지 시에만 TTS 중단 */
  const dccInterruptAboveSinceRef = useRef<number | null>(null)
  /** 사용자 위치 기반 날씨 블록 (세션당 1회 fetch, LLM context 주입용) */
  const weatherBlockRef = useRef<string>('')
  /** Deepgram 실시간 WebSocket STT */
  const dgWsRef = useRef<WebSocket | null>(null)
  const dgApiKeyRef = useRef<string>('')
  const dgReconnectingRef = useRef(false)
  const dgKeepaliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const closingForSwapRef = useRef(false)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** AI 발화 종료 시각. 스피커 에코·볼륨 decay로 타이머가 무효화되는 것을 방지. 종료 직후 3초간은 볼륨으로 clear 안 함 (3초 침묵 타이머 전체 커버) */
  const lastAiSpeechEndAtRef = useRef(0)
  /** 사용자 전사가 마지막으로 수신된 시각. 침묵깨기 발동 시 사용자가 방금 말했으면 스킵해 질문에 답하도록 함 */
  const lastUserTranscriptAtRef = useRef(0)
  /** 뿌잉 예의 확립: 당일(세션) 예의 위반 횟수. 2회 시 상담 종료 */
  const etiquetteViolationCountRef = useRef(0)
  /** 현재 user 턴에서 이미 감지한 위반 유형 (같은 턴 내 중복 카운트 방지) */
  const currentUserTurnViolationsRef = useRef<Set<EtiquetteViolationType>>(new Set())
  /** 현재 user 턴 누적 텍스트 (스트리밍 전사 조각 합쳐서 예의/위기 감지) */
  const currentUserTurnTextRef = useRef('')
  /** Hume EVI: audio_output은 WAV base64 → 큐에 쌓아 HTMLAudioElement로 재생 */
  const humeAudioQueueRef = useRef<Blob[]>([])
  const humeCurrentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playHumeQueueRef = useRef<(() => void) | null>(null)

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
  /** 상담 저장 완료 후 "상담이 끝났습니다" 팝업 — 확인 시 폼으로 이동 */
  const [showConsultationEndModal, setShowConsultationEndModal] = useState(false)
  const showConsultationEndModalRef = useRef(false)
  showConsultationEndModalRef.current = showConsultationEndModal
  /* ── 뿌잉 예의 위반 2회 시 상담 종료 경고 문구 (표시 후 재방문 불가 안내) ── */
  const [mannerWarningMessage, setMannerWarningMessage] = useState<string | null>(null)

  // 양방향 오디오 녹음 (MediaRecorder: 마이크 + AI 출력 믹스)
  const mixedMediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mixedChunksRef = useRef<Blob[]>([])
  const mixedDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)

  // 효과음
  const startSoundRef = useRef<HTMLAudioElement | null>(null)
  /** 시간 0 시 재생 (TTS 강제 중단 후 재생 → ended 시 자동저장) */
  const endSoundRef = useRef<HTMLAudioElement | null>(null)
  const endSoundPlayedRef = useRef(false)
  const conversationSoundsRef = useRef<(HTMLAudioElement | null)[]>([])
  const bubbleProbRef = useRef(0)
  /** 대화중 소리 연타 방지: 재생 후 이 시간(ms)까지는 재생 안 함. 말하는 도중에도 나오도록 발화시작만이 아님 */
  const conversationSoundCooldownUntilRef = useRef(0)
  const startSoundPlayedRef = useRef(false)
  const mutedRef = useRef(muted)
  mutedRef.current = muted
  const micSensitivityRef = useRef(micSensitivity)
  micSensitivityRef.current = micSensitivity
  /** 5회 이상 방문 시 걱정/잔소리 톤이므로 침묵깨기 미발동 */
  const skipSilenceBreakRef = useRef(false)
  skipSilenceBreakRef.current = true // 침묵깨기 비활성화 (기존: isPpoingAttributes(contentData) && visitCountToday >= 5)
  /** 보이스 화면 시작 시점 KST(한 번 고정). 공수 시 이미 지나간 시간대는 공수하지 않도록 사용 */
  const sessionStartKstRef = useRef<Date | null>(null)

  messagesRef.current = messages

  /* ── 결제/콘텐츠 정보 로드 ─────────────── */
  const contentIdRef = useRef<string | null>(null)
  const voiceMinutesRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    ;(async () => {
      try {
        const urlId = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('id') : null
        const cid =
          (urlId && urlId.trim() !== '' ? urlId.trim() : null) ||
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

        // 상담 종료(시간 0) 후 폼을 나갔다가 이전 버튼으로 재진입한 경우 → 폼으로 리다이렉트(반응 없음)
        if (sessionStorage.getItem('voice_time_expired') === '1') {
          stopAllTTSRef.current()
          window.location.replace('/form?id=' + encodeURIComponent(cid))
          return
        }

        // 콘텐츠 상세 로드 (캐시 무효화: 저장 후 소리 설정이 바로 반영되도록)
        const res = await fetch(`/api/content/${cid}?full=true&_t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('콘텐츠를 불러올 수 없습니다.')
        const data = await res.json()
        const c = data?.data || data?.content || data

        // voice_time_options: JSONB가 문자열로 내려올 수 있으므로 파싱 보장
        if (c && c.voice_time_options) {
          try {
            const raw = c.voice_time_options
            c.voice_time_options = typeof raw === 'string' ? JSON.parse(raw) : raw
          } catch { c.voice_time_options = [] }
        }

        // 시간 결정: sessionStorage → 잔여금액으로 계산(폼에서 잔여금액으로 상담 진입) → 기본시간 → fallback 5분
        const opts = Array.isArray(c?.voice_time_options) ? c.voice_time_options : []
        const defaultOpt = opts.find((o: any) => o?.type === 'default' || (o && Number(o?.price) === 0))
        const defaultSecs = defaultOpt ? (Number(defaultOpt.minutes || 0) * 60 + Number(defaultOpt.seconds ?? 0)) || 300 : 300
        const storedTotalSec = sessionStorage.getItem('payment_voice_total_seconds')
        let secs = 300
        if (storedTotalSec) {
          const n = parseInt(storedTotalSec, 10)
          if (Number.isFinite(n) && n > 0) secs = n
        } else if (storedVoiceMin) {
          secs = parseInt(storedVoiceMin, 10) * 60
        } else {
          // sessionStorage에 시간 없음: 잔여금액으로 상담 진입 시 balance에서 이용시간 계산
          const phone = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
          let usedBalancePath = false // 잔여금액으로 진입해 차감 단위 미만이면 secs=0 → 기본시간 부여하지 않음
          if (phone) {
            try {
              const balRes = await fetch(`/api/voice/balance?contentId=${encodeURIComponent(cid)}&phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
              if (balRes.ok) {
                const balData = await balRes.json()
                const balanceWan = typeof (balData as any)?.balance_wan === 'number' ? (balData as any).balance_wan : 0
                if (balanceWan > 0) {
                  usedBalancePath = true
                  const chargeOpt = opts.find((o: any) => o?.type === 'charge')
                  const rateSec = chargeOpt != null && Number(chargeOpt.rate_seconds) > 0 ? Number(chargeOpt.rate_seconds) : 0
                  const rateWon = chargeOpt != null && Number(chargeOpt.rate_won) > 0 ? Number(chargeOpt.rate_won) : 0
                  if (rateWon > 0 && rateSec > 0) secs = Math.floor(balanceWan / rateWon) * rateSec
                  if (secs > 0) {
                    enteredWithBalanceRef.current = true
                  } else {
                  }
                }
              }
            } catch { /* ignore */ }
          }
          // 잔여금액 경로에서 차감 단위 미만으로 0분이 된 경우 기본시간 부여하지 않음
          if (secs <= 0 && !usedBalancePath) secs = defaultSecs
        }
        const voiceMin = Math.floor(secs / 60)
        voiceMinutesRef.current = voiceMin
        setTotalSeconds(secs)
        const expired = typeof sessionStorage !== 'undefined' && sessionStorage.getItem('voice_time_expired') === '1'
        setRemainingSeconds(expired ? 0 : secs)

        setContentData(c)
        isFreeStartSessionRef.current = !sessionStorage.getItem('voice_entered_by_100')

        // 방문 빈도 (당일 localStorage, 상품별 개별 카운트)
        const count = getAndIncrementVisitCountToday(cid)
        setVisitCountToday(count)

        // 보이스 화면 시작 시점 KST 고정 — 공수 시 이미 지나간 시간대는 공수하지 않도록
        sessionStartKstRef.current = new Date()

        // 효과음 세팅
        const convSounds = c?.voice_conversation_sounds
        const soundList = Array.isArray(convSounds) && convSounds.length > 0
          ? convSounds
          : (c?.voice_bubble_sound_url ? [{ label: '방울 소리', url: c.voice_bubble_sound_url }] : [])
        const probPct = typeof c?.voice_conversation_sound_probability_pct === 'number'
          ? c.voice_conversation_sound_probability_pct
          : (c?.voice_bubble_sound_probability_pct ?? 0)
        if (c?.voice_start_sound_url) {
          const startAudio = new Audio()
          setPlaysInlineForSpeaker(startAudio)
          startAudio.crossOrigin = 'anonymous'
          startAudio.src = getAudioSrc(c.voice_start_sound_url)
          startAudio.preload = 'auto'
          startAudio.addEventListener('error', () => {})
          startSoundRef.current = startAudio
          // 시작 소리는 상담 연결(ready) 시 한 번 재생하여 녹음에 포함됨 (페이지 로드 시 재생 제거)
        }
        if (c?.voice_end_sound_url) {
          const endAudio = new Audio()
          setPlaysInlineForSpeaker(endAudio)
          endAudio.crossOrigin = 'anonymous'
          endAudio.preload = 'auto'
          endAudio.addEventListener('error', () => {})
          endSoundRef.current = endAudio
        } else {
          endSoundRef.current = null
        }
        endSoundPlayedRef.current = false
        conversationSoundsRef.current = soundList
          .filter((s: any) => s?.url)
          .map((s: any) => {
            const a = new Audio()
            setPlaysInlineForSpeaker(a)
            a.crossOrigin = 'anonymous'
            a.src = getAudioSrc(s.url)
            a.preload = 'auto'
            a.addEventListener('error', () => {})
            return a
          })
        bubbleProbRef.current = probPct / 100

        // 무료속성(8006)이 아닐 때만: 점사형과 동일한 만세력 로직(computeManseFromFormInput)으로 세션 본인정보로 계산 후 표시·LLM 주입
        if (isPpoingAttributes(c)) {
          setManseBlockHtml('')
          setManseText('')
        } else {
          const userYear = sessionStorage.getItem('payment_user_year') || ''
          const userMonth = sessionStorage.getItem('payment_user_month') || ''
          const userDay = sessionStorage.getItem('payment_user_day') || ''
          const userBirthHour = sessionStorage.getItem('payment_user_birth_hour') || ''
          const userCalendarType = (sessionStorage.getItem('payment_user_calendar_type') || 'solar') as 'solar' | 'lunar' | 'lunar-leap'
          const userName = sessionStorage.getItem('payment_user_name') || ''
          const manseResult = computeManseFromFormInput({
            userYear,
            userMonth,
            userDay,
            userBirthHour: userBirthHour || undefined,
            userCalendarType,
            userName,
          })
          if (manseResult) {
            setManseBlockHtml(manseResult.manseRyeokTable)
            setManseText(manseResult.manseRyeokText)
          } else {
            setManseBlockHtml('')
            setManseText('')
          }
        }
      } catch (e: any) {
        setError(e?.message || '로딩 중 오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  /* ── 마운트 시 날씨 정보 1회 fetch (LLM context 주입용) ── */
  useEffect(() => {
    fetch('/api/voice/weather')
      .then((r) => r.json())
      .then((d: { weatherBlock?: string }) => {
        if (d?.weatherBlock) weatherBlockRef.current = d.weatherBlock
      })
      .catch(() => { /* 실패해도 무시 — 날씨 없이 기존대로 동작 */ })
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
      // 잔여시간이 1블록(rate_seconds) 초과면 잔액 유지, 이하일 때만 이탈 시 소진 (12초보다 큰 잔여에선 0원으로 만들면 안 됨)
      const opts = Array.isArray(contentData?.voice_time_options) ? contentData.voice_time_options : []
      const chargeOpt = opts.find((o: any) => o?.type === 'charge')
      const rateSeconds = chargeOpt != null && Number(chargeOpt.rate_seconds) > 0 ? Number(chargeOpt.rate_seconds) : 0
      const shouldDrainBalance = (useBalanceModeRef.current || enteredWithBalanceRef.current) && cid != null && !!phone && rateSeconds > 0 && remainingSeconds <= rateSeconds
      const payloadObj: Record<string, unknown> = {
        title: contentTitle,
        html: '', // NOT NULL 제약 대응
        result_type: 'voice',
        voice_messages: msgs.map((m) => ({ role: m.role, text: m.text })),
        voice_audio_url: null, // beacon에서는 오디오 업로드 불가
        voice_duration_seconds: totalSeconds - remainingSeconds > 0 ? totalSeconds - remainingSeconds : null,
        content_id: cid,
        userName,
        _beacon_phone: phone,
        _beacon_password: password,
        _beacon_injected_summary_item_refs: injectedSummaryItemRefsRef.current || [],
      }
      if (shouldDrainBalance) payloadObj._beacon_drain_balance = true
      const payload = JSON.stringify(payloadObj)
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon('/api/saved-results/save-voice-beacon', blob)
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
      if (!sessionStartedRef.current) return
      if (conversationSavedRef.current) {
        stopAllTTSRef.current()
        try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
        router.replace('/form')
        return
      }
      history.pushState({ [key]: true }, '', window.location.href)
      setShowLeaveConfirmModal(true)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [router])

  /* ── 저장 완료 후 나가기 처리 ───────────── */
  useEffect(() => {
    if (!savingConversation && leaveAfterSaveRef.current) {
      leaveAfterSaveRef.current = false
      stopAllTTSRef.current()
      setIsNavigatingAway(true)
      try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
      router.push('/form')
    }
  }, [savingConversation, router])

  /** DCC 재생 즉시 중단 (barge-in 포함). 컨텍스트/스트리머는 null·close 하지 않음 → 믹스 녹음(나의 이용내역)이 세션 끝까지 계속 쌓이도록 */
  const stopDccPlayback = useCallback((markStop = true) => {
    if (markStop) dccStopPlaybackRef.current = true
    dccAbortControllerRef.current?.abort()
    dccAbortControllerRef.current = null
    dccCurrentAudioRef.current?.pause()
    dccCurrentAudioRef.current = null
    dccStreamerRef.current?.stop()
    if (dccOutVolumeIntervalRef.current) {
      clearInterval(dccOutVolumeIntervalRef.current)
      dccOutVolumeIntervalRef.current = null
    }
    setOutVolume(0)
    isAiSpeakingRef.current = false
  }, [])

  /** Deepgram WebSocket 정리 */
  const closeDeepgramWs = useCallback(() => {
    if (dgKeepaliveRef.current) { clearInterval(dgKeepaliveRef.current); dgKeepaliveRef.current = null }
    const ws = dgWsRef.current
    if (ws) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })) } catch { /* ignore */ }
      try { ws.close() } catch { /* ignore */ }
      dgWsRef.current = null
    }
    dgReconnectingRef.current = false
  }, [])

  /** DCC 녹음 진행 중 여부 (Deepgram WS 재연결 판단용) */
  const dccRecordingRef = useRef(false)

  /** 보이스 화면에서 폼으로 나갈 때(이전/팝업 확인/언마운트 등) TTS·마이크·모든 소리 즉시 중지 */
  const stopAllTTSRef = useRef<() => void>(() => {})
  useEffect(() => {
    stopAllTTSRef.current = () => {
      recorderRef.current?.stop()
      dccRecordingRef.current = false
      closeDeepgramWs()
      streamerRef.current?.stop()
      humeCurrentAudioRef.current?.pause()
      humeCurrentAudioRef.current = null
      humeAudioQueueRef.current.length = 0
      stopDccPlayback()
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      startSoundRef.current?.pause()
      if (startSoundRef.current) startSoundRef.current.currentTime = 0
      endSoundRef.current?.pause()
      if (endSoundRef.current) endSoundRef.current.currentTime = 0
      conversationSoundsRef.current.forEach((a) => { a?.pause(); try { (a as HTMLAudioElement).currentTime = 0 } catch { /* ignore */ } })
      setOutVolume(0)
      isAiSpeakingRef.current = false
    }
    return () => {
      stopAllTTSRef.current()
    }
  }, [stopDccPlayback, closeDeepgramWs])

  const initDccPcmAudio = useCallback(() => {
    const AudioCtx = (typeof window !== 'undefined'
      ? (window.AudioContext || (window as any).webkitAudioContext)
      : null)
    if (!AudioCtx) return null
    if (!dccPcmContextRef.current) {
      dccPcmContextRef.current = new AudioCtx({ sampleRate: DCC_PCM_SAMPLE_RATE })
      forceSpeakerOutput(dccPcmContextRef.current)
    }
    if (!dccStreamerRef.current) {
      dccStreamerRef.current = new AudioStreamer(dccPcmContextRef.current, {
        mergeChunkSamples: Math.floor(DCC_PCM_SAMPLE_RATE * 0.5),
        initialBufferTime: 0.8,
        minBufferDurationSeconds: 0.8,
      })
    }
    const ctx = dccPcmContextRef.current
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return ctx
  }, [])

  const playDccPcmChunk = useCallback((arrayBuffer: ArrayBuffer) => {
    if (dccStopPlaybackRef.current) return
    const ctx = initDccPcmAudio()
    if (!ctx || !dccStreamerRef.current) return
    const chunk = new Uint8Array(arrayBuffer)
    if (chunk.length === 0) return
    if (!dccOutVolumeIntervalRef.current) dccOutVolumeIntervalRef.current = setInterval(() => setOutVolume(0.35), 80)
    isAiSpeakingRef.current = true
    // DCC도 대화중 소리: 말하는 도중 확률 재생 (쿨다운 4초)
    const list = conversationSoundsRef.current.filter(Boolean) as HTMLAudioElement[]
    const prob = bubbleProbRef.current
    const now = Date.now()
    if (list.length > 0 && prob > 0 && now >= conversationSoundCooldownUntilRef.current) {
      const roll = Math.random()
      if (roll < prob) {
        const chosen = list[Math.floor(Math.random() * list.length)]
        chosen.currentTime = 0
        chosen.play().catch(() => {})
        conversationSoundCooldownUntilRef.current = now + CONVERSATION_SOUND_COOLDOWN_MS
      }
    }
    dccStreamerRef.current.addPCM16(chunk)
  }, [initDccPcmAudio])

  /* ── 정리: 보이스 화면을 떠날 때(어떤 경로든) TTS·연결 즉시 중지 ──────────────────────────────── */
  useEffect(() => {
    return () => {
      stopAllTTSRef.current()
      disconnectInternalRef.current?.(true)
      if (autoReconnectTimeoutRef.current) clearTimeout(autoReconnectTimeoutRef.current)
      if (failoverCheckIntervalRef.current) clearInterval(failoverCheckIntervalRef.current)
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      pendingWsRef.current?.close()
      wsRef.current?.close()
      recorderRef.current?.stop()
      streamerRef.current?.stop()
      humeCurrentAudioRef.current?.pause()
      humeCurrentAudioRef.current = null
      humeAudioQueueRef.current.length = 0
      dccCurrentAudioRef.current?.pause()
      dccCurrentAudioRef.current = null
      dccStreamerRef.current?.stop()
      dccStreamerRef.current = null
      if (dccPcmContextRef.current) {
        try { dccPcmContextRef.current.close() } catch { /* ignore */ }
        dccPcmContextRef.current = null
      }
      if (dccOutVolumeIntervalRef.current) {
        clearInterval(dccOutVolumeIntervalRef.current)
        dccOutVolumeIntervalRef.current = null
      }
      isAiSpeakingRef.current = false
      if (audioTimeoutRef.current) clearTimeout(audioTimeoutRef.current)
      if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
      iosMicStreamPromiseRef.current = null
      iosContextWorkaroundDoneRef.current = false
      if (iosRecorderContextRef.current) {
        iosRecorderContextRef.current.close().catch(() => {})
        iosRecorderContextRef.current = null
      }
      // 시작소리 오디오 정리
      if (startSoundRef.current) {
        startSoundRef.current.pause()
        startSoundRef.current.currentTime = 0
        startSoundRef.current = null
      }
      conversationSoundsRef.current.forEach((a) => { a?.pause(); try { (a as any).src = '' } catch { /* ignore */ } })
      conversationSoundsRef.current = []
    }
  }, [])

  /* ── 침묵깨기 타이머 초 (어드민 voice_silence_break_config "재촉,관찰,환기" 순, 예: "3,5,5") ── */
  const silenceBreakSecs = useMemo(() => {
    const raw = String(contentData?.voice_silence_break_config || '').trim()
    if (!raw) return { first: 3, second: 5, third: 5 }
    const parts = raw.split(',').map((s) => Math.max(1, Math.min(15, parseInt(s.trim(), 10) || 3)))
    return {
      first: parts[0] ?? 3,
      second: parts[1] ?? 5,
      third: parts[2] ?? 5,
    }
  }, [contentData?.voice_silence_break_config])

  /* ── 모델/시스템 프롬프트 ──────────────── */
  const model = useMemo(() => {
    return normalizeLiveModel(contentData?.voice_model || '')
  }, [contentData])

  const systemAndContext = useMemo(() => {
    if (!contentData) return { systemText: '', contextText: '' }
    const persona = String(contentData.voice_persona_prompt || '').trim()
    const style = String(contentData.voice_style || 'calm').trim()
    const userName = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : ''
    const isPpoing = isPpoingAttributes(contentData)

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
- 끝까지 페르소나와 세계관에 맞는 자연스러운 말투를 유지하세요. 단조롭거나 국어책 읽듯 낭독하지 마세요.
- 목표: 공감 + 구체적 조언 + 마지막에 질문 1개
- 길이: 6~12문장
${speechLine}
[첫 인사 규칙]
- 상담이 시작되면 유저가 말하기 전에 당신이 먼저 인사를 건네세요.
- "${counselorName || '상담사'}"로서 따뜻하고 신비로운 분위기로 내담자의 이름을 부르며 짧게 인사하세요.
- 첫 인사는 2~3문장으로 짧게, 내담자가 편안함을 느끼도록 합니다.
- 예시: "어서 오세요, [이름]님. 제가 기다리고 있었어요. 무엇이 궁금하신가요?"
`
    const sessionKst = sessionStartKstRef.current ?? undefined
    const kst = getKoreaContextVars(sessionKst)
    // 무료속성(8006)일 때만 내정보·만세력 미참조. 무료속성 아닐 때는 폼 본인정보·만세력을 LLM에 주입.
    const skipUserInfo = isPpoing
    let userInfoBlock = ''
    if (!skipUserInfo) {
      const uName = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : ''
      const uGender = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_gender') || '' : ''
      const uYear = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_year') || '' : ''
      const uMonth = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_month') || '' : ''
      const uDay = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_day') || '' : ''
      const uBirthHour = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_birth_hour') || '' : ''
      const genderHint = uGender === 'male' ? '남성(호칭: ~님)' : uGender === 'female' ? '여성(호칭: ~님)' : ''
      const birthLine = uYear && uMonth && uDay
        ? `생년월일: ${uYear}년 ${uMonth}월 ${uDay}일${uBirthHour ? `, 태어난 시: ${uBirthHour}` : ''}`
        : ''
      userInfoBlock = `

### 내담자 정보
- 이름: ${uName || '(미입력)'}
${genderHint ? `- 성별: ${genderHint}\n` : ''}${birthLine ? `- ${birthLine}\n` : ''}
### 만세력(본인)
${manseText && manseText.trim() ? manseText.trim() : '(만세력 정보 없음)'}
`
    }
    const commonContextBlock = `${getKstTimeInstructionBlock(sessionKst)}
- 요일: ${kst.weekdayKo}요일, 시간대: ${kst.timeSlotHint}
- 공수(운세 말하기) 시 이미 지나간 시간대는 공수하지 말 것. 위 현재 시각을 기준으로 그 이후 시간만 공수할 것.
${weatherBlockRef.current ? `\n- 날씨 관련 발언은 반드시 아래 [현재/예보] 날씨 정보에만 근거할 것. 위 정보에 없는 날씨(눈·추위·비·더위 등)를 임의로 짐작하거나 "밖에 눈 왔죠?", "손끝이 시리네" 식으로 말하지 말 것.\n${weatherBlockRef.current}\n` : ''}
`
    // 방문 빈도·사계절·환기: 뿌잉(8006) 전용 (오늘 온 횟수만 참조)
    let visitBlock = ''
    if (isPpoing) {
      const visitGuidance = getVisitGuidanceText(visitCountToday)
      const seasonBlock = getSeasonContextBlock()
      visitBlock = `
### 방문 빈도(오늘 ${visitCountToday}번째 방문)
${visitCountToday <= 1
  ? '- 내담자가 당일 첫 방문으로 접속했습니다. 먼저 따뜻하게 인사한 후 신점으로 약 20초가량 오늘의 운세(재물운, 애정운)를 얘기해 주시오.'
  : '- 내담자가 재접속했습니다. 인사만 간단히 하시오.'}
- 입구 테마: ${visitGuidance.openingTheme} — ${visitGuidance.openingHint}
- 출구 테마: ${visitGuidance.closingTheme} — ${visitGuidance.closingHint}

${seasonBlock}

### 환기(Mood Refresh)
- 상담이 5턴 이상 지속되거나 대화가 정체되면 [환기 시트] 중 하나를 무작위로 선택해 실행하세요. (아이 돌발행동, 영적 신호 감지, 신령님 개입, 육체적 피로, 환경 변화 인지 등) 내담자 감정에 맞춰 자연스럽게 끼워 넣으세요.
`
    }
    const contextText = `${commonContextBlock}${visitBlock}${userInfoBlock}`
    return { systemText, contextText }
  }, [contentData, visitCountToday, manseText])

  const voiceName = useMemo(() => {
    if (isGptRealtimeModel(model)) {
      return String(contentData?.voice_gpt_name || 'alloy').trim().toLowerCase()
    }
    // xAI는 voice_gpt_name 필드를 같이 사용 (구조 동일)
    if (/^grok/i.test(model)) {
      return String(contentData?.voice_gpt_name || 'ara').trim().toLowerCase()
    }
    return String(contentData?.voice_name || 'Aoede').trim()
  }, [contentData, model])

  const humeConfigId = useMemo(() => {
    return String(contentData?.voice_hume_config_id || '').trim()
  }, [contentData])

  const temperature = useMemo(() => {
    if (contentData?.voice_temperature != null) return Number(contentData.voice_temperature)
    return 0.8
  }, [contentData])

  /** 결제 진행 중(보빌리언스 팝업 열림)일 때 타이머 멈춤 */
  const extendPaymentInProgressRef = useRef(false)
  /** 시간연장/충전 팝업: 떠 있을 때 AI 말 끝난 뒤에만 타이머 멈춤 */
  const extendPopupOpenRef = useRef(false)
  /** 시간연장/충전 팝업 떠 있을 때 마이크 복원용 (닫을 때 이 값으로 복원) */
  const extendPopupMutedRestoreRef = useRef(false)
  const prevExtendPopupOpenRef = useRef(false)
  /** Android: 팝업 닫을 때 스피커 재적용 지연 호출 정리용 */
  const extendPopupCloseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => {
    const wasOpen = prevExtendPopupOpenRef.current
    prevExtendPopupOpenRef.current = showExtendPopup
    extendPopupOpenRef.current = showExtendPopup
    // popup이 실제로 열리거나 닫힐 때만 처리 (connected 변경 시엔 무시)
    if (showExtendPopup && !wasOpen) {
      forceSpeakerOutput(dccPcmContextRef.current)
      extendPopupMutedRestoreRef.current = muted
      setMuted(true)
      recorderRef.current?.stop()
      streamerRef.current?.stop()
      humeCurrentAudioRef.current?.pause()
      humeCurrentAudioRef.current = null
      humeAudioQueueRef.current.length = 0
      dccCurrentAudioRef.current?.pause()
      dccCurrentAudioRef.current = null
      if (dccOutVolumeIntervalRef.current) {
        clearInterval(dccOutVolumeIntervalRef.current)
        dccOutVolumeIntervalRef.current = null
      }
      setOutVolume(0)
      isAiSpeakingRef.current = false
    } else if (!showExtendPopup && wasOpen) {
      extendPopupCloseTimeoutsRef.current.forEach((t) => clearTimeout(t))
      extendPopupCloseTimeoutsRef.current = []
      forceSpeakerOutput(dccPcmContextRef.current)
      setMuted(extendPopupMutedRestoreRef.current)
      if (connected) recorderRef.current?.start().catch(() => {})
      if (isAndroidDevice()) {
        const t1 = setTimeout(() => forceSpeakerOutput(dccPcmContextRef.current), 100)
        const t2 = setTimeout(() => forceSpeakerOutput(dccPcmContextRef.current), 400)
        extendPopupCloseTimeoutsRef.current = [t1, t2]
      }
    }
    return () => {
      extendPopupCloseTimeoutsRef.current.forEach((t) => clearTimeout(t))
      extendPopupCloseTimeoutsRef.current = []
    }
  }, [showExtendPopup, muted, connected])

  /** 1분 무료 연장 팝업은 TTS 멈추지 않음 (팝업 떠 있어도 AI 말 계속 들리게) */
  const prevFreeExtendPopupRef = useRef(false)
  useEffect(() => {
    prevFreeExtendPopupRef.current = showFreeExtendPopup
  }, [showFreeExtendPopup])

  /** 상담종료 팝업 떴을 때 TTS 즉시 중지 */
  const prevConsultationEndModalRef = useRef(false)
  useEffect(() => {
    const wasOpen = prevConsultationEndModalRef.current
    prevConsultationEndModalRef.current = showConsultationEndModal
    if (showConsultationEndModal && !wasOpen) {
      streamerRef.current?.stop()
      humeCurrentAudioRef.current?.pause()
      humeCurrentAudioRef.current = null
      humeAudioQueueRef.current.length = 0
      dccCurrentAudioRef.current?.pause()
      dccCurrentAudioRef.current = null
      dccStreamerRef.current?.stop()
      dccStreamerRef.current = null
      if (dccPcmContextRef.current) {
        try { dccPcmContextRef.current.close() } catch { /* ignore */ }
        dccPcmContextRef.current = null
      }
      if (dccOutVolumeIntervalRef.current) {
        clearInterval(dccOutVolumeIntervalRef.current)
        dccOutVolumeIntervalRef.current = null
      }
      setOutVolume(0)
      isAiSpeakingRef.current = false
    }
  }, [showConsultationEndModal])

  /* ── 타이머 ────────────────────────────── */
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) return
    sessionStartedRef.current = true
    timerIntervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (extendPaymentInProgressRef.current) return prev
        if (extendPopupOpenRef.current && !isAiSpeakingRef.current) return prev
        const next = prev - 1
        // 30초 전: 무료시작 1회 → 1분 무료 연장 팝업 / 유료진입·이미 무료팝업 봤음 → 시간연장·충전 팝업
        if (next === 30 && !extendPopupShownRef.current) {
          extendPopupShownRef.current = true
          const isFreeStartNow = typeof window !== 'undefined' && !sessionStorage.getItem('voice_entered_by_100')
          if (isFreeStartNow && !freeExtendPopupShownThisSessionRef.current) {
            freeExtendPopupShownThisSessionRef.current = true
            setExtendPopupOpenedByButton(false)
            setShowFreeExtendPopup(true)
          } else {
            setExtendPopupOpenedByButton(false)
            setShowExtendPopup(true)
          }
        }
        // 시간 종료
        if (next <= 0) {
          if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current)
            timerIntervalRef.current = null
          }
          try {
            sessionStorage.setItem('voice_time_expired', '1')
          } catch { /* ignore */ }
          if (extendPopupShownRef.current) {
            timeHitZeroNoExtendPopupRef.current = true
            return 0
          }
          extendPopupShownRef.current = true
          const isFreeStartAtZero = typeof window !== 'undefined' && !sessionStorage.getItem('voice_entered_by_100')
          if (isFreeStartAtZero && !freeExtendPopupShownThisSessionRef.current) {
            freeExtendPopupShownThisSessionRef.current = true
            setExtendPopupOpenedByButton(false)
            setShowFreeExtendPopup(true)
          } else {
            setExtendPopupOpenedByButton(false)
            setShowExtendPopup(true)
          }
          return 0
        }
        return next
      })
    }, 1000)
  }, [])

  /** 시간 0 되었을 때: TTS 무조건 끊고, 종료소리 있으면 재생 후 자동저장. 없으면 즉시 자동저장 */
  /** totalSeconds > 0 일 때만 동작 (초기 마운트 시 remainingSeconds=0으로 즉시 disconnect되는 것 방지) */
  useEffect(() => {
    if (totalSeconds <= 0) return
    if (remainingSeconds <= 0 && disconnectInternalRef.current && !disconnectedAtZeroRef.current) {
      if (timeHitZeroNoExtendPopupRef.current) {
        timeHitZeroNoExtendPopupRef.current = false
        setShowFreeExtendPopup(false)
        setShowExtendPopup(false)
      }
      const doDisconnect = () => {
        if (disconnectedAtZeroRef.current) return
        disconnectedAtZeroRef.current = true
        disconnectInternalRef.current?.()
      }
      // TTS/재생 무조건 중단 (말 중이어도 끊음)
      stopAllTTSRef.current()
      const endUrl = contentData?.voice_end_sound_url
      const endEl = endSoundRef.current
      if (endUrl && endEl && !endSoundPlayedRef.current) {
        endSoundPlayedRef.current = true
        endEl.src = getAudioSrc(endUrl)
        const onDone = () => {
          endEl.removeEventListener('ended', onDone)
          endEl.removeEventListener('error', onDone)
          doDisconnect()
        }
        endEl.addEventListener('ended', onDone, { once: true })
        endEl.addEventListener('error', onDone, { once: true })
        endEl.play().catch(() => onDone())
        // 재생이 끝나지 않을 경우 대비 (최대 10초 후 자동저장)
        setTimeout(() => {
          if (!disconnectedAtZeroRef.current) doDisconnect()
        }, 10000)
      } else {
        doDisconnect()
      }
    }
  }, [totalSeconds, remainingSeconds, contentData?.voice_end_sound_url])

  /* ── 침묵 깨기 ─────────────────────────── */
  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const ensurePlaybackResumed = useCallback(async () => {
    const streamer = streamerRef.current
    if (!streamer) return
    try { await streamer.resume() } catch { /* ignore */ }
  }, [])

  // 탭 전환 시에는 중단하지 않음(다른 탭 보면서 들을 수 있도록). 실제 이탈 시에는 언마운트 cleanup에서 TTS·연결 중지.

  // iOS Safari: 포커스/복귀 후 AudioContext가 suspended면 AI 음성이 무음이 될 수 있어 복구
  useEffect(() => {
    if (typeof window === 'undefined' || !isIOSDevice()) return
    const resumeIfConnected = () => {
      if (!connected) return
      void ensurePlaybackResumed()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeIfConnected()
    }
    window.addEventListener('pageshow', resumeIfConnected)
    window.addEventListener('focus', resumeIfConnected)
    window.addEventListener('touchstart', resumeIfConnected, { passive: true })
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pageshow', resumeIfConnected)
      window.removeEventListener('focus', resumeIfConnected)
      window.removeEventListener('touchstart', resumeIfConnected)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [connected, ensurePlaybackResumed])

  const sendSilenceBreakRef = useRef<(sec: number, onTtsEnd?: () => void) => Promise<void>>(async () => {})
  const sendDccTurnRef = useRef<((opts: { transcript?: string; audioBase64?: string; userName?: string; silenceBreakText?: string }, onPlaybackComplete?: () => void) => Promise<void>) | null>(null)

  const sendSilenceBreak = useCallback(async (silenceSeconds: number, onTtsEnd?: () => void) => {
    if (showConsultationEndModalRef.current) {
      onTtsEnd?.()
      return
    }
    if (isAiSpeakingRef.current) {
      onTtsEnd?.()
      return
    }
    if (Date.now() - lastUserTranscriptAtRef.current < 5000) {
      return
    }
    clearSilenceTimer()
    const cid = contentIdRef.current
    if (!cid) {
      return
    }
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

      // WebSocket(Live API) 또는 DCC로 캐릭터 목소리 재생. 없을 때만 speechSynthesis(국어책 읽기 음성) 사용
      const ws = wsRef.current
      const sid = dccSessionIdRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        const instruction = `[침묵 깨기] 사용자가 ${silenceSeconds}초간 말이 없습니다. 당신이 먼저 말을 걸어야 합니다. 반드시 아래 문장만 음성으로 말하세요. 다른 설명이나 추가 말 금지: "${text}"`
        ws.send(JSON.stringify({ type: 'text', text: instruction }))
        const estimatedMs = Math.min(14000, Math.max(6000, text.length * 100))
        setTimeout(() => onTtsEnd?.(), estimatedMs)
      } else if (sid && sendDccTurnRef.current) {
        sendDccTurnRef.current({ silenceBreakText: text }, onTtsEnd)
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

  /** AI 발화 종료 시 침묵깨기 타이머 시작 (WebSocket은 streamer.onComplete에서, DCC는 재생 완료 시 이 함수 호출) */
  const startSilenceBreakTimerAfterPlayback = useCallback(() => {
    isAiSpeakingRef.current = false
    lastAiSpeechEndAtRef.current = Date.now()
    clearSilenceTimer()
    const sessionStart = sessionStartTimeRef.current
    if (sessionStart != null && Date.now() - sessionStart < 5000) return
    if (skipSilenceBreakRef.current) return
    if (showConsultationEndModalRef.current) return
    if (mutedRef.current) return
    const doSend = sendSilenceBreakRef.current
    const s1 = silenceBreakSecs.first * 1000
    const s2 = silenceBreakSecs.second * 1000
    const s3 = silenceBreakSecs.third * 1000
    silenceTimerRef.current = setTimeout(() => {
      silenceTimerRef.current = null
      if (showConsultationEndModalRef.current) return
      doSend(silenceBreakSecs.first, () => {
        if (showConsultationEndModalRef.current) return
        if (!mutedRef.current && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null
            if (showConsultationEndModalRef.current) return
            doSend(silenceBreakSecs.second, () => {
              if (showConsultationEndModalRef.current) return
              if (!mutedRef.current && !silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  silenceTimerRef.current = null
                  if (showConsultationEndModalRef.current) return
                  doSend(silenceBreakSecs.third, undefined)
                }, s3)
              }
            })
          }, s2)
        }
      })
    }, s1)
  }, [silenceBreakSecs, clearSilenceTimer])

  const startSilenceBreakTimerRef = useRef<() => void>(() => {})
  startSilenceBreakTimerRef.current = startSilenceBreakTimerAfterPlayback

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
    const failoverWsUrl = resolveWsUrl()
    const failoverUsesInternal = failoverWsUrl.includes('/api/voice-mvp/live-proxy')
    const failoverSpeechConfig = failoverUsesInternal
      ? { languageCode: 'ko-KR' as const, voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      : { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
    const grokNativeKoHint = /^grok/i.test(model)
      ? '\n\n[음성 입력 해석] 사용자 음성은 한국어로 해석할 것. 한국어 발음·억양을 고려해 인식할 것.\n\n[음성 출력] 반드시 한국어로만 답할 것. 한국어 네이티브 화자와 같은 자연스러운 발음·억양·리듬을 유지할 것. 외국인 억양이 들리지 않도록 할 것.'
      : ''
    const config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: failoverSpeechConfig,
      systemInstruction: { parts: [{ text: `${sysText}\n\n${systemAndContext.contextText}${grokNativeKoHint}` }] },
      temperature,
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
          if (isHumeModel(model)) {
            const buf = base64ToArrayBuffer(msg.data)
            const blob = new Blob([buf], { type: 'audio/wav' })
            humeAudioQueueRef.current.push(blob)
            playHumeQueueRef.current?.()
            return
          }
          const buf = base64ToArrayBuffer(msg.data)
          streamerRef.current?.addPCM16(new Uint8Array(buf))
          return
        }
        if (msg.type === 'interrupted') {
          if (isHumeModel(model)) {
            humeCurrentAudioRef.current?.pause()
            humeCurrentAudioRef.current = null
            humeAudioQueueRef.current.length = 0
          }
          streamerRef.current?.stop()
          isAiSpeakingRef.current = false
          return
        }
      } catch { /* ignore */ }
    }
    pendingWs.onerror = () => { pendingWsRef.current = null; plannedFailoverRef.current = false; setError('리전 전환 실패.') }
    pendingWs.onclose = () => { if (pendingWsRef.current === pendingWs) { pendingWsRef.current = null; plannedFailoverRef.current = false } }
  }, [systemAndContext, model, voiceName, temperature, humeConfigId, startFailoverCheckInterval])

  connectPendingFailoverRef.current = connectPendingFailover

  /* ── WS URL 해석 ───────────────────────── */
  function resolveWsUrl() {
    const envProxy = String(process.env.NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL || '').trim()
    if (envProxy) {
      if (envProxy.startsWith('ws://') || envProxy.startsWith('wss://')) return envProxy
      if (envProxy.startsWith('http://') || envProxy.startsWith('https://')) return envProxy.replace(/^http/, 'ws')
      return `${window.location.origin}${envProxy.startsWith('/') ? '' : '/'}${envProxy}`.replace(/^http/, 'ws')
    }
    // envProxy 미설정 시: GPT는 live-proxy, Gemini는 live-proxy (Next.js는 upgrade 시 socket.end()로 1006 → vertex-proxy 사용 권장)
    return `${window.location.origin.replace(/^http/, 'ws')}/api/voice-mvp/live-proxy`
  }

  /* ── 내부 disconnect ───────────────────── */
  const saveConversationRef = useRef<() => Promise<void>>()
  const disconnectInternalRef = useRef<((skipSave?: boolean) => void) | null>(null)

  function disconnectInternal(skipSave = false) {
    // 나가기/종료 시 항상 모든 TTS·재생 즉시 중지 (저장 후 폼 이동해도 소리 계속 나는 현상 방지)
    stopAllTTSRef.current()
    manualDisconnectRef.current = true
    clearSilenceTimer()
    if (dccVadTimerRef.current) {
      clearTimeout(dccVadTimerRef.current)
      dccVadTimerRef.current = null
    }
    setDccRecording(false)
    recorderRef.current?.stop()
    streamerRef.current?.stop()
    humeCurrentAudioRef.current?.pause()
    humeCurrentAudioRef.current = null
    humeAudioQueueRef.current.length = 0
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
    // 시간이 남은 채로 종료한 경우 잔여시간 저장 (폼에서 상담잔여시간으로 재상담 가능)
    const sec = remainingSecondsRef.current
    const cid = contentIdRef.current
    const phone = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
    if (!skipSave && sec > 0 && cid && phone) {
      fetch('/api/voice/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_remaining', contentId: cid, phone, remainingSeconds: sec }),
      }).catch(() => {})
    }
    iosMicStreamPromiseRef.current = null
    iosContextWorkaroundDoneRef.current = false
    if (iosRecorderContextRef.current) {
      iosRecorderContextRef.current.close().catch(() => {})
      iosRecorderContextRef.current = null
    }
  }
  disconnectInternalRef.current = disconnectInternal

  /* ── connect ───────────────────────────── */
  /** Deepgram+Claude+Cartesia: PCM base64 청크들을 WAV로 합쳐 base64 반환 (16kHz mono 16bit) */
  const buildWavFromPcmChunks = useCallback((chunks: string[], sampleRate = 16000): string => {
    if (chunks.length === 0) return ''
    let totalLen = 0
    const buffers: ArrayBuffer[] = []
    for (const b64 of chunks) {
      const bin = atob(b64)
      const buf = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
      totalLen += buf.length
      buffers.push(buf.buffer)
    }
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
    const blockAlign = numChannels * (bitsPerSample / 8)
    const dataSize = totalLen
    const header = new ArrayBuffer(44)
    const view = new DataView(header)
    const writeStr = (off: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)) }
    writeStr(0, 'RIFF')
    view.setUint32(4, 36 + dataSize, true)
    writeStr(8, 'WAVE')
    writeStr(12, 'fmt ')
    view.setUint32(16, 16, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, numChannels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, byteRate, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bitsPerSample, true)
    writeStr(36, 'data')
    view.setUint32(40, dataSize, true)
    const combined = new Uint8Array(44 + dataSize)
    combined.set(new Uint8Array(header), 0)
    let offset = 44
    for (const buf of buffers) {
      combined.set(new Uint8Array(buf), offset)
      offset += buf.byteLength
    }
    let binary = ''
    for (let i = 0; i < combined.length; i++) binary += String.fromCharCode(combined[i])
    return btoa(binary)
  }, [])

  const sendDccTurn = useCallback(async (opts: { transcript?: string; audioBase64?: string; userName?: string; silenceBreakText?: string }, onPlaybackComplete?: () => void) => {
    const cid = contentIdRef.current
    const sid = dccSessionIdRef.current
    if (!cid || !sid) return
    if (dccSendingRef.current) return
    dccSendingRef.current = true
    dccStopPlaybackRef.current = false
    const abortCtrl = new AbortController()
    dccAbortControllerRef.current = abortCtrl
    setError('')
    const isSilenceBreak = !!opts.silenceBreakText
    const isStartTurn = !isSilenceBreak && opts.transcript === '[시작]'
    if (isStartTurn) dccFirstTurnPlayingRef.current = true
    try {
      const body: Record<string, unknown> = {
        contentId: parseInt(cid, 10),
        sessionId: sid,
        conversationHistory: isSilenceBreak ? [] : dccHistoryRef.current,
      }
      if (opts.silenceBreakText != null) body.silenceBreakText = opts.silenceBreakText
      if (opts.transcript != null) body.transcript = opts.transcript
      if (opts.audioBase64 != null) body.audioBase64 = opts.audioBase64
      if (opts.userName != null) body.userName = opts.userName
      if (systemAndContext.contextText) body.contextText = systemAndContext.contextText
      const DCC_RETRY_DELAY_MS = 2000
      let res: Response = await fetch('/api/voice/dcc-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: abortCtrl.signal,
      })
      if (!res.ok && res.status === 502) {
        await new Promise((r) => setTimeout(r, DCC_RETRY_DELAY_MS))
        res = await fetch('/api/voice/dcc-turn', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortCtrl.signal,
        })
      }
      const contentType = res.headers.get('content-type') || ''
      const isStream = contentType.includes('ndjson') || contentType.includes('x-ndjson')

      if (isStream && res.body) {
        if (!res.ok) {
          if (isStartTurn) dccFirstTurnPlayingRef.current = false
          const errText = await res.text().catch(() => '')
          let userMsg = '일시적인 오류입니다. 다시 말씀해 주세요.'
          try {
            const errData = JSON.parse(errText) as { error?: string }
            if (typeof errData?.error === 'string' && errData.error.length > 0 && errData.error.length < 120) {
              userMsg = errData.error
            }
          } catch {
            /* use default userMsg */
          }
          setError(userMsg)
          onPlaybackComplete?.()
          return
        }
        let userT = ''
        let assistantT = ''
        let receivedAudio = false
        const base64ToArrayBuffer = (b64: string) => {
          const binary = atob(b64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          return bytes.buffer
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed) continue
            try {
              const parsed = JSON.parse(trimmed) as { type?: string; text?: string; assistantText?: string; base64?: string; format?: string; sampleRate?: number }
              if (parsed.type === 'userTranscript' && typeof parsed.text === 'string') {
                userT = parsed.text
                if (!isSilenceBreak) {
                  setMessages((prev) => [...prev, { role: 'user', text: userT }])
                  lastUserTranscriptAtRef.current = Date.now()
                  clearSilenceTimer()
                }
              } else if (parsed.type === 'audio' && typeof parsed.base64 === 'string') {
                if (parsed.format === 'pcm_s16le') {
                  const ab = base64ToArrayBuffer(parsed.base64)
                  playDccPcmChunk(ab)
                  receivedAudio = true
                }
              } else if (parsed.type === 'done') {
                assistantT = typeof parsed.assistantText === 'string' ? parsed.assistantText : ''
                if (assistantT && !isSilenceBreak) setMessages((prev) => [...prev, { role: 'assistant', text: assistantT }])
                if (receivedAudio && dccStreamerRef.current) {
                  dccStreamerRef.current.onComplete = () => {
                    if (isStartTurn) dccFirstTurnPlayingRef.current = false
                    stopDccPlayback(false)
                    startSilenceBreakTimerRef.current?.()
                    onPlaybackComplete?.()
                  }
                  dccStreamerRef.current.flush()
                  dccStreamerRef.current.complete()
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
        if (!receivedAudio) {
          if (isStartTurn) dccFirstTurnPlayingRef.current = false
          startSilenceBreakTimerRef.current?.()
          onPlaybackComplete?.()
        }
        if (!isSilenceBreak) {
          dccHistoryRef.current = [
            ...dccHistoryRef.current,
            ...(userT ? [{ role: 'user' as const, content: userT }] : []),
            ...(assistantT ? [{ role: 'assistant' as const, content: assistantT }] : []),
          ].slice(-50)
        }
        return
      }

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const errMsg = (data as any)?.error
        setError(typeof errMsg === 'string' && errMsg.length > 0 && errMsg.length < 120 ? errMsg : '일시적인 오류입니다. 다시 말씀해 주세요.')
        onPlaybackComplete?.()
        return
      }
      const userT = (data as any).userTranscript
      const assistantT = (data as any).assistantText
      const audioB64 = (data as any).audioBase64
      if (userT && !isSilenceBreak) {
        setMessages((prev) => [...prev, { role: 'user', text: userT }])
        lastUserTranscriptAtRef.current = Date.now()
        clearSilenceTimer()
      }
      if (assistantT && !isSilenceBreak) setMessages((prev) => [...prev, { role: 'assistant', text: assistantT }])
      if (!isSilenceBreak) {
        dccHistoryRef.current = [
          ...dccHistoryRef.current,
          ...(userT ? [{ role: 'user' as const, content: userT }] : []),
          ...(assistantT ? [{ role: 'assistant' as const, content: assistantT }] : []),
        ].slice(-50)
      }
      if (audioB64 && typeof audioB64 === 'string' && !dccStopPlaybackRef.current) {
        isAiSpeakingRef.current = true
        const list = conversationSoundsRef.current.filter(Boolean) as HTMLAudioElement[]
        const prob = bubbleProbRef.current
        const now = Date.now()
        if (list.length > 0 && prob > 0 && now >= conversationSoundCooldownUntilRef.current) {
          const roll = Math.random()
          if (roll < prob) {
            const chosen = list[Math.floor(Math.random() * list.length)]
            chosen.currentTime = 0
            chosen.play().catch(() => {})
            conversationSoundCooldownUntilRef.current = now + CONVERSATION_SOUND_COOLDOWN_MS
          }
        }
        if (dccOutVolumeIntervalRef.current) clearInterval(dccOutVolumeIntervalRef.current)
        dccOutVolumeIntervalRef.current = setInterval(() => setOutVolume(0.35), 80)
        const audio = new Audio(`data:audio/wav;base64,${audioB64}`)
        setPlaysInlineForSpeaker(audio)
        dccCurrentAudioRef.current = audio
        const clearOutVol = () => {
          if (isStartTurn) dccFirstTurnPlayingRef.current = false
          dccCurrentAudioRef.current = null
          if (dccOutVolumeIntervalRef.current) {
            clearInterval(dccOutVolumeIntervalRef.current)
            dccOutVolumeIntervalRef.current = null
          }
          setOutVolume(0)
          isAiSpeakingRef.current = false
          startSilenceBreakTimerRef.current?.()
          onPlaybackComplete?.()
        }
        audio.onended = clearOutVol
        audio.onerror = clearOutVol
        await audio.play().catch(clearOutVol)
      } else {
        if (isStartTurn) dccFirstTurnPlayingRef.current = false
        if (onPlaybackComplete) onPlaybackComplete()
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return
      throw e
    } finally {
      dccSendingRef.current = false
    }
  }, [systemAndContext])
  sendDccTurnRef.current = sendDccTurn

  const isDccProvider = contentData?.voice_provider === 'deepgram-claude-cartesia'
  const [dccRecording, setDccRecording] = useState(false)

  const startDccRecording = useCallback(async () => {
    if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
    dccChunksRef.current = []
    const rec = recorderRef.current
    const onData = (base64: string) => { dccChunksRef.current.push(base64) }
    const onVolume = (vol: number) => { setInVolume(vol) }
    rec.off('data', onData as any).off('volume', onVolume as any).on('data', onData as any).on('volume', onVolume as any)
    try {
      await rec.start()
      setDccRecording(true)
    } catch (e: any) {
      setError(e?.message || '마이크를 사용할 수 없습니다.')
    }
  }, [])

  const endDccTurn = useCallback(async () => {
    recorderRef.current?.stop()
    setDccRecording(false)
    dccRecordingRef.current = false
    setInVolume(0)
    closeDeepgramWs()
    const chunks = dccChunksRef.current
    dccChunksRef.current = []
    if (chunks.length > 0) {
      const wavB64 = buildWavFromPcmChunks(chunks)
      if (wavB64) await sendDccTurn({ audioBase64: wavB64 })
    }
  }, [buildWavFromPcmChunks, sendDccTurn, stopDccPlayback, closeDeepgramWs])

  /** Deepgram WebSocket 연결 생성. speech_final 시 sendDccTurn({ transcript }) 호출 */
  const connectDeepgramWs = useCallback(async () => {
    closeDeepgramWs()
    if (!dgApiKeyRef.current) {
      try {
        const r = await fetch('/api/voice/deepgram-token')
        const d = await r.json()
        if (d?.key) dgApiKeyRef.current = d.key
      } catch (e) {
        console.error('[DG-WS] API key fetch failed:', e)
        return
      }
    }
    if (!dgApiKeyRef.current) {
      console.error('[DG-WS] No API key')
      return
    }

    const params = new URLSearchParams({
      model: 'nova-3',
      language: 'ko',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      speech_final: 'true',
      endpointing: String(DCC_SILENCE_END_MS),
      vad_events: 'true',
    })
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', dgApiKeyRef.current])
    dgWsRef.current = ws

    ws.onopen = () => {
      dgReconnectingRef.current = false
      console.log('[DG-WS] connected')
      if (dgKeepaliveRef.current) clearInterval(dgKeepaliveRef.current)
      dgKeepaliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'KeepAlive' })) } catch { /* ignore */ }
        }
      }, 8000)
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : '')
        if (msg.type === 'Results') {
          const alt = msg.channel?.alternatives?.[0]
          const transcript = alt?.transcript ?? ''
          if (msg.speech_final && transcript.trim()) {
            if (isAiSpeakingRef.current || dccSendingRef.current) {
              console.log('[DG-WS] speech_final 무시 (AI 발화중/전송중):', transcript.trim().slice(0, 30))
              return
            }
            console.log('[DG-WS] speech_final:', transcript.trim())
            sendDccTurn({ transcript: transcript.trim() })
          }
        }
      } catch { /* ignore non-JSON */ }
    }

    ws.onerror = (e) => {
      console.error('[DG-WS] error:', e)
    }

    ws.onclose = (e) => {
      console.log('[DG-WS] closed:', e.code, e.reason)
      if (dgKeepaliveRef.current) { clearInterval(dgKeepaliveRef.current); dgKeepaliveRef.current = null }
      if (dgWsRef.current === ws) dgWsRef.current = null
      if (!dgReconnectingRef.current && dccRecordingRef.current) {
        dgReconnectingRef.current = true
        console.log('[DG-WS] reconnecting...')
        setTimeout(() => connectDeepgramWs(), 1000)
      }
    }
  }, [closeDeepgramWs, sendDccTurn])

  /** DCC 연속 대화: 첫 인사 재생이 끝난 뒤 호출. Deepgram WS로 실시간 STT, speech_final로 자동 턴 전송.
   * iOS: 사용자 제스처 직후 취득한 primedStream/primedContext 를 넘기면 수음 불가 이슈를 줄일 수 있음. */
  const startDccContinuousRecording = useCallback((primedStream?: MediaStream, primedContext?: AudioContext) => {
    if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
    dccChunksRef.current = []
    dccLastTurnEndIndexRef.current = 0

    const rec = recorderRef.current
    const sens = micSensitivityRef.current
    const threshold = SPEECH_THRESHOLD_MAX - (sens / 100) * (SPEECH_THRESHOLD_MAX - SPEECH_THRESHOLD_MIN)
    const interruptThreshold = threshold * TTS_INTERRUPT_VOLUME_FACTOR

    const onData = (base64: string) => {
      dccChunksRef.current.push(base64)
      const ws = dgWsRef.current
      if (ws && ws.readyState === WebSocket.OPEN) {
        const bin = atob(base64)
        const buf = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i)
        try { ws.send(buf.buffer) } catch { /* ignore */ }
      }
    }

    const onVolume = (vol: number) => {
      setInVolume(vol)
      if (isAiSpeakingRef.current && vol > interruptThreshold) {
        const now = Date.now()
        if (dccInterruptAboveSinceRef.current === null) dccInterruptAboveSinceRef.current = now
        else if (now - dccInterruptAboveSinceRef.current >= TTS_INTERRUPT_DEBOUNCE_MS) {
          stopDccPlayback(true)
          dccInterruptAboveSinceRef.current = null
        }
      } else if (vol <= interruptThreshold) {
        dccInterruptAboveSinceRef.current = null
      }
    }

    rec.off('data', onData as any).off('volume', onVolume as any).on('data', onData as any).on('volume', onVolume as any)

    connectDeepgramWs()

    const startPromise = primedStream && primedContext
      ? rec.start(primedStream, primedContext)
      : rec.start()
    startPromise.then(() => { setDccRecording(true); dccRecordingRef.current = true }).catch((e: any) => setError(e?.message || '마이크를 사용할 수 없습니다.'))
  }, [sendDccTurn, stopDccPlayback, connectDeepgramWs])

  /** 잔여금액으로 진입한 세션: 연결 후 차감주기마다 잔액 차감·UI 갱신 (remaining/total은 타이머가 이미 카운트다운 중이므로 갱신만) */
  const startBalanceDeductIntervalIfNeeded = useCallback((data: typeof contentData) => {
    if (!enteredWithBalanceRef.current) return
    if (balanceDeductIntervalRef.current) return
    const chargeOpt = data?.voice_time_options && Array.isArray(data.voice_time_options)
      ? (data.voice_time_options as any[]).find((o: any) => o?.type === 'charge')
      : null
    const rateSeconds = chargeOpt != null && Number(chargeOpt.rate_seconds) > 0 ? Number(chargeOpt.rate_seconds) : 0
    const rateWon = chargeOpt != null && Number(chargeOpt.rate_won) > 0 ? Number(chargeOpt.rate_won) : 0
    if (!rateSeconds || !rateWon) return
    useBalanceModeRef.current = true
    balanceDeductIntervalRef.current = setInterval(async () => {
      if (!useBalanceModeRef.current) return
      const cid2 = contentIdRef.current
      const phone2 = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
      if (!cid2 || !phone2) return
      try {
        const r = await fetch('/api/voice/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deduct', contentId: cid2, phone: phone2, secondsUsed: rateSeconds, rate_seconds: rateSeconds, rate_won: rateWon }),
        })
        const d = await r.json()
        if (r.status === 402 || !d?.success) {
          useBalanceModeRef.current = false
          if (balanceDeductIntervalRef.current) {
            clearInterval(balanceDeductIntervalRef.current)
            balanceDeductIntervalRef.current = null
          }
          setRemainingSeconds(0)
          alert('잔액이 부족하여 상담 시간이 종료됩니다.')
          return
        }
        setBalanceWan(d.balance_wan ?? 0)
      } catch {
        useBalanceModeRef.current = false
        if (balanceDeductIntervalRef.current) {
          clearInterval(balanceDeductIntervalRef.current)
          balanceDeductIntervalRef.current = null
        }
      }
    }, rateSeconds * 1000)
  }, [])

  const connect = useCallback(async () => {
    setError('')
    startSoundPlayedRef.current = false // 이번 연결에서 ready 시 종소리 1회 재생
    // iOS: 사용자 제스처 직후 무음 재생으로 오디오 세션 활성화 (스피커/이어피스는 세션 설정 안 함 — playback 설정 시 소리 안 나는 경우 있음)
    if (isIOSDevice() && typeof window !== 'undefined') {
      const unlock = new Audio()
      setPlaysInlineForSpeaker(unlock)
      unlock.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      void unlock.play().catch(() => {})
    }
    try {
      // 중복 connect 방지: CONNECTING 상태에서도 재호출되면 소켓이 교체되어 init 누락 가능
      if (
        wsRef.current &&
        (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)
      ) return
      const isDccProvider = contentData?.voice_provider === 'deepgram-claude-cartesia'
      if (isDccProvider) {
        // DCC는 streamerRef/WS를 쓰지 않으므로 침묵깨기 타이머는 설정되지 않음 (아래 streamer.onComplete 미실행)
        const cid = contentIdRef.current
        if (!cid) return
        dccSessionIdRef.current = `dcc-${cid}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
        dccChunksRef.current = []
        dccHistoryRef.current = []
        setConnected(true)
        startTimer()
        startBalanceDeductIntervalIfNeeded(contentData)
        if (startSoundRef.current && !startSoundPlayedRef.current) {
          startSoundPlayedRef.current = true
          startSoundRef.current.currentTime = 0
          startSoundRef.current.play().catch(() => {})
        }
        // iOS: 마이크 팝업이 먼저 뜨도록 getUserMedia를 재생용 AudioContext 생성보다 먼저 호출. 그 다음 재생용 컨텍스트 초기화.
        const isiOS = isIOSDevice()
        if (isiOS) {
          if (!iosRecorderContextRef.current) {
            try {
              iosRecorderContextRef.current = new AudioContext({ sampleRate: 16000 })
            } catch {
              /* ignore */
            }
          }
          if (!iosMicStreamPromiseRef.current && navigator.mediaDevices?.getUserMedia) {
            iosMicStreamPromiseRef.current = navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
          }
          initDccPcmAudio()
          const stream = await iosMicStreamPromiseRef.current?.catch(() => null)
          const ctx = iosRecorderContextRef.current
          if (stream && ctx) startDccContinuousRecording(stream, ctx)
          else startDccContinuousRecording()
        } else {
          initDccPcmAudio()
          startDccContinuousRecording()
        }
        // DCC도 양방향 녹음(마이크+AI) → 나의 이용내역 음성듣기용 voice_audio_url 저장
        ;(async () => {
          const ctx = initDccPcmAudio()
          if (!ctx || !dccStreamerRef.current) return
          try {
            const dest = ctx.createMediaStreamDestination()
            mixedDestinationRef.current = dest
            dccStreamerRef.current.connectExtraDestination(dest)
            const micStream = iosMicStreamPromiseRef.current
              ? await iosMicStreamPromiseRef.current
              : await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
            const micSource = ctx.createMediaStreamSource(micStream)
            micSource.connect(dest)
            micSourceNodeRef.current = micSource
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm'
            const mr = new MediaRecorder(dest.stream, { mimeType })
            mixedChunksRef.current = []
            mr.ondataavailable = (e) => {
              if (e.data.size > 0) mixedChunksRef.current.push(e.data)
            }
            mr.start(1000)
            mixedMediaRecorderRef.current = mr
          } catch (recErr: any) {
          }
        })()
        const dccUserName = typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : ''
        sendDccTurn({ transcript: '[시작]', userName: dccUserName }, () => {
          dccLastTurnEndIndexRef.current = dccChunksRef.current.length
        })
        return
      }
      const isiOS = isIOSDevice()

      // iOS: 사용자 클릭 제스처 시점에 마이크 권한/녹음 컨텍스트를 먼저 준비해야
      // 최신 기기에서 권한 팝업 지연/수음 불가 이슈를 줄일 수 있음.
      if (isiOS) {
        if (!iosRecorderContextRef.current) {
          try {
            iosRecorderContextRef.current = new AudioContext({ sampleRate: 16000 })
          } catch {
            // ignore
          }
        }
        if (!iosMicStreamPromiseRef.current && navigator.mediaDevices?.getUserMedia) {
          iosMicStreamPromiseRef.current = navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
        }
      }

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
        // AI 재생이 끝난 후에만 침묵깨기 타이머 시작 (AI가 말하는 중에는 미발동)
        streamer.onComplete = () => {
          isAiSpeakingRef.current = false
          lastAiSpeechEndAtRef.current = Date.now()
          clearSilenceTimer()
          const sessionStart = sessionStartTimeRef.current
          if (sessionStart != null && Date.now() - sessionStart < 5000) return
          if (skipSilenceBreakRef.current) return
          if (showConsultationEndModalRef.current) return
          if (mutedRef.current) return
          const doSend = sendSilenceBreakRef.current
          const s1 = silenceBreakSecs.first * 1000
          const s2 = silenceBreakSecs.second * 1000
          const s3 = silenceBreakSecs.third * 1000
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null
            if (showConsultationEndModalRef.current) return
            doSend(silenceBreakSecs.first, () => {
              if (showConsultationEndModalRef.current) return
              if (!mutedRef.current && !silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(() => {
                  silenceTimerRef.current = null
                  if (showConsultationEndModalRef.current) return
                  doSend(silenceBreakSecs.second, () => {
                    if (showConsultationEndModalRef.current) return
                    if (!mutedRef.current && !silenceTimerRef.current) {
                      silenceTimerRef.current = setTimeout(() => {
                        silenceTimerRef.current = null
                        if (showConsultationEndModalRef.current) return
                        doSend(silenceBreakSecs.third, undefined)
                      }, s3)
                    }
                  })
                }, s2)
              }
            })
          }, s1)
        }
        streamerRef.current = streamer

        // 양방향 오디오 녹음 설정: AI 출력 + 마이크 → MediaRecorder
        try {
          const dest = outCtx.createMediaStreamDestination()
          mixedDestinationRef.current = dest
          // AI 출력(gainNode)을 녹음 destination에도 연결 (stop() 시 재연결도 자동)
          streamer.connectExtraDestination(dest)
          // 마이크 스트림을 AI 출력 AudioContext에 소스로 연결
          const micStream = iosMicStreamPromiseRef.current
            ? await iosMicStreamPromiseRef.current
            : await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS })
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
            }
          }
          conversationSoundsRef.current.forEach((audio) => {
            if (!audio) return
            try {
              const source = outCtx.createMediaElementSource(audio)
              source.connect(dest)
              source.connect(outCtx.destination)
            } catch (e: any) {
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
        } catch (recErr: any) {
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
        }
      } catch { /* ignore */ }

      const wsUrl = resolveWsUrl()
      const envProxy = String(process.env.NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL || '').trim()
      const usesInternalProxy = wsUrl.includes('/api/voice-mvp/live-proxy')
      const speechConfig: any = usesInternalProxy
        ? { languageCode: 'ko-KR', voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
        : { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }

      // xAI Grok: 문서상 시스템 지시에 선호 언어·억양 명시 가능 → 네이티브 한국어 발음 지시
      const grokNativeKoHint = /^grok/i.test(model)
        ? '\n\n[음성 입력 해석] 사용자 음성은 한국어로 해석할 것. 한국어 발음·억양을 고려해 인식할 것.\n\n[음성 출력] 반드시 한국어로만 답할 것. 한국어 네이티브 화자와 같은 자연스러운 발음·억양·리듬을 유지할 것. 외국인 억양이 들리지 않도록 할 것.'
        : ''

      const config: any = {
        responseModalities: [Modality.AUDIO],
        speechConfig,
        systemInstruction: { parts: [{ text: `${sysText}\n\n${contextText}${grokNativeKoHint}` }] },
        // AI가 먼저 말하도록 Proactive Audio 활성화
        proactivity: { proactiveAudio: true },
        // GPT/xAI 온도 설정 (프록시에서 처리)
        temperature,
        // Hume 설정
        humeConfigId,
      }
      // Next API live-proxy는 upgrade 핸들러 등록을 위해 HTTP 초기화 호출이 선행되어야 함.
      if (!envProxy || usesInternalProxy) {
        const initUrl = `${window.location.origin}/api/voice-mvp/live-proxy`
        try { await fetch(initUrl, { method: 'GET', cache: 'no-store' }) } catch (e: any) { throw new Error(e?.message || 'Live 프록시 초기화 실패') }
      }
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      /** Hume EVI: audio_output(WAV) 큐를 순서대로 HTMLAudioElement로 재생 */
      const playHumeQueue = () => {
        if (humeCurrentAudioRef.current) return
        if (humeAudioQueueRef.current.length === 0) {
          isAiSpeakingRef.current = false
          return
        }
        const blob = humeAudioQueueRef.current.shift()!
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        humeCurrentAudioRef.current = audio
        audio.onended = () => {
          URL.revokeObjectURL(url)
          humeCurrentAudioRef.current = null
          playHumeQueue()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          humeCurrentAudioRef.current = null
          playHumeQueue()
        }
        audio.play().catch(() => {
          URL.revokeObjectURL(url)
          humeCurrentAudioRef.current = null
          playHumeQueue()
        })
      }
      playHumeQueueRef.current = playHumeQueue

      ws.onopen = () => {
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
          const region = failoverRegionRef.current || currentRegionRef.current
          if (failoverRegionRef.current) failoverRegionRef.current = null
          currentRegionRef.current = region
          // init 지연 전송은 일부 환경에서 누락 레이스가 발생할 수 있어 onopen 즉시 전송
          if (wsRef.current !== ws) return
          if (ws.readyState !== WebSocket.OPEN) return
          ws.send(JSON.stringify({ type: 'init', model, config, region }))
        } catch (e: any) { setError(e?.message || 'init 전송 실패') }
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data || '{}'))
          if (msg.type === 'ready') {
            lastSocketErrorRef.current = ''
            wasConnectedRef.current = true
            autoReconnectCountRef.current = 0
            initRetryCountRef.current = 0
            sessionStartTimeRef.current = Date.now()
            etiquetteViolationCountRef.current = 0
            currentUserTurnViolationsRef.current = new Set()
            currentUserTurnTextRef.current = ''
            setMannerWarningMessage(null)
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
              startSoundRef.current.play().catch(() => {})
            }
            // 타이머 시작
            startTimer()
            startBalanceDeductIntervalIfNeeded(contentData)

            // AI 첫 인사: 콘텐츠(어드민) voice_initial_greet_prompt만 사용. {{userName}} 치환. 하드코딩 프롬프트 없음. 8006/무료속성은 유저정보 미전달
            const isPpoingGreet = isPpoingAttributes(contentData)
            const userName2 = isPpoingGreet ? '' : (typeof window !== 'undefined' ? sessionStorage.getItem('payment_user_name') || '' : '')
            const minimalFallbackInitial = '내담자가 접속했습니다. 짧게 인사해 주세요.'
            const minimalFallbackResumed = '내담자가 다시 접속했습니다. 이어서 상담해 주세요.'
            const startRecorderDelayed = () => {
              const startRecorder = async () => {
                if (!recorderRef.current || wsRef.current?.readyState !== WebSocket.OPEN || mutedRef.current) return
                try {
                  if (isIOSDevice()) {
                    const primedStream = iosMicStreamPromiseRef.current
                      ? await iosMicStreamPromiseRef.current
                      : undefined
                    await recorderRef.current!.start(primedStream, iosRecorderContextRef.current ?? undefined)
                    iosRecorderContextRef.current = null
                  } else {
                    await recorderRef.current!.start()
                  }
                } catch (e: any) {
                  setError(e?.message || '마이크를 사용할 수 없습니다.')
                }
              }
              void startRecorder()
            }
            setTimeout(startRecorderDelayed, 1500)
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
                  const raw = isResumedSession ? (data.resumed ?? '') : (data.initial ?? '')
                  const fallback = isResumedSession ? minimalFallbackResumed : minimalFallbackInitial
                  greetTrigger = typeof raw === 'string' && raw.trim()
                    ? raw.replace(/\{\{userName\}\}/g, userName2 || '')
                    : fallback
                } catch {
                  greetTrigger = isResumedSession ? minimalFallbackResumed : minimalFallbackInitial
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
                }
              }
              sendGreet()
              setTimeout(sendGreet, 100)
            })()
            return
          }
          if (msg.type === 'audio' && msg.data) {
            clearSilenceTimer()
            if (isHumeModel(model)) {
              // Hume EVI: data는 base64 WAV. 큐에 넣고 HTMLAudioElement로 재생 (PCM 스트리머 사용 안 함)
              const buf = base64ToArrayBuffer(msg.data)
              const blob = new Blob([buf], { type: 'audio/wav' })
              humeAudioQueueRef.current.push(blob)
              audioChunksRef.current.push(msg.data)
              if (!isAiSpeakingRef.current) isAiSpeakingRef.current = true
              // 대화중 소리: 발화시작뿐 아니라 말하는 도중에도 확률로 재생 (쿨다운 4초)
              const list = conversationSoundsRef.current.filter(Boolean) as HTMLAudioElement[]
              const prob = bubbleProbRef.current
              const now = Date.now()
              if (list.length > 0 && prob > 0 && now >= conversationSoundCooldownUntilRef.current) {
                const roll = Math.random()
                if (roll < prob) {
                  const chosen = list[Math.floor(Math.random() * list.length)]
                  chosen.currentTime = 0
                  chosen.play().catch(() => {})
                  conversationSoundCooldownUntilRef.current = now + CONVERSATION_SOUND_COOLDOWN_MS
                }
              }
              playHumeQueue()
              return
            }
            const buf = base64ToArrayBuffer(msg.data)
            if (!isAiSpeakingRef.current) isAiSpeakingRef.current = true
            // 대화중 소리: 발화시작뿐 아니라 말하는 도중에도 확률로 재생 (쿨다운 4초)
            const list = conversationSoundsRef.current.filter(Boolean) as HTMLAudioElement[]
            const prob = bubbleProbRef.current
            const now = Date.now()
            if (list.length > 0 && prob > 0 && now >= conversationSoundCooldownUntilRef.current) {
              const roll = Math.random()
              if (roll < prob) {
                const chosen = list[Math.floor(Math.random() * list.length)]
                chosen.currentTime = 0
                chosen.play().catch(() => {})
                conversationSoundCooldownUntilRef.current = now + CONVERSATION_SOUND_COOLDOWN_MS
              }
            }
            const streamAndPlay = async () => {
              const streamer = streamerRef.current
              if (!streamer) return
              if (isIOSDevice() && !iosContextWorkaroundDoneRef.current) {
                iosContextWorkaroundDoneRef.current = true
                const ctx = streamer.context
                try {
                  if (ctx.state === 'running') {
                    await ctx.suspend()
                    await ctx.resume()
                  } else {
                    await ctx.resume()
                  }
                } catch {
                  // ignore
                }
              }
              try { await streamer.resume() } catch { /* ignore */ }
              streamer.addPCM16(new Uint8Array(buf))
            }
            void streamAndPlay()
            audioChunksRef.current.push(msg.data)
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
              if (role === 'user') {
                // 사용자 발화 전사 수신 시 TTS 즉시 멈춤 (Deepgram STT 결과가 오는 즉시)
                if (isAiSpeakingRef.current) {
                  if (isHumeModel(model)) {
                    humeCurrentAudioRef.current?.pause()
                    humeCurrentAudioRef.current = null
                    humeAudioQueueRef.current.length = 0
                  }
                  streamerRef.current?.stop()
                  setOutVolume(0)
                  isAiSpeakingRef.current = false
                }
                lastUserTranscriptAtRef.current = Date.now()
                clearSilenceTimer()
              }
              const isPpoingSession = isPpoingAttributes(contentData)
              if (role === 'assistant') {
                currentUserTurnViolationsRef.current = new Set()
                currentUserTurnTextRef.current = ''
              } else if (isPpoingSession) {
                currentUserTurnTextRef.current = (currentUserTurnTextRef.current + ' ' + txt).trim()
                const fullUserText = currentUserTurnTextRef.current
                if (fullUserText) {
                  if (detectCrisisKeywords(fullUserText)) {
                    try {
                      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'text', text: CRISIS_EXPERT_INSTRUCTION }))
                    } catch { /* ignore */ }
                  }
                  const violationType = detectEtiquetteViolation(fullUserText)
                  if (violationType && !currentUserTurnViolationsRef.current.has(violationType)) {
                    currentUserTurnViolationsRef.current.add(violationType)
                    etiquetteViolationCountRef.current += 1
                    if (etiquetteViolationCountRef.current >= 2) {
                      setMannerWarningMessage(getMannerWarningMessage())
                      disconnectInternal()
                    } else {
                      try {
                        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'text', text: getEtiquetteReprimandInstruction(violationType) }))
                      } catch { /* ignore */ }
                    }
                  }
                }
              }
              setMessages((prev) => {
                const last = prev.length > 0 ? prev[prev.length - 1] : null
                if (last && last.role === role) {
                  const updated = [...prev]
                  updated[updated.length - 1] = { ...last, text: last.text + ' ' + txt }
                  return updated
                }
                return [...prev, { role, text: txt }]
              })
            }
            return
          }
          if (msg.type === 'interrupted') {
            if (isHumeModel(model)) {
              humeCurrentAudioRef.current?.pause()
              humeCurrentAudioRef.current = null
              humeAudioQueueRef.current.length = 0
            }
            streamerRef.current?.stop()
            isAiSpeakingRef.current = false
            clearSilenceTimer()
            if (audioTimeoutRef.current) { clearTimeout(audioTimeoutRef.current); audioTimeoutRef.current = null }
            return
          }
          if (msg.type === 'error') {
            const errMsg = String(msg.message || 'Live 연결 오류')
            lastSocketErrorRef.current = errMsg
            // "already has an active response" → AI 말하는 중 재요청, 무시 (대화는 계속됨)
            if (/already has an active response|active response in progress/i.test(errMsg)) return
            setError(errMsg)
            if (msg.code === 'SESSION_END') wsRef.current?.close()
            return
          }
        } catch { /* ignore */ }
      }
      ws.onerror = () => { setError('Live 연결 오류') }
      ws.onclose = (event) => {
        const code = typeof (event as any)?.code === 'number' ? (event as any).code : null
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
        const reason = String((event as any)?.reason || '').trim()
        const closeMsg =
          lastSocketErrorRef.current ||
          (reason ? `연결 종료: ${reason}${code != null ? ` (code ${code})` : ''}` : `연결이 종료되었습니다.${code != null ? ` (code ${code})` : ''}`)
        setError(closeMsg)
        lastSocketErrorRef.current = ''

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
        } else if (!wasConnectedRef.current && initRetryCountRef.current < 1) {
          initRetryCountRef.current += 1
          setError('연결이 끊겼습니다. 2초 후 재연결 중...')
          autoReconnectTimeoutRef.current = setTimeout(() => {
            autoReconnectTimeoutRef.current = null
            wsRef.current = null
            connect()
          }, 2000)
        }
      }

      // mic — 핸들러만 등록, start()는 'ready' 수신 후 1.8초 뒤에 호출 (AI가 먼저 말하도록)
      if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
      const recorder = recorderRef.current
      const onData = (base64: string) => {
        if (extendPopupOpenRef.current) return
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64, mimeType: 'audio/pcm;rate=16000' }))
      }
      const onVolume = (vol: number) => {
        setInVolume(vol)
        const sens = micSensitivityRef.current
        const threshold = SPEECH_THRESHOLD_MAX - (sens / 100) * (SPEECH_THRESHOLD_MAX - SPEECH_THRESHOLD_MIN)
        const interruptThreshold = threshold * TTS_INTERRUPT_VOLUME_FACTOR
        // TTS 재생 중 사용자 발화(볼륨) 감지 → 즉시 멈춤. 기준을 높여 에코/잡음으로 끊김 방지
        if (vol > interruptThreshold && isAiSpeakingRef.current) {
          if (isHumeModel(model)) {
            humeCurrentAudioRef.current?.pause()
            humeCurrentAudioRef.current = null
            humeAudioQueueRef.current.length = 0
          }
          streamerRef.current?.stop()
          setOutVolume(0)
          isAiSpeakingRef.current = false
        }
        // AI 발화 직후 3초간은 스피커 에코·볼륨 decay로 오탐 방지 (3초 침묵 타이머 전체 구간 보호)
        if (Date.now() - lastAiSpeechEndAtRef.current < 3000) return
        if (vol > threshold) clearSilenceTimer()
      }
      recorder.off('data', onData as any).off('volume', onVolume as any).on('data', onData as any).on('volume', onVolume as any)

      setMessages([])
    } catch (e: any) {
      setError(e?.message || '연결 실패')
    }
  }, [contentData, contentData?.voice_provider, systemAndContext, model, voiceName, muted, silenceBreakSecs, startFailoverCheckInterval, startTimer, startBalanceDeductIntervalIfNeeded, clearSilenceTimer, sendSilenceBreak, sendDccTurn])

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
    setExtendPopupOpenedByButton(false)
    setShowExtendPopup(false)
    if (remainingSecondsRef.current <= 0) {
      disconnectInternal()
    }
  }, [])

  /** 상담시간 연장하기 버튼 클릭: 연장 팝업을 띄우고, 이때는 '상담 시간이 종료되었습니다' 메시지 박스 숨김 */
  const openExtendPopupByButton = useCallback(() => {
    setExtendPopupOpenedByButton(true)
    setShowExtendPopup(true)
  }, [])

  /* ── 1분 무료 연장 팝업 (무료시작 1회만, 팝업 중 타이머 계속) ── */
  const dismissFreeExtendPopup = useCallback(() => {
    setShowFreeExtendPopup(false)
    if (remainingSecondsRef.current <= 0) {
      disconnectInternal()
    }
  }, [])
  const handleFreeExtend1Min = useCallback(() => {
    const cid = contentIdRef.current
    if (typeof window !== 'undefined' && cid) {
      try {
        localStorage.setItem(`voice_free_extend_${cid}`, String(Date.now()))
      } catch { /* ignore */ }
    }
    const addSec = 60
    setRemainingSeconds((prev) => prev + addSec)
    setTotalSeconds((prev) => prev + addSec)
    if (!timerIntervalRef.current && connected) startTimer()
    setShowFreeExtendPopup(false)
  }, [connected, startTimer])

  /* ── 보이스 화면 내 추가 결제 (In-Page Payment) ── */
  const [selectedExtendOption, setSelectedExtendOption] = useState<{ minutes: number; seconds?: number; price: number; label: string; charge?: boolean } | null>(null)
  const [extendPaymentMethod, setExtendPaymentMethod] = useState<'card' | 'mobile'>('card')
  const [extendPaymentProcessing, setExtendPaymentProcessing] = useState(false)
  const paymentWindowRef = useRef<Window | null>(null)
  /** 무료 연장 24시간 1회 제한: 차단 시 팝업용 */
  const [showFreeExtendBlockedPopup, setShowFreeExtendBlockedPopup] = useState(false)
  const [freeExtendBlockedRemainingMs, setFreeExtendBlockedRemainingMs] = useState(0)

  /* ── 1000원 충전식 잔액: 어드민 /admin/form/voice 시간 상품섹션의 차감 주기(초)·차감 금액(원)만 사용 (하드코딩 없음) ── */
  const [balanceWan, setBalanceWan] = useState<number>(0)
  const useBalanceModeRef = useRef(false)
  const balanceDeductIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  /** 폼에서 잔여금액으로 상담 진입 시 true → 차감 주기마다 잔액 차감·UI 갱신 인터벌 자동 시작 */
  const enteredWithBalanceRef = useRef(false)
  const fetchBalance = useCallback(async () => {
    const cid = contentIdRef.current
    const phone = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
    if (!cid || !phone) return
    try {
      const res = await fetch(`/api/voice/balance?contentId=${encodeURIComponent(cid)}&phone=${encodeURIComponent(phone)}`, { cache: 'no-store' })
      const data = await res.json()
      if (data?.success && typeof data.balance_wan === 'number') setBalanceWan(data.balance_wan)
    } catch { /* ignore */ }
  }, [])
  useEffect(() => {
    if (!contentData?.id) return
    fetchBalance()
  }, [contentData?.id, fetchBalance])

  useEffect(() => {
    if (!showFreeExtendBlockedPopup || freeExtendBlockedRemainingMs <= 0) return
    const t = setInterval(() => {
      setFreeExtendBlockedRemainingMs((prev) => Math.max(0, prev - 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [showFreeExtendBlockedPopup, freeExtendBlockedRemainingMs])

  const handleExtendPayment = useCallback(async (option: { minutes: number; seconds?: number; price: number; label: string; charge?: boolean }, paymentMethodOverride?: 'card' | 'mobile') => {
    if (extendPaymentProcessing) return
    setExtendPaymentProcessing(true)
    extendPaymentInProgressRef.current = true
    try {
      // 0원 무료 추가: 24시간 내 1회만 가능 (이미 사용했으면 연장 팝업 자체를 안 띄우므로 여기 오는 경우는 드묾; 차단 시 별도 팝업 없이 그냥 return)
      if (!option.charge && option.price <= 0) {
        const cid = contentIdRef.current
        const FREE_EXTEND_COOLDOWN_MS = 24 * 60 * 60 * 1000
        if (typeof window !== 'undefined' && cid) {
          const lastAt = localStorage.getItem(`voice_free_extend_${cid}`)
          if (lastAt) {
            const elapsed = Date.now() - parseInt(lastAt, 10)
            if (elapsed < FREE_EXTEND_COOLDOWN_MS) {
              extendPaymentInProgressRef.current = false
              setExtendPaymentProcessing(false)
              return
            }
          }
        }
        try {
          if (typeof window !== 'undefined' && contentIdRef.current) {
            localStorage.setItem(`voice_free_extend_${contentIdRef.current}`, String(Date.now()))
          }
        } catch { /* ignore */ }
        const addSec = (option.minutes || 0) * 60 + (option.seconds ?? 0)
        setRemainingSeconds((prev) => prev + addSec)
        setTotalSeconds((prev) => prev + addSec)
        if (!timerIntervalRef.current) startTimer()
        disconnectedAtZeroRef.current = false
        try { connect() } catch { /* ignore */ }
        extendPopupShownRef.current = false
        setShowExtendPopup(false)
        setSelectedExtendOption(null)
        extendPaymentInProgressRef.current = false
        setExtendPaymentProcessing(false)
        return
      }

      const oid = generateOrderId()
      const cid = contentIdRef.current
      const paymentMethod = paymentMethodOverride ?? (sessionStorage.getItem('payment_method') || 'card')
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
          if (option.charge) {
            try {
              const chargeRes = await fetch('/api/voice/balance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'charge', oid: successOid, contentId: cid, phone: phoneNumber, amount_wan: option.price }),
              })
              const chargeData = await chargeRes.json()
              if (chargeData?.success && typeof chargeData.balance_wan === 'number') {
                setBalanceWan(chargeData.balance_wan)
              }
            } catch (e) {
            }
            // 충전 시 추가 시간: 어드민 시간상품 charge의 충전시간(minutes/seconds) 사용 (부가세 포함 결제액으로 계산하지 않음)
            const chargeOpt = contentData?.voice_time_options && Array.isArray(contentData.voice_time_options)
              ? (contentData.voice_time_options as any[]).find((o: any) => o?.type === 'charge')
              : null
            const addSec = chargeOpt != null
              ? (Number(chargeOpt.minutes) || 0) * 60 + (Number(chargeOpt.seconds) ?? 0)
              : 0
            if (addSec > 0) {
              setRemainingSeconds((prev) => prev + addSec)
              setTotalSeconds((prev) => prev + addSec)
              if (!timerIntervalRef.current) startTimer()
              disconnectedAtZeroRef.current = false
              try { connect() } catch { /* ignore */ }
            }
            extendPopupShownRef.current = false
            setShowExtendPopup(false)
            setSelectedExtendOption(null)
            extendPaymentInProgressRef.current = false
            setExtendPaymentProcessing(false)
            localStorage.removeItem('payment_success_oid')
            localStorage.removeItem('payment_success_timestamp')
            localStorage.removeItem('payment_success_signal')
            return
          }
          const addSec = (option.minutes || 0) * 60 + (option.seconds ?? 0)
          setRemainingSeconds((prev) => prev + addSec)
          setTotalSeconds((prev) => prev + addSec)
          if (!timerIntervalRef.current) startTimer()
          disconnectedAtZeroRef.current = false
          try { connect() } catch { /* ignore */ }
          extendPopupShownRef.current = false
          setShowExtendPopup(false)
          setSelectedExtendOption(null)
        }
        extendPaymentInProgressRef.current = false
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
        extendPaymentInProgressRef.current = false
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
                extendPaymentInProgressRef.current = false
                setExtendPaymentProcessing(false)
              }
            } else {
              extendPaymentInProgressRef.current = false
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
      alert(e?.message || '결제 처리 중 오류가 발생했습니다.')
      extendPaymentInProgressRef.current = false
      setExtendPaymentProcessing(false)
    }
  }, [contentData, connected, extendPaymentProcessing, startTimer, connect])

  /** 잔액으로 계속. 콘텐츠 설정(rate_seconds당 rate_won원)으로 차감, 1초만 넘겨도 1블록 전체 차감 */
  const handleUseBalanceContinue = useCallback(async () => {
    const cid = contentIdRef.current
    const phone = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
    if (!cid || !phone) return
    const chargeOpt = contentData?.voice_time_options && Array.isArray(contentData.voice_time_options)
      ? (contentData.voice_time_options as any[]).find((o: any) => o?.type === 'charge')
      : null
    const rateSeconds = chargeOpt != null && Number(chargeOpt.rate_seconds) > 0 ? Number(chargeOpt.rate_seconds) : 0
    const rateWon = chargeOpt != null && Number(chargeOpt.rate_won) > 0 ? Number(chargeOpt.rate_won) : 0
    if (!rateSeconds || !rateWon) return
    try {
      const res = await fetch('/api/voice/balance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deduct', contentId: cid, phone, secondsUsed: rateSeconds, rate_seconds: rateSeconds, rate_won: rateWon }),
      })
      const data = await res.json()
      if (res.status === 402 || !data?.success) {
        alert('잔액이 부족합니다.')
        return
      }
      setBalanceWan(data.balance_wan ?? 0)
      setRemainingSeconds((prev) => prev + rateSeconds)
      setTotalSeconds((prev) => prev + rateSeconds)
      if (!timerIntervalRef.current && connected) startTimer()
      useBalanceModeRef.current = true
      setShowExtendPopup(false)
      setSelectedExtendOption(null)

      if (balanceDeductIntervalRef.current) clearInterval(balanceDeductIntervalRef.current)
      balanceDeductIntervalRef.current = setInterval(async () => {
        if (!useBalanceModeRef.current) return
        const cid2 = contentIdRef.current
        const phone2 = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
        if (!cid2 || !phone2) return
        try {
          const r = await fetch('/api/voice/balance', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'deduct', contentId: cid2, phone: phone2, secondsUsed: rateSeconds, rate_seconds: rateSeconds, rate_won: rateWon }),
          })
          const d = await r.json()
          if (r.status === 402 || !d?.success) {
            useBalanceModeRef.current = false
            if (balanceDeductIntervalRef.current) {
              clearInterval(balanceDeductIntervalRef.current)
              balanceDeductIntervalRef.current = null
            }
            setRemainingSeconds(0)
            alert('잔액이 부족하여 상담 시간이 종료됩니다.')
            return
          }
          setBalanceWan(d.balance_wan ?? 0)
          setRemainingSeconds((prev) => prev + rateSeconds)
        } catch {
          useBalanceModeRef.current = false
          if (balanceDeductIntervalRef.current) {
            clearInterval(balanceDeductIntervalRef.current)
            balanceDeductIntervalRef.current = null
          }
        }
      }, rateSeconds * 1000)
    } catch (e: any) {
      alert(e?.message || '잔액 차감 중 오류가 발생했습니다.')
    }
  }, [contentData, connected, startTimer])

  useEffect(() => {
    return () => {
      if (balanceDeductIntervalRef.current) {
        clearInterval(balanceDeductIntervalRef.current)
        balanceDeductIntervalRef.current = null
      }
    }
  }, [])

  /* ── 상담 종료 시 대화 + 오디오 저장 ────── */
  const saveConversation = useCallback(async () => {
    if (conversationSavedRef.current) return
    if (savingConversation) return
    conversationSavedRef.current = true
    setSavingConversation(true)
    const msgs = messagesRef.current.filter((m) => m.role !== 'system' && m.text !== 'pong' && m.text !== 'ping')

    try {
      // 잔액 모드 이탈 시: 잔여시간이 1블록(rate_seconds) 초과면 잔액 유지, 이하일 때만 소진 (12초보다 큰 잔여에선 0원으로 만들면 안 됨)
      const rem = remainingSecondsRef.current
      const cidSave = contentIdRef.current ? parseInt(contentIdRef.current, 10) : null
      const phoneSave = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
      const optsSave = Array.isArray(contentData?.voice_time_options) ? contentData.voice_time_options : []
      if ((useBalanceModeRef.current || enteredWithBalanceRef.current) && cidSave != null && phoneSave && optsSave.length > 0) {
        const chargeOptSave = (optsSave as any[]).find((o: any) => o?.type === 'charge')
        const rateSecondsSave = chargeOptSave != null && Number(chargeOptSave.rate_seconds) > 0 ? Number(chargeOptSave.rate_seconds) : 0
        if (rateSecondsSave > 0 && rem <= rateSecondsSave) {
          try {
            await fetch('/api/voice/balance', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'drain_balance', contentId: cidSave, phone: phoneSave }),
            })
          } catch (e: any) {
          }
        }
      }

      let voiceAudioUrl: string | null = null
      /** 녹음 파일 실제 재생 길이(초). 없으면 세션 타이머로 대체 */
      let recordedDurationSeconds: number | null = null

      // 1) 양방향 오디오 녹음 (마이크+AI) 업로드 우선, 없으면 AI 전용 PCM fallback
      if (mixedChunksRef.current.length > 0) {
        // 양방향 믹스 녹음이 있는 경우 (WebM/Opus)
        try {
          const mixedBlob = new Blob(mixedChunksRef.current, { type: mixedChunksRef.current[0]?.type || 'audio/webm' })
          recordedDurationSeconds = await getBlobDurationSeconds(mixedBlob)
          const ext = mixedBlob.type.includes('webm') ? 'webm' : 'ogg'
          const formData = new FormData()
          formData.append('file', mixedBlob, `voice_${Date.now()}.${ext}`)
          const uploadRes = await fetch('/api/voice-upload', { method: 'POST', body: formData })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            voiceAudioUrl = uploadData.url || null
          } else {
          }
        } catch (e: any) {
        }
      }
      // fallback: 양방향 녹음 실패 시 AI 전용 PCM 청크 사용
      if (!voiceAudioUrl && audioChunksRef.current.length > 0) {
        try {
          const wavBlob = pcm16Base64ToWavBlob(audioChunksRef.current)
          if (recordedDurationSeconds == null) recordedDurationSeconds = await getBlobDurationSeconds(wavBlob)
          const formData = new FormData()
          formData.append('file', wavBlob, `voice_${Date.now()}.wav`)
          const uploadRes = await fetch('/api/voice-upload', { method: 'POST', body: formData })
          if (uploadRes.ok) {
            const uploadData = await uploadRes.json()
            voiceAudioUrl = uploadData.url || null
          } else {
          }
        } catch (e: any) {
        }
      }

      // 2) 상담 시간(초): 녹음 실제 길이 우선, 없으면 세션 타이머 (이용내역 표시와 플레이바 일치)
      const durationSeconds = recordedDurationSeconds ?? (totalSeconds - remainingSeconds)

      // 3) saved_results에 voice 타입으로 저장
      const userName = sessionStorage.getItem('payment_user_name') || ''
      const contentTitle = contentData?.content_name || '음성 상담'

      // voice 전용 필드로 저장 (phone: 요약 연동용, injected_summary_item_refs: 안부로 물어본 항목 기록)
      const phoneForSave = sessionStorage.getItem('payment_phone') || ''
      let savedId: string | null = null
      const voicePayAmount = typeof window !== 'undefined'
        ? parseInt(sessionStorage.getItem('voice_pay_amount') ?? '0', 10)
        : 0
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
        voice_pay_amount: Number.isFinite(voicePayAmount) ? voicePayAmount : 0,
      }

      let saveRes = await fetch('/api/saved-results/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(voicePayload),
      })

      if (!saveRes.ok) {
        // voice 컬럼이 아직 없을 수 있음 → 기본 필드 + result_type으로 재시도 (phone, voice_messages 포함해 요약 저장 가능하도록)
        const errDetail = await saveRes.text().catch(() => '')
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
          voice_pay_amount: Number.isFinite(voicePayAmount) ? voicePayAmount : 0,
        }
        saveRes = await fetch('/api/saved-results/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPayload),
        })
        if (!saveRes.ok) {
          const errText = await saveRes.text().catch(() => '')
          return
        }
      }

      const saveData = await saveRes.json()
      savedId = saveData?.data?.id || null
      if (saveData?.data?.summaryStored === false && voicePayload.voice_messages?.length) {
      }

      // 4) user_credentials에 voice_saved_id로 연결 (나의 이용내역에서 조회 가능하도록, saved_results_voice 전용)
      if (savedId) {
        const phone = sessionStorage.getItem('payment_phone') || ''
        const password = sessionStorage.getItem('payment_password') || ''
        const requestKey = sessionStorage.getItem('result_request_key') || sessionStorage.getItem('payment_request_key') || ''
        if (phone && password) {
          try {
            const credRes = await fetch('/api/user-credentials/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                voiceSavedId: parseInt(savedId, 10),
                phone,
                password,
                requestKey: requestKey || undefined,
              }),
            })
            if (credRes.ok) {
            } else {
              const credErr = await credRes.text().catch(() => '')
            }
          } catch (e: any) {
          }
        } else {
        }
      }
      if (!leaveAfterSaveRef.current) setShowConsultationEndModal(true)
    } catch (e: any) {
    } finally {
      setSavingConversation(false)
    }
  }, [contentData, totalSeconds, remainingSeconds, savingConversation])

  // ref 업데이트 (disconnectInternal에서 사용)
  saveConversationRef.current = saveConversation

  /* ── 시간 종료 후 폼 이동 (점사형 전용 — 음성형은 미사용) ── */
  const goBackToForm = useCallback(() => {
    stopAllTTSRef.current()
    router.push('/form')
  }, [router])

  /* ── 상담 끝남 팝업 확인 → 폼으로 이동 (폼에서 뒤로가기 시 /home으로) ── */
  const handleConsultationEndConfirm = useCallback(() => {
    setShowConsultationEndModal(false)
    stopAllTTSRef.current()
    try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
    router.push('/form')
  }, [router])

  /* ── 나가기 전 저장 확인: 이전/홈 시 모달 표시 (브라우저/모바일 뒤로가기와 동일) */
  const requestLeave = useCallback(() => {
    if (conversationSavedRef.current) {
      stopAllTTSRef.current()
      setIsNavigatingAway(true)
      try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
      router.push('/form')
      return
    }
    if (sessionStartedRef.current) {
      setShowLeaveConfirmModal(true)
      return
    }
    stopAllTTSRef.current()
    setIsNavigatingAway(true)
    try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
    router.push('/form')
  }, [router])

  const handleLeaveWithSave = useCallback(() => {
    setShowLeaveConfirmModal(false)
    setIsNavigatingAway(true)
    stopAllTTSRef.current()
    leaveAfterSaveRef.current = true
    disconnect()
  }, [disconnect])

  const handleLeaveWithoutSave = useCallback(async () => {
    setShowLeaveConfirmModal(false)
    setIsNavigatingAway(true)
    stopAllTTSRef.current()
    disconnectInternalRef.current?.(true)
    const cid = contentIdRef.current ? parseInt(contentIdRef.current, 10) : null
    const phone = typeof window !== 'undefined' ? sessionStorage.getItem('payment_phone') : null
    if ((useBalanceModeRef.current || enteredWithBalanceRef.current) && cid != null && phone) {
      try {
        await fetch('/api/voice/balance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'drain_balance', contentId: cid, phone }),
        })
      } catch {
        /* 소진 실패해도 나가기 진행 */
      }
    }
    try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
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
    stopAllTTSRef.current()
    await disconnect()
    try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
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
    extendPopupOpenedByButton,
    openExtendPopupByButton,
    showFreeExtendPopup,
    dismissFreeExtendPopup,
    handleFreeExtend1Min,
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
    extendPaymentMethod,
    setExtendPaymentMethod,
    extendPaymentProcessing,
    handleExtendPayment,
    // 1000원 충전식 잔액
    balanceWan,
    fetchBalance,
    handleUseBalanceContinue,
    // 무료 연장 24h 1회 제한 차단 팝업
    showFreeExtendBlockedPopup,
    setShowFreeExtendBlockedPopup,
    freeExtendBlockedRemainingMs,
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
    // Deepgram+Claude+Cartesia 턴 기반
    isDccProvider,
    dccRecording,
    startDccRecording,
    endDccTurn,
    // 점사 진행 중 나가기 방지 팝업
    showInProgressBlockModal,
    handleInProgressBlockClose: () => setShowInProgressBlockModal(false),
    // 상담 끝남 팝업 (확인 시 폼으로)
    showConsultationEndModal,
    handleConsultationEndConfirm,
    // 뿌잉 예의 위반 2회 시 상담 종료 경고
    mannerWarningMessage,
    dismissMannerWarning: () => {
      setMannerWarningMessage(null)
      stopAllTTSRef.current()
      try { sessionStorage.setItem('voice_came_to_form', '1') } catch { /* ignore */ }
      router.push('/form')
    },
  }
}
