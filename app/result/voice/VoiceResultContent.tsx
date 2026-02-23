'use client'

import { useRef, useEffect, useCallback, useState } from 'react'
import { isPpoingAttributes } from '@/lib/voice-mvp/ppoing-rules'
import SocialShareButtons from '@/components/SocialShareButtons'
import { useVoiceResult } from './useVoiceResult'

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

/* ── 캔버스 기반 오디오 이퀄라이저 ─────────────────── */
const BAR_COUNT = 48
const DECAY = 0.92   // 바가 내려오는 속도 (높을수록 느림)
const RISE  = 0.35   // 바가 올라가는 속도

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
  const barsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0))
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

    // 볼륨 → 0~1 스케일링
    const scaleVol = (v: number) => {
      const x = Number.isFinite(v) ? Math.max(0, v) : 0
      return Math.min(1, Math.log10(1 + x * 50) / Math.log10(51))
    }
    const inPct = scaleVol(inRef.current)
    const outPct = scaleVol(outRef.current)
    const combined = Math.max(inPct, outPct)

    const bars = barsRef.current
    const half = BAR_COUNT / 2
    const gap = 2
    const totalGap = (BAR_COUNT - 1) * gap
    const barW = Math.max(2, (w - totalGap) / BAR_COUNT)
    const maxH = h - 20 // 라벨 공간

    // 각 바의 목표 높이 계산 (중앙이 높고 가장자리가 낮은 형태 + 랜덤 변동)
    for (let i = 0; i < BAR_COUNT; i++) {
      const distFromCenter = Math.abs(i - half) / half
      const envelope = 1 - distFromCenter * distFromCenter * 0.6
      const noise = 0.6 + Math.random() * 0.4
      const target = combined * envelope * noise * maxH * 0.9
      if (target > bars[i]) {
        bars[i] = bars[i] + (target - bars[i]) * RISE
      } else {
        bars[i] = bars[i] * DECAY
      }
      if (bars[i] < 2) bars[i] = combined > 0.01 ? 2 + Math.random() * 4 : 2
    }

    // 그라데이션 색상 그리기
    for (let i = 0; i < BAR_COUNT; i++) {
      const x = i * (barW + gap)
      const barH = Math.max(2, bars[i])
      const y = maxH - barH

      // 수직 그라데이션: 위(따뜻한 색) → 아래(차가운 색)
      const grad = ctx.createLinearGradient(x, y, x, maxH)
      const ratio = i / BAR_COUNT

      if (ratio < 0.25) {
        // 왼쪽: 골드/옐로우 → 시안
        grad.addColorStop(0, '#f59e0b')
        grad.addColorStop(0.4, '#f97316')
        grad.addColorStop(0.7, '#06b6d4')
        grad.addColorStop(1, '#0891b2')
      } else if (ratio < 0.5) {
        // 중앙 왼쪽: 오렌지/레드 → 시안
        grad.addColorStop(0, '#ef4444')
        grad.addColorStop(0.3, '#f97316')
        grad.addColorStop(0.6, '#06b6d4')
        grad.addColorStop(1, '#22d3ee')
      } else if (ratio < 0.75) {
        // 중앙 오른쪽: 레드/핑크 → 시안
        grad.addColorStop(0, '#ec4899')
        grad.addColorStop(0.3, '#ef4444')
        grad.addColorStop(0.6, '#0ea5e9')
        grad.addColorStop(1, '#06b6d4')
      } else {
        // 오른쪽: 퍼플/핑크 → 블루
        grad.addColorStop(0, '#a855f7')
        grad.addColorStop(0.4, '#ec4899')
        grad.addColorStop(0.7, '#6366f1')
        grad.addColorStop(1, '#3b82f6')
      }

      ctx.fillStyle = grad
      ctx.beginPath()
      const r = Math.min(barW / 2, 3)
      // 둥근 모서리 바
      ctx.moveTo(x + r, y)
      ctx.lineTo(x + barW - r, y)
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + r)
      ctx.lineTo(x + barW, maxH)
      ctx.lineTo(x, maxH)
      ctx.lineTo(x, y + r)
      ctx.quadraticCurveTo(x, y, x + r, y)
      ctx.fill()

      // 반짝이는 하이라이트 (바 상단)
      if (barH > 10) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillRect(x + 1, y, barW - 2, 2)
      }
    }

    // 하단 반사 효과 (미러)
    ctx.save()
    ctx.globalAlpha = 0.12
    ctx.scale(1, -1)
    ctx.translate(0, -(maxH * 2) - 6)
    for (let i = 0; i < BAR_COUNT; i++) {
      const x = i * (barW + gap)
      const barH = Math.min(bars[i] * 0.3, 12)
      ctx.fillStyle = `rgba(100,200,255,0.5)`
      ctx.fillRect(x, maxH - barH, barW, barH)
    }
    ctx.restore()

    // 라벨
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillStyle = '#64748b'
    ctx.fillText(inLabel, 4, h - 4)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#64748b'
    ctx.fillText(outLabel, w - 4, h - 4)

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
      style={{ height: 120, background: 'linear-gradient(180deg, #0f172a 0%, #1e293b 100%)' }}
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
          <p className="text-gray-500">상담 준비 중...</p>
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

  const timerColor = h.remainingSeconds <= 30
    ? 'text-red-400'
    : h.remainingSeconds <= 60
      ? 'text-yellow-400'
      : 'text-emerald-400'

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
          <div className="flex items-center gap-3 shrink-0 w-14 justify-end">
            <span className={`font-mono font-bold text-lg ${timerColor}`}>
              {h.formatTime(h.remainingSeconds)}
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 py-4 gap-4">
        {/* 에러 */}
        {h.error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-600 text-sm">{h.error}</div>
        ) : null}

        {/* 상담사 영상: DCC 음성과 동시 재생 시 메인 스레드/GPU 경쟁으로 끊김이나 영상 멈춤 가능(과부하). 별도 레이어로 분리해 완화 */}
        {h.contentData?.voice_advisor_video_url ? (
          <div className="w-full overflow-hidden rounded-2xl [contain:layout_paint] [will-change:transform]">
            <video
              src={h.contentData.voice_advisor_video_url}
              autoPlay
              loop
              muted
              playsInline
              className="w-full object-cover"
              preload="auto"
            />
          </div>
        ) : (
          <div className="w-full rounded-2xl bg-gray-100 border border-gray-200 flex items-center justify-center py-12">
            <p className="text-gray-400 text-sm">상담사 영상이 등록되지 않았습니다.</p>
          </div>
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
            outLabel={h.contentData?.voice_counselor_name || 'AI 상담사'}
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

        {/* 종료 / 상담시간 연장하기 — 마이크 민감도와 소셜 버튼 사이 영역에서 비율로 가운데 */}
        <div className="flex-1 flex flex-col justify-center items-center min-h-0 py-4">
          <div className="flex flex-wrap items-center justify-center gap-3">
          {(h.savingConversation || h.isNavigatingAway) ? (
            <div className="w-full flex flex-col items-center gap-3 py-6">
              <svg className="animate-spin w-8 h-8 text-violet-500" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-gray-600 font-semibold text-base">상담 내용 저장 중...</span>
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
              {h.connected && (
                <button
                  type="button"
                  onClick={h.openExtendPopupByButton}
                  disabled={h.savingConversation}
                  className="group relative overflow-hidden rounded-xl transition-all duration-300 active:scale-[0.97] disabled:opacity-50"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-pink-500 to-pink-600 group-hover:from-pink-600 group-hover:to-pink-700 transition-all duration-300" />
                  <div className="relative flex items-center justify-center gap-1.5 py-2.5 px-4">
                    <span className="text-white font-semibold text-[13px]">상담시간 연장하기</span>
                  </div>
                </button>
              )}
            </>
          )}
          </div>
        </div>

        {/* 만세력 (접기/펼치기) — 8006/무료속성이 아닐 때만 표시 */}
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

        {/* 스크린 하단: 소셜 공유 버튼 (종료 버튼 아래, 클릭 보장을 위해 relative z-10) */}
        <div className="relative z-10 mt-auto pt-4 pb-4 flex flex-col items-center w-full min-w-0">
          <SocialShareButtons
            url={shareUrl || undefined}
            title={h.contentData?.content_name ? `${h.contentData.content_name} 음성상담` : '음성상담'}
            size={36}
            className="w-full justify-center"
          />
        </div>
      </main>

      {/* 1분 무료 연장 팝업 (무료시작 1회만, 팝업 떠 있어도 타이머 계속) */}
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
                상담 시간이 곧 끝납니다. 1분 무료 연장을 사용할 수 있습니다. (이번 상담 중 1회)
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={h.handleFreeExtend1Min}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition-all"
                >
                  1분 무료 연장
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

      {/* 시간연장/충전 팝업 — 폼 결제정보와 동일 레이아웃: 헤더 + 본문 */}
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
              <h2 className="text-xl font-bold text-white cursor-default">상담 시간 연장</h2>
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
              {/* 안내 섹션 - 버튼으로 연 경우 '상담 시간이 종료되었습니다' 메시지 박스 숨김 */}
              {!h.extendPopupOpenedByButton && (
                <div className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-xl p-4 mb-6">
                  <p className="text-gray-700 text-sm">
                    {h.remainingSeconds > 0
                      ? `${h.remainingSeconds}초 후 상담이 종료됩니다.`
                      : '상담 시간이 종료되었습니다.'}
                    {' '}원하는 시간을 선택해 주세요.
                  </p>
                </div>
              )}

              {/* 현재 잔액 (충전식) - 12초당 18원 등 차감 단위는 콘텐츠 설정대로 표시 */}
              {(() => {
                const chargeOpt = Array.isArray(h.contentData?.voice_time_options) ? (h.contentData.voice_time_options as any[]).find((o: any) => o?.type === 'charge') : null
                const rateSeconds = chargeOpt?.rate_seconds ?? 12
                const rateWon = chargeOpt?.rate_won ?? 19
                return (h.balanceWan ?? 0) >= 0 ? (
                  <p className="text-sm text-gray-600 mb-4">현재 잔액: <span className="font-bold text-violet-600">{(h.balanceWan ?? 0).toLocaleString()}원</span> ({rateSeconds}초당 {rateWon}원 차감)</p>
                ) : null
              })()}

            {/* 시간연장 옵션(extension) + 1000원 충전(charge) */}
            {(() => {
              const opts = Array.isArray(h.contentData?.voice_time_options) ? h.contentData.voice_time_options : []
              const extensionOpts = opts.filter((o: any) => o?.type === 'extension' || (o?.price > 0 && o?.type !== 'charge' && o?.type !== 'default'))
              const chargeOpt = opts.find((o: any) => o?.type === 'charge') as { rate_seconds?: number; rate_won?: number; price?: number; label?: string } | undefined
              const rateSeconds = chargeOpt?.rate_seconds ?? 12
              const rateWon = chargeOpt?.rate_won ?? 19
              const chargePrice = Number(chargeOpt?.price) ?? 1000
              const chargeLabel = (chargeOpt?.label && String(chargeOpt.label).trim()) ? String(chargeOpt.label).trim() : `${chargePrice.toLocaleString()}원 충전 (${rateSeconds}초당 ${rateWon}원)`
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
              <h2 className="text-xl font-bold text-white cursor-default">상담 종료</h2>
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
              <p className="text-gray-700 text-base mb-2">
                상담시간이 남아 있어요. 정말로 그만 하시겠어요?
              </p>
              <p className="text-gray-500 text-sm mb-5">
                남은 시간: <span className="font-semibold text-pink-600">{h.formatTime(h.remainingSeconds)}</span>
              </p>
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
              <h2 className="text-xl font-bold text-white cursor-default">상담 종료 안내</h2>
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
              <h2 className="text-xl font-bold text-white cursor-default">상담 내용 저장</h2>
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
                  소리와 텍스트를 저장하면 나중에 다시 들어서 들을 수 있습니다. 저장하고 나가시겠어요?
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
              <h2 className="text-xl font-bold text-white cursor-default">상담 종료</h2>
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
                  상담이 끝났습니다. 저장된 내용은 나중에 다시 들어서 들을 수 있습니다.
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
