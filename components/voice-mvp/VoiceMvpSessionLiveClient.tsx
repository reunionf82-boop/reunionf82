'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
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

const LIVE_MODEL_FALLBACK = 'gemini-2.5-flash-native-audio-preview-12-2025'

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

  const snapshot = session?.routing_config_snapshot
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
    const contextText = `### 기본 정보\n${selfLine}\n생년월일: ${selfBirth}\n\n### 만세력(본인)\n${manseSelfText || '(만세력 텍스트 없음)'}\n\n### 만세력(상대)\n${
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
      wsRef.current?.close()
      recorderRef.current?.stop()
      streamerRef.current?.stop()
      if (audioTimeoutRef.current) {
        clearTimeout(audioTimeoutRef.current)
        audioTimeoutRef.current = null
      }
    }
  }, [])

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

      // audio output
      if (!streamerRef.current) {
        const outCtx = await audioContext({ id: 'voice-mvp-out' })
        const streamer = new AudioStreamer(outCtx)
        await streamer.addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
          setOutVolume(ev.data.volume)
        })
        streamerRef.current = streamer
      }
      await streamerRef.current.resume()

      const mode = liveContext.mode
      const preset = liveContext.preset
      const voiceName = liveContext.voiceName
      const systemText = liveContext.systemText
      const contextText = liveContext.contextText

      const config: any = {
        responseModalities: [Modality.AUDIO],
        // voiceName은 캐릭터(모드)별로 DB에서 설정된 값을 사용
        // 참고: speakingRate는 현재 GenAI Live API의 SpeechConfig에서 지원되지 않음
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
      setWsStatus('connecting')
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('open')
        setWsOpenAt(new Date().toISOString())
        try {
          ws.send(JSON.stringify({ type: 'ping' }))
          setTimeout(() => {
            try {
              ws.send(JSON.stringify({ type: 'init', model, config }))
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
            setConnected(true)
            isAiSpeakingRef.current = false
            return
          }
          if (msg.type === 'audio' && msg.data) {
            const buf = base64ToArrayBuffer(msg.data)
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
              if (Math.random() < 0.3 && jongSoundRef.current) {
                jongSoundRef.current.currentTime = 0
                jongSoundRef.current.play().catch(() => {})
              }
            }
            streamerRef.current?.addPCM16(new Uint8Array(buf))
            audioTimeoutRef.current = setTimeout(() => {
              isAiSpeakingRef.current = false
              audioTimeoutRef.current = null
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
            if (audioTimeoutRef.current) {
              clearTimeout(audioTimeoutRef.current)
              audioTimeoutRef.current = null
            }
            return
          }
          if (msg.type === 'error') {
            setWsLastServerError(String(msg.message || 'Live 연결 오류'))
            setError(msg.message || 'Live 연결 오류')
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
        setWsStatus('closed')
        setWsCloseCode(typeof event?.code === 'number' ? event.code : null)
        setWsCloseReason(event?.reason || '')
        setConnected(false)
        isAiSpeakingRef.current = false
        recorderRef.current?.stop()
        streamerRef.current?.stop()
        if (manualDisconnectRef.current) {
          manualDisconnectRef.current = false
          return
        }
        const code = event?.code ? ` (code ${event.code})` : ''
        const reason = event?.reason ? `: ${event.reason}` : ''
        setError(`Live 연결 종료${code}${reason}`)
      }

      // ✅ 연결 시 jong.mp3 재생 (500ms 지연)
      // 최초 연결 시: 100% 확률, 이후 연결 시: 5% 확률
      const shouldPlayJong = isFirstConnectionRef.current ? true : Math.random() < 0.05
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
    recorderRef.current?.stop()
    streamerRef.current?.stop()
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'disconnect' }))
      wsRef.current.close()
    }
    setConnected(false)
    isAiSpeakingRef.current = false // 연결 해제 시 초기화
  }

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

        {/* ✅ 만세력 표시 (세션 생성 시 서버에서 계산/고정된 데이터) */}
        {session?.manse_self?.manse_table ? (
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                  // 내부 MVP: 서버에서 생성한 HTML 테이블만 렌더링 (사용자 입력 HTML 아님)
                  dangerouslySetInnerHTML={{ __html: String(session.manse_self.manse_table || '') }}
                />
                {session?.mode === 'gunghap' && session?.manse_partner?.manse_table ? (
                  <div className="mt-6">
                    <div className="font-semibold text-gray-800 mb-2">상대 만세력</div>
                    <div
                      className="w-full overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: String(session.manse_partner.manse_table || '') }}
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

