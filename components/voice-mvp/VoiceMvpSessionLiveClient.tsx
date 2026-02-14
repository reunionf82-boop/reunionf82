'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getKoreaContextVars, sanitizeForTts } from '@/lib/voice-mvp/ppoing-rules'
import { buildResultStyleManseBlock } from '@/lib/manse-ryeok-display'
import { AudioRecorder } from '@/lib/voice-mvp/genai-live/audio-recorder'
import { AudioStreamer } from '@/lib/voice-mvp/genai-live/audio-streamer'
import { audioContext, base64ToArrayBuffer } from '@/lib/voice-mvp/genai-live/utils'
import VolMeterWorket from '@/lib/voice-mvp/genai-live/worklets/vol-meter'
import { Modality } from '@google/genai/web'

type Msg = { role: 'user' | 'assistant' | 'system'; text: string }

const CALENDAR_LABEL: Record<string, string> = {
  solar: '양력',
  lunar: '음력',
  'lunar-leap': '음력(윤)',
}

/** iPhone 12 이후 / iOS 16·17 등 Safari: 음성 재생·지글거림 방지용 */
function isIOSDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1)
  )
}

function styleInstruction(style: string) {
  switch (style) {
    case 'bright':
      return '말투: 밝고 경쾌하게. 문장은 짧게, 긍정적인 표현을 사용하되 과장하지 마세요.'
    case 'firm':
      return '말투: 단호하고 명확하게. 핵심을 먼저 말하고, 불필요한 수식어를 줄이세요.'
    case 'empathetic':
      return '말투: 공감적으로. 먼저 감정을 인정하고(“그럴 수 있어요”), 그 다음 현실적인 조언을 제시하세요.'
    case 'warm':
      return '말투: 다정하고 따뜻하게. 부드러운 표현과 배려하는 어조로 이야기하세요.'
    case 'calm':
    default:
      return '말투: 차분하고 안정감 있게. 속도는 너무 빠르지 않게, 정리된 흐름으로 말하세요.'
  }
}

function pickVoiceName(snapshot: any) {
  const gender = String(snapshot?.voice_gender || 'female').trim()
  const female = String(snapshot?.voice_name_female || 'Aoede').trim() || 'Aoede'
  const male = String(snapshot?.voice_name_male || 'Fenrir').trim() || 'Fenrir'
  return gender === 'male' ? male : female
}

// Mode key mapping for DB columns
const MODE_KEY_MAP: Record<string, string> = {
  saju: 'saju',
  shinjeom: 'shinjeom',
  fortune: 'fortune',
  gunghap: 'gunghap',
  reunion: 'reunion',
}

// Default speaking rates per mode
const DEFAULT_SPEAKING_RATES: Record<string, number> = {
  saju: 0.85,
  shinjeom: 1.15,
  fortune: 1.15,
  gunghap: 1.15,
  reunion: 0.9,
}

// Default voice names per mode
const DEFAULT_VOICE_NAMES: Record<string, string> = {
  saju: 'Charon',
  shinjeom: 'Aoede',
  fortune: 'Aoede',
  gunghap: 'Aoede',
  reunion: 'Aoede',
}

/** 리절트 페이지와 동일한 만세력 스타일 (음성 MVP 내부만 적용) */
const MANSE_RESULT_STYLES = `
.voice-mvp-manse-wrapper .manse-ryeok-container { overflow-x: auto !important; }
.voice-mvp-manse-wrapper .manse-header-line {
  display: flex !important; flex-direction: column !important; gap: 6px !important;
  align-items: center !important; justify-content: center !important; text-align: center !important;
  padding: 10px 12px !important; margin: 0 0 10px 0 !important; border-radius: 14px !important;
  border: 1px solid rgba(245, 158, 11, 0.25) !important;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 251, 235, 0.9) 100%) !important;
  max-width: 100% !important;
}
.voice-mvp-manse-wrapper .manse-header-name {
  font-size: 1.35rem !important; font-weight: 800 !important; color: #111827 !important; line-height: 1.2 !important;
}
.voice-mvp-manse-wrapper .manse-header-badges {
  display: flex !important; flex-wrap: wrap !important; gap: 6px !important;
  justify-content: center !important; align-items: center !important; max-width: 100% !important;
}
.voice-mvp-manse-wrapper .manse-header-badge {
  display: inline-flex !important; align-items: center !important; gap: 6px !important;
  padding: 6px 10px !important; border-radius: 9999px !important;
  border: 1px solid rgba(209, 213, 219, 0.8) !important; background: rgba(255, 255, 255, 0.75) !important;
  color: #374151 !important; font-size: 0.85rem !important; line-height: 1 !important;
  max-width: 100% !important; white-space: nowrap !important;
}
.voice-mvp-manse-wrapper .manse-header-badge strong { color: #111827 !important; font-weight: 800 !important; }
.voice-mvp-manse-wrapper .manse-ryeok-container {
  padding: 8px !important;
  background: linear-gradient(135deg, rgba(212, 168, 83, 0.05) 0%, rgba(139, 90, 43, 0.03) 100%) !important;
  border-radius: 20px !important; width: 100% !important; max-width: 100% !important;
  overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; box-sizing: border-box !important;
}
.voice-mvp-manse-wrapper .manse-ryeok-table,
.voice-mvp-manse-wrapper .manse-ryeok-container .manse-ryeok-table,
.voice-mvp-manse-wrapper .manse-ryeok-container table {
  width: 100% !important; border-collapse: separate !important; border-spacing: 0 !important;
  background: linear-gradient(135deg, #fefbf3 0%, #faf6eb 50%, #f5efe0 100%) !important;
  border-radius: 16px !important; overflow: hidden !important;
  box-shadow: 0 4px 20px rgba(139, 90, 43, 0.12), 0 2px 8px rgba(139, 90, 43, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
  border: 2px solid transparent !important; background-clip: padding-box !important;
  position: relative !important; margin: 1.5rem 0 !important;
}
.voice-mvp-manse-wrapper .manse-ryeok-table::before,
.voice-mvp-manse-wrapper .manse-ryeok-container .manse-ryeok-table::before {
  content: '' !important; position: absolute !important; inset: -2px !important;
  background: linear-gradient(135deg, #d4a853 0%, #c9956c 25%, #8b5a2b 50%, #c9956c 75%, #d4a853 100%) !important;
  border-radius: 18px !important; z-index: -1 !important;
}
.voice-mvp-manse-wrapper .manse-ryeok-table th,
.voice-mvp-manse-wrapper .manse-ryeok-container .manse-ryeok-table th {
  background: linear-gradient(180deg, #8b5a2b 0%, #6d4422 100%) !important; color: #fef8e8 !important;
  font-weight: 700 !important; padding: 12px 8px !important; text-align: center !important;
  font-size: 0.8rem !important; letter-spacing: 0.05em !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important; border-bottom: 2px solid #d4a853 !important; white-space: nowrap !important;
}
.voice-mvp-manse-wrapper .manse-ryeok-table td,
.voice-mvp-manse-wrapper .manse-ryeok-container .manse-ryeok-table td {
  padding: 12px 8px !important; text-align: center !important; font-size: 0.9rem !important;
  font-weight: 600 !important; color: #4a3520 !important;
  border-bottom: 1px solid rgba(139, 90, 43, 0.15) !important; background: transparent !important;
  position: relative !important; white-space: nowrap !important; vertical-align: middle !important;
}
.voice-mvp-manse-wrapper .manse-ryeok-table td:not(:last-child),
.voice-mvp-manse-wrapper .manse-ryeok-container .manse-ryeok-table td:not(:last-child) {
  border-right: 1px solid rgba(139, 90, 43, 0.12) !important;
}
.voice-mvp-manse-wrapper .manse-two-line { display: inline-block !important; white-space: normal !important; line-height: 1.15 !important; }
.voice-mvp-manse-wrapper .manse-two-line-kor { display: block !important; font-weight: 700 !important; line-height: 1.15 !important; }
.voice-mvp-manse-wrapper .manse-two-line-hanja { display: block !important; font-weight: 600 !important; opacity: 0.9 !important; line-height: 1.15 !important; margin-top: 2px !important; }
.voice-mvp-manse-wrapper .manse-element-wood { color: #1e40af !important; text-shadow: 0 1px 2px rgba(30, 64, 175, 0.2) !important; }
.voice-mvp-manse-wrapper .manse-element-fire { color: #991b1b !important; text-shadow: 0 1px 2px rgba(153, 27, 27, 0.2) !important; }
.voice-mvp-manse-wrapper .manse-element-earth { color: #d97706 !important; text-shadow: 0 1px 2px rgba(217, 119, 6, 0.2) !important; }
.voice-mvp-manse-wrapper .manse-element-metal { color: #6b7280 !important; text-shadow: 0 1px 2px rgba(107, 114, 128, 0.2) !important; }
.voice-mvp-manse-wrapper .manse-element-water { color: #1f2937 !important; text-shadow: 0 1px 2px rgba(31, 41, 55, 0.3) !important; }
.voice-mvp-manse-wrapper .manse-ganzi-char { font-size: 1.2em !important; font-weight: 700 !important; }
`

const LIVE_MODEL_FALLBACK = 'gemini-2.5-flash-native-audio-preview-12-2025'

const AUTO_RECONNECT_MAX = 3
const AUTO_RECONNECT_DELAYS = [2000, 4000, 6000]

// Cloudways에서 asia-northeast3 시 1008 발생 → us-central1 사용. 9분 로테이션은 동작 리전만 사용(실서버는 us-central1→us-central1)
const PRIMARY_REGION = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_VERTEX_LIVE_PRIMARY_REGION) || 'us-central1'
const FAILOVER_REGIONS = PRIMARY_REGION === 'us-central1' ? ['us-central1'] : ['us-central1']
const REGIONS = [PRIMARY_REGION, ...FAILOVER_REGIONS]
const SESSION_FAILOVER_AFTER_MS = 9 * 60 * 1000
const FAILOVER_CHECK_INTERVAL_MS = 60 * 1000

function getNextRegion(current: string): string {
  const i = REGIONS.indexOf(current)
  if (i < 0) return PRIMARY_REGION
  return REGIONS[(i + 1) % REGIONS.length]
}

function normalizeLiveModel(base: string) {
  const trimmed = String(base || '').trim()
  if (!trimmed) return LIVE_MODEL_FALLBACK
  // Gemini Developer API Live는 models/ 접두어 없이 모델명을 사용
  const model = trimmed.replace(/^models\//, '')
  if (model.includes('-exp')) return LIVE_MODEL_FALLBACK
  if (model.includes('native-audio')) return model
  return LIVE_MODEL_FALLBACK
}

function getModeVoicePreset(snapshot: any, mode: string) {
  const modeKey = MODE_KEY_MAP[mode] || mode
  
  // Get mode-specific values from snapshot (DB config)
  const genderKey = `voice_gender_${modeKey}`
  const styleKey = `voice_style_${modeKey}`
  const voiceNameKey = `voice_name_${modeKey}`
  const speakingRateKey = `speaking_rate_${modeKey}`
  
  const gender = String(snapshot?.[genderKey] || snapshot?.voice_gender || 'female').trim()
  const style = String(snapshot?.[styleKey] || snapshot?.voice_style || 'calm').trim()
  const voiceName = String(snapshot?.[voiceNameKey] || DEFAULT_VOICE_NAMES[modeKey] || 'Aoede').trim()
  const speakingRate = typeof snapshot?.[speakingRateKey] === 'number' 
    ? snapshot[speakingRateKey] 
    : DEFAULT_SPEAKING_RATES[modeKey] || 1.0
  
  return {
    gender: gender === 'male' ? 'male' : 'female',
    style: style || 'calm',
    voiceName: voiceName || 'Aoede',
    speakingRate: Math.max(0.5, Math.min(2.0, speakingRate)), // Clamp between 0.5 and 2.0
  }
}

function profileLine(p: any, label: string) {
  if (!p || typeof p !== 'object') return `${label}: (없음)`
  const name = String(p.name || '').trim() || '(이름 없음)'
  const genderRaw = String(p.gender || '').trim()
  const gender = genderRaw === 'male' ? '남성' : genderRaw === 'female' ? '여성' : genderRaw ? genderRaw : '(성별 없음)'
  return `${label}: ${name} / ${gender}`
}

function birthSummary(p: any) {
  if (!p || typeof p !== 'object') return '(없음)'
  const year = p.year ?? ''
  const month = p.month ?? ''
  const day = p.day ?? ''
  const cal = p.calendarType || ''
  const hour = p.birthHour || ''
  const calLabel = CALENDAR_LABEL[cal] || cal || '양력'
  const datePart = year && month && day ? `${year}년 ${month}월 ${day}일` : '(생년월일 없음)'
  const hourPart = hour ? ` / 시각 ${hour}` : ''
  return `${datePart} (${calLabel})${hourPart}`
}

function styleLabel(style: string) {
  switch (style) {
    case 'bright':
      return '밝게'
    case 'firm':
      return '단호하게'
    case 'empathetic':
      return '공감적으로'
    case 'warm':
      return '다정하게'
    case 'calm':
    default:
      return '차분하게'
  }
}

function toneLabel(voiceName: string) {
  switch (voiceName) {
    case 'Aoede':
      return '차분한 여성 톤'
    case 'Kore':
      return '맑은 여성 톤'
    case 'Fenrir':
      return '차분한 남성 톤'
    case 'Charon':
      return '중저음 남성 톤'
    case 'Puck':
      return '밝은 중성 톤'
    default:
      return voiceName
  }
}

function levelPct(v: number) {
  const x = Number.isFinite(v) ? Math.max(0, v) : 0
  // log-ish scaling to make low levels visible
  const scaled = Math.log10(1 + x * 50) / Math.log10(51)
  return Math.max(0, Math.min(100, Math.round(scaled * 100)))
}

function LevelBar({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent: 'pink' | 'blue'
}) {
  const pct = levelPct(value)
  const bar =
    accent === 'pink'
      ? 'from-pink-500 via-fuchsia-500 to-purple-500'
      : 'from-sky-500 via-cyan-500 to-emerald-500'
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="font-semibold text-gray-800">{label}</div>
        <div className="font-mono text-gray-500">{Number.isFinite(value) ? value.toFixed(3) : '0.000'}</div>
      </div>
      <div className="relative h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${bar}`} style={{ width: `${pct}%` }} />
        <div className="absolute inset-0 ring-1 ring-inset ring-gray-200 rounded-full" />
      </div>
    </div>
  )
}

export default function VoiceMvpSessionLiveClient({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [session, setSession] = useState<any>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [connected, setConnected] = useState(false)
  const [muted, setMuted] = useState(false)
  const [inVolume, setInVolume] = useState(0)
  const [outVolume, setOutVolume] = useState(0)
  const [error, setError] = useState('')
  const [showManse, setShowManse] = useState(true)
  const [showContext, setShowContext] = useState(false)
  const [wsStatus, setWsStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
  const [wsCloseCode, setWsCloseCode] = useState<number | null>(null)
  const [wsCloseReason, setWsCloseReason] = useState<string>('')
  const [wsLastError, setWsLastError] = useState<string>('')
  const [wsLastServerError, setWsLastServerError] = useState<string>('')
  const [wsInitSent, setWsInitSent] = useState(false)
  const [wsOpenAt, setWsOpenAt] = useState<string>('')
  const [wsLastServerMsg, setWsLastServerMsg] = useState<string>('')
  const [wsLastServerAt, setWsLastServerAt] = useState<string>('')
  const [wsConnectionUrl, setWsConnectionUrl] = useState<string>('')
  const wsRef = useRef<WebSocket | null>(null)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const streamerRef = useRef<AudioStreamer | null>(null)
  
  // 효과음 오디오 객체들
  const t1SoundRef = useRef<HTMLAudioElement | null>(null)
  const t2SoundRef = useRef<HTMLAudioElement | null>(null)
  const t3SoundRef = useRef<HTMLAudioElement | null>(null)
  const t4SoundRef = useRef<HTMLAudioElement | null>(null)
  const jongSoundRef = useRef<HTMLAudioElement | null>(null)
  const isAiSpeakingRef = useRef<boolean>(false) // AI가 현재 말하고 있는지 추적
  const isFirstConnectionRef = useRef<boolean>(true) // 최초 연결 여부 추적
  const audioTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 오디오 스트림 종료 감지용 타임아웃
  const manualDisconnectRef = useRef(false)
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null) // keepalive: Nginx/프록시 유휴 타임아웃 방지
  const lastResumptionHandleRef = useRef<string>('') // 세션 재개용 (서버가 보낸 마지막 newHandle)
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
  /** iOS 17 등: 첫 오디오 수신 시 suspend→resume 워크어라운드 1회만 수행 */
  const iosContextWorkaroundDoneRef = useRef(false)

  messagesRef.current = messages

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const sendSilenceBreakRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const clearSilenceTimerRef = useRef<() => void>(() => {})

  const sendSilenceBreak = useCallback(async () => {
    clearSilenceTimer()
    try {
      const res = await fetch(`/api/voice-mvp/sessions/${sessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          text: '__SILENCE_BREAK__',
          trigger: 'silence',
          silence_seconds: 5,
        }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.success) return
      const text = String(data.text || '').trim()
      if (!text) return
      setMessages((prev) => [...prev, { role: 'assistant', text }])
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(sanitizeForTts(text) || text)
        u.lang = 'ko-KR'
        u.rate = 1.05
        window.speechSynthesis.speak(u)
      }
    } catch {
      // ignore
    }
  }, [sessionId, clearSilenceTimer])

  sendSilenceBreakRef.current = sendSilenceBreak
  clearSilenceTimerRef.current = clearSilenceTimer

  const snapshot = session?.routing_config_snapshot
  /** 리절트 페이지와 동일한 만세력 블록(헤더+컨테이너+오행 스타일 테이블) */
  const manseSelfBlockHtml = useMemo(() => {
    const table = session?.manse_self?.manse_table
    return table ? buildResultStyleManseBlock(String(table)) : ''
  }, [session?.manse_self?.manse_table])
  const mansePartnerBlockHtml = useMemo(() => {
    const table = session?.manse_partner?.manse_table
    return table ? buildResultStyleManseBlock(String(table)) : ''
  }, [session?.manse_partner?.manse_table])
  const voiceStyle = useMemo(() => String(snapshot?.voice_style || 'calm').trim() || 'calm', [snapshot])
  const voiceGender = useMemo(() => (String(snapshot?.voice_gender || 'female').trim() === 'male' ? 'male' : 'female'), [snapshot])
  const selectedVoiceName = useMemo(() => pickVoiceName(snapshot), [snapshot])

  const model = useMemo(() => {
    const base = String(
      session?.routing_config_snapshot?.base_model ||
        session?.routing_config_snapshot?.routing?.base_model ||
        'gemini-2.0-flash-001'
    ).trim()
    return normalizeLiveModel(base)
  }, [session])

  const liveContext = useMemo(() => {
    const mode = String(session?.mode || '')
    const persona =
      (session?.routing_config_snapshot?.personas &&
        typeof session.routing_config_snapshot.personas?.[mode] === 'string' &&
        String(session.routing_config_snapshot.personas?.[mode] || '').trim()) ||
      ''
    const preset = getModeVoicePreset(session?.routing_config_snapshot, mode)
    const voiceName = preset.voiceName
    const selfLine = profileLine(session?.profile_self, '본인')
    const partnerLine = profileLine(session?.profile_partner, '상대')
    const selfBirth = birthSummary(session?.profile_self)
    const partnerBirth = birthSummary(session?.profile_partner)
    const manseSelfText = String(session?.manse_self?.manse_text || '').slice(0, 4000)
    const mansePartnerText = String(session?.manse_partner?.manse_text || '').slice(0, 3000)
    const situation = String(session?.situation || '').slice(0, 1500)
    const systemText = `당신은 한국어로 대답하는 실시간 음성 상담사입니다.
${persona ? `\n[페르소나]\n${persona}\n` : ''}
- ${styleInstruction(preset.style)}
- 상담 종류: ${mode}
- 목표: 공감 + 구체적 조언 + 마지막에 질문 1개
- 길이: 6~12문장
`
    const kst = getKoreaContextVars()
    const kstLine = `${kst.dateStr} ${kst.weekdayKo}요일 ${kst.timeStr}`
    const contextText = `### 현재 시각(한국 표준시 KST)\n${kstLine}\n(유저가 시간/날짜 물어보면 이 시각 기준으로 답하세요. 요일: ${kst.weekdayKo}요일, 시간대: ${kst.timeSlotHint})\n\n### 기본 정보\n${selfLine}\n생년월일: ${selfBirth}\n\n### 만세력(본인)\n${manseSelfText || '(만세력 텍스트 없음)'}\n\n### 만세력(상대)\n${
      mode === 'gunghap' ? `${partnerLine}\n생년월일: ${partnerBirth}\n${mansePartnerText || '(만세력 텍스트 없음)'}` : '(해당 없음)'
    }\n\n### 상황\n${mode === 'reunion' ? situation || '(없음)' : '(해당 없음)'}\n`
    return {
      mode,
      persona,
      preset,
      voiceName,
      selfLine,
      partnerLine,
      selfBirth,
      partnerBirth,
      manseSelfText,
      mansePartnerText,
      situation,
      systemText,
      contextText,
    }
  }, [session])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/auth/check', { cache: 'no-store' })
        const data = await res.json()
        if (data?.authenticated) {
          setAuthenticated(true)
        } else {
          setAuthenticated(false)
          router.push('/admin/login')
        }
      } catch {
        setAuthenticated(false)
        router.push('/admin/login')
      }
    })()
  }, [router])

  useEffect(() => {
    if (!authenticated) return
    ;(async () => {
      const res = await fetch(`/api/voice-mvp/sessions/${sessionId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.success) {
        setError(data?.error || `HTTP ${res.status}`)
        return
      }
      setSession(data.session)
    })()
  }, [authenticated, sessionId])

  // 효과음 초기화
  useEffect(() => {
    t1SoundRef.current = new Audio('/t1.mp3')
    t1SoundRef.current.volume = 0.5
    t1SoundRef.current.preload = 'auto'
    
    t2SoundRef.current = new Audio('/t2.mp3')
    t2SoundRef.current.volume = 0.5
    t2SoundRef.current.preload = 'auto'
    
    t3SoundRef.current = new Audio('/t3.mp3')
    t3SoundRef.current.volume = 0.5
    t3SoundRef.current.preload = 'auto'
    
    t4SoundRef.current = new Audio('/t4.mp3')
    t4SoundRef.current.volume = 0.5
    t4SoundRef.current.preload = 'auto'
    
    jongSoundRef.current = new Audio('/jong.mp3')
    jongSoundRef.current.volume = 0.5
    jongSoundRef.current.preload = 'auto'
    
    return () => {
      t1SoundRef.current = null
      t2SoundRef.current = null
      t3SoundRef.current = null
      t4SoundRef.current = null
      jongSoundRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      if (autoReconnectTimeoutRef.current) {
        clearTimeout(autoReconnectTimeoutRef.current)
        autoReconnectTimeoutRef.current = null
      }
      if (failoverCheckIntervalRef.current) {
        clearInterval(failoverCheckIntervalRef.current)
        failoverCheckIntervalRef.current = null
      }
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current)
        pingIntervalRef.current = null
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      pendingWsRef.current?.close()
      pendingWsRef.current = null
      wsRef.current?.close()
      recorderRef.current?.stop()
      streamerRef.current?.stop()
      if (audioTimeoutRef.current) {
        clearTimeout(audioTimeoutRef.current)
        audioTimeoutRef.current = null
      }
    }
  }, [])

  const connectPendingFailoverRef = useRef<() => void>(() => {})

  const startFailoverCheckInterval = useCallback(() => {
    if (failoverCheckIntervalRef.current) {
      clearInterval(failoverCheckIntervalRef.current)
      failoverCheckIntervalRef.current = null
    }
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
      setError('다른 리전과 연결 중... (상담은 계속됩니다)')
      connectPendingFailoverRef.current()
    }, FAILOVER_CHECK_INTERVAL_MS)
  }, [])

  const connectPendingFailover = useCallback(() => {
    const region = failoverRegionRef.current
    const priorContext = conversationContextForReconnectRef.current
    if (!region) return
    const envProxy = String(process.env.NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL || '').trim()
    const resolveWsUrl = () => {
      if (envProxy) {
        if (envProxy.startsWith('ws://') || envProxy.startsWith('wss://')) return envProxy
        if (envProxy.startsWith('http://') || envProxy.startsWith('https://')) return envProxy.replace(/^http/, 'ws')
        return `${window.location.origin}${envProxy.startsWith('/') ? '' : '/'}${envProxy}`.replace(/^http/, 'ws')
      }
      return `${window.location.origin.replace(/^http/, 'ws')}/api/voice-mvp/live-proxy`
    }
    const wsUrl = resolveWsUrl()
    const pendingWs = new WebSocket(wsUrl)
    pendingWsRef.current = pendingWs

    let systemText = liveContext.systemText
    if (priorContext) systemText = `${systemText}\n\n[이전 상담 맥락 (이어서 상담해 주세요)]\n${priorContext}`
    const config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: liveContext.preset.voiceName } } },
      systemInstruction: { parts: [{ text: `${systemText}\n\n${liveContext.contextText}` }] },
    }

    pendingWs.onopen = () => {
      pendingWs.send(JSON.stringify({ type: 'ping' }))
      setTimeout(() => {
        try {
          pendingWs.send(JSON.stringify({ type: 'init', model, config, region }))
        } catch {
          pendingWsRef.current = null
          plannedFailoverRef.current = false
          setError('리전 전환 준비 실패.')
        }
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
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current)
            pingIntervalRef.current = null
          }
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
          setMessages((prev) => [...prev, { role: 'system', text: '리전 전환 완료. 상담이 이어집니다.' }])
          return
        }
        if (msg.type === 'audio' && msg.data) {
          const buf = base64ToArrayBuffer(msg.data)
          streamerRef.current?.addPCM16(new Uint8Array(buf))
          return
        }
        if (msg.type === 'text' && msg.text) {
          setMessages((prev) => [...prev, { role: 'assistant', text: String(msg.text).trim() }])
          return
        }
        if (msg.type === 'interrupted') {
          streamerRef.current?.stop()
          isAiSpeakingRef.current = false
        }
      } catch {
        // ignore
      }
    }

    pendingWs.onerror = () => {
      pendingWsRef.current = null
      plannedFailoverRef.current = false
      setError('리전 전환 실패. 현재 연결 유지 중.')
    }
    pendingWs.onclose = () => {
      if (pendingWsRef.current === pendingWs) {
        pendingWsRef.current = null
        plannedFailoverRef.current = false
        setError('리전 전환 실패. 현재 연결 유지 중.')
      }
    }
  }, [liveContext, model, startFailoverCheckInterval])

  connectPendingFailoverRef.current = connectPendingFailover

  const connect = async () => {
    setError('')
    setWsLastError('')
    setWsLastServerError('')
    setWsLastServerMsg('')
    setWsLastServerAt('')
    setWsCloseCode(null)
    setWsCloseReason('')
    setWsInitSent(false)
    setWsOpenAt('')
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        return
      }

      if (isIOSDevice() && typeof window !== 'undefined') {
        const unlock = new Audio()
        unlock.src =
          'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
        void unlock.play().catch(() => {})
      }

      // audio output (iOS: mergeChunkSamples로 지글거림 완화, 24kHz context로 리샘플링 노이즈 완화)
      if (!streamerRef.current) {
        const outCtx = await audioContext({ id: 'voice-mvp-out', sampleRate: 24000 })
        const streamer = new AudioStreamer(
          outCtx,
          isIOSDevice() ? { mergeChunkSamples: 48000 } : undefined
        )
        await streamer.addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
          setOutVolume(ev.data.volume)
        })
        streamerRef.current = streamer
      }
      await streamerRef.current.resume()

      const mode = liveContext.mode
      const preset = liveContext.preset
      const voiceName = liveContext.voiceName
      let systemText = liveContext.systemText
      const contextText = liveContext.contextText
      const priorContext = conversationContextForReconnectRef.current
      if (priorContext) {
        systemText = `${systemText}\n\n[이전 상담 맥락 (이어서 상담해 주세요)]\n${priorContext}`
        conversationContextForReconnectRef.current = null
      }

      const config: any = {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName } },
        },
        systemInstruction: {
          parts: [{ text: `${systemText}\n\n${contextText}` }],
        },
      }

      const envProxy = String(process.env.NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL || '').trim()
      const resolveWsUrl = () => {
        if (envProxy) {
          if (envProxy.startsWith('ws://') || envProxy.startsWith('wss://')) return envProxy
          if (envProxy.startsWith('http://') || envProxy.startsWith('https://')) {
            return envProxy.replace(/^http/, 'ws')
          }
          return `${window.location.origin}${envProxy.startsWith('/') ? '' : '/'}${envProxy}`.replace(/^http/, 'ws')
        }
        return `${window.location.origin.replace(/^http/, 'ws')}/api/voice-mvp/live-proxy`
      }
      if (!envProxy) {
        const initUrl = `${window.location.origin}/api/voice-mvp/live-proxy`
        try {
          await fetch(initUrl, { method: 'GET', cache: 'no-store' })
        } catch (e: any) {
          throw new Error(e?.message || 'Live 프록시 초기화 실패')
        }
      }
      const wsUrl = resolveWsUrl()
      setWsConnectionUrl(wsUrl)
      setWsStatus('connecting')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('open')
        setWsOpenAt(new Date().toISOString())
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
          const resumptionHandle = lastResumptionHandleRef.current || undefined
          if (resumptionHandle) lastResumptionHandleRef.current = ''
          const region = failoverRegionRef.current || currentRegionRef.current
          if (failoverRegionRef.current) failoverRegionRef.current = null
          currentRegionRef.current = region
          setTimeout(() => {
            try {
              ws.send(JSON.stringify({
                type: 'init',
                model,
                config,
                ...(resumptionHandle ? { resumptionHandle } : {}),
                region,
              }))
              setWsInitSent(true)
            } catch (e: any) {
              setWsLastError(e?.message || 'init 전송 실패')
              setWsInitSent(false)
            }
          }, 60)
        } catch (e: any) {
          setWsLastError(e?.message || 'init 전송 실패')
          setWsInitSent(false)
        }
      }
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data || '{}'))
          setWsLastServerMsg(String(msg.type || 'unknown'))
          setWsLastServerAt(new Date().toISOString())
          if (msg.type === 'ready') {
            wasConnectedRef.current = true
            autoReconnectCountRef.current = 0
            sessionStartTimeRef.current = Date.now()
            setConnected(true)
            isAiSpeakingRef.current = false
            if (pingIntervalRef.current) {
              clearInterval(pingIntervalRef.current)
              pingIntervalRef.current = null
            }
            pingIntervalRef.current = setInterval(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'ping' }))
              }
            }, 30000)
            startFailoverCheckInterval()
            return
          }
          if (msg.type === 'sessionResumptionUpdate' && msg.newHandle != null) {
            lastResumptionHandleRef.current = String(msg.newHandle)
            return
          }
          if (msg.type === 'audio' && msg.data) {
            const buf = base64ToArrayBuffer(msg.data)
            const streamer = streamerRef.current
            const doPlay = async () => {
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
                  /* ignore */
                }
              }
              await streamer.resume()
              if (audioTimeoutRef.current) {
                clearTimeout(audioTimeoutRef.current)
                audioTimeoutRef.current = null
              }
              if (!isAiSpeakingRef.current) {
                isAiSpeakingRef.current = true
                const tSounds = [t1SoundRef.current, t2SoundRef.current, t3SoundRef.current, t4SoundRef.current].filter(Boolean)
                if (tSounds.length > 0) {
                  const randomTSound = tSounds[Math.floor(Math.random() * tSounds.length)]
                  if (randomTSound) {
                    randomTSound.currentTime = 0
                    randomTSound.play().catch(() => {})
                  }
                }
                if (Math.random() < 0.05 && jongSoundRef.current) {
                  jongSoundRef.current.currentTime = 0
                  jongSoundRef.current.play().catch(() => {})
                }
              }
              streamer.addPCM16(new Uint8Array(buf))
            }
            void doPlay()
            audioTimeoutRef.current = setTimeout(() => {
              isAiSpeakingRef.current = false
              audioTimeoutRef.current = null
              clearSilenceTimerRef.current()
              silenceTimerRef.current = setTimeout(() => {
                silenceTimerRef.current = null
                sendSilenceBreakRef.current()
              }, 5000)
            }, 500)
            return
          }
          if (msg.type === 'text' && msg.text) {
            setMessages((prev) => [...prev, { role: 'assistant', text: String(msg.text).trim() }])
            return
          }
          if (msg.type === 'text' && String(msg.text || '') === 'pong') {
            return
          }
          if (msg.type === 'interrupted') {
            streamerRef.current?.stop()
            isAiSpeakingRef.current = false
            clearSilenceTimerRef.current()
            if (audioTimeoutRef.current) {
              clearTimeout(audioTimeoutRef.current)
              audioTimeoutRef.current = null
            }
            return
          }
          if (msg.type === 'error') {
            if (pingIntervalRef.current) {
              clearInterval(pingIntervalRef.current)
              pingIntervalRef.current = null
            }
            const errMsg = String(msg.message || 'Live 연결 오류')
            const hint = msg.hint ? ` ${msg.hint}` : ''
            setWsLastServerError(errMsg)
            setError(errMsg + hint)
            if (msg.code === 'SESSION_END' || /Live 연결 종료/.test(errMsg)) {
              wsRef.current?.close()
            }
            return
          }
        } catch {
          // ignore
        }
      }
      ws.onerror = () => {
        setWsStatus('error')
        setWsLastError('WebSocket 연결 오류')
        setError('Live 연결 오류')
      }
      ws.onclose = (event) => {
        if (failoverCheckIntervalRef.current) {
          clearInterval(failoverCheckIntervalRef.current)
          failoverCheckIntervalRef.current = null
        }
        sessionStartTimeRef.current = null
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current)
          pingIntervalRef.current = null
        }
        setWsStatus('closed')
        setWsCloseCode(typeof event?.code === 'number' ? event.code : null)
        setWsCloseReason(event?.reason || '')
        setConnected(false)
        isAiSpeakingRef.current = false
        recorderRef.current?.stop()
        streamerRef.current?.stop()
        if (manualDisconnectRef.current) {
          manualDisconnectRef.current = false
          wasConnectedRef.current = false
          return
        }
        if (plannedFailoverRef.current) return
        if (closingForSwapRef.current) {
          closingForSwapRef.current = false
          return
        }
        const code = event?.code ? ` (code ${event.code})` : ''
        const reason = event?.reason ? `: ${event.reason}` : ''
        setError(`Live 연결 종료${code}${reason}. 다시 연결해 주세요.`)

        if (wasConnectedRef.current && autoReconnectCountRef.current < AUTO_RECONNECT_MAX) {
          const attempt = autoReconnectCountRef.current
          autoReconnectCountRef.current += 1
          const delay = AUTO_RECONNECT_DELAYS[Math.min(attempt, AUTO_RECONNECT_DELAYS.length - 1)]
          setError(`연결이 끊겼습니다. ${delay / 1000}초 후 자동 재연결 시도 중... (${autoReconnectCountRef.current}/${AUTO_RECONNECT_MAX})`)
          autoReconnectTimeoutRef.current = setTimeout(() => {
            autoReconnectTimeoutRef.current = null
            wsRef.current = null
            connect()
          }, delay)
        }
      }

      // ✅ 연결 시 jong.mp3 재생 (500ms 지연) — 확률 5% 이내
      const shouldPlayJong = Math.random() < 0.05
      if (shouldPlayJong && jongSoundRef.current) {
        setTimeout(() => {
          if (jongSoundRef.current) {
            jongSoundRef.current.currentTime = 0
            jongSoundRef.current.play().catch(() => {})
          }
        }, 500)
      }
      
      // 최초 연결 후 플래그 해제
      if (isFirstConnectionRef.current) {
        isFirstConnectionRef.current = false
      }

      // start mic recorder once connected
      if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
      const recorder = recorderRef.current

      const onData = (base64: string) => {
        clearSilenceTimerRef.current()
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        wsRef.current.send(JSON.stringify({ type: 'audio', data: base64, mimeType: 'audio/pcm;rate=16000' }))
      }
      recorder.off('data', onData as any).off('volume', setInVolume as any)
      if (!muted) recorder.on('data', onData as any).on('volume', setInVolume as any).start()

      setMessages([{ role: 'system', text: '연결됨. 마이크로 말하면 모델이 오디오로 응답합니다.' }])
      isAiSpeakingRef.current = false // 연결 시 초기화
    } catch (e: any) {
      setError(e?.message || 'connect 실패')
    }
  }

  const disconnect = async () => {
    manualDisconnectRef.current = true
    iosContextWorkaroundDoneRef.current = false
    recorderRef.current?.stop()
    streamerRef.current?.stop()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }))
      wsRef.current.close()
    }
    setConnected(false)
    isAiSpeakingRef.current = false
  }

  // iOS Safari: 백그라운드 복귀/포커스 복귀 후 AudioContext가 suspended 되면 무음이 날 수 있어 복구
  useEffect(() => {
    if (!isIOSDevice()) return
    const resumeIfConnected = () => {
      if (streamerRef.current) void streamerRef.current.resume()
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
  }, [])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    if (next) {
      recorderRef.current?.stop()
    } else {
      // restart if connected
      if (connected) {
        recorderRef.current?.start().catch(() => {})
      }
    }
  }

  if (authenticated === null) return <div className="min-h-screen flex items-center justify-center text-gray-500">인증 확인 중...</div>
  if (authenticated === false) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="w-full bg-white border-b-2 border-pink-500">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/voice-mvp/new" target="_blank" rel="noopener noreferrer" className="text-lg font-bold tracking-tight text-pink-600">
            음성상담 MVP (GenAI Live)
          </a>
          <div className="flex items-center gap-2">
            <button type="button" onClick={toggleMute} className="text-sm font-semibold text-gray-700 hover:text-pink-600">
              {muted ? '마이크 켜기' : '마이크 끄기'}
            </button>
            {connected ? (
              <button type="button" onClick={disconnect} className="text-sm font-semibold text-red-600 hover:text-red-700">
                연결 끊기
              </button>
            ) : (
              <button type="button" onClick={connect} className="text-sm font-semibold text-gray-700 hover:text-pink-600">
                연결
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 flex-1 flex flex-col gap-4">
        {error ? <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div> : null}

        {/* 🎛️ 오디오 레벨 메타 (만세력 섹션 위) */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-sm font-extrabold tracking-tight text-gray-900">오디오 레벨</div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      connected ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'
                    }`}
                  >
                    {connected ? 'LIVE 연결됨' : '연결 안 됨'}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${
                      muted ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-sky-50 text-sky-700 ring-1 ring-sky-200'
                    }`}
                  >
                    {muted ? '마이크 OFF' : '마이크 ON'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  IN(마이크) / OUT(모델 음성) 레벨을 확인하세요. 말하는 중에 모델이 말하면, 끼어들기(바지인)도 동작하는지 체크하면 됩니다.
                </div>
                <div className="mt-2 text-xs font-semibold text-gray-700">
                  설정: {voiceGender === 'male' ? '남성' : '여성'} · {toneLabel(selectedVoiceName)} · {styleLabel(voiceStyle)}
                </div>
              </div>
              <div className="text-right">
                <div className="mt-0.5 text-[11px] font-mono text-gray-400 leading-tight break-all">{model}</div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-200 p-3">
                <LevelBar label="IN (마이크)" value={inVolume} accent="blue" />
              </div>
              <div className="rounded-xl bg-gradient-to-br from-gray-50 to-white border border-gray-200 p-3">
                <LevelBar label="OUT (모델 음성)" value={outVolume} accent="pink" />
              </div>
            </div>
          </div>
          <div className="h-1 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-purple-500" />
        </div>

        {/* 컨텍스트 점검: 만세력/상황 주입 여부 확인 */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setShowContext((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
          >
            <span className="font-bold text-gray-900">컨텍스트 점검</span>
            <span className="text-sm text-gray-500">{showContext ? '접기' : '펼치기'}</span>
          </button>
          {showContext && (
            <div className="px-4 pb-4 text-xs text-gray-700 space-y-2">
              <div>모드: <span className="font-mono">{liveContext.mode || '-'}</span></div>
              <div>본인: <span className="font-mono">{liveContext.selfLine}</span></div>
              <div>생년월일: <span className="font-mono">{liveContext.selfBirth}</span></div>
              <div>만세력(본인) 길이: <span className="font-mono">{liveContext.manseSelfText.length}</span></div>
              <div className="whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-40 overflow-auto">
                {liveContext.manseSelfText ? liveContext.manseSelfText.slice(0, 600) : '(없음)'}
              </div>
              {liveContext.mode === 'gunghap' && (
                <>
                  <div>상대: <span className="font-mono">{liveContext.partnerLine}</span></div>
                  <div>생년월일(상대): <span className="font-mono">{liveContext.partnerBirth}</span></div>
                  <div>만세력(상대) 길이: <span className="font-mono">{liveContext.mansePartnerText.length}</span></div>
                  <div className="whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-40 overflow-auto">
                    {liveContext.mansePartnerText ? liveContext.mansePartnerText.slice(0, 600) : '(없음)'}
                  </div>
                </>
              )}
              {liveContext.mode === 'reunion' && (
                <>
                  <div>상황 길이: <span className="font-mono">{liveContext.situation.length}</span></div>
                  <div className="whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded p-2 max-h-40 overflow-auto">
                    {liveContext.situation ? liveContext.situation.slice(0, 600) : '(없음)'}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* WS 상태 디버그 */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-700 space-y-2">
          <div className="font-bold text-gray-900">WS 상태</div>
          <div>연결 URL: <span className="font-mono break-all">{wsConnectionUrl || '-'}</span></div>
          <div>상태: <span className="font-mono">{wsStatus}</span></div>
          <div>오픈 시각: <span className="font-mono">{wsOpenAt || '-'}</span></div>
          <div>init 전송: <span className="font-mono">{wsInitSent ? 'yes' : 'no'}</span></div>
          <div>마지막 수신: <span className="font-mono">{wsLastServerMsg || '-'}</span></div>
          <div>수신 시각: <span className="font-mono">{wsLastServerAt || '-'}</span></div>
          <div>닫힘 코드: <span className="font-mono">{wsCloseCode ?? '-'}</span></div>
          <div>닫힘 사유: <span className="font-mono">{wsCloseReason || '-'}</span></div>
          <div>클라이언트 오류: <span className="font-mono">{wsLastError || '-'}</span></div>
          <div>서버 오류: <span className="font-mono">{wsLastServerError || '-'}</span></div>
        </div>

        {/* ✅ 만세력 표시 (리절트 페이지와 동일한 헤더+컨테이너+오행 스타일) */}
        {manseSelfBlockHtml ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden voice-mvp-manse-wrapper">
            <style dangerouslySetInnerHTML={{ __html: MANSE_RESULT_STYLES }} />
            <button
              type="button"
              onClick={() => setShowManse((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50"
            >
              <span className="font-bold text-gray-900">만세력</span>
              <span className="text-sm text-gray-500">{showManse ? '접기' : '펼치기'}</span>
            </button>
            {showManse && (
              <div className="px-4 pb-4">
                <div
                  className="w-full overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: manseSelfBlockHtml }}
                />
                {session?.mode === 'gunghap' && mansePartnerBlockHtml ? (
                  <div className="mt-6">
                    <div className="font-semibold text-gray-800 mb-2">상대 만세력</div>
                    <div
                      className="w-full overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: mansePartnerBlockHtml }}
                    />
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
          {messages.map((m, idx) => (
            <div key={idx} className={`text-sm ${m.role === 'assistant' ? 'text-gray-900' : m.role === 'user' ? 'text-gray-800' : 'text-gray-500'}`}>
              <span className="font-semibold">{m.role === 'assistant' ? '상담사' : m.role === 'user' ? '사용자' : 'system'}</span>
              <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
            </div>
          ))}
          {messages.length === 0 ? <div className="text-sm text-gray-500">대화 로그 없음</div> : null}
        </div>
      </main>
    </div>
  )
}

