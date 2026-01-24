'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AudioRecorder } from '@/lib/voice-mvp/genai-live/audio-recorder'
import { AudioStreamer } from '@/lib/voice-mvp/genai-live/audio-streamer'
import { audioContext } from '@/lib/voice-mvp/genai-live/utils'
import VolMeterWorket from '@/lib/voice-mvp/genai-live/worklets/vol-meter'
import { GenAILiveClient } from '@/lib/voice-mvp/genai-live/genai-live-client'
import type { LiveClientOptions } from '@/lib/voice-mvp/genai-live/types'
import { Modality, type LiveConnectConfig } from '@google/genai'

type Msg = { role: 'user' | 'assistant' | 'system'; text: string }

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

function getPublicLiveApiKey(): string {
  // ⚠️ 내부 MVP 전용: 브라우저에서 직접 Live API 연결을 위해 공개키를 사용.
  // 운영용으로 갈 때는 서버 프록시/토큰 방식을 쓰는 게 안전.
  return String(process.env.NEXT_PUBLIC_GEMINI_LIVE_API_KEY || '')
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

  const apiKey = useMemo(() => getPublicLiveApiKey(), [])
  const clientRef = useRef<GenAILiveClient | null>(null)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const streamerRef = useRef<AudioStreamer | null>(null)

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
    if (!base) return 'models/gemini-2.0-flash-001'
    // Live API expects "models/..." naming (or a full resource name depending on client).
    // Our DB stores plain ids like "gemini-2.0-flash-001".
    return base.includes('/') ? base : `models/${base}`
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

  useEffect(() => {
    if (!authenticated) return
    if (!apiKey) {
      setError('NEXT_PUBLIC_GEMINI_LIVE_API_KEY 가 설정되지 않았습니다.')
      return
    }

    const opts: LiveClientOptions = { apiKey } as any
    const client = new GenAILiveClient(opts)
    clientRef.current = client

    const onOpen = () => setConnected(true)
    const onClose = () => setConnected(false)
    const onError = (e: any) => setError(e?.message || 'Live 연결 오류')

    const onAudio = (data: ArrayBuffer) => {
      try {
        streamerRef.current?.addPCM16(new Uint8Array(data))
      } catch {
        // ignore
      }
    }
    const onInterrupted = () => streamerRef.current?.stop()
    const onContent = (c: any) => {
      // 모델 텍스트도 받을 수 있음 (AUDIO 모드여도 텍스트 part가 올 수 있음)
      const parts = c?.modelTurn?.parts || c?.serverContent?.modelTurn?.parts || []
      const texts = (parts || [])
        .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
        .filter(Boolean)
        .join('\n')
      if (texts.trim()) setMessages((prev) => [...prev, { role: 'assistant', text: texts.trim() }])
    }

    client.on('open', onOpen).on('close', onClose).on('error', onError).on('audio', onAudio).on('interrupted', onInterrupted).on('content', onContent)

    return () => {
      client.off('open', onOpen).off('close', onClose).off('error', onError).off('audio', onAudio).off('interrupted', onInterrupted).off('content', onContent)
      client.disconnect()
      recorderRef.current?.stop()
      streamerRef.current?.stop()
    }
  }, [authenticated, apiKey])

  const connect = async () => {
    setError('')
    try {
      if (!clientRef.current) return

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

      const mode = String(session?.mode || '')
      const persona =
        (session?.routing_config_snapshot?.personas &&
          typeof session.routing_config_snapshot.personas?.[mode] === 'string' &&
          String(session.routing_config_snapshot.personas?.[mode] || '').trim()) ||
        ''
      const preset = getModeVoicePreset(session?.routing_config_snapshot, mode)
      // Use mode-specific voiceName from preset (from DB config)
      const voiceName = preset.voiceName
      // 참고: speakingRate는 현재 GenAI Live API에서 미지원 (preset.speakingRate는 향후 지원 시 사용)
      const selfLine = profileLine(session?.profile_self, '본인')
      const partnerLine = profileLine(session?.profile_partner, '상대')
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
      const contextText = `### 만세력(본인)\n${selfLine}\n${manseSelfText || '(없음)'}\n\n### 만세력(상대)\n${
        mode === 'gunghap' ? `${partnerLine}\n${mansePartnerText || '(없음)'}` : '(해당 없음)'
      }\n\n### 상황\n${mode === 'reunion' ? situation || '(없음)' : '(해당 없음)'}\n`

      const config: LiveConnectConfig = {
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

      await clientRef.current.connect(model, config)

      // start mic recorder once connected
      if (!recorderRef.current) recorderRef.current = new AudioRecorder(16000)
      const recorder = recorderRef.current

      const onData = (base64: string) => {
        clientRef.current?.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=16000', data: base64 }])
      }
      recorder.off('data', onData as any).off('volume', setInVolume as any)
      if (!muted) recorder.on('data', onData as any).on('volume', setInVolume as any).start()

      setMessages([{ role: 'system', text: '연결됨. 마이크로 말하면 모델이 오디오로 응답합니다.' }])
    } catch (e: any) {
      setError(e?.message || 'connect 실패')
    }
  }

  const disconnect = async () => {
    recorderRef.current?.stop()
    streamerRef.current?.stop()
    clientRef.current?.disconnect()
    setConnected(false)
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

