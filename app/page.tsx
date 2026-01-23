'use client'

import { useState, useEffect, useRef } from 'react'
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
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    // HTML을 먼저 로드하고, 그 다음에 서비스 로드
    loadHomeHtml().then(() => {
      loadServices()
    })
  }, [])

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
      
      // ✅ 노출 컨텐츠만 프론트 메뉴에 표시 (기본값: 비노출)
      const exposedOnly = (data || []).filter((content: any) => {
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
        console.log('[home-html] loaded:', html.length, 'chars', html.substring(0, 100))
      }
    } catch (e) {
      console.error('[home-html] load error:', e)
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
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
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
        <div className="w-full p-0 m-0 border-0 relative z-10" style={{ height: 'auto', minHeight: '1px' }}>
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
        <main className="container mx-auto px-4 py-8 flex-1 relative z-20">
          {loading ? (
            <div className="text-center text-gray-400 py-12">로딩 중...</div>
          ) : services.length === 0 ? (
            <div className="text-center text-gray-400 py-12">컨텐츠가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
        <div className="container mx-auto px-4">
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
            <div>
              ㈜테크앤조이 │ 대표 : 서주형
            </div>
          </div>
        </div>
      </footer>
      )}
    </div>
  )
}

