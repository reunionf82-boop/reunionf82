'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import ServiceCard from '@/components/ServiceCard'
import { getContents } from '@/lib/supabase-admin'
import TermsPopup from '@/components/TermsPopup'
import PrivacyPopup from '@/components/PrivacyPopup'
import SlideMenuBar from '@/components/SlideMenuBar'
import MyHistoryPopup from '@/components/MyHistoryPopup'

export default function Home() {
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [homeHtml, setHomeHtml] = useState<string>('')
  const [homeHtmlLoading, setHomeHtmlLoading] = useState(true)
  const [homeBgColor, setHomeBgColor] = useState<string>('')
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [showTermsPopup, setShowTermsPopup] = useState(false)
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false)
  const [showSlideMenu, setShowSlideMenu] = useState(false)
  const [showMyHistoryPopup, setShowMyHistoryPopup] = useState(false)
  const [showDevUnlockModal, setShowDevUnlockModal] = useState(false)
  const [devUnlockPasswordInput, setDevUnlockPasswordInput] = useState('')
  const [devUnlockDurationMinutes, setDevUnlockDurationMinutes] = useState<number>(60)
  const [devUnlockHideEnabled, setDevUnlockHideEnabled] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const devUnlockClickRef = useRef<{ count: number; timer: ReturnType<typeof setTimeout> | null }>({ count: 0, timer: null })

  const isEditableTarget = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof HTMLElement)) return false
    const tagName = target.tagName
    return (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
  }, [])

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleSelectStart = (event: Event) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleCut = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleDragStart = (event: DragEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName
        if (tagName === 'IMG' || tagName === 'VIDEO') {
          event.preventDefault()
        }
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (['c', 'x', 's', 'p', 'u', 'i'].includes(key)) {
        event.preventDefault()
      }
    }

    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('selectstart', handleSelectStart, true)
    document.addEventListener('copy', handleCopy, true)
    document.addEventListener('cut', handleCut, true)
    document.addEventListener('dragstart', handleDragStart, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('selectstart', handleSelectStart, true)
      document.removeEventListener('copy', handleCopy, true)
      document.removeEventListener('cut', handleCut, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isEditableTarget])

  useEffect(() => {
    // HTML을 먼저 로드하고, 그 다음에 서비스 로드
    loadHomeHtml().then(() => {
      loadServices()
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const storedMinutes = localStorage.getItem('dev_unlock_duration_minutes')
    if (storedMinutes) {
      const parsed = parseInt(storedMinutes, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        setDevUnlockDurationMinutes(parsed)
      }
    }
    const storedHide = localStorage.getItem('dev_unlock_hide_enabled')
    if (storedHide !== null) {
      setDevUnlockHideEnabled(storedHide === '1')
    }
    const until = localStorage.getItem('dev_unlock_until')
    if (!until) return
    const untilTime = parseInt(until, 10)
    if (Number.isFinite(untilTime) && untilTime > Date.now()) {
      return
    } else {
      localStorage.removeItem('dev_unlock_until')
    }
  }, [])

  const loadDevUnlockConfig = useCallback(async () => {
    try {
      const response = await fetch('/api/dev-unlock/config', { cache: 'no-store' })
      if (!response.ok) return
      const data = await response.json()
      const minutes = Number(data?.dev_unlock_duration_minutes || 60)
      if (Number.isFinite(minutes) && minutes > 0) {
        setDevUnlockDurationMinutes(minutes)
        localStorage.setItem('dev_unlock_duration_minutes', String(minutes))
      }
      const hideEnabled = Boolean(data?.dev_unlock_hide_enabled)
      setDevUnlockHideEnabled(hideEnabled)
      localStorage.setItem('dev_unlock_hide_enabled', hideEnabled ? '1' : '0')
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    void loadDevUnlockConfig()
  }, [loadDevUnlockConfig])

  const isDevUnlockActive = () => {
    if (typeof window === 'undefined') return false
    const hideEnabled = localStorage.getItem('dev_unlock_hide_enabled') === '1'
    if (hideEnabled) return false
    const until = localStorage.getItem('dev_unlock_until')
    if (!until) return false
    const untilTime = parseInt(until, 10)
    if (!Number.isFinite(untilTime)) return false
    if (untilTime <= Date.now()) {
      localStorage.removeItem('dev_unlock_until')
      return false
    }
    return true
  }

  const handleDevUnlockTitleClick = () => {
    const now = Date.now()
    if (devUnlockClickRef.current.timer) {
      clearTimeout(devUnlockClickRef.current.timer)
    }
    if (devUnlockClickRef.current.count === 0) {
      devUnlockClickRef.current.timer = setTimeout(() => {
        devUnlockClickRef.current.count = 0
        devUnlockClickRef.current.timer = null
      }, 2000)
    }
    devUnlockClickRef.current.count += 1
    if (devUnlockClickRef.current.count >= 5) {
      devUnlockClickRef.current.count = 0
      if (devUnlockClickRef.current.timer) {
        clearTimeout(devUnlockClickRef.current.timer)
        devUnlockClickRef.current.timer = null
      }
      setShowDevUnlockModal(true)
    }
  }

  const formatUnlockDuration = (minutes: number) => {
    const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60
    const hours = Math.floor(safeMinutes / 60)
    const restMinutes = safeMinutes % 60
    if (hours > 0 && restMinutes > 0) return `${hours}시간 ${restMinutes}분`
    if (hours > 0) return `${hours}시간`
    return `${restMinutes}분`
  }

  const handleDevUnlockSubmit = async () => {
    const password = devUnlockPasswordInput.trim()
    if (!password) {
      alert('비밀번호를 입력해주세요.')
      return
    }
    try {
      const response = await fetch('/api/dev-unlock/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any))
        const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
        alert(msg)
        return
      }
      const data = await response.json()
      const durationMinutes = Number(data?.dev_unlock_duration_minutes || devUnlockDurationMinutes || 60)
      const safeMinutes = Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 60
      const until = Date.now() + safeMinutes * 60 * 1000
      localStorage.setItem('dev_unlock_until', String(until))
      localStorage.setItem('dev_unlock_duration_minutes', String(safeMinutes))
      setDevUnlockDurationMinutes(safeMinutes)
      setShowDevUnlockModal(false)
      setDevUnlockPasswordInput('')
      loadServices()
    } catch (e) {
      alert('인증 중 오류가 발생했습니다.')
    }
  }

  const loadServices = async () => {
    try {
      // POST 방식으로 컨텐츠 목록 가져오기 (캐시 우회)
      const response = await fetch('/api/admin/content/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({})
      })
      
      if (!response.ok) {
        throw new Error('컨텐츠 목록을 가져오는데 실패했습니다.')
      }
      
      const result = await response.json()
      const data = result.success && result.data ? result.data : []
      
      const previewAllowed = isDevUnlockActive()
      // ✅ 기본은 노출 컨텐츠만, 관리자 인증 시 비노출도 포함
      const exposedOnly = previewAllowed
        ? data
        : (data || []).filter((content: any) => {
            const v = content?.is_exposed
            return v === true || v === 'true' || v === 1
          })
      
      // Supabase 데이터를 ServiceCard 형식으로 변환
      const convertedServices = (exposedOnly || []).map((content: any) => ({
        id: content.id,
        title: content.content_name || '이름 없음',
        description: content.introduction || '',
        summary: content.summary || '',
        price: content.price || '',
        isNew: content.is_new || false,
        isFree: !content.price || content.price === '' || content.price === '0',
        thumbnailImageUrl: content.thumbnail_url || '',
        thumbnailVideoUrl: content.thumbnail_video_url || '',
      }))
      setServices(convertedServices)
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  const loadHomeHtml = async () => {
    setHomeHtmlLoading(true)
    setIframeLoaded(false)
    try {
      // ✅ 프로덕션 CDN 캐시 우회: POST로 조회(대부분의 캐시는 POST를 캐싱하지 않음)
      const res = await fetch('/api/settings/home-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        setHomeHtmlLoading(false)
        setIframeLoaded(true) // HTML이 없으면 바로 메뉴 표시
        return
      }
      const data = await res.json()
      const html = typeof data?.home_html === 'string' ? data.home_html : ''
      const bgColor = typeof data?.home_bg_color === 'string' ? data.home_bg_color : ''
      setHomeHtml(html)
      setHomeBgColor(bgColor)
      // HTML이 없으면 바로 메뉴 표시
      if (!html || html.trim() === '') {
        setHomeHtmlLoading(false)
        setIframeLoaded(true)
      } else {
        // HTML이 있으면 iframe 렌더링을 위해 homeHtmlLoading은 false로 설정
        // (iframe의 onLoad에서 iframeLoaded를 true로 설정)
        setHomeHtmlLoading(false)
      }
      // 디버깅: HTML이 제대로 로드되었는지 확인
      if (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {

      }
    } catch (e) {

      setHomeHtml('')
      setHomeBgColor('')
      setHomeHtmlLoading(false)
      setIframeLoaded(true) // 에러 발생 시 바로 메뉴 표시
    }
  }

  // iframe 높이 자동 조정
  useEffect(() => {
    if (!homeHtml || !iframeRef.current) return

    const adjustIframeHeight = () => {
      try {
        const iframe = iframeRef.current
        if (!iframe?.contentWindow?.document?.body) return

        const height = Math.max(
          iframe.contentWindow.document.body.scrollHeight,
          iframe.contentWindow.document.documentElement.scrollHeight,
          200
        )
        iframe.style.height = `${height}px`
      } catch (err) {
        // cross-origin 등으로 접근 불가 시 무시
      }
    }

    // iframe 로드 후 높이 조정
    const timer = setTimeout(adjustIframeHeight, 100)
    const interval = setInterval(adjustIframeHeight, 500) // 주기적으로 높이 확인

    // iframe이 로드되지 않는 경우를 대비한 타임아웃 (5초 후 메뉴 표시)
    const fallbackTimer = setTimeout(() => {
      if (!iframeLoaded) {
        setIframeLoaded(true)
      }
    }, 5000)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      clearTimeout(fallbackTimer)
    }
  }, [homeHtml, iframeLoaded])

  return (
    <div
      className="min-h-screen bg-white flex flex-col"
      style={{ backgroundColor: homeBgColor && homeBgColor.trim() ? homeBgColor : '#ffffff' }}
    >
      {/* 슬라이드 메뉴바 */}
      <SlideMenuBar isOpen={showSlideMenu} onClose={() => setShowSlideMenu(false)} />

      {/* 이용약관 팝업 */}
      <TermsPopup isOpen={showTermsPopup} onClose={() => setShowTermsPopup(false)} />
      
      {/* 개인정보처리방침 팝업 */}
      <PrivacyPopup isOpen={showPrivacyPopup} onClose={() => setShowPrivacyPopup(false)} />
      
      {/* 나의 이용내역 팝업 */}
      <MyHistoryPopup isOpen={showMyHistoryPopup} onClose={() => setShowMyHistoryPopup(false)} />

      {/* 헤더 */}
      <header className="w-full bg-white border-b-2 border-pink-500">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <a 
            href="/"
            className="text-2xl font-bold tracking-tight text-pink-600 hover:text-pink-700 transition-colors cursor-pointer"
          >
            jeuniOn
          </a>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowMyHistoryPopup(true)}
              className="text-sm font-semibold text-gray-700 hover:text-pink-600 transition-colors"
            >
              나의 이용내역
            </button>
            <button
              type="button"
              onClick={() => setShowSlideMenu(true)}
              aria-label="메뉴"
              className="w-9 h-9 inline-flex items-center justify-center rounded-md text-pink-600 hover:bg-pink-50 transition-colors"
            >
              <span className="sr-only">메뉴</span>
              <span className="block w-5">
                <span className="block h-[2px] w-full bg-pink-600 mb-1"></span>
                <span className="block h-[2px] w-full bg-pink-600 mb-1"></span>
                <span className="block h-[2px] w-full bg-pink-600"></span>
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* 헤더 아래 HTML 뷰 (padding/border/margin 0, iframe으로 완전 격리) */}
      {homeHtml && homeHtml.trim() !== '' && (
        <div className="mx-auto w-full max-w-4xl p-0 border-0 relative z-10" style={{ height: 'auto', minHeight: '1px' }}>
          <iframe
            ref={iframeRef}
            srcDoc={homeHtml}
            className="w-full border-0"
            style={{
              display: 'block',
              width: '100%',
              minHeight: '200px',
              border: 'none',
              margin: 0,
              padding: 0,
            }}
            title="홈 HTML 뷰"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
            onLoad={() => {
              // iframe 로드 후 높이 조정 (useEffect에서 처리)
              setTimeout(() => {
                try {
                  const iframe = iframeRef.current
                  if (iframe?.contentWindow?.document?.body) {
                    const iframeDocument = iframe.contentWindow.document
                    const blockInIframe = (event: Event) => {
                      if (event.target && isEditableTarget(event.target)) return
                      event.preventDefault()
                    }
                    const blockDragInIframe = (event: DragEvent) => {
                      const target = event.target
                      if (target instanceof HTMLElement) {
                        const tagName = target.tagName
                        if (tagName === 'IMG' || tagName === 'VIDEO') {
                          event.preventDefault()
                        }
                      }
                    }
                    const blockKeyInIframe = (event: KeyboardEvent) => {
                      if (isEditableTarget(event.target)) return
                      if (!event.ctrlKey && !event.metaKey) return
                      const key = event.key.toLowerCase()
                      if (['c', 'x', 's', 'p', 'u', 'i'].includes(key)) {
                        event.preventDefault()
                      }
                    }

                    iframeDocument.addEventListener('contextmenu', blockInIframe, true)
                    iframeDocument.addEventListener('selectstart', blockInIframe, true)
                    iframeDocument.addEventListener('copy', blockInIframe, true)
                    iframeDocument.addEventListener('cut', blockInIframe, true)
                    iframeDocument.addEventListener('dragstart', blockDragInIframe, true)
                    iframeDocument.addEventListener('keydown', blockKeyInIframe, true)

                    const height = Math.max(
                      iframe.contentWindow.document.body.scrollHeight,
                      iframe.contentWindow.document.documentElement.scrollHeight,
                      200
                    )
                    iframe.style.height = `${height}px`
                  }
                } catch (err) {
                  // cross-origin 등으로 접근 불가 시 무시
                }
                // iframe이 완전히 로드되었음을 표시
                setIframeLoaded(true)
              }, 100)
            }}
          />
        </div>
      )}

      {/* 기존 메뉴(컨텐츠) 리스트 - iframe 완전히 로드된 후 표시 */}
      {iframeLoaded && (
        <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 flex-1 relative z-20">
          {loading ? (
            <div className="text-center text-gray-400 py-12">로딩 중...</div>
          ) : services.length === 0 ? (
            <div className="text-center text-gray-400 py-12">컨텐츠가 없습니다.</div>
          ) : (
            <div className="w-full grid grid-cols-1 gap-6 justify-items-stretch">
              {services.map((service) => (
                <ServiceCard key={service.id} service={service} />
              ))}
            </div>
          )}
        </main>
      )}

      {/* 푸터 - HTML view와 메뉴가 로드된 후에만 표시 */}
      {iframeLoaded && (
        <footer className="bg-gray-800 text-white py-6 mt-auto relative z-0">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
          <div className="text-xs space-y-1 leading-relaxed">
            <div>
              <button
                type="button"
                onClick={() => setShowTermsPopup(true)}
                className="text-white hover:text-pink-300 underline font-semibold transition-colors"
              >
                이용약관
              </button>
              {' / '}
              <button
                type="button"
                onClick={() => setShowPrivacyPopup(true)}
                className="text-white hover:text-pink-300 underline font-semibold transition-colors"
              >
                개인정보처리방침
              </button>
            </div>
            <div>
              사업자등록번호 : 108-81-84400 │ 통신판매업신고번호 : 2022-서울성동-00643
            </div>
            <div>
              02-516-1975 │ service＠fortune82.com
            </div>
            <div>
              서울특별시 성동구 상원12길 34 (성수동1가, 서울숲에이원) 213호
            </div>
            <div className="pt-2">
              Copyright(c) FORTUNE82.COM All Rights Reserved.
            </div>
            <span
              onClick={handleDevUnlockTitleClick}
              className="text-white cursor-text"
            >
              (주)테크앤조이 │ 대표 : 서주형
            </span>
          </div>
        </div>
      </footer>
      )}

      {/* 관리자 미리보기 잠금 해제 팝업 */}
      {showDevUnlockModal && (
        <div
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowDevUnlockModal(false)
            }
          }}
        >
          <div className="absolute top-0 left-0 right-0 bottom-0 bg-black/60"></div>
          <div
            className="relative w-full max-w-sm bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-lg font-bold text-white">관리자 확인</h2>
              <button
                type="button"
                onClick={() => setShowDevUnlockModal(false)}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form
              className="p-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault()
                handleDevUnlockSubmit()
              }}
            >
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">비밀번호</label>
                <input
                  type="password"
                  value={devUnlockPasswordInput}
                  onChange={(e) => setDevUnlockPasswordInput(e.target.value)}
                  className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all"
                  placeholder="관리자 비밀번호"
                />
              </div>
              <div className="text-xs text-gray-500">
                인증 후 {formatUnlockDuration(devUnlockDurationMinutes)} 동안 미노출 메뉴가 표시됩니다.
              </div>
              <button
                type="submit"
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 rounded-lg transition-all"
              >
                확인
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

