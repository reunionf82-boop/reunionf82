'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

declare global {
  interface Window {
    webkitSpeechRecognition?: any
    SpeechRecognition?: any
  }
}

type Msg = { role: 'user' | 'assistant' | 'system' | 'tool'; text: string; created_at?: string; model_used?: string }

export default function VoiceMvpSessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<any>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [listening, setListening] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [error, setError] = useState<string>('')
  const [debugOpen, setDebugOpen] = useState(true)

  const recognitionRef = useRef<any>(null)
  const listenStartRef = useRef<number>(0)
  const transcriptRef = useRef<HTMLDivElement>(null)

  const hasSpeechRecognition = useMemo(() => {
    return typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
  }, [])

  const scrollToBottom = () => {
    const el = transcriptRef.current
    if (el) el.scrollTop = el.scrollHeight
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages.length])

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

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/voice-mvp/sessions/${sessionId}`, { cache: 'no-store' })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.success) {
        setError(data?.error || `HTTP ${res.status}`)
        return
      }
      setSession(data.session)
      setMessages((data.messages || []).map((m: any) => ({ role: m.role, text: m.text, created_at: m.created_at, model_used: m.model_used })))
      setEvents(data.events || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const speak = (text: string) => {
    try {
      if (typeof window === 'undefined') return
      if (!('speechSynthesis' in window)) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ko-KR'
      u.rate = 1.05
      u.pitch = 1.0
      window.speechSynthesis.speak(u)
    } catch {
      // ignore
    }
  }

  const stopSpeaking = () => {
    try {
      if (typeof window === 'undefined') return
      window.speechSynthesis?.cancel?.()
    } catch {
      // ignore
    }
  }

  const startListening = () => {
    setError('')
    if (!hasSpeechRecognition) {
      setError('이 브라우저는 SpeechRecognition을 지원하지 않습니다. (Chrome 권장)')
      return
    }
    if (listening) return

    stopSpeaking() // barge-in

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    recognitionRef.current = rec
    rec.lang = 'ko-KR'
    rec.interimResults = true
    rec.continuous = false

    let finalText = ''
    rec.onresult = (event: any) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0]?.transcript || ''
        if (event.results[i].isFinal) finalText += t
        else interim += t
      }
      // show interim as system line (local only)
      setMessages((prev) => {
        const next = prev.filter((m) => m.role !== 'system' || !m.text.startsWith('[interim] '))
        if (interim.trim()) next.push({ role: 'system', text: `[interim] ${interim.trim()}` })
        return next
      })
    }

    rec.onerror = (e: any) => {
      setError(`음성 인식 오류: ${e?.error || 'unknown'}`)
      setListening(false)
    }

    rec.onend = async () => {
      setListening(false)
      // remove interim marker
      setMessages((prev) => prev.filter((m) => m.role !== 'system' || !m.text.startsWith('[interim] ')))
      const text = finalText.trim()
      if (!text) return
      const seconds = listenStartRef.current ? (Date.now() - listenStartRef.current) / 1000 : undefined
      await sendTurn(text, seconds)
    }

    listenStartRef.current = Date.now()
    setListening(true)
    rec.start()
  }

  const stopListening = () => {
    try {
      recognitionRef.current?.stop?.()
    } catch {
      // ignore
    }
    setListening(false)
  }

  const sendTurn = async (text: string, seconds?: number) => {
    setThinking(true)
    setMessages((prev) => [...prev, { role: 'user', text }])
    try {
      const res = await fetch(`/api/voice-mvp/sessions/${sessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ text, seconds }),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.success) {
        setError(data?.error || `HTTP ${res.status}`)
        return
      }
      setMessages((prev) => [...prev, { role: 'assistant', text: data.text, model_used: data.model_used }])
      speak(String(data.text || ''))
      // refresh events occasionally (for debug)
      const r = await fetch(`/api/voice-mvp/sessions/${sessionId}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({} as any))
      if (d?.success) setEvents(d.events || [])
    } finally {
      setThinking(false)
    }
  }

  const endSession = async () => {
    if (!confirm('세션을 종료할까요?')) return
    await fetch(`/api/voice-mvp/sessions/${sessionId}/end`, { method: 'POST' }).catch(() => {})
    await load()
  }

  if (authenticated === null) return <div className="min-h-screen flex items-center justify-center text-gray-500">인증 확인 중...</div>
  if (authenticated === false) return null

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="w-full bg-white border-b-2 border-pink-500">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <a
            href="/voice-mvp/new"
            target="_blank"
            rel="noopener noreferrer"
            className="text-lg font-bold tracking-tight text-pink-600"
          >
            음성상담 MVP
          </a>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              className="text-sm font-semibold text-gray-700 hover:text-pink-600"
            >
              디버그 {debugOpen ? '숨김' : '표시'}
            </button>
            <button
              type="button"
              onClick={endSession}
              className="text-sm font-semibold text-red-600 hover:text-red-700"
            >
              세션 종료
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 flex-1 flex flex-col gap-4">
        {loading ? (
          <div className="text-gray-500">로딩 중...</div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{error}</div>
        ) : null}

        {session && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">모드</span>: {session.mode} / <span className="font-semibold">상태</span>: {session.status}
            </div>
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div ref={transcriptRef} className="max-h-[52vh] overflow-y-auto p-4 space-y-3">
            {messages.map((m, idx) => (
              <div key={idx} className={`text-sm ${m.role === 'assistant' ? 'text-gray-900' : m.role === 'user' ? 'text-gray-800' : 'text-gray-500'}`}>
                <span className="font-semibold">
                  {m.role === 'assistant' ? '상담사' : m.role === 'user' ? '사용자' : m.role}
                </span>
                {m.model_used ? <span className="ml-2 text-xs text-gray-400">({m.model_used})</span> : null}
                <div className="whitespace-pre-wrap leading-relaxed">{m.text}</div>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-200 p-4 flex gap-2">
            <button
              type="button"
              onClick={listening ? stopListening : startListening}
              disabled={thinking}
              className={`flex-1 py-3 rounded-xl font-bold transition-colors ${
                thinking ? 'bg-gray-200 text-gray-500' : listening ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-pink-600 hover:bg-pink-700 text-white'
              }`}
            >
              {thinking ? '답변 생성 중...' : listening ? '듣는 중... (탭해서 중지)' : '말하기(탭해서 시작)'}
            </button>
            <button
              type="button"
              onClick={stopSpeaking}
              className="px-4 py-3 rounded-xl font-bold bg-gray-100 hover:bg-gray-200 text-gray-800"
            >
              음성 중단
            </button>
          </div>
          {!hasSpeechRecognition && (
            <div className="px-4 pb-4 text-xs text-gray-500">
              이 브라우저는 음성 인식(Web Speech API)을 지원하지 않습니다. 내부 MVP는 Chrome에서 테스트하세요.
            </div>
          )}
        </div>

        {debugOpen && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="font-semibold text-gray-900 mb-2">디버그(라우팅/툴/에러 이벤트)</div>
            <div className="max-h-56 overflow-y-auto text-xs text-gray-700 space-y-2">
              {events.slice(-60).map((e, idx) => (
                <div key={idx} className="border-b border-gray-100 pb-2">
                  <div className="font-semibold">{e.type}</div>
                  <div className="text-gray-500">{e.created_at}</div>
                  {e.payload ? <pre className="whitespace-pre-wrap">{JSON.stringify(e.payload, null, 2)}</pre> : null}
                </div>
              ))}
              {events.length === 0 ? <div className="text-gray-500">이벤트 없음</div> : null}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

