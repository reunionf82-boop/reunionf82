'use client'

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { isPpoingAttributes } from '@/lib/voice-mvp/ppoing-rules'
import SocialShareButtons from '@/components/SocialShareButtons'
import { useVoiceResult } from './useVoiceResult'

/** DB voice_advisor_video_url: 단일 URL 문자열 또는 JSON 배열 문자열 → string[] */
function parseVideoUrls(raw: string | undefined): string[] {
  if (!raw || typeof raw !== 'string') return []
  const s = raw.trim()
  if (!s) return []
  if (s.startsWith('[')) {
    try {
      const arr = JSON.parse(s) as unknown
      return Array.isArray(arr) ? arr.filter((u): u is string => typeof u === 'string' && !!u.trim()) : [s]
    } catch { return [s] }
  }
  return [s]
}

/** Fisher–Yates 셔플. 세션당 한 번만 호출해 랜덤 순차 재생 목록 생성 */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** 복수 동영상: 세션당 한 번 셔플 후 순차 재생, 전환 시 크로스페이드로 깜빡임 방지 */
function VoiceAdvisorVideoBlock({ rawVideoUrl }: { rawVideoUrl?: string }) {
  const urls = useMemo(() => parseVideoUrls(rawVideoUrl), [rawVideoUrl])
  const shuffledUrls = useMemo(() => (urls.length <= 1 ? urls : shuffle(urls)), [urls])
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0)
  const [currentIdx, setCurrentIdx] = useState(0)
  const videoRef0 = useRef<HTMLVideoElement>(null)
  const videoRef1 = useRef<HTMLVideoElement>(null)
  const loadRetryCountRef = useRef(0)
  const LOAD_RETRY_MAX = 2

  useEffect(() => {
    if (shuffledUrls.length === 0) return
    const v = videoRef0.current
    if (!v) return
    const src = shuffledUrls[0]
    v.src = src
    v.play().catch(() => {})
    setActiveSlot(0)
    setCurrentIdx(0)
    const onError = () => {
      if (loadRetryCountRef.current >= LOAD_RETRY_MAX) return
      loadRetryCountRef.current += 1
      setTimeout(() => {
        if (v && src) {
          v.src = ''
          v.src = src
          v.load()
          v.play().catch(() => {})
        }
      }, 1500)
    }
    v.addEventListener('error', onError, { once: true })
    return () => v.removeEventListener('error', onError)
  }, [shuffledUrls])

  const goNext = useCallback(() => {
    if (shuffledUrls.length === 0) return
    const nextIdx = (currentIdx + 1) % shuffledUrls.length
    const inactive: 0 | 1 = activeSlot === 0 ? 1 : 0
    const ref = inactive === 0 ? videoRef0 : videoRef1
    const el = ref.current
    if (el) {
      el.src = shuffledUrls[nextIdx]
      el.currentTime = 0
      const onReady = () => {
        el.removeEventListener('canplay', onReady)
        el.removeEventListener('error', onReady)
        setActiveSlot(inactive)
        setCurrentIdx(nextIdx)
        el.play().catch(() => {})
      }
      el.addEventListener('canplay', onReady, { once: true })
      el.addEventListener('error', onReady, { once: true })
      el.load()
    }
  }, [shuffledUrls, currentIdx, activeSlot])

  useEffect(() => {
    if (shuffledUrls.length <= 1) return
    const ref = activeSlot === 0 ? videoRef0 : videoRef1
    const el = ref.current
    if (!el) return
    const onEnded = () => goNext()
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [activeSlot, goNext, shuffledUrls.length])

  if (urls.length === 0) {
    return (
      <div className="w-full rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center py-12">
        <p className="text-gray-400 text-sm">영상이 등록되지 않았습니다.</p>
      </div>
    )
  }

  const wrapperClass = 'w-full overflow-hidden rounded-none [contain:layout_paint] [will-change:transform] relative'
  const videoClass = 'absolute inset-0 w-full h-full object-cover transition-opacity duration-[480ms] ease-out'
  const singleVideo = shuffledUrls.length <= 1
  return (
    <div className={wrapperClass} style={{ aspectRatio: '16/10' }}>
      <video
        ref={videoRef0}
        autoPlay
        loop={singleVideo}
        muted
        playsInline
        className={videoClass}
        preload="auto"
        style={{ opacity: activeSlot === 0 ? 1 : 0, zIndex: activeSlot === 0 ? 1 : 0 }}
      />
      <video
        ref={videoRef1}
        loop={singleVideo}
        muted
        playsInline
        className={videoClass}
        preload="auto"
        style={{ opacity: activeSlot === 1 ? 1 : 0, zIndex: activeSlot === 1 ? 1 : 0 }}
      />
    </div>
  )
}

/** 다자형: 1:1 비율 3분할. 페르소나별 동영상, 말할 때만 해당 칸 재생·나머지 일시정지. 전환 시 크로스페이드로 블랙 방지 */
function MultiAdvisorVideoBlock({
  videoUrlsByPersona,
  currentSpeakerIndex,
}: {
  videoUrlsByPersona: [string[], string[], string[]]
  currentSpeakerIndex: 0 | 1 | 2
}) {
  const getUrls = (i: 0 | 1 | 2) =>
    (videoUrlsByPersona[i] ?? []).filter((u) => typeof u === 'string' && (u as string).trim()) as string[]
  const urls0 = useMemo(() => getUrls(0), [videoUrlsByPersona[0]?.join('|')])
  const urls1 = useMemo(() => getUrls(1), [videoUrlsByPersona[1]?.join('|')])
  const urls2 = useMemo(() => getUrls(2), [videoUrlsByPersona[2]?.join('|')])
  const shuffled0 = useMemo(() => (urls0.length <= 1 ? urls0 : shuffle(urls0)), [urls0.join('|')])
  const shuffled1 = useMemo(() => (urls1.length <= 1 ? urls1 : shuffle(urls1)), [urls1.join('|')])
  const shuffled2 = useMemo(() => (urls2.length <= 1 ? urls2 : shuffle(urls2)), [urls2.join('|')])

  const ref0a = useRef<HTMLVideoElement>(null)
  const ref0b = useRef<HTMLVideoElement>(null)
  const ref1a = useRef<HTMLVideoElement>(null)
  const ref1b = useRef<HTMLVideoElement>(null)
  const ref2a = useRef<HTMLVideoElement>(null)
  const ref2b = useRef<HTMLVideoElement>(null)
  const [idx0, setIdx0] = useState(0)
  const [idx1, setIdx1] = useState(0)
  const [idx2, setIdx2] = useState(0)
  const [activeSlot0, setActiveSlot0] = useState<0 | 1>(0)
  const [activeSlot1, setActiveSlot1] = useState<0 | 1>(0)
  const [activeSlot2, setActiveSlot2] = useState<0 | 1>(0)
  const idxRef = useRef({ 0: 0, 1: 0, 2: 0 })
  idxRef.current = { 0: idx0, 1: idx1, 2: idx2 }
  const [loaded0, setLoaded0] = useState(false)
  const [loaded1, setLoaded1] = useState(false)
  const [loaded2, setLoaded2] = useState(false)

  const refsA = [ref0a, ref1a, ref2a] as const
  const refsB = [ref0b, ref1b, ref2b] as const
  const shuffled = [shuffled0, shuffled1, shuffled2] as const
  const setIdx = [setIdx0, setIdx1, setIdx2] as const
  const activeSlots = [activeSlot0, activeSlot1, activeSlot2] as const
  const setActiveSlot = [setActiveSlot0, setActiveSlot1, setActiveSlot2] as const
  const setLoaded = [setLoaded0, setLoaded1, setLoaded2] as const

  // 말하는 화자만 재생, 나머지 일시정지
  useEffect(() => {
    ;([0, 1, 2] as const).forEach((i) => {
      const refA = refsA[i].current
      const refB = refsB[i].current
      const active = activeSlots[i]
      const el = active === 0 ? refA : refB
      if (!el) return
      if (i === currentSpeakerIndex && shuffled[i].length > 0) el.play().catch(() => {})
      else {
        refA?.pause()
        refB?.pause()
      }
    })
  }, [currentSpeakerIndex, activeSlot0, activeSlot1, activeSlot2, idx0, idx1, idx2])

  const goNext = useCallback((personaIndex: 0 | 1 | 2) => {
    const list = shuffled[personaIndex]
    if (list.length <= 1) return
    const cur = idxRef.current[personaIndex]
    const next = (cur + 1) % list.length
    const inactive = activeSlots[personaIndex] === 0 ? 1 : 0
    const refInactive = inactive === 0 ? refsA[personaIndex] : refsB[personaIndex]
    const el = refInactive.current
    if (el) {
      el.src = list[next]
      el.currentTime = 0
      const onReady = () => {
        el.removeEventListener('canplay', onReady)
        el.removeEventListener('error', onReady)
        setIdx[personaIndex](next)
        setActiveSlot[personaIndex](inactive)
        if (personaIndex === currentSpeakerIndex) el.play().catch(() => {})
      }
      el.addEventListener('canplay', onReady, { once: true })
      el.addEventListener('error', onReady, { once: true })
      el.load()
    }
  }, [currentSpeakerIndex, shuffled0, shuffled1, shuffled2, activeSlot0, activeSlot1, activeSlot2])

  useEffect(() => {
    const cleanups: (() => void)[] = []
    ;([0, 1, 2] as const).forEach((i) => {
      const refA = refsA[i].current
      const refB = refsB[i].current
      const list = shuffled[i]
      if (!refA || !refB || list.length <= 1) return
      const onEnded = () => goNext(i as 0 | 1 | 2)
      refA.addEventListener('ended', onEnded)
      refB.addEventListener('ended', onEnded)
      cleanups.push(() => {
        refA.removeEventListener('ended', onEnded)
        refB.removeEventListener('ended', onEnded)
      })
    })
    return () => cleanups.forEach((c) => c())
  }, [goNext])

  useEffect(() => {
    ;([0, 1, 2] as const).forEach((i) => {
      if (shuffled[i].length > 0) setLoaded[i](true)
    })
  }, [shuffled0.join('|'), shuffled1.join('|'), shuffled2.join('|')])

  const hasAny = videoUrlsByPersona.some((arr) => Array.isArray(arr) && arr.filter((u) => typeof u === 'string' && (u as string).trim()).length > 0)
  const videoTransitionClass = 'absolute inset-0 w-full h-full object-cover transition-opacity duration-[480ms] ease-out'
  if (!hasAny) {
    return (
      <div className="w-full rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center py-12 aspect-square max-w-md mx-auto">
        <p className="text-gray-400 text-sm">영상이 등록되지 않았습니다.</p>
      </div>
    )
  }

  const cellClass = 'relative w-full overflow-hidden bg-black'
  return (
    <div className="w-full grid grid-cols-3 gap-0 aspect-square [contain:layout_paint]">
      {([0, 1, 2] as const).map((i) => {
        const list = shuffled[i]
        const idx = [idx0, idx1, idx2][i]
        const active = activeSlots[i]
        const len = Math.max(1, list.length)
        const srcA = active === 0 ? (list[idx] ?? '') : (list[(idx + 1) % len] ?? '')
        const srcB = active === 1 ? (list[idx] ?? '') : (list[(idx + 1) % len] ?? '')
        const isSpeaking = i === currentSpeakerIndex
        return (
          <div
            key={i}
            className={cellClass}
            style={{
              transform: isSpeaking ? 'scale(1.08)' : 'scale(0.96)',
              transition: 'transform 0.4s cubic-bezier(0.4,0,0.2,1)',
              zIndex: isSpeaking ? 2 : 1,
              borderRadius: isSpeaking ? '8px' : '0px',
            }}
          >
            {list.length > 0 ? (
              <>
                <video
                  ref={refsA[i]}
                  src={srcA}
                  muted
                  playsInline
                  preload="auto"
                  loop={list.length <= 1}
                  className={videoTransitionClass}
                  style={{ opacity: active === 0 ? 1 : 0, zIndex: active === 0 ? 1 : 0, objectFit: 'cover' }}
                />
                <video
                  ref={refsB[i]}
                  src={srcB}
                  muted
                  playsInline
                  preload="auto"
                  loop={list.length <= 1}
                  className={videoTransitionClass}
                  style={{ opacity: active === 1 ? 1 : 0, zIndex: active === 1 ? 1 : 0, objectFit: 'cover' }}
                />
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <span className="text-gray-500 text-xs">영상 없음</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* 만세력 스타일 (voice-mvp에서 가져옴). 모바일: 가로 스크롤 없이 폰트/패딩 축소로 맞춤 */
const MANSE_STYLES = `
.voice-result-manse .manse-ryeok-container { overflow-x: hidden !important; max-width: 100% !important; }
.voice-result-manse .manse-header-line {
  display: flex !important; flex-direction: column !important; gap: 6px !important;
  align-items: center !important; justify-content: center !important; text-align: center !important;
  padding: 10px 12px !important; margin: 0 0 10px 0 !important; border-radius: 14px !important;
  border: 1px solid rgba(245, 158, 11, 0.25) !important;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 251, 235, 0.9) 100%) !important;
  max-width: 100% !important;
}
.voice-result-manse .manse-header-name {
  font-size: 1.35rem !important; font-weight: 800 !important; color: #111827 !important; line-height: 1.2 !important;
}
.voice-result-manse .manse-header-badges {
  display: flex !important; flex-wrap: wrap !important; gap: 6px !important;
  justify-content: center !important; align-items: center !important; max-width: 100% !important;
}
.voice-result-manse .manse-header-badge {
  display: inline-flex !important; align-items: center !important; gap: 6px !important;
  padding: 6px 10px !important; border-radius: 9999px !important;
  border: 1px solid rgba(209, 213, 219, 0.8) !important; background: rgba(255, 255, 255, 0.75) !important;
  color: #374151 !important; font-size: 0.85rem !important; line-height: 1 !important;
  max-width: 100% !important; white-space: nowrap !important;
}
.voice-result-manse .manse-header-badge strong { color: #111827 !important; font-weight: 800 !important; }
.voice-result-manse .manse-ryeok-container {
  padding: 8px !important;
  background: linear-gradient(135deg, rgba(212, 168, 83, 0.05) 0%, rgba(139, 90, 43, 0.03) 100%) !important;
  border-radius: 20px !important; width: 100% !important; max-width: 100% !important;
  overflow-x: hidden !important; box-sizing: border-box !important;
}
.voice-result-manse .manse-ryeok-table,
.voice-result-manse .manse-ryeok-container .manse-ryeok-table,
.voice-result-manse .manse-ryeok-container table {
  width: 100% !important; border-collapse: separate !important; border-spacing: 0 !important;
  background: linear-gradient(135deg, #fefbf3 0%, #faf6eb 50%, #f5efe0 100%) !important;
  border-radius: 16px !important; overflow: hidden !important;
  box-shadow: 0 4px 20px rgba(139, 90, 43, 0.12), 0 2px 8px rgba(139, 90, 43, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
  border: 2px solid transparent !important; background-clip: padding-box !important;
  position: relative !important; margin: 1.5rem 0 !important;
  table-layout: fixed !important;
}
.voice-result-manse .manse-ryeok-table th,
.voice-result-manse .manse-ryeok-container .manse-ryeok-table th {
  background: linear-gradient(180deg, #8b5a2b 0%, #6d4422 100%) !important; color: #fef8e8 !important;
  font-weight: 700 !important; padding: 12px 8px !important; text-align: center !important;
  font-size: 0.8rem !important; letter-spacing: 0.05em !important;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important; border-bottom: 2px solid #d4a853 !important; white-space: nowrap !important;
}
.voice-result-manse .manse-ryeok-table td,
.voice-result-manse .manse-ryeok-container .manse-ryeok-table td {
  padding: 12px 8px !important; text-align: center !important; font-size: 0.9rem !important;
  font-weight: 600 !important; color: #4a3520 !important;
  border-bottom: 1px solid rgba(139, 90, 43, 0.15) !important; background: transparent !important;
  position: relative !important; white-space: nowrap !important; vertical-align: middle !important;
}
.voice-result-manse .manse-two-line { display: inline-block !important; white-space: normal !important; line-height: 1.15 !important; }
.voice-result-manse .manse-two-line-kor { display: block !important; font-weight: 700 !important; line-height: 1.15 !important; }
.voice-result-manse .manse-two-line-hanja { display: block !important; font-weight: 600 !important; opacity: 0.9 !important; line-height: 1.15 !important; margin-top: 2px !important; }
.voice-result-manse .manse-element-wood { color: #1e40af !important; }
.voice-result-manse .manse-element-fire { color: #991b1b !important; }
.voice-result-manse .manse-element-earth { color: #d97706 !important; }
.voice-result-manse .manse-element-metal { color: #6b7280 !important; }
.voice-result-manse .manse-element-water { color: #1f2937 !important; }
.voice-result-manse .manse-ganzi-char { font-size: 1.2em !important; font-weight: 700 !important; }
@media (max-width: 639px) {
  .voice-result-manse .manse-ryeok-container { overflow-x: hidden !important; }
  .voice-result-manse .manse-header-line { padding: 8px 10px !important; }
  .voice-result-manse .manse-header-name { font-size: 1.1rem !important; }
  .voice-result-manse .manse-header-badge { padding: 4px 8px !important; font-size: 0.75rem !important; }
  .voice-result-manse .manse-ryeok-table th,
  .voice-result-manse .manse-ryeok-container .manse-ryeok-table th {
    padding: 6px 4px !important; font-size: 0.6rem !important;
  }
  .voice-result-manse .manse-ryeok-table td,
  .voice-result-manse .manse-ryeok-container .manse-ryeok-table td {
    padding: 6px 4px !important; font-size: 0.65rem !important;
  }
  .voice-result-manse .manse-ganzi-char { font-size: 0.95em !important; }
  .voice-result-manse .manse-two-line-kor,
  .voice-result-manse .manse-two-line-hanja { font-size: 0.85em !important; }
}
`

/* ── 캔버스 기반 오디오 이퀄라이저: 좌=내 목소리(시안), 우=AI(보라) 시각적 구분 ─────────────────── */
const BAR_COUNT = 48
const HALF_BARS = BAR_COUNT / 2
const DECAY = 0.92
const RISE = 0.35

function AudioEqualizer({
  inVolume,
  outVolume,
  inLabel,
  outLabel,
}: {
  inVolume: number
  outVolume: number
  inLabel: string
  outLabel: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const barsInRef = useRef<number[]>(new Array(HALF_BARS).fill(0))
  const barsOutRef = useRef<number[]>(new Array(HALF_BARS).fill(0))
  const rafRef = useRef<number>(0)
  const inRef = useRef(0)
  const outRef = useRef(0)

  inRef.current = inVolume
  outRef.current = outVolume

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    const w = rect.width
    const h = rect.height

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.scale(dpr, dpr)
    }
    ctx.clearRect(0, 0, w, h)

    const scaleVol = (v: number) => {
      const x = Number.isFinite(v) ? Math.max(0, v) : 0
      return Math.min(1, Math.log10(1 + x * 50) / Math.log10(51))
    }
    const inPct = scaleVol(inRef.current)
    const outPct = scaleVol(outRef.current)

    const halfW = w / 2
    const gap = 2
    const totalGapLeft = (HALF_BARS - 1) * gap
    const totalGapRight = (HALF_BARS - 1) * gap
    const barWLeft = Math.max(2, (halfW - 4 - totalGapLeft) / HALF_BARS)
    const barWRight = Math.max(2, (halfW - 4 - totalGapRight) / HALF_BARS)
    const maxH = h - 22

    const drawHalf = (
      bars: number[],
      pct: number,
      startX: number,
      barW: number,
      isLeft: boolean
    ) => {
      const half = HALF_BARS / 2
      for (let i = 0; i < HALF_BARS; i++) {
        if (pct < 0.01) {
          bars[i] = 0
        } else {
          const distFromCenter = Math.abs(i - half) / half
          const envelope = 1 - distFromCenter * distFromCenter * 0.5
          const noise = 0.65 + Math.random() * 0.35
          const target = pct * envelope * noise * maxH * 0.92
          if (target > bars[i]) {
            bars[i] = bars[i] + (target - bars[i]) * RISE
          } else {
            bars[i] = bars[i] * DECAY
          }
          if (bars[i] < 2) bars[i] = 2 + Math.random() * 4
        }
      }
      for (let i = 0; i < HALF_BARS; i++) {
        const x = startX + i * (barW + gap)
        const barH = Math.max(0, bars[i])
        const y = maxH - barH
        const grad = ctx.createLinearGradient(x, y, x, maxH)
        if (isLeft) {
          grad.addColorStop(0, '#22d3ee')
          grad.addColorStop(0.4, '#06b6d4')
          grad.addColorStop(0.8, '#0891b2')
          grad.addColorStop(1, '#0e7490')
        } else {
          grad.addColorStop(0, '#c084fc')
          grad.addColorStop(0.35, '#a855f7')
          grad.addColorStop(0.7, '#7c3aed')
          grad.addColorStop(1, '#6d28d9')
        }
        ctx.fillStyle = grad
        ctx.beginPath()
        const r = Math.min(barW / 2, 3)
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + barW - r, y)
        ctx.quadraticCurveTo(x + barW, y, x + barW, y + r)
        ctx.lineTo(x + barW, maxH)
        ctx.lineTo(x, maxH)
        ctx.lineTo(x, y + r)
        ctx.quadraticCurveTo(x, y, x + r, y)
        ctx.fill()
        if (barH > 10) {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.fillRect(x + 1, y, barW - 2, 2)
        }
      }
    }

    // 좌 = AI(보라), 우 = 내 목소리(시안)
    drawHalf(barsOutRef.current, outPct, 2, barWLeft, false)
    drawHalf(barsInRef.current, inPct, halfW + 2, barWRight, true)

    // 중앙 구분선 (누가 누구인지 한눈에)
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(halfW, 0)
    ctx.lineTo(halfW, maxH)
    ctx.stroke()

    // 라벨: 좌 하단 = AI(보라 톤), 우 하단 = 내 목소리(시안 톤)
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#a855f7'
    ctx.fillText(outLabel, 4, h - 5)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#22d3ee'
    ctx.fillText(inLabel, w - 4, h - 5)

    rafRef.current = requestAnimationFrame(draw)
  }, [inLabel, outLabel])

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(rafRef.current)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="w-full"
      style={{ height: 72, background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}
    />
  )
}

export default function VoiceResultContent() {
  const h = useVoiceResult()
  const [shareUrl, setShareUrl] = useState('')
  useEffect(() => {
    if (typeof window !== 'undefined') setShareUrl(window.location.href)
  }, [])

  if (h.loading) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500 mx-auto mb-3" />
          <p className="text-gray-500">음성 준비 중...</p>
        </div>
      </div>
    )
  }

  if (h.error && !h.contentData) {
    return (
      <div className="min-h-screen bg-white text-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md px-4">
          <p className="text-red-500 mb-4">{h.error}</p>
          <button
            type="button"
            onClick={h.requestLeave}
            className="inline-flex items-center px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium"
          >
            돌아가기
          </button>
        </div>
      </div>
    )
  }

  // 캐시 표시: 잔액 있으면 balanceWan, 없으면 남은초에서 환산
  const timeOpts = h.contentData?.content_type === 'multi' && Array.isArray((h.contentData as any)?.multi_time_options)
    ? (h.contentData as any).multi_time_options
    : Array.isArray(h.contentData?.voice_time_options)
      ? h.contentData.voice_time_options
      : []
  const chargeOpt = (timeOpts as any[]).find((o: any) => o?.type === 'charge') ?? null
  const rateSeconds = chargeOpt != null && Number(chargeOpt.rate_seconds) > 0 ? Number(chargeOpt.rate_seconds) : 12
  const rateWon = chargeOpt != null && Number(chargeOpt.rate_won) > 0 ? Number(chargeOpt.rate_won) : 19
  const displayCache = (h.balanceWan != null && h.balanceWan > 0)
    ? h.balanceWan
    : (h.balanceModeForDisplay && (h.balanceWan ?? 0) === 0)
      ? 0
      : Math.floor(h.remainingSeconds / rateSeconds) * rateWon
  return (
    <div className="min-h-screen bg-white text-gray-900 flex flex-col">
      {/* 상단 바 */}
      <header className="w-full bg-white/90 backdrop-blur border-b border-gray-200">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={h.requestLeave}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="이전"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={h.requestLeave}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-600"
              aria-label="홈"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </button>
          </div>
          <h2 className="text-lg font-bold text-gray-900 truncate min-w-0 flex-1 text-center">{h.contentData?.content_name || '음성 상담'}</h2>
          <div className="flex items-center shrink-0 justify-end">
            <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
              displayCache <= 100
                ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                : displayCache <= 300
                  ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200'
                  : 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200'
            }`}>
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><circle cx="10" cy="10" r="8" opacity=".15"/><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.35c.164.55.386 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a5.389 5.389 0 01-.497-.969L10 12.021h2a1 1 0 000-2h-2.38a7.308 7.308 0 010-1.002L12 9a1 1 0 100-2H9.236a5.389 5.389 0 01.5-.021z" /></svg>
              {displayCache} 캐시
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-4 gap-4">
        {/* 에러 */}
        {h.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{h.error}</div>
        ) : null}

        {/* 잔여금액 라운드 박스: 표시하지 않음 */}
        {null}

        {/* 상담사 영상: 복수 시 세션당 하나 랜덤 선택 후 해당 동영상만 반복 재생. DCC 음성과 동시 재생 시 메인 스레드/GPU 경쟁 완화 위해 레이어 분리 */}
        {h.contentData?.content_type === 'multi' ? (
          <MultiAdvisorVideoBlock
            videoUrlsByPersona={[
              /* 세그먼트1(페르소나1) = admin 상담사 동영상 1번 → 왼쪽 칸 */
              Array.isArray(h.contentData?.multi_advisor_video_urls_1) ? [...h.contentData.multi_advisor_video_urls_1] : [],
              /* 세그먼트2(페르소나2) = admin 상담사 동영상 2번 → 가운데 칸 */
              Array.isArray(h.contentData?.multi_advisor_video_urls_2) ? [...h.contentData.multi_advisor_video_urls_2] : [],
              /* 세그먼트3(페르소나3) = admin 상담사 동영상 3번 → 오른쪽 칸 */
              Array.isArray(h.contentData?.multi_advisor_video_urls_3) ? [...h.contentData.multi_advisor_video_urls_3] : [],
            ]}
            currentSpeakerIndex={h.currentSpeakerIndex ?? 0}
          />
        ) : (
          <VoiceAdvisorVideoBlock rawVideoUrl={h.contentData?.voice_advisor_video_url} />
        )}

        {/* 모바일 볼륨 안내 */}
        <p className="text-gray-500 text-xs text-center md:hidden">
          모바일에서 볼륨 키는 통화 음량을 조절합니다. 미디어 음량으로 들으시려면 기기에서 볼륨 키를 누른 뒤 표시되는 음량 종류(미디어/통화)를 바꿔 보세요.
        </p>
        {/* 오디오 이퀄라이저 */}
        <div className="overflow-hidden">
          <AudioEqualizer
            inVolume={h.inVolume}
            outVolume={h.outVolume}
            inLabel="내 목소리"
            outLabel={
              h.contentData?.content_type === 'multi'
                ? (([h.contentData?.multi_persona_1_name, h.contentData?.multi_persona_2_name, h.contentData?.multi_persona_3_name][h.currentSpeakerIndex ?? 0] ?? '')?.trim() || `상담사 ${(h.currentSpeakerIndex ?? 0) + 1}`)
                : (h.contentData?.voice_counselor_name || 'AI 상담사')
            }
          />
        </div>

        {/* 마이크 민감도 */}
        <div className="flex items-center gap-2 flex-nowrap min-w-0">
          <span className="text-gray-500 text-sm shrink-0">마이크 민감도</span>
          <input
            type="range"
            min={0}
            max={100}
            value={h.micSensitivity ?? 50}
            onChange={(e) => h.setMicSensitivity?.(Number(e.target.value))}
            className="flex-1 min-w-0 h-2 rounded-full appearance-none bg-gray-200 accent-violet-500"
          />
          <span className="text-gray-400 text-xs shrink-0 tabular-nums">{h.micSensitivity ?? 50}%</span>
        </div>

        {/* 내가 말한 STT 텍스트 */}
        {(() => {
          const raw = (h.lastUserSttText ?? '').trim()
          const displayText = raw === '[시작]' ? '(내 말풍선)' : raw
          return displayText ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 min-w-0">
              <p className="text-gray-700 text-sm break-words">{displayText}</p>
            </div>
          ) : null
        })()}

        {/* 음성 서비스 이용 안내 */}
        <p className="text-gray-500 text-xs leading-relaxed text-center">
          음성 서비스 이용 중에는 다른 작동(화면캡쳐/리프레시/통화 등)을 하지 마세요. 네트워크 단절 현상이 발생할 수 있습니다.
        </p>

        {/* 사주 만세력 (접기/펼치기) — 마이크 민감도 아래, 8006/무료속성이 아닐 때만 표시 */}
        {!isPpoingAttributes(h.contentData) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl overflow-hidden voice-result-manse min-w-0">
          <style dangerouslySetInnerHTML={{ __html: MANSE_STYLES }} />
          <button
            type="button"
            onClick={() => h.setShowManse((v: boolean) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-100 transition"
          >
            <span className="font-bold text-gray-700 text-sm">사주 만세력</span>
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 shrink-0 ${h.showManse ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {h.showManse ? (
            <div className="px-4 pb-4 min-w-0 overflow-hidden">
              {h.manseBlockHtml ? (
                <div className="w-full max-w-full overflow-hidden" dangerouslySetInnerHTML={{ __html: h.manseBlockHtml }} />
              ) : (
                <p className="text-gray-500 text-sm py-2">생년월일 정보가 없어 만세력을 표시할 수 없습니다.</p>
              )}
            </div>
          ) : null}
        </div>
        )}

        {/* 종료 / 상담시간 연장하기 — 만세력과 소셜 버튼 사이 영역 (상담시간 연장 버튼은 비활성화) */}
        <div className="flex-1 flex flex-col justify-center items-center min-h-0 py-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
          {(h.savingConversation || h.isNavigatingAway) ? (
            <div className="w-full flex flex-col items-center gap-3 py-6">
              <svg className="animate-spin w-8 h-8 text-violet-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-gray-600 font-semibold text-base">음성 내용 저장 중...</span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={h.onExitClick}
                disabled={h.savingConversation}
                className="group relative overflow-hidden rounded-xl transition-all duration-300 active:scale-[0.97] disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200 group-hover:from-gray-200 group-hover:to-gray-300 transition-all duration-300" />
                <div className="relative flex items-center justify-center gap-1.5 py-2.5 px-4">
                  {h.savingConversation ? (
                    <svg className="animate-spin w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" />
                    </svg>
                  )}
                  <span className="text-gray-700 font-semibold text-[13px]">
                    {h.savingConversation ? '저장 중...' : '종료'}
                  </span>
                </div>
              </button>
            </>
          )}
          </div>
        </div>

        {/* 스크린 하단: 소셜 공유 버튼 비활성화 */}
        {false && (
        <div className="relative z-10 mt-auto pt-4 pb-4 flex flex-col items-center w-full min-w-0">
          <SocialShareButtons
            url={shareUrl || undefined}
            title={h.contentData?.content_name ? `${h.contentData.content_name} 음성상담` : '음성상담'}
            size={36}
            className="w-full justify-center"
          />
        </div>
        )}
      </main>

      {/* 무료 캐시 연장 팝업 — 음성형·다자형 동일 (무료시작 1회만) */}
      {h.showFreeExtendPopup ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9998] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">무료 연장</h2>
              <button
                type="button"
                onClick={h.dismissFreeExtendPopup}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm mb-6">
                캐시가 곧 소진됩니다. 무료 캐시 연장을 사용할 수 있습니다. (이번 이용 중 1회)
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={h.handleFreeExtend1Min}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all"
                >
                  무료 캐시 연장
                </button>
                <button
                  type="button"
                  onClick={h.dismissFreeExtendPopup}
                  className="px-4 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-all"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 캐시 충전/연장 팝업 — 음성형·다자형 동일 UI (다자형은 충전형만 표시) */}
      {h.showExtendPopup ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 - 폼 결제정보와 동일 */}
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">캐시 충전</h2>
              <button
                type="button"
                onClick={h.dismissExtendPopup}
                disabled={h.extendPaymentProcessing}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors disabled:opacity-70"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* 안내 섹션 - 버튼으로 연 경우 '캐시 소진 종료' 메시지 박스 숨김 */}
              {!h.extendPopupOpenedByButton && (
                <div className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm">
                    {((h.balanceWan ?? 0) > 0)
                      ? '캐시가 소진되면 음성이 종료됩니다.'
                      : '캐시가 소진되어 음성이 종료되었습니다.'}
                    {' '}원하는 충전을 선택해 주세요.
                  </p>
                </div>
              )}

              {/* 현재 잔액 (충전식, 0원일 때는 표시하지 않음) */}
              {(() => {
                const timeOpts = h.contentData?.content_type === 'multi' && Array.isArray((h.contentData as any)?.multi_time_options)
                  ? (h.contentData as any).multi_time_options
                  : Array.isArray(h.contentData?.voice_time_options)
                    ? h.contentData.voice_time_options
                    : []
                const chargeOpt = (timeOpts as any[]).find((o: any) => o?.type === 'charge') ?? null
                const bal = h.balanceWan ?? 0
                if (bal <= 0) return null
                const rateSeconds = chargeOpt != null && Number(chargeOpt.rate_seconds) > 0 ? Number(chargeOpt.rate_seconds) : 0
                const rateWon = chargeOpt != null && Number(chargeOpt.rate_won) > 0 ? Number(chargeOpt.rate_won) : 0
                const rateText = rateSeconds > 0 && rateWon > 0 ? ` (차감주기 ${rateSeconds}초당 ${rateWon}원)` : ''
                return (
                  <p className="text-sm text-gray-600 mb-4">
                    잔여 캐시 <span className="font-bold text-violet-600">{bal.toLocaleString()}원</span>
                    {rateText}
                  </p>
                )
              })()}

            {/* 연장 옵션(extension) + 충전(charge) — 다자형은 충전형만 표시 */}
            {(() => {
              const opts = h.contentData?.content_type === 'multi' && Array.isArray((h.contentData as any)?.multi_time_options)
                ? (h.contentData as any).multi_time_options
                : Array.isArray(h.contentData?.voice_time_options)
                  ? h.contentData.voice_time_options
                  : []
              const isMulti = h.contentData?.content_type === 'multi'
              const extensionOpts = isMulti ? [] : opts.filter((o: any) => o?.type === 'extension' || (o?.price > 0 && o?.type !== 'charge' && o?.type !== 'default'))
              const chargeOpt = opts.find((o: any) => o?.type === 'charge') as { rate_seconds?: number; rate_won?: number; price?: number; label?: string; minutes?: number; seconds?: number } | undefined
              const rateSeconds = chargeOpt != null && Number(chargeOpt?.rate_seconds) > 0 ? Number(chargeOpt?.rate_seconds) : 0
              const rateWon = chargeOpt != null && Number(chargeOpt?.rate_won) > 0 ? Number(chargeOpt?.rate_won) : 0
              const chargePrice = Number(chargeOpt?.price) ?? 1000
              const chargeMin = chargeOpt != null ? (Number(chargeOpt?.minutes) || 0) : 0
              const chargeSec = chargeOpt != null ? (Number(chargeOpt?.seconds) ?? 0) : 0
              const chargeTimeLabel = chargeMin > 0 || chargeSec > 0 ? (chargeSec > 0 ? `${chargeMin}분 ${chargeSec}초` : `${chargeMin}분`) : ''
              const chargeLabel = (chargeOpt != null && (chargeOpt?.label ?? '').trim() !== '') ? String(chargeOpt?.label ?? '').trim() : (rateSeconds > 0 && rateWon > 0 ? `${chargePrice.toLocaleString()}원 충전 (${rateSeconds}초당 ${rateWon}원)` + (chargeTimeLabel ? ` · ${chargeTimeLabel}` : '') : `${chargePrice.toLocaleString()}원 충전` + (chargeTimeLabel ? ` (${chargeTimeLabel})` : ''))
              return (extensionOpts.length > 0 || true) ? (
              <div className="space-y-2 mb-5">
                {extensionOpts.map((opt: { minutes: number; seconds?: number; price: number; label: string }, idx: number) => {
                  const isSelected = !(opt as any).charge && h.selectedExtendOption?.minutes === opt.minutes && (h.selectedExtendOption?.seconds ?? 0) === (opt.seconds ?? 0) && h.selectedExtendOption?.price === opt.price
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => h.setSelectedExtendOption(opt)}
                      disabled={h.extendPaymentProcessing}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                        isSelected
                          ? 'border-violet-500 bg-violet-50'
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      } ${h.extendPaymentProcessing ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-violet-500' : 'border-gray-300'
                        }`}>
                          {isSelected ? <div className="w-2.5 h-2.5 rounded-full bg-violet-500" /> : null}
                        </div>
                        <span className={`font-semibold text-[15px] ${isSelected ? 'text-violet-700' : 'text-gray-800'}`}>
                          {opt.label}
                        </span>
                      </div>
                      <span className={`font-bold text-[15px] ${isSelected ? 'text-violet-600' : 'text-gray-600'}`}>
                        {opt.price.toLocaleString()}원
                      </span>
                    </button>
                  )
                })}
                {/* 충전: admin/form/voice 충전시간 라벨·가격·차감 단위 연동 */}
                {(() => {
                  const chargeOption = { minutes: 0, seconds: 0, price: chargePrice, label: chargeLabel, charge: true as const }
                  const isChargeSelected = h.selectedExtendOption?.charge === true
                  return (
                    <button
                      key="charge"
                      type="button"
                      onClick={() => h.setSelectedExtendOption(chargeOption)}
                      disabled={h.extendPaymentProcessing}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                        isChargeSelected ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      } ${h.extendPaymentProcessing ? 'opacity-50 pointer-events-none' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isChargeSelected ? 'border-violet-500' : 'border-gray-300'}`}>
                          {isChargeSelected ? <div className="w-2.5 h-2.5 rounded-full bg-violet-500" /> : null}
                        </div>
                        <span className={`font-semibold text-[15px] ${isChargeSelected ? 'text-violet-700' : 'text-gray-800'}`}>
                          {chargeLabel}
                        </span>
                      </div>
                      <span className={`font-bold text-[15px] ${isChargeSelected ? 'text-violet-600' : 'text-gray-600'}`}>
                        {chargePrice.toLocaleString()}원
                      </span>
                    </button>
                  )
                })()}
              </div>
            ) : (
              <div className="space-y-2 mb-5">
                <button
                  type="button"
                  onClick={() => h.setSelectedExtendOption({ minutes: 0, seconds: 0, price: chargePrice, label: chargeLabel, charge: true })}
                  disabled={h.extendPaymentProcessing}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all ${
                    h.selectedExtendOption?.charge ? 'border-violet-500 bg-violet-50' : 'border-gray-200 bg-white hover:border-gray-300'
                  } ${h.extendPaymentProcessing ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <span className="font-semibold text-[15px]">{chargeLabel}</span>
                  <span className="font-bold text-[15px]">{chargePrice.toLocaleString()}원</span>
                </button>
              </div>
            );
            })()}

            {/* 유료 선택 시 결제 방식 선택 (카드 / 휴대폰) */}
            {((h.selectedExtendOption?.price ?? 0) > 0) && (
              <div className="mb-5">
                <p className="text-sm font-semibold text-gray-700 mb-2">결제 방식</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => h.setExtendPaymentMethod('card')}
                    disabled={h.extendPaymentProcessing}
                    className={`flex-1 py-2.5 rounded-xl border-2 font-medium transition-all disabled:opacity-50 ${
                      h.extendPaymentMethod === 'card'
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    카드결제
                  </button>
                  <button
                    type="button"
                    onClick={() => h.setExtendPaymentMethod('mobile')}
                    disabled={h.extendPaymentProcessing}
                    className={`flex-1 py-2.5 rounded-xl border-2 font-medium transition-all disabled:opacity-50 ${
                      h.extendPaymentMethod === 'mobile'
                        ? 'border-violet-500 bg-violet-50 text-violet-700'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    휴대폰결제
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  if (h.selectedExtendOption) h.handleExtendPayment(h.selectedExtendOption, (h.selectedExtendOption?.price ?? 0) > 0 ? h.extendPaymentMethod : undefined)
                }}
                disabled={!h.selectedExtendOption || h.extendPaymentProcessing}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-bold transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                {h.extendPaymentProcessing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {((h.selectedExtendOption?.price ?? 0) <= 0) ? '추가 중...' : '결제 진행 중...'}
                  </span>
                ) : '결제하기'}
              </button>
              <button
                type="button"
                onClick={h.dismissExtendPopup}
                disabled={h.extendPaymentProcessing}
                className="px-4 py-3 rounded-xl bg-gray-200 hover:bg-gray-300 text-gray-700 font-medium transition-all disabled:opacity-50"
              >
                닫기
              </button>
            </div>
            </div>
          </div>
        </div>
      ) : null}
      {/* 캐시 충전/연장 팝업 블록 끝 */}

      {/* 종료 버튼 확인 팝업 (폼 결제정보 팝업과 동일 스타일) */}
      {h.showExitConfirmPopup ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 - 폼 결제 팝업과 동일 */}
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">음성 종료</h2>
              <button
                type="button"
                onClick={h.handleExitConfirmContinue}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {h.isVoiceSessionChargeType && !h.isDefaultTimeOptionSession ? (
                <p className="text-gray-700 text-base mb-5">
                  잔여 캐시는 저장되며 언제든지 이어서 할 수 있습니다.
                </p>
              ) : (
                <p className="text-gray-700 text-base mb-5">
                  무료 이용 중 잔여 캐시는 종료 시 소멸됩니다.
                </p>
              )}
              <div className="flex flex-row flex-nowrap items-center gap-3">
                <button
                  type="button"
                  onClick={h.handleExitConfirmContinue}
                  className="flex-1 min-w-0 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  계속하기
                </button>
                <button
                  type="button"
                  onClick={h.handleExitConfirmExit}
                  disabled={h.savingConversation}
                  className="flex-1 min-w-0 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-4 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {h.savingConversation ? '저장 중...' : '종료하기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 점사 진행 중 나가기 방지 팝업 (결제정보 레이아웃) */}
      {h.showInProgressBlockModal ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">점사 진행 중</h2>
              <button
                type="button"
                onClick={h.handleInProgressBlockClose}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <div className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-xl p-4 mb-6">
                <p className="text-gray-700 text-sm leading-relaxed">
                  점사가 완료될 때까지 나가시면 안 됩니다. 나가시면 점사가 중지됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={h.handleInProgressBlockClose}
                className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 뿌잉 예의 위반 2회 시 상담 종료 경고 모달 */}
      {h.mannerWarningMessage ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">음성 종료 안내</h2>
            </div>
            <div className="p-6">
              <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4 mb-6">
                <p className="text-gray-800 text-sm leading-relaxed">{h.mannerWarningMessage}</p>
              </div>
              <button
                type="button"
                onClick={h.dismissMannerWarning}
                className="w-full bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* 나가기 전 저장 확인 모달 (폼 결제정보 팝업과 동일 레이아웃·톤) */}
      {h.showLeaveConfirmModal ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 - 폼 결제 팝업과 동일 */}
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">음성 내용 저장</h2>
              <button
                type="button"
                onClick={h.handleLeaveCancel}
                disabled={h.savingConversation}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors disabled:opacity-70"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              <div className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-xl p-4 mb-6">
                <p className="text-gray-700 text-sm leading-relaxed">
                  음성을 저장하면 다시듣기가 가능합니다. 다시듣기를 하시려면 반드시 저장하세요.
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={h.handleLeaveWithSave}
                  disabled={h.savingConversation}
                  className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {h.savingConversation ? '저장 중...' : '저장하고 나가기'}
                </button>
                <button
                  type="button"
                  onClick={h.handleLeaveWithoutSave}
                  disabled={h.savingConversation}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-4 px-4 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  저장 안 하고 나가기
                </button>
                <button
                  type="button"
                  onClick={h.handleLeaveCancel}
                  disabled={h.savingConversation}
                  className="w-full border-2 border-gray-200 hover:bg-gray-50 text-gray-700 font-bold py-4 px-4 rounded-xl transition-all duration-200 disabled:opacity-50"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 상담 끝남 팝업 (폼 결제정보 팝업과 동일 레이아웃) — 확인 시 폼으로 이동 */}
      {h.showConsultationEndModal ? (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
        >
          <div className="absolute inset-0 bg-black/60" aria-hidden />
          <div
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 - 폼 결제 팝업과 동일 */}
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white cursor-default">음성 종료</h2>
              <button
                type="button"
                onClick={h.handleConsultationEndConfirm}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              <div className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-xl p-4 mb-6">
                <p className="text-gray-700 text-sm leading-relaxed">
                  음성 서비스가 종료되었습니다. 저장된 내용은 나중에 다시 들을 수 있습니다.(유료에 한함)
                </p>
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={h.handleConsultationEndConfirm}
                  className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
