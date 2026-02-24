'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

interface VoiceMessage {
  role: 'user' | 'assistant'
  text: string
}

interface VoiceResult {
  id: number
  title: string
  saved_at: string
  user_name?: string
  result_type: string
  voice_messages: VoiceMessage[]
  voice_audio_url?: string
  /** iOS Safari 재생용 M4A URL (서버 변환 또는 DB 저장값) */
  voice_audio_url_m4a?: string | null
  voice_duration_seconds?: number
  content_id?: number
  /** 어드민 음성형 컨텐츠의 상담사명 */
  voice_counselor_name?: string | null
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isWebmUrl(url: string): boolean {
  return /\.webm(\?|$)/i.test(url) || url.toLowerCase().includes('audio/webm')
}

/** iOS Safari: 무음 재생으로 오디오 세션 활성화 → 스피커 모드 (panana와 동일) */
const IOS_UNLOCK_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

function VoiceReplayContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const resultId = searchParams?.get('id') ?? null
  const autoplay = searchParams?.get('autoplay') === '1'

  const [loading, setLoading] = useState(true)

  // iOS: 다시듣기 페이지 진입 시 무음 WAV 1회 재생 → 스피커 모드 활성화
  useEffect(() => {
    if (isIOS() && typeof window !== 'undefined') {
      const unlock = new Audio(IOS_UNLOCK_WAV)
      void unlock.play().catch(() => {})
    }
  }, [])
  const [error, setError] = useState('')
  const [result, setResult] = useState<VoiceResult | null>(null)

  // 오디오 플레이어 (iOS는 M4A URL 사용)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [effectiveAudioUrl, setEffectiveAudioUrl] = useState<string | null>(null)
  const [loadingM4a, setLoadingM4a] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioError, setAudioError] = useState(false)
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!resultId) {
      setError('결과 ID가 없습니다.')
      setLoading(false)
      return
    }
    ;(async () => {
      try {
        const res = await fetch(`/api/saved-results/list?id=${resultId}`, { cache: 'no-store' })
        if (!res.ok) throw new Error('결과를 불러올 수 없습니다.')
        const data = await res.json()
        const r = data?.data
        if (!r) {
          setError('결과를 찾을 수 없습니다.')
          setLoading(false)
          return
        }
        // voice 판별: result_type이 'voice'이거나, voice_messages/voice_audio_url이 존재
        const isVoiceResult = r.result_type === 'voice' || !!r.voice_messages || !!r.voice_audio_url
        if (!isVoiceResult) {
          setError('음성 상담 결과가 아닙니다.')
          setLoading(false)
          return
        }
        // voice_messages 파싱
        let msgs: VoiceMessage[] = []
        if (r.voice_messages) {
          try {
            msgs = typeof r.voice_messages === 'string' ? JSON.parse(r.voice_messages) : r.voice_messages
          } catch { msgs = [] }
        }
        setResult({
          id: r.id,
          title: r.title,
          saved_at: r.savedAt || r.saved_at || r.savedAtISO || '',
          user_name: r.userName || r.user_name,
          result_type: r.result_type || 'voice',
          voice_messages: Array.isArray(msgs) ? msgs : [],
          voice_audio_url: r.voice_audio_url || null,
          voice_audio_url_m4a: r.voice_audio_url_m4a ?? null,
          voice_duration_seconds: r.voice_duration_seconds || null,
          content_id: r.content_id || null,
          voice_counselor_name: r.voice_counselor_name ?? null,
        })
      } catch (e: any) {
        setError(e?.message || '로딩 오류')
      } finally {
        setLoading(false)
      }
    })()
  }, [resultId])

  // iOS일 때 M4A URL 확정 (이미 있으면 사용, 없으면 변환 API 호출)
  useEffect(() => {
    if (!result?.voice_audio_url) {
      setEffectiveAudioUrl(null)
      return
    }
    const ios = isIOS()
    const webm = isWebmUrl(result.voice_audio_url)
    if (!ios || !webm) {
      setEffectiveAudioUrl(result.voice_audio_url)
      return
    }
    if (result.voice_audio_url_m4a) {
      setEffectiveAudioUrl(result.voice_audio_url_m4a)
      return
    }
    setLoadingM4a(true)
    const urlEnc = encodeURIComponent(result.voice_audio_url)
    const savedId = result?.id != null ? String(result.id) : ''
    fetch(`/api/voice-audio-m4a?url=${urlEnc}&savedId=${savedId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.url) {
          setEffectiveAudioUrl(data.url)
          if (result && data.url) {
            setResult((prev) => (prev ? { ...prev, voice_audio_url_m4a: data.url } : prev))
          }
        } else {
          setEffectiveAudioUrl(result.voice_audio_url ?? null)
        }
      })
      .catch(() => setEffectiveAudioUrl(result.voice_audio_url ?? null))
      .finally(() => setLoadingM4a(false))
  }, [result?.id, result?.voice_audio_url, result?.voice_audio_url_m4a])

  // 오디오 초기화 (effectiveAudioUrl 기준)
  useEffect(() => {
    if (!effectiveAudioUrl) return
    const audio = new Audio(effectiveAudioUrl)
    audio.preload = 'metadata'
    // WebM 스트리밍 녹음은 loadedmetadata에서 duration이 Infinity일 수 있음
    const updateDuration = () => {
      const d = audio.duration
      if (Number.isFinite(d) && d > 0) {
        setDuration(d)
      } else if (result?.voice_duration_seconds && result.voice_duration_seconds > 0) {
        // DB에 저장된 상담 시간을 fallback으로 사용
        setDuration(result.voice_duration_seconds)
      }
    }
    audio.addEventListener('loadedmetadata', updateDuration)
    audio.addEventListener('durationchange', updateDuration)
    audio.addEventListener('ended', () => {
      // 끝까지 재생됐으면 실제 재생 시간으로 duration 확정
      if (audio.currentTime > 0 && Number.isFinite(audio.currentTime)) {
        setDuration(audio.currentTime)
      }
      setIsPlaying(false)
      setCurrentTime(0)
    })
    audio.addEventListener('error', () => setAudioError(true))
    audioRef.current = audio
    // autoplay 파라미터가 있으면 자동 재생
    if (autoplay) {
      audio.addEventListener('canplaythrough', () => {
        audio.play().then(() => {
          setIsPlaying(true)
          progressIntervalRef.current = setInterval(() => {
            setCurrentTime(audio.currentTime)
          }, 200)
        }).catch(() => {})
      }, { once: true })
    }
    return () => {
      audio.pause()
      audio.src = ''
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current)
    }
  }, [effectiveAudioUrl, autoplay, result?.voice_duration_seconds])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (isPlaying) {
      audio.pause()
      if (progressIntervalRef.current) { clearInterval(progressIntervalRef.current); progressIntervalRef.current = null }
      setIsPlaying(false)
    } else {
      audio.play().catch(() => {})
      progressIntervalRef.current = setInterval(() => {
        setCurrentTime(audio.currentTime)
      }, 200)
      setIsPlaying(true)
    }
  }, [isPlaying])

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value)
    if (audioRef.current) {
      audioRef.current.currentTime = val
      setCurrentTime(val)
    }
  }, [])

  const formatTime = (sec: number) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    // KST 포맷 문자열(예: "2026.02.04 14:30")이면 그대로 반환
    if (/^\d{4}\.\d{2}\.\d{2}/.test(dateStr)) return dateStr
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return dateStr
      return d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch { return dateStr }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-10 h-10 text-violet-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-gray-400 text-sm">불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800/80 rounded-2xl p-8 max-w-md w-full text-center border border-gray-700">
          <svg className="w-16 h-16 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-gray-300 text-lg mb-6">{error || '결과를 찾을 수 없습니다.'}</p>
          <button onClick={() => router.back()} className="px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold transition-colors">
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur-md border-b border-gray-700/50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-gray-700/50 transition-colors">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-bold text-base truncate">{result.title}</h1>
            <p className="text-gray-500 text-xs">{formatDate(result.saved_at)}</p>
          </div>
          {result.voice_duration_seconds != null && result.voice_duration_seconds > 0 && (
            <span className="text-gray-500 text-xs whitespace-nowrap">
              {Math.floor(result.voice_duration_seconds / 60)}분 {result.voice_duration_seconds % 60}초
            </span>
          )}
        </div>
      </div>

      {/* 오디오 플레이어 */}
      {result.voice_audio_url && (effectiveAudioUrl || loadingM4a) && !audioError && (
        <div className="sticky top-[57px] z-10 bg-gray-800/95 backdrop-blur-md border-b border-gray-700/50">
          <div className="max-w-2xl mx-auto px-4 py-3">
            {loadingM4a && (
              <p className="text-gray-400 text-xs mb-2">오디오 준비 중…</p>
            )}
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                disabled={loadingM4a || !effectiveAudioUrl}
                className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600 hover:bg-violet-500 flex items-center justify-center transition-colors disabled:opacity-50 disabled:pointer-events-none"
              >
                {isPlaying ? (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" /></svg>
                ) : (
                  <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                )}
              </button>
              <div className="flex-1 flex items-center gap-2">
                <span className="text-gray-400 text-xs font-mono w-10 text-right">{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer bg-gray-600 accent-violet-500"
                />
                <span className="text-gray-400 text-xs font-mono w-10">{formatTime(duration)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 대화 내용 */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {result.voice_messages.length === 0 ? (
          <div className="text-center py-20">
            <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-500 mb-2">텍스트 대화 기록이 없습니다.</p>
            {result.voice_audio_url && (
              <p className="text-gray-500 text-sm">위의 오디오 플레이어로 상담 내용을 들으실 수 있습니다.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {result.voice_messages.map((msg, idx) => {
              const isAssistant = msg.role === 'assistant'
              return (
                <div key={idx} className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                    isAssistant
                      ? 'bg-gray-700/70 text-gray-200 rounded-tl-md'
                      : 'bg-violet-600/80 text-white rounded-tr-md'
                  }`}>
                    <p className="text-xs font-semibold mb-1 opacity-60">
                      {isAssistant ? (result.voice_counselor_name || '상담사') : (result.user_name || '나')}
                    </p>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 하단 여백 */}
        <div className="h-20" />
      </div>
    </div>
  )
}

export default function VoiceReplayPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <svg className="animate-spin w-10 h-10 text-violet-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    }>
      <VoiceReplayContent />
    </Suspense>
  )
}
