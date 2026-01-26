/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, useRef, useMemo, memo, useCallback } from 'react'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import { getContentById, getSelectedSpeaker, getFortuneViewMode } from '@/lib/supabase-admin'
import SupabaseVideo from '@/components/SupabaseVideo'
import SlideMenuBar from '@/components/SlideMenuBar'
import MyHistoryPopup from '@/components/MyHistoryPopup'
import TermsPopup from '@/components/TermsPopup'
import PrivacyPopup from '@/components/PrivacyPopup'
import AlertPopup from '@/components/AlertPopup'

interface ResultData {
  content: any
  html: string // HTML 결과
  startTime?: number
  model?: string // 사용된 모델 정보
  userName?: string // 사용자 이름
}

interface ParsedSubtitle {
  detailMenus?: Array<{ detailMenu: string; contentHtml?: string; thumbnail_image_url?: string; thumbnail_video_url?: string; thumbnail?: string }>;
  title: string
  contentHtml: string
  thumbnail?: string
  thumbnail_image_url?: string
  thumbnail_video_url?: string
  detailMenuSectionHtml?: string
  isDetailMenu?: boolean // 상세메뉴 여부 플래그 (소메뉴와 동급으로 취급)
  detailMenuIndex?: number // 상세메뉴 인덱스 (원래 소메뉴 내에서의 순서)
  parentSubtitleIndex?: number // 부모 소메뉴 인덱스
}

interface ParsedMenu {
  title: string
  subtitles: ParsedSubtitle[]
  startIndex: number
  thumbnailHtml?: string
  manseHtml?: string
}

// 썸네일 컴포넌트 (메모이제이션으로 깜빡임 방지)
const ThumbnailDisplay = memo(({ html, menuIndex }: { html: string; menuIndex: number }) => {
  return (
    <div
      key={`thumbnail-${menuIndex}`}
      className="mt-2 w-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
ThumbnailDisplay.displayName = 'ThumbnailDisplay'

// HTML 길이 제한 상수 (10만자)
const MAX_HTML_LENGTH = 100000

/**
 * 스트리밍 chunk가 "증분(delta)"이 아니라 이전에 보낸 텍스트 일부를 포함(겹침/재전송)하는 경우가 있어,
 * 단순 += 누적 시 HTML 앞부분(특히 첫 대메뉴 title)이 중복되는 문제가 간헐적으로 발생한다.
 *
 * 해결: prev(누적) suffix와 next(chunk) prefix의 최대 겹침(overlap)을 찾아 겹치는 부분을 제거하고 append한다.
 * 또한 next가 "누적 전체 HTML"처럼 보이는 경우(동일 prefix를 공유하며 더 길다)는 prev를 next로 교체한다.
 */
function appendStreamChunk(prev: string, next: string): string {
  const chunk = next || ''
  if (!chunk) return prev || ''
  if (!prev) return chunk

  // ✅ chunk가 누적 전체 HTML(또는 그에 준하는 재전송)인 케이스: 동일 prefix를 공유하며 더 길면 교체
  if (chunk.length > prev.length) {
    const headLen = Math.min(200, prev.length, chunk.length)
    if (headLen > 0 && prev.slice(0, headLen) === chunk.slice(0, headLen)) {
      return chunk
    }
    if (chunk.startsWith(prev)) {
      return chunk
    }
  }

  // ✅ chunk가 이미 포함된 경우(큰 조각 재전송 등): 무시
  if (chunk.length >= 200 && prev.includes(chunk)) {
    return prev
  }

  // ✅ suffix/prefix overlap 제거
  const maxCheck = Math.min(4096, prev.length, chunk.length)
  for (let i = maxCheck; i >= 1; i--) {
    if (prev.endsWith(chunk.slice(0, i))) {
      return prev + chunk.slice(i)
    }
  }
  return prev + chunk
}

function ResultContent() {
  const searchParams = useSearchParams()
  
  // sessionStorage에서 데이터 가져오기 (URL 파라미터 대신, 하위 호환성 유지)
  const [storageKey, setStorageKey] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRealtime, setIsRealtime] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false) // 데이터 로드 완료 플래그
  // requestKey는 setState 타이밍 이슈가 있을 수 있어 ref로도 보존 (저장/업데이트에서 항상 최신 값 사용)
  const requestKeyRef = useRef<string | null>(null)
  // savedId도 결제 직후에 들어오므로 ref로 보존 (update 라우트 선택에 사용)
  const savedIdRef = useRef<string | null>(null)
  
  // sessionStorage와 URL 파라미터에서 데이터 로드 (최우선 실행)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (dataLoaded) return // 이미 로드했으면 건너뛰기
    
    // 1. sessionStorage 우선 확인 (새로운 방식)
    const storedRequestKey = sessionStorage.getItem('result_requestKey')
    const storedStream = sessionStorage.getItem('result_stream')
    const storedSavedId = sessionStorage.getItem('result_savedId')
    const storedStorageKey = sessionStorage.getItem('result_key')
    
    if (storedRequestKey) {
      // ✅ 결제 직후 방식(A): requestKey와 savedId를 함께 넘길 수 있으므로 같이 처리
      if (storedSavedId) {
        savedIdRef.current = storedSavedId
        setSavedId(storedSavedId)
        sessionStorage.removeItem('result_savedId')
      }
      requestKeyRef.current = storedRequestKey
      setRequestKey(storedRequestKey)
      setIsStreaming(storedStream === 'true')
      setIsRealtime(storedStream === 'true' && !!storedRequestKey)
      // 사용 후 삭제 (한 번만 사용)
      sessionStorage.removeItem('result_requestKey')
      sessionStorage.removeItem('result_stream')
      setDataLoaded(true)
      return
    }
    
    if (storedSavedId) {
      savedIdRef.current = storedSavedId
      setSavedId(storedSavedId)
      // 사용 후 삭제 (한 번만 사용)
      sessionStorage.removeItem('result_savedId')
      setDataLoaded(true)
      return
    }
    
    if (storedStorageKey) {
      setStorageKey(storedStorageKey)
      // 사용 후 삭제 (한 번만 사용)
      sessionStorage.removeItem('result_key')
      setDataLoaded(true)
      return
    }
    
    // 2. URL 파라미터 확인 (하위 호환성)
    const urlStorageKey = searchParams.get('key')
    const urlSavedId = searchParams.get('savedId')
    const urlRequestKey = searchParams.get('requestKey')
    const urlIsStreaming = searchParams.get('stream') === 'true'
    const urlGeneratePdf = searchParams.get('generatePdf') === 'true'
    
    if (urlStorageKey) {
      setStorageKey(urlStorageKey)
    }
    
    if (urlSavedId) {
      savedIdRef.current = urlSavedId
      setSavedId(urlSavedId)
    }
    
    // generatePdf 파라미터 저장 (나중에 PDF 생성 시 사용)
    if (urlGeneratePdf) {
      sessionStorage.setItem('result_generatePdf', 'true')
    }
    
    if (urlRequestKey) {
      requestKeyRef.current = urlRequestKey
      setRequestKey(urlRequestKey)
      setIsStreaming(urlIsStreaming)
      setIsRealtime(urlIsStreaming && !!urlRequestKey)
    }
    
    setDataLoaded(true)
  }, [searchParams, dataLoaded])
  
  // requestKey나 isStreaming이 변경되면 isRealtime 업데이트
  useEffect(() => {
    const realtime = isStreaming && !!requestKey
    // requestKey ref 동기화 (저장/업데이트에서 최신 값 사용)
    requestKeyRef.current = requestKey
    setIsRealtime(realtime)
    // realtime 모드일 때 fortuneViewMode도 'realtime'으로 설정
    if (realtime) {
      setFortuneViewMode('realtime')
    }
  }, [isStreaming, requestKey])

  // savedId ref 동기화 (update 라우트 선택에서 최신 값 사용)
  useEffect(() => {
    savedIdRef.current = savedId
  }, [savedId])
  const [resultData, setResultData] = useState<ResultData | null>(null)
  const [streamingHtml, setStreamingHtml] = useState('')
  const [isStreamingActive, setIsStreamingActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // resultData가 로드되면 썸네일을 sessionStorage에 저장 (form 페이지로 돌아갈 때 사용)
  useEffect(() => {
    if (resultData?.content?.thumbnail_url && typeof window !== 'undefined') {
      sessionStorage.setItem('form_thumbnail_url', resultData.content.thumbnail_url)
      sessionStorage.setItem('form_title', resultData.content?.content_name || '')
    }
  }, [resultData])
  const [savedResults, setSavedResults] = useState<any[]>([])
  const [streamingProgress, setStreamingProgress] = useState(0) // realtime 가짜 로딩/진행률
  const [fortuneViewMode, setFortuneViewMode] = useState<'batch' | 'realtime'>('batch')
  const [parsedMenus, setParsedMenus] = useState<ParsedMenu[]>([])
  const [totalSubtitles, setTotalSubtitles] = useState(0)
  const [revealedCount, setRevealedCount] = useState(0)
  const [showRealtimeLoading, setShowRealtimeLoading] = useState(false) // 기존 플래그(사용 안함)
  const tocButtonRef = useRef<HTMLButtonElement | null>(null) // 목차로 이동 버튼 ref
  const [tocButtonWidth, setTocButtonWidth] = useState<number | null>(null) // 목차로 이동 버튼 너비
  const [showRealtimePopup, setShowRealtimePopup] = useState(false) // realtime 전용 로딩 팝업
  const [showSlideMenu, setShowSlideMenu] = useState(false) // 슬라이드 메뉴 표시
  const [showMyHistoryPopup, setShowMyHistoryPopup] = useState(false) // 나의 이용내역 팝업 표시
  const [showMansePopup, setShowMansePopup] = useState(false) // 나의 사주명식 보기 팝업
  const [showTermsPopup, setShowTermsPopup] = useState(false) // 이용약관 팝업
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false) // 개인정보처리방침 팝업
  const [firstSubtitleReady, setFirstSubtitleReady] = useState(false) // 1-1 소제목 준비 여부
  const firstSubtitleReadyRef = useRef(false)
  const [streamingFinished, setStreamingFinished] = useState(false) // 스트리밍 완료 여부 (realtime)
  const [showCompletionPopup, setShowCompletionPopup] = useState(false) // 점사 완료 팝업
  const completionPopupShownRef = useRef(false)
  const thumbnailHtmlCacheRef = useRef<Map<number, string>>(new Map()) // 썸네일 HTML 캐시 (메뉴 인덱스별)
  const manseHtmlCacheRef = useRef<Map<number, string>>(new Map()) // 만세력 HTML 캐시 (메뉴 인덱스별)
  const autoSavedRef = useRef(false) // 자동 저장 여부 (중복 저장 방지)
  const subtitleHtmlLengthRef = useRef<Map<string, number>>(new Map()) // 소제목별 HTML 길이 추적 (완성 여부 판단용)
  const detailMenuHtmlLengthRef = useRef<Map<string, number>>(new Map()) // 상세메뉴별 HTML 길이 추적 (완성 여부 판단용)
  const subtitleStableCountRef = useRef<Map<string, number>>(new Map()) // 소제목별 안정화 카운트 (길이가 변하지 않은 연속 횟수)
  const detailMenuStableCountRef = useRef<Map<string, number>>(new Map()) // 상세메뉴별 안정화 카운트
  const parsingTimeoutRef = useRef<NodeJS.Timeout | null>(null) // 파싱 딜레이를 위한 타임아웃 ref

  // firstSubtitleReady ref 동기화 (타이머/인터벌에서 최신 값 사용)
  useEffect(() => {
    firstSubtitleReadyRef.current = firstSubtitleReady
  }, [firstSubtitleReady])

  // 목차로 이동 버튼 너비 측정
  useEffect(() => {
    if (tocButtonRef.current) {
      const updateWidth = () => {
        if (tocButtonRef.current) {
          setTocButtonWidth(tocButtonRef.current.offsetWidth)
        }
      }
      updateWidth()
      // 리사이즈 이벤트 리스너 추가 (반응형 대응)
      window.addEventListener('resize', updateWidth)
      return () => {
        window.removeEventListener('resize', updateWidth)
      }
    }
  }, [parsedMenus.length]) // parsedMenus가 변경될 때마다 재측정

  // 점사 모드 로드
  useEffect(() => {
    // isRealtime이 true이면 fortuneViewMode를 'realtime'으로 설정 (우선순위)
    if (isRealtime) {
      setFortuneViewMode('realtime')
      setShowRealtimeLoading(false)
      return
    }
    
    const loadMode = async () => {
      try {
        const mode = await getFortuneViewMode()
        setFortuneViewMode(mode === 'realtime' ? 'realtime' : 'batch')
        // 결제 성공 진입 시 팝업 없이 바로 결과 화면으로 전환
        setShowRealtimeLoading(false)
      } catch (e) {
        setFortuneViewMode('batch')
        setShowRealtimeLoading(false)
      }
    }
    loadMode()

    // 결제 성공 진입 플래그가 있는 경우는 처리하지 않음
    // (결제 성공 URL이 form 페이지로 변경되었으므로 여기서는 처리 불필요)
  }, [searchParams, isRealtime])
  
  // 저장된 결과 목록 로드 함수 (useEffect 위에 정의)
  const loadSavedResults = async () => {
    if (typeof window === 'undefined') return
    try {
      const response = await fetch('/api/saved-results/list', {
        cache: 'no-store' // 프로덕션 환경에서 캐싱 방지
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`저장된 결과 목록 조회 실패: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        const data = result.data || []
        setSavedResults(data)
      } else {
        setSavedResults([])
      }
    } catch (e) {
      setSavedResults([])
    }
  }

  // 경과 시간 상태 (모든 hooks는 early return 이전에 정의)
  const [currentTime, setCurrentTime] = useState('0:00')
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playingResultId, setPlayingResultId] = useState<string | null>(null) // 재생 중인 저장된 결과 ID
  const currentAudioRef = useRef<HTMLAudioElement | null>(null) // 현재 재생 중인 오디오 (ref로 관리하여 리렌더링 방지)
  const shouldStopRef = useRef(false) // 재생 중지 플래그 (ref로 관리하여 실시간 확인 가능)
  const [shouldStop, setShouldStop] = useState(false) // 재생 중지 플래그 (UI 업데이트용)
  const [ttsStatus, setTtsStatus] = useState<string | null>(null) // TTS 상태 메시지 (음성 생성 중, 재생 시작 등)

  // 결과 제목(예: [김슬기 : 양력 2000년 1월 20일 (음력 1999년 12월 14일) 丑시(01:30 ~ 03:29)])을 보기 좋게 분해
  const parsePrettyResultTitle = (rawTitle: string) => {
    const raw = (rawTitle || '').trim()
    if (!raw) return null

    // 바깥 대괄호 제거
    const unwrapped = raw.replace(/^\s*\[/, '').replace(/\]\s*$/, '').trim()

    // "이름 : ..." 형태
    const colonIdx = unwrapped.indexOf(':')
    if (colonIdx < 0) return null

    const name = unwrapped.slice(0, colonIdx).trim()
    const rest = unwrapped.slice(colonIdx + 1).trim()

    const solarMatch = rest.match(/양력\s*([0-9]{4}년\s*\d{1,2}월\s*\d{1,2}일)/)
    const lunarMatch = rest.match(/음력\s*([0-9]{4}년\s*\d{1,2}월\s*\d{1,2}일)/)

    // 예: 丑시(01:30 ~ 03:29) / 子시(09:30~11:29)
    const timeMatch = rest.match(/([子丑寅卯辰巳午未申酉戌亥])\s*시\s*\(([^)]+)\)/)
    const branch = timeMatch?.[1] || ''
    const timeRange = timeMatch?.[2]?.replace(/\s+/g, ' ').trim() || ''

    // ✅ 사람 정보 헤더로 확실히 보이는 경우에만 카드 렌더링 (컨텐츠 제목 오인 방지)
    if (!name || !solarMatch || !lunarMatch) return null

    return {
      name,
      solar: solarMatch?.[1] || '',
      lunar: lunarMatch?.[1] || '',
      branch,
      timeRange,
      raw: rawTitle,
    }
  }

  // 오디오 중지 함수 (여러 곳에서 재사용)
  const stopAndResetAudio = () => {
    shouldStopRef.current = true // ref 업데이트 (즉시 반영)
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      const url = currentAudioRef.current.src
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url) // URL 해제
      }
      currentAudioRef.current = null
    }
    setShouldStop(true) // state 업데이트 (UI 반영)
    setIsPlaying(false)
    setPlayingResultId(null)
  }

  // 페이지가 비활성화되거나 브라우저 뒤로 가기 시 음성 재생 중지
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopAndResetAudio()
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      stopAndResetAudio()
    }

    const handleBeforeUnload = () => {
      stopAndResetAudio()
    }

    // 이벤트 리스너 등록 (캡처링 단계에서도 처리)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('popstate', handlePopState, true) // 캡처링 단계에서 처리
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // cleanup: 페이지 언마운트 시 오디오 중지
    return () => {
      stopAndResetAudio()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('popstate', handlePopState, true)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  // batch 모드: Supabase에서 완료된 결과 로드 (savedId 기반)
  useEffect(() => {
    if (!savedId || isRealtime) {
      // realtime 모드이거나 savedId가 없으면 이 경로는 사용하지 않음
      // 기존 key 파라미터 지원 (하위 호환성)
      if (storageKey && !isRealtime) {
        setError('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.')
        setLoading(false)
      }
      return
    }

    // Supabase에서 완료된 결과 로드
    const loadData = async () => {
      try {
        const response = await fetch(`/api/saved-results/list`)
        if (!response.ok) {
          throw new Error('저장된 결과 목록 조회 실패')
        }

        const result = await response.json()
        if (!result.success || !result.data) {
          throw new Error('저장된 결과 데이터가 없습니다.')
        }

        const savedResult = result.data.find((item: any) => item.id === savedId)
        if (!savedResult) {
          throw new Error('저장된 결과를 찾을 수 없습니다.')
        }

        // 저장된 HTML 확인
        const savedHtml = savedResult.html || ''
        console.log('[결과 로드] 저장된 결과 HTML 확인:', {
          savedId,
          htmlLength: savedHtml.length,
          htmlPreview: savedHtml.substring(0, 300),
          hasContent: savedHtml.includes('menu-section') || savedHtml.includes('subtitle-section')
        })
        
        if (!savedHtml || savedHtml.trim().length < 100) {
          console.error('[결과 로드] 저장된 HTML이 비어있음!', {
            htmlLength: savedHtml.length,
            htmlTrimmedLength: savedHtml.trim().length,
            htmlPreview: savedHtml.substring(0, 200)
          })
          throw new Error('저장된 결과에 내용이 없습니다. 관리자에게 문의해주세요.')
        }

        // content가 없거나 menu_items가 없으면 title로 찾기
        // (저장 시 content가 불완전하게 저장된 경우 대비)
        let finalContent = savedResult.content
        const needsFetchContent = !finalContent || !finalContent.menu_items || !Array.isArray(finalContent.menu_items) || finalContent.menu_items.length === 0
        
        if (needsFetchContent && savedResult.title) {
          try {
            console.log('[결과 로드] content 불완전, title로 다시 가져오기 시도:', {
              hasContent: !!savedResult.content,
              hasMenuItems: !!savedResult.content?.menu_items,
              title: savedResult.title
            })
            const findResponse = await fetch(`/api/contents/find-by-title?title=${encodeURIComponent(savedResult.title)}`)
            if (findResponse.ok) {
              const findData = await findResponse.json().catch(() => ({}))
              if (findData.success && findData.content_id) {
                // content_id로 전체 content 정보 가져오기 (full=true로 전체 데이터 요청)
                const contentResponse = await fetch(`/api/content/${findData.content_id}?full=true`)
                if (contentResponse.ok) {
                  const contentData = await contentResponse.json()
                  if (contentData && contentData.menu_items) {
                    // 기존 저장된 content의 user_info는 유지 (점사 시 입력한 정보)
                    finalContent = {
                      ...contentData,
                      user_info: savedResult.content?.user_info || contentData.user_info
                    }
                    console.log('[결과 로드] title로 content 찾기 성공:', {
                      content_id: findData.content_id,
                      hasMenuItems: !!contentData.menu_items,
                      menuItemsCount: contentData.menu_items?.length || 0
                    })
                  }
                }
              }
            }
          } catch (e) {
            console.warn('[결과 로드] title로 content 찾기 실패:', e)
          }
        }
        
        // ResultData 형식으로 변환
        const parsedData: ResultData = {
          content: finalContent || null,
          html: savedHtml,
          startTime: savedResult.processingTime ? Date.now() - savedResult.processingTime : undefined,
          model: savedResult.model,
          userName: savedResult.userName
        }
        
        setResultData(parsedData)
        // ✅ 저장된 결과 화면에서는 스트리밍이 아닌 "완료 상태"로 렌더링해야 본문이 보인다.
        // 사용자가 fortuneViewMode를 realtime로 설정했더라도 savedId로 진입한 경우는 완료된 HTML을 즉시 표시.
        setIsStreamingActive(false)
        setStreamingFinished(true)
        setStreamingHtml(parsedData.html || '')
        setShowRealtimePopup(false)
        
        // generatePdf 파라미터가 있으면 자동으로 PDF 생성
        const shouldGeneratePdf = sessionStorage.getItem('result_generatePdf') === 'true'
        if (shouldGeneratePdf) {
          sessionStorage.removeItem('result_generatePdf')
          // 약간의 지연 후 PDF 생성 (렌더링 완료 대기)
          setTimeout(() => {
            // form 페이지의 handleClientSidePdf와 동일한 로직 사용
            // 여기서는 간단하게 alert로 안내하고, 실제 PDF 생성은 form 페이지의 로직을 참고하여 구현
            // (전체 코드가 너무 길기 때문에 핵심만 구현)
            alert('PDF 생성 기능은 준비 중입니다. 잠시 후 다시 시도해주세요.')
          }, 1000)
        }
        
        // 저장된 결과 목록 로드
        loadSavedResults()
      } catch (e: any) {
        setError('결과 데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [savedId, storageKey, isRealtime])

  // realtime 모드: requestKey 기반으로 스트리밍 수행
  useEffect(() => {
    if (!isRealtime || !requestKey) return
    if (typeof window === 'undefined') return

    let cancelled = false
    let fakeProgressInterval: NodeJS.Timeout | null = null

    const startStreaming = async () => {
      try {
        // Supabase에서 임시 요청 데이터 조회
        const getResponse = await fetch(`/api/temp-request/get?requestKey=${requestKey}`)
        
        if (!getResponse.ok) {
          const errorData = await getResponse.json()
          if (!cancelled) {
            setError('결과 요청 데이터를 찾을 수 없습니다. 다시 시도해주세요.')
            setLoading(false)
            // 3초 후 form 페이지로 리다이렉트
            setTimeout(() => {
              window.location.href = '/form'
            }, 3000)
          }
          return
        }

        const getResult = await getResponse.json()
        if (!getResult.success || !getResult.payload) {
          if (!cancelled) {
            setError('결과 요청 데이터를 불러오는 중 오류가 발생했습니다. 다시 시도해주세요.')
            setLoading(false)
            setTimeout(() => {
              window.location.href = '/form'
            }, 3000)
          }
          return
        }

        const payload = getResult.payload
        const { requestData, content, startTime, model, userName, useSequentialFortune } = payload
        
        // allMenuGroups는 payload 최상위 또는 requestData에 있을 수 있음
        const allMenuGroups = payload.allMenuGroups || requestData?.allMenuGroups || []

        if (cancelled) return
        
        // 병렬점사 모드 확인
        const isParallelMode = !useSequentialFortune && allMenuGroups && Array.isArray(allMenuGroups) && allMenuGroups.length > 1
        
        // 초기 상태 설정: 화면은 바로 결과 레이아웃으로 전환
        // user_info에서 사용자 정보 가져오기 (userName이 없을 경우)
        const userInfo = requestData?.user_info
        const finalUserName = userName || userInfo?.name || ''
        
        // content에 user_info가 없으면 requestData에서 가져와서 추가
        const contentWithUserInfo = {
          ...content,
          user_info: content?.user_info || userInfo || null
        }
        
        setResultData({
          content: contentWithUserInfo,
          html: '',
          startTime,
          model,
          userName: finalUserName,
        })
        setStreamingHtml('')
        setParsedMenus([])
        setTotalSubtitles(0)
        setRevealedCount(0)
        setLoading(false)
        setIsStreamingActive(true)
        setStreamingProgress(0)
        setShowRealtimePopup(true)
        setFirstSubtitleReady(false)
        setStreamingFinished(false)

        // 가짜 진행률: 0.5초에 1%씩 97%까지 증가 (첫 소제목 준비 전까지)
        fakeProgressInterval = setInterval(() => {
          if (firstSubtitleReadyRef.current) {
            // 첫 소제목이 준비되면 100%까지 채우고 팝업 제거
            setStreamingProgress(100) // 애니메이션으로 100%까지 증가
            setTimeout(() => {
              setShowRealtimePopup(false)
            }, 500) // 0.5초 후 팝업 제거 (애니메이션 완료 후)
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            return
          }

          setStreamingProgress((prev) => {
            if (prev >= 97) {
              // 97% 도달 시 더 이상 증가하지 않음
              return 97
            }
            const next = prev + 1
            return next > 97 ? 97 : next
          })
        }, 500)

        // 직렬점사와 병렬점사 완전 분리
        if (isParallelMode) {
          await startParallelStreaming(requestData, contentWithUserInfo, startTime, model, userName, allMenuGroups, payload)
        } else {
          await startSequentialStreaming(requestData, contentWithUserInfo, startTime, model, userName, payload)
        }
      } catch (e: any) {
        if (cancelled) return
        
        // 429 Rate Limit 에러는 점사중... 메시지가 이미 떠 있으므로 에러 메시지 표시하지 않음
        if (e?.message && (e.message.includes('429') || e.message.includes('Rate Limit'))) {
          setIsStreamingActive(false)
          setStreamingFinished(true)
        } else {
          setError(e?.message || '점사를 진행하는 중 오류가 발생했습니다.')
          setIsStreamingActive(false)
          setStreamingFinished(true)
        }
      } finally {
        if (fakeProgressInterval) {
          clearInterval(fakeProgressInterval)
          fakeProgressInterval = null
        }
      }
    }

    // 직렬점사 전용 함수 (병렬점사 코드와 완전 분리)
    const startSequentialStreaming = async (
      requestData: any,
      content: any,
      startTime: number,
      model: string,
      userName: string,
      payload: any
    ) => {
      let accumulatedHtml = ''
      const manseRyeokTable: string | undefined = payload?.requestData?.manse_ryeok_table
      let hasReceivedPartialDone = false
      // ✅ 보장: 완료 이후(또는 에러 이후) 늦게 도착한 이벤트는 무시
      let streamLocked = false
      // ✅ 보장: 화면에 표시되는 HTML은 길이가 줄어들지 않게 단조 증가
      let lastRenderedLength = 0

      await callJeminaiAPIStream(requestData, async (data) => {
          if (cancelled) return
          if (streamLocked) return
          if (cancelled) return

          if (data.type === 'start') {
            // lib/jeminai.ts에서 MAX_TOKENS 재요청 시에도 'start'가 한 번 더 전달될 수 있음.
            // 이때 accumulatedHtml을 비우면 이미 받은 HTML이 사라져 "첫 대제목이 다시 보이거나 재점사"처럼 보일 수 있다.
            if (!accumulatedHtml || accumulatedHtml.trim().length === 0) {
              accumulatedHtml = ''
            }
          } else if (data.type === 'partial_done') {
            hasReceivedPartialDone = true
            
            // 직렬점사: partial_done이면 완료 처리 (2차 요청은 lib/jeminai.ts에서 처리)
            let finalHtml = data.html || accumulatedHtml

            console.log('[직렬점사] partial_done 수신:', {
              hasDataHtml: !!data.html,
              dataHtmlLength: data.html?.length || 0,
              accumulatedHtmlLength: accumulatedHtml.length,
              finalHtmlLength: finalHtml.length
            })

            // HTML 정리
            finalHtml = finalHtml
              .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              .replace(/\*\*/g, '')

            console.log('[직렬점사] partial_done 정리 후:', {
              finalHtmlLength: finalHtml.length,
              hasMenuSection: finalHtml.includes('menu-section'),
              hasSubtitleSection: finalHtml.includes('subtitle-section'),
              htmlPreview: finalHtml.substring(0, 500)
            })

            // 즉시 상태 업데이트 (버튼 활성화를 위해)
            setStreamingHtml(finalHtml)

            const finalResult: ResultData = {
              content,
              html: finalHtml,
              startTime,
              model,
              userName,
            }
            setResultData(finalResult)
            setIsStreamingActive(false)
            setStreamingFinished(true)
            setStreamingProgress(100) // 애니메이션으로 100%까지 증가
            setLoading(false)
            // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
            setTimeout(() => {
              setShowRealtimePopup(false)
            }, 500)
            // 완료 처리 후 추가 이벤트 무시
            streamLocked = true
            
            // 직렬점사(partial_done) 완료 시 즉시 결과 저장 (지연 없이)
            if (!autoSavedRef.current) {
              console.log('[직렬점사] partial_done 완료, 결과 저장 시작', {
                finalHtmlLength: finalHtml.length,
                hasResultData: !!finalResult,
                streamingFinished: true
              })
              autoSavedRef.current = true
              // 즉시 저장 (setTimeout 제거)
              ;(async () => {
                try {
                  // 최신 HTML과 content를 직접 전달하여 저장
                  if (finalHtml && finalHtml.length >= 100) {
                    await saveResultToLocal(false, finalHtml, content)
                    console.log('[직렬점사] partial_done 결과 저장 완료', { htmlLength: finalHtml.length, hasContent: !!content })
                  } else {
                    console.error('[직렬점사] partial_done 결과 저장 실패: HTML이 유효하지 않음', {
                      htmlLength: finalHtml?.length || 0
                    })
                    autoSavedRef.current = false // 재시도 가능하도록
                  }
                } catch (err) {
                  console.error('[직렬점사] partial_done 결과 저장 실패:', err)
                  autoSavedRef.current = false // 실패 시 재시도 가능하도록
                }
              })()
            }
          } else if (data.type === 'chunk') {
            const chunkText = data.text || ''
            // lib/jeminai.ts 재요청(2차)에서는 chunk 이벤트에 병합된 전체 HTML(data.html)이 포함될 수 있다.
            // 가능한 경우 data.html을 기준으로 누적하여 중복/리셋으로 인한 화면 흔들림을 막는다.
            if (data.html && data.html.length >= accumulatedHtml.length) {
              accumulatedHtml = data.html
            } else {
              accumulatedHtml = appendStreamChunk(accumulatedHtml, chunkText)
            }

            // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
            let cleanedChunkHtml = accumulatedHtml
              .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              .replace(/\*\*/g, '')

            // 스트리밍 중에도 만세력 테이블을 가능한 한 빨리 삽입
            if (manseRyeokTable && !cleanedChunkHtml.includes('manse-ryeok-table')) {
              const firstMenuSectionMatch = cleanedChunkHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
              if (firstMenuSectionMatch) {
                const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)

                // ✅ 만세력 바로 위 1줄(사주명식 정보 라인)만 예쁘게 감싸기
                // - 점사 본문 전체를 파싱/변경하지 않기 위해, "맨 앞"의 해당 라인만 추출하여 만세력 앞에 배치한다.
                let headerLineHtml = ''
                try {
                  const headerLineMatch = cleanedChunkHtml.match(/\[[^\]]*양력[^\]]*음력[^\]]*\]/)
                  if (headerLineMatch) {
                    const parsed = parsePrettyResultTitle(headerLineMatch[0])
                    if (parsed) {
                      const timeLabel = parsed.branch ? `${parsed.branch}시` : '시간'
                      const timeText = parsed.timeRange ? `(${parsed.timeRange})` : ''
                      headerLineHtml =
                        `<div class="manse-header-line">` +
                        `<div class="manse-header-name">${parsed.name}</div>` +
                        `<div class="manse-header-badges">` +
                        `<span class="manse-header-badge"><strong>양력</strong> ${parsed.solar}</span>` +
                        `<span class="manse-header-badge"><strong>음력</strong> ${parsed.lunar}</span>` +
                        `<span class="manse-header-badge"><strong>${timeLabel}</strong> ${timeText}</span>` +
                        `</div>` +
                        `</div>`
                    }
                    // 해당 라인은 본문에서 제거 (중복 방지)
                    cleanedChunkHtml = cleanedChunkHtml.replace(headerLineMatch[0], '')
                  }
                } catch {
                  // 실패 시 무시
                }

                const manseBlock = `${headerLineHtml}${manseRyeokTable}`

                if (thumbnailMatch) {
                  cleanedChunkHtml = cleanedChunkHtml.replace(
                    /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                    `$1\n${manseBlock}`
                  )
                } else {
                  const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                  if (menuTitleMatch) {
                    cleanedChunkHtml = cleanedChunkHtml.replace(
                      /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                      `$1\n${manseBlock}`
                    )
                  } else {
                    cleanedChunkHtml = cleanedChunkHtml.replace(
                      /(<div class="menu-section">)\s*/,
                      `$1\n${manseBlock}`
                    )
                  }
                }
              }
            }

            // 직렬점사: 청크는 실시간으로 표시 (accumulatedHtml만 사용)
            // ✅ 단조 증가 보장: 길이가 줄어드는 렌더는 무시
            if (cleanedChunkHtml.length >= lastRenderedLength) {
              lastRenderedLength = cleanedChunkHtml.length
              setStreamingHtml(cleanedChunkHtml)
            }
            
          } else if (data.type === 'done') {
            // 직렬점사: partial_done을 받았으면 done 무시 (중복 방지)
            if (hasReceivedPartialDone) {
              return
            }
            
            let finalHtml = data.html || accumulatedHtml

            console.log('[직렬점사] done 수신:', {
              hasDataHtml: !!data.html,
              dataHtmlLength: data.html?.length || 0,
              accumulatedHtmlLength: accumulatedHtml.length,
              finalHtmlLength: finalHtml.length
            })

            // HTML 정리
            finalHtml = finalHtml
              .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              .replace(/\*\*/g, '')

            console.log('[직렬점사] done 정리 후:', {
              finalHtmlLength: finalHtml.length,
              hasMenuSection: finalHtml.includes('menu-section'),
              hasSubtitleSection: finalHtml.includes('subtitle-section'),
              htmlPreview: finalHtml.substring(0, 500)
            })

            // 만세력 테이블 삽입
            if (manseRyeokTable && !finalHtml.includes('manse-ryeok-table')) {
              const firstMenuSectionMatch = finalHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
              if (firstMenuSectionMatch) {
                const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)

                if (thumbnailMatch) {
                  finalHtml = finalHtml.replace(
                    /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                    `$1\n${manseRyeokTable}`
                  )
                } else {
                  const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                  if (menuTitleMatch) {
                    finalHtml = finalHtml.replace(
                      /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  } else {
                    finalHtml = finalHtml.replace(
                      /(<div class="menu-section">)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  }
                }
              }
            }

            // 직렬점사: 완료 이벤트에서는 길이와 무관하게 최종 HTML을 적용
            lastRenderedLength = Math.max(lastRenderedLength, finalHtml.length)
              setStreamingHtml(finalHtml)

            const finalResult: ResultData = {
              content,
              html: finalHtml,
              startTime,
              model,
              userName,
            }
            setResultData(finalResult)

            // 즉시 상태 업데이트 (버튼 활성화를 위해)
            setIsStreamingActive(false)
            setStreamingFinished(true)
            setStreamingProgress(100) // 애니메이션으로 100%까지 증가
            setLoading(false)
            // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
            setTimeout(() => {
              setShowRealtimePopup(false)
            }, 500)
            // 완료 처리 후 추가 이벤트 무시
            streamLocked = true
            
            // 직렬점사 완료 시 즉시 결과 저장 (지연 없이)
            if (!autoSavedRef.current) {
              console.log('[직렬점사] 완료, 결과 저장 시작', {
                finalHtmlLength: finalHtml.length,
                hasResultData: !!finalResult,
                streamingFinished: true
              })
              autoSavedRef.current = true
              // 즉시 저장 (setTimeout 제거)
              ;(async () => {
                try {
                  // 최신 HTML과 content를 직접 전달하여 저장
                  if (finalHtml && finalHtml.length >= 100) {
                    await saveResultToLocal(false, finalHtml, content, model, startTime, userName)
                    console.log('[직렬점사] 결과 저장 완료', { htmlLength: finalHtml.length, hasContent: !!content })
                  } else {
                    console.error('[직렬점사] 결과 저장 실패: HTML이 유효하지 않음', {
                      htmlLength: finalHtml?.length || 0
                    })
                    autoSavedRef.current = false // 재시도 가능하도록
                  }
                } catch (err) {
                  console.error('[직렬점사] 결과 저장 실패:', err)
                  autoSavedRef.current = false // 실패 시 재시도 가능하도록
                }
              })()
            }
          } else if (data.type === 'error') {
            if (data.error && (data.error.includes('429') || data.error.includes('Rate Limit'))) {
              setIsStreamingActive(false)
              setStreamingFinished(true)
              streamLocked = true
            } else {
              setError(data.error || '점사를 진행하는 중 일시적인 문제가 발생했습니다.')
              setIsStreamingActive(false)
              setStreamingFinished(true)
              streamLocked = true
            }
          }
        })
    }

    // 병렬점사 전용 함수 (직렬점사 코드와 완전 분리)
    // 룰: 1) 첫 대메뉴 점사 요청 2) 청크 오는데로 즉시 표시 3) Done되면 즉시 다음 대메뉴 백그라운드 요청
    // 4) 사용자 읽는 동안 다음 대메뉴 데이터 받기 5) 컨텍스트 유지(이전 대메뉴 완료 후 다음 요청)
    const startParallelStreaming = async (
      requestData: any,
      content: any,
      startTime: number,
      model: string,
      userName: string,
      allMenuGroups: any[],
      payload: any
    ) => {
      const manseRyeokTable: string | undefined = payload?.requestData?.manse_ryeok_table
      
      // 각 대메뉴별 완료된 HTML 저장 (화면 떨림 방지)
      const completedMenuHtmls: string[] = []
      let allAccumulatedHtml = ''
      // ✅ 보장: 화면에 표시되는 HTML은 길이가 줄어들지 않게 단조 증가
      let lastRenderedLength = 0
      
      // 중복 요청 방지: 각 대메뉴별로 요청 중/완료 상태 추적
      const menuProcessingState: { [key: number]: 'idle' | 'processing' | 'done' } = {}
      let nextMenuRequested = false // 다음 대메뉴 요청 플래그

      // 대메뉴 처리 함수 (순차 실행 보장)
      const processNextMenu = async (menuIdx: number, previousContext: string) => {
        if (menuIdx >= allMenuGroups.length) {
          // 모든 대메뉴 완료 (이미 모든 대메뉴가 처리된 경우)
          setStreamingHtml(allAccumulatedHtml)
          const finalResult: ResultData = {
            content,
            html: allAccumulatedHtml,
            startTime,
            model,
            userName,
          }
          setResultData(finalResult)
          setIsStreamingActive(false)
          setStreamingFinished(true)
          setStreamingProgress(100) // 애니메이션으로 100%까지 증가
          setLoading(false)
          // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
          setTimeout(() => {
            setShowRealtimePopup(false)
          }, 500)
          console.log('[병렬점사] 모든 대메뉴 완료 (processNextMenu 체크), 스트리밍 종료')
          
          // 모든 대메뉴 완료 시 즉시 결과 저장 (지연 없이)
            if (!autoSavedRef.current) {
              console.log('[병렬점사] 완료 (체크), 결과 저장 시작')
              autoSavedRef.current = true
              // 즉시 저장 (setTimeout 제거)
              ;(async () => {
                try {
                  await saveResultToLocal(false, allAccumulatedHtml, content, model, startTime, userName)
                  console.log('[병렬점사] 결과 저장 완료')
                } catch (err) {
                  console.error('[병렬점사] 결과 저장 실패:', err)
                  autoSavedRef.current = false // 실패 시 재시도 가능하도록
                }
              })()
            }
          
          return
        }
        
        console.log(`[병렬점사] 대메뉴 ${menuIdx + 1}/${allMenuGroups.length} 처리 시작`)
        
        // 중복 요청 방지: 이미 처리 중이거나 완료된 대메뉴는 건너뛰기
        if (menuProcessingState[menuIdx] === 'processing' || menuProcessingState[menuIdx] === 'done') {
          return
        }
        
        // 요청 시작 표시
        menuProcessingState[menuIdx] = 'processing'
        nextMenuRequested = false // 다음 대메뉴 요청 플래그 초기화
        
        const group = allMenuGroups[menuIdx]
        
        const nextRequestData = {
          ...requestData,
          menu_subtitles: group.subtitles,
          menu_items: [group.menuItem],
          previousContext: previousContext, // 이전 대메뉴 완료된 텍스트 전체/요약 전달
          isParallelMode: true,
          currentMenuIndex: menuIdx,
          totalMenus: allMenuGroups.length
        }
        
        let menuAccumulated = '' // 현재 대메뉴의 누적 HTML
        let hasReceivedPartialDone = false
        let hasRequestedNextMenu = false // 다음 대메뉴 요청 여부 플래그
        let isProcessingDone = false // done 이벤트 처리 중 플래그 (중복 방지)
        
        try {
          await callJeminaiAPIStream(nextRequestData, async (nextData) => {
            if (cancelled) return
            // 이미 완료된 메뉴에 대한 늦은 이벤트는 무시 (재연결/재요청 등)
            if (menuProcessingState[menuIdx] === 'done') return
            
            if (nextData.type === 'start') {
              // lib/jeminai.ts에서 MAX_TOKENS 재요청 시에도 'start'가 한 번 더 전달될 수 있음.
              // 이미 받은 HTML이 있다면 초기화하지 않는다(재점사/중복처럼 보이는 현상 방지).
              if (!menuAccumulated || menuAccumulated.trim().length === 0) {
                menuAccumulated = ''
              }
            } 
            else if (nextData.type === 'chunk') {
              // 룰 2: 청크가 오는 즉시 화면에 표시
              const newChunk = nextData.text || ''
              if (newChunk) {
                // 재요청(2차)에서는 chunk 이벤트에 병합된 전체 HTML(nextData.html)이 포함될 수 있다.
                // 가능한 경우 nextData.html을 기준으로 누적하여 중복/리셋으로 인한 화면 흔들림을 막는다.
                if (nextData.html && nextData.html.length >= menuAccumulated.length) {
                  menuAccumulated = nextData.html
                } else {
                  menuAccumulated = appendStreamChunk(menuAccumulated, newChunk)
                }
                
                // HTML 정리 (테이블 중첩 방지 포함)
                let cleanedMenuHtml = menuAccumulated
                  .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                  .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                  .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                  .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                  .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                  .replace(/\*\*/g, '')
                
                // 테이블 중첩 방지: 테이블 내부에 테이블이 있는지 확인
                // (서버에서 방지해야 하지만 클라이언트에서도 안전장치)
                cleanedMenuHtml = cleanedMenuHtml.replace(/<table[^>]*>[\s\S]*?<table/g, (match) => {
                  // 중첩된 테이블 발견 시 내부 테이블을 div로 변환
                  return match.replace(/<table/g, '<div class="nested-table-prevention"')
                })
                
                // 만세력 테이블 삽입 (첫 번째 대메뉴만)
                if (menuIdx === 0 && manseRyeokTable && !cleanedMenuHtml.includes('manse-ryeok-table')) {
                  const firstMenuSectionMatch = cleanedMenuHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
                  if (firstMenuSectionMatch) {
                    const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)
                    if (thumbnailMatch) {
                      cleanedMenuHtml = cleanedMenuHtml.replace(
                        /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                        `$1\n${manseRyeokTable}`
                      )
                    } else {
                      const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                      if (menuTitleMatch) {
                        cleanedMenuHtml = cleanedMenuHtml.replace(
                          /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                          `$1\n${manseRyeokTable}`
                        )
                      }
                    }
                  }
                }
                
                // 룰 2: 청크 오는데로 즉시 표시 (이전 대메뉴 완료 HTML + 현재 대메뉴 누적 HTML)
                // 이전 대메뉴 HTML은 절대 변경되지 않음 (화면 떨림 방지)
                const displayHtml = allAccumulatedHtml + cleanedMenuHtml
                // ✅ 단조 증가 보장: 길이가 줄어드는 렌더는 무시
                if (displayHtml.length >= lastRenderedLength) {
                  lastRenderedLength = displayHtml.length
                  setStreamingHtml(displayHtml)
                }
              }
            } 
            else if (nextData.type === 'partial_done') {
              // 중복 partial_done 방지
              if (hasReceivedPartialDone) {
                return
              }
              
              hasReceivedPartialDone = true
              
              let nextPartialHtml = nextData.html || menuAccumulated
              nextPartialHtml = nextPartialHtml
                .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                .replace(/\*\*/g, '')
              
              // 테이블 중첩 방지
              nextPartialHtml = nextPartialHtml.replace(/<table[^>]*>[\s\S]*?<table/g, (match) => {
                return match.replace(/<table/g, '<div class="nested-table-prevention"')
              })
              
              // 완료된 부분을 allAccumulatedHtml에 추가 (이전 대메뉴 HTML은 그대로 유지)
              allAccumulatedHtml += nextPartialHtml
              completedMenuHtmls[menuIdx] = nextPartialHtml
              menuAccumulated = ''
              
              // 완료된 부분 표시 (done 이벤트 대기)
              if (allAccumulatedHtml.length >= lastRenderedLength) {
                lastRenderedLength = allAccumulatedHtml.length
                setStreamingHtml(allAccumulatedHtml)
              }
              
              // partial_done을 받은 경우, done 이벤트에서 다음 대메뉴를 요청하지 않도록 플래그 설정
              // (마지막 대메뉴가 아닌 경우에만)
              if (menuIdx < allMenuGroups.length - 1) {
                // partial_done을 받았지만 done 이벤트가 올 것이므로, done에서 다음 대메뉴 요청
                // hasRequestedNextMenu는 done에서 설정됨
              }
            } 
            else if (nextData.type === 'done') {
              // 중복 done 이벤트 방지
              if (isProcessingDone || hasRequestedNextMenu) {
                return
              }
              
              // done 이벤트 처리 시작
              isProcessingDone = true
              
              
              let nextFinalHtml = nextData.html || menuAccumulated
              
              // HTML 정리 (테이블 중첩 방지 포함)
              nextFinalHtml = nextFinalHtml
                .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                .replace(/\*\*/g, '')
              
              // 테이블 중첩 방지
              nextFinalHtml = nextFinalHtml.replace(/<table[^>]*>[\s\S]*?<table/g, (match) => {
                return match.replace(/<table/g, '<div class="nested-table-prevention"')
              })
              
              // 만세력 테이블 삽입 (첫 번째 대메뉴만)
              if (menuIdx === 0 && manseRyeokTable && !nextFinalHtml.includes('manse-ryeok-table')) {
                const firstMenuSectionMatch = nextFinalHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
                if (firstMenuSectionMatch) {
                  const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)
                  if (thumbnailMatch) {
                    nextFinalHtml = nextFinalHtml.replace(
                      /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  } else {
                    const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                    if (menuTitleMatch) {
                      nextFinalHtml = nextFinalHtml.replace(
                        /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                        `$1\n${manseRyeokTable}`
                      )
                    }
                  }
                }
              }
              
              // 완료된 대메뉴 HTML을 allAccumulatedHtml에 추가 (partial_done에서 이미 추가했으면 생략)
              if (!hasReceivedPartialDone) {
                allAccumulatedHtml += nextFinalHtml
                completedMenuHtmls[menuIdx] = nextFinalHtml
              }
              
              // 완료된 대메뉴 표시 (한 번에)
              if (allAccumulatedHtml.length >= lastRenderedLength) {
                lastRenderedLength = allAccumulatedHtml.length
                setStreamingHtml(allAccumulatedHtml)
              }
              
              // 현재 대메뉴 완료 표시
              menuProcessingState[menuIdx] = 'done'
              
              // 마지막 대메뉴 완료 여부 확인
              const isLastMenu = menuIdx >= allMenuGroups.length - 1
              
              if (isLastMenu) {
                // 모든 대메뉴 완료 - 스트리밍 종료 처리
                setStreamingHtml(allAccumulatedHtml)
                const finalResult: ResultData = {
                  content,
                  html: allAccumulatedHtml,
                  startTime,
                  model,
                  userName,
                }
                setResultData(finalResult)
                setIsStreamingActive(false)
                setStreamingFinished(true)
                setStreamingProgress(100) // 애니메이션으로 100%까지 증가
                setLoading(false)
                // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
                setTimeout(() => {
                  setShowRealtimePopup(false)
                }, 500)
                console.log('[병렬점사] 모든 대메뉴 완료, 스트리밍 종료')
                
                // 병렬점사 완료 시 즉시 결과 저장 (지연 없이)
                if (!autoSavedRef.current) {
                  console.log('[병렬점사] 완료, 결과 저장 시작')
                  autoSavedRef.current = true
                  // 즉시 저장 (setTimeout 제거)
                  ;(async () => {
                    try {
                      await saveResultToLocal(false, allAccumulatedHtml, content, model, startTime, userName)
                      console.log('[병렬점사] 결과 저장 완료')
                    } catch (err) {
                      console.error('[병렬점사] 결과 저장 실패:', err)
                      autoSavedRef.current = false // 실패 시 재시도 가능하도록
                    }
                  })()
                }
                
                return // 마지막 대메뉴이므로 다음 대메뉴 요청하지 않음
              }
              
              // 룰 3: Done 되는 순간, 즉시 다음 대메뉴를 백그라운드에서 시작
              // 룰 5: 컨텍스트 유지 - 이전 대메뉴 완료된 텍스트 전체를 다음 요청에 전달
              const nextContext = nextFinalHtml
                .replace(/<[^>]+>/g, ' ') // HTML 태그 제거
                .replace(/\s+/g, ' ') // 공백 정리
                .trim()
              
              
              // 다음 대메뉴 요청 플래그를 먼저 설정 (중복 방지)
              hasRequestedNextMenu = true
              nextMenuRequested = true
              
              
              // 다음 대메뉴 요청 (백그라운드로 즉시 시작, await로 순차 보장)
              // 이전 대메뉴 화면 표시에 영향 없이 진행
              // 플래그를 먼저 설정했으므로 중복 호출 방지됨
              await processNextMenu(menuIdx + 1, nextContext)
            } 
            else if (nextData.type === 'error') {
              // 에러 발생해도 현재까지의 내용은 표시
              if (allAccumulatedHtml.length >= lastRenderedLength) {
                lastRenderedLength = allAccumulatedHtml.length
                setStreamingHtml(allAccumulatedHtml)
              }
              setIsStreamingActive(false)
              setStreamingFinished(true)
              setStreamingProgress(100) // 애니메이션으로 100%까지 증가
              setLoading(false)
              // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
              setTimeout(() => {
                setShowRealtimePopup(false)
              }, 500)
            }
          })
        } catch (error) {
          // 에러 발생해도 현재까지의 내용은 표시
          if (allAccumulatedHtml.length >= lastRenderedLength) {
            lastRenderedLength = allAccumulatedHtml.length
            setStreamingHtml(allAccumulatedHtml)
          }
          setIsStreamingActive(false)
          setStreamingFinished(true)
          setStreamingProgress(100) // 애니메이션으로 100%까지 증가
          setLoading(false)
          // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
          setTimeout(() => {
            setShowRealtimePopup(false)
          }, 500)
        }
      }
      
      // 룰 1: 첫 번째 대메뉴 요청 시작
      await processNextMenu(0, '')
    }

    startStreaming()

    return () => {
      cancelled = true
      if (fakeProgressInterval) {
        clearInterval(fakeProgressInterval)
      }
    }
  }, [isRealtime, requestKey])

  // 페이지 포커스 시 저장된 결과 동기화
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (isRealtime) {
          // 스트리밍 중일 때는 백그라운드 복귀 시 스트림 상태 확인
          // 스트림은 백그라운드에서도 계속 진행되므로 별도 처리 불필요
          // lib/jeminai.ts의 visibilitychange 핸들러가 타임아웃 방지 처리
        } else {
          loadSavedResults()
        }
      } else {
        if (isRealtime) {
          // 스트리밍 중 백그라운드로 전환 (전화 수신, 메신저 알림 탭, 다른 앱으로 이동 등)
        }
      }
    }

    const handleFocus = () => {
      if (!isRealtime) {
        loadSavedResults()
      } else {
        // 스트리밍 중 포커스 복귀
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isRealtime])

  // 결과를 서버에 저장 (자동 저장용, alert 없음) - early return 이전에 정의
  // htmlOverride 파라미터 추가: 직렬점사 완료 시 최신 HTML을 직접 전달
  // contentOverride 파라미터 추가: htmlOverride와 함께 content도 전달
  // modelOverride, startTimeOverride, userNameOverride 파라미터 추가: 직렬/병렬 점사 완료 시 최신 정보 전달
  const saveResultToLocal = useCallback(async (
    showAlert: boolean = true, 
    htmlOverride?: string, 
    contentOverride?: any,
    modelOverride?: string,
    startTimeOverride?: number,
    userNameOverride?: string
  ) => {
    console.log('[결과 저장] saveResultToLocal 호출:', {
      hasWindow: typeof window !== 'undefined',
      hasResultData: !!resultData,
      hasHtmlOverride: !!htmlOverride,
      hasModelOverride: !!modelOverride,
      hasStartTimeOverride: !!startTimeOverride,
      hasUserNameOverride: !!userNameOverride,
      htmlOverrideLength: htmlOverride?.length || 0,
      showAlert
    })
    
    // htmlOverride가 있으면 resultData 없이도 저장 가능
    if (typeof window === 'undefined') {
      console.error('[결과 저장] 저장 실패: window 없음')
      if (showAlert) {
        alert('결과 저장에 실패했습니다. (window 없음)')
      }
      return
    }
    
    if (!resultData && !htmlOverride) {
      console.error('[결과 저장] 저장 실패: 데이터 없음', {
        hasResultData: !!resultData,
        hasHtmlOverride: !!htmlOverride
      })
      if (showAlert) {
        alert('결과 저장에 실패했습니다. (데이터 없음)')
      }
      return
    }
    
    // requestKey 저장 (나중에 temp_requests 삭제용)
    const currentRequestKey = requestKeyRef.current || requestKey
    console.log('[결과 저장] currentRequestKey:', currentRequestKey)
    
    try {
      // resultData에서 필요한 값들 가져오기 (없으면 기본값 사용)
      // htmlOverride가 있을 때는 resultData가 아직 설정되지 않았을 수 있으므로 optional chaining 사용
      // contentOverride가 있으면 우선 사용 (직렬점사 완료 시 content 직접 전달)
      const content = contentOverride || resultData?.content || null
      // htmlOverride가 있으면 우선 사용 (직렬점사 완료 시 최신 HTML)
      // 그 다음 realtime 모드에서는 streamingHtml이 더 최신일 수 있으므로 우선 사용
      const html = htmlOverride 
        ? htmlOverride
        : ((isRealtime && streamingHtml && streamingHtml.length > (resultData?.html?.length || 0))
          ? streamingHtml
          : (resultData?.html || streamingHtml || ''))
      
      // modelOverride가 있으면 우선 사용
      const model = modelOverride || resultData?.model || 'gemini-3-flash-preview'
      
      // userNameOverride가 있으면 우선 사용
      const userName = userNameOverride || resultData?.userName || content?.user_info?.name || ''
      
      console.log('[결과 저장] HTML 길이 확인:', {
        isRealtime,
        hasHtmlOverride: !!htmlOverride,
        resultDataHtmlLength: resultData?.html?.length || 0,
        streamingHtmlLength: streamingHtml?.length || 0,
        finalHtmlLength: html.length,
        htmlPreview: html.substring(0, 200) // HTML 내용 미리보기
      })
      
      // HTML이 비어있거나 너무 짧으면 저장하지 않음
      if (!html || html.trim().length < 100) {
        console.error('[결과 저장] HTML 내용이 비어있거나 너무 짧음:', {
          htmlLength: html?.length || 0,
          htmlTrimmedLength: html?.trim().length || 0,
          htmlPreview: html?.substring(0, 200) || 'EMPTY'
        })
        if (showAlert) {
          alert('저장할 내용이 없습니다. 점사가 완료된 후 다시 시도해주세요.')
        }
        return
      }
      const fontFace = content?.font_face || ''
      
      // HTML에 모든 CSS 스타일 포함하여 저장 (result 페이지와 동일하게 표시되도록)
      let htmlWithFont = html || ''
      
      console.log('[결과 저장] HTML 처리 시작:', {
        originalHtmlLength: html.length,
        htmlPreview: html.substring(0, 300)
      })
      
      // font-family 추출
      const match = fontFace ? fontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/) : null
      const extractedFontFamily = match ? (match[1] || match[2]?.trim()) : null
      
      // 폰트 크기 및 볼드 설정 (content 객체에서 가져오기)
      const menuFontSize = content?.menu_font_size || 16
      const menuFontBold = content?.menu_font_bold || false
      const subtitleFontSize = content?.subtitle_font_size || 14
      const subtitleFontBold = content?.subtitle_font_bold || false
      const detailMenuFontSize = content?.detail_menu_font_size || 12
      const detailMenuFontBold = content?.detail_menu_font_bold || false
      const bodyFontSize = content?.body_font_size || 11
      const bodyFontBold = content?.body_font_bold || false
      
      // 컬러 값 추출
      const menuColor = content?.menu_color || ''
      const subtitleColor = content?.subtitle_color || ''
      const detailMenuColor = content?.detail_menu_color || ''
      const bodyColor = content?.body_color || ''
      
      // result 페이지와 동일한 전체 CSS 스타일 생성
      const completeStyle = `
<style>
${fontFace ? fontFace : ''}
.jeminai-results .menu-title {
  font-size: ${menuFontSize}px !important;
  font-weight: ${menuFontBold ? 'bold' : 'normal'} !important;
  line-height: 1.6 !important;
  ${menuColor ? `color: ${menuColor} !important;` : ''}
}
.jeminai-results .subtitle-title {
  font-size: ${subtitleFontSize}px !important;
  font-weight: ${subtitleFontBold ? 'bold' : 'normal'} !important;
  ${subtitleColor ? `color: ${subtitleColor} !important;` : ''}
}
.jeminai-results .detail-menu-title {
  font-size: ${detailMenuFontSize}px !important;
  font-weight: ${detailMenuFontBold ? 'bold' : 'normal'} !important;
  ${detailMenuColor ? `color: ${detailMenuColor} !important;` : ''}
}
.jeminai-results .subtitle-content {
  font-size: ${bodyFontSize}px !important;
  font-weight: ${bodyFontBold ? 'bold' : 'normal'} !important;
  margin-bottom: 2em !important;
  line-height: 1.8 !important;
  ${bodyColor ? `color: ${bodyColor} !important;` : ''}
}
.jeminai-results .detail-menu-content {
  font-size: ${bodyFontSize}px !important;
  font-weight: ${bodyFontBold ? 'bold' : 'normal'} !important;
  line-height: 1.8 !important;
  margin-bottom: 0 !important;
  ${bodyColor ? `color: ${bodyColor} !important;` : ''}
}
.jeminai-results .detail-menu-container {
  margin-bottom: 2em !important;
}
.jeminai-results .detail-menu-section {
  margin-bottom: 2em !important;
}
.jeminai-results .detail-menu-section:last-child {
  margin-bottom: 0 !important;
}
.jeminai-results .subtitle-section {
  padding-top: 24px;
  padding-bottom: 24px;
  position: relative;
}
.jeminai-results .subtitle-section:not(:last-child)::after {
  content: '';
  display: block;
  width: 300px;
  height: 2px;
  background: linear-gradient(to right, transparent, #e5e7eb, transparent);
  margin: 24px auto 0;
}
.jeminai-results .subtitle-section:last-child {
  padding-top: 24px;
  padding-bottom: 24px;
}
.loading-dots {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.loading-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #ec4899;
  opacity: 0.3;
  animation: dot-bounce 1s infinite;
}
.loading-dots .dot:nth-child(2) { animation-delay: 0.15s; }
.loading-dots .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40% { transform: translateY(-4px); opacity: 1; }
}
</style>
`
      htmlWithFont = completeStyle + htmlWithFont
      
      console.log('[결과 저장] HTML 스타일 추가 후:', {
        htmlWithFontLength: htmlWithFont.length,
        styleLength: completeStyle.length,
        contentHtmlLength: html.length
      })
      
      // currentTime 계산 (resultData.startTime이 있으면)
      let processingTime = '0:00'
      const startTime = startTimeOverride || resultData?.startTime
      if (startTime) {
        const elapsed = Date.now() - startTime
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        processingTime = `${mins}:${secs.toString().padStart(2, '0')}`
      }
      
      const currentSavedId = savedIdRef.current || savedId
      const hasDraftId = !!currentSavedId
      const endpoint = hasDraftId ? '/api/saved-results/update' : '/api/saved-results/save'

      console.log('[결과 저장] 저장 요청 준비:', {
        endpoint,
        hasDraftId,
        currentSavedId,
        htmlWithFontLength: htmlWithFont.length,
        title: content?.content_name || '재회 결과',
        model,
        processingTime,
        userName
      })

      const response = await fetch(endpoint, {
        method: 'POST',
        cache: 'no-store', // 프로덕션 환경에서 캐싱 방지
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...(hasDraftId ? { id: currentSavedId } : {}),
          title: content?.content_name || '재회 결과',
          html: htmlWithFont, // 웹폰트가 포함된 HTML 저장
          content: content, // content 객체 전체 저장 (tts_speaker 포함)
          model: model, // 모델 정보 저장
          processingTime: processingTime, // 처리 시간 저장
          userName: userName // 사용자 이름 저장
        })
      })

      console.log('[결과 저장] 저장 요청 완료:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })

      if (!response.ok) {
        const errorText = await response.text()
        let error: any = {}
        if (errorText) {
          try {
            error = JSON.parse(errorText)
          } catch (e) {
            error = { error: errorText || '결과 저장에 실패했습니다.' }
          }
        }
        throw new Error(error.error || '결과 저장에 실패했습니다.')
      }

      const result = await response.json()
      console.log('[결과 저장] 저장 응답:', result)
      console.log('[결과 저장] 응답 상세:', {
        success: result.success,
        hasData: !!result.data,
        dataId: result.data?.id,
        dataIdType: typeof result.data?.id,
        currentRequestKey,
        currentSavedId
      })
      
      if (result.success) {
        
        // 저장된 결과 ID 저장 (동기화 확인용)
        const savedResultId = result.data?.id
        const savedHtml = result.data?.html || ''
        console.log('[결과 저장] savedResultId 추출:', {
          savedResultId,
          savedResultIdType: typeof savedResultId,
          savedResultIdString: String(savedResultId),
          savedHtmlLength: savedHtml.length
        })
        console.log('[결과 저장] 저장된 HTML 미리보기:', savedHtml.substring(0, 300))
        console.log('[결과 저장] 저장된 HTML에 menu-section 포함:', savedHtml.includes('menu-section'))
        console.log('[결과 저장] 저장된 HTML에 subtitle-section 포함:', savedHtml.includes('subtitle-section'))
        
        // 저장된 HTML이 비어있으면 경고
        if (!savedHtml || savedHtml.trim().length < 100) {
          console.error('[결과 저장] 저장된 HTML이 비어있음!', {
            savedHtmlLength: savedHtml.length,
            savedHtmlTrimmedLength: savedHtml.trim().length,
            savedHtmlPreview: savedHtml.substring(0, 200),
            sentHtmlLength: htmlWithFont.length,
            sentHtmlPreview: htmlWithFont.substring(0, 200)
          })
          if (showAlert) {
            alert('경고: 저장된 내용이 비어있습니다. 관리자에게 문의해주세요.')
          }
        } else if (!savedHtml.includes('menu-section') && !savedHtml.includes('subtitle-section')) {
          console.warn('[결과 저장] 저장된 HTML에 본문 내용이 없을 수 있음:', {
            savedHtmlLength: savedHtml.length,
            hasMenuSection: savedHtml.includes('menu-section'),
            hasSubtitleSection: savedHtml.includes('subtitle-section'),
            savedHtmlPreview: savedHtml.substring(0, 500)
          })
        }
        
        // 저장된 결과를 리스트 맨 위에 추가 (즉시 반영)
        if (result.data) {
          setSavedResults((prev) => {
            // 중복 제거 (같은 ID가 있으면 제거)
            const filtered = prev.filter((item: any) => item.id !== result.data.id)
            // 새 데이터를 맨 위에 추가
            return [result.data, ...filtered]
          })
        }
        
        // user_credentials 업데이트: 점사 완료 후 저장된 savedId를 user_credentials에 저장
        // 이제 savedId는 점사 완료 후에만 생성되므로 항상 업데이트 필요
        console.log('[결과 저장] user_credentials 업데이트 조건 확인:', {
          hasCurrentRequestKey: !!currentRequestKey,
          currentRequestKey,
          hasSavedResultId: !!savedResultId,
          savedResultId,
          savedResultIdType: typeof savedResultId,
          savedResultIdString: String(savedResultId),
          savedResultIdTruthy: !!savedResultId
        })
        
        if (currentRequestKey && savedResultId) {
          console.log('[결과 저장] user_credentials 업데이트 시도:', { currentRequestKey, savedId: savedResultId })
          try {
            // savedId를 숫자로 변환 (문자열일 수 있음)
            const savedIdNumber = typeof savedResultId === 'string' ? parseInt(savedResultId, 10) : savedResultId
            if (isNaN(savedIdNumber) || savedIdNumber <= 0) {
              console.error('[결과 저장] savedId가 유효한 숫자가 아닙니다:', {
                savedResultId,
                savedIdNumber,
                isNaN: isNaN(savedIdNumber),
                isPositive: savedIdNumber > 0
              })
              // 에러가 나도 계속 진행 (저장은 성공했으므로)
              return
            }
            
            // savedId가 유효한지 재확인
            if (!savedIdNumber || savedIdNumber <= 0) {
              console.error('[결과 저장] savedId가 유효하지 않음:', savedIdNumber)
              return
            }
            
            console.log('[결과 저장] user_credentials 업데이트 요청:', {
              requestKey: currentRequestKey,
              savedId: savedIdNumber
            })
            
            const updateResponse = await fetch('/api/user-credentials/update', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestKey: currentRequestKey,
                savedId: savedIdNumber
              })
            })
            
            console.log('[결과 저장] user_credentials 업데이트 응답:', {
              status: updateResponse.status,
              ok: updateResponse.ok
            })
            
            if (!updateResponse.ok) {
              const errorText = await updateResponse.text()
              console.error('[결과 저장] user_credentials 업데이트 실패:', {
                status: updateResponse.status,
                errorText
              })
            } else {
              const updateResult = await updateResponse.json()
              console.log('[결과 저장] user_credentials 업데이트 성공:', updateResult)
            }
          } catch (updateError) {
            // 업데이트 실패는 무시 (로그만 출력)
            console.error('[결과 저장] user_credentials 업데이트 실패:', updateError)
          }
        } else {
          console.warn('[결과 저장] user_credentials 업데이트 스킵:', { 
            currentRequestKey, 
            savedResultId,
            hasCurrentRequestKey: !!currentRequestKey,
            hasSavedResultId: !!savedResultId
          })
        }
        
        // temp_requests 삭제 (결과 저장 성공 후)
        if (currentRequestKey) {
          try {
            await fetch(`/api/temp-request/delete?requestKey=${currentRequestKey}`, {
              method: 'DELETE'
            })
          } catch (deleteError) {
            // 삭제 실패는 무시
          }
        }
        
        if (showAlert) {
          alert('결과가 저장되었습니다.')
        } else {
        }
        // 저장된 결과 목록 다시 로드 (DB 동기화를 위해 충분한 시간 대기)
        // DB에 저장 후 인덱싱/캐싱 시간을 고려하여 1.5초 후 조회
        setTimeout(async () => {
          await loadSavedResults()
          
          // 동기화 후 새로 저장된 항목이 포함되어 있는지 확인
          setSavedResults((prev) => {
            const hasNewItem = prev.some((item: any) => item.id === savedResultId)
            if (!hasNewItem && result.data) {
              // 새로 저장된 항목이 없으면 다시 추가
              const filtered = prev.filter((item: any) => item.id !== result.data.id)
              return [result.data, ...filtered]
            }
            return prev
          })
          
        }, 1500)
      } else {
        console.error('[결과 저장] 저장 실패: result.success가 false')
        if (showAlert) {
          alert('결과 저장에 실패했습니다.')
        }
      }
    } catch (e: any) {
      console.error('[결과 저장] 저장 실패:', e)
      if (showAlert) {
        alert('결과 저장에 실패했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
      }
    }
  }, [resultData, requestKey, loadSavedResults, isRealtime, streamingHtml])

  // 점사 완료 시 자동 저장 - early return 이전에 정의
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // 이미 자동 저장했으면 건너뛰기 (직렬점사에서 직접 저장했을 수 있음)
    if (autoSavedRef.current) {
      // 로그를 너무 많이 출력하지 않도록 주석 처리
      // console.log('[자동 저장] 이미 저장했으므로 스킵')
      return
    }
    
    // html 값 가져오기 (resultData에서 직접, 없으면 streamingHtml 사용)
    // realtime 모드에서는 streamingHtml이 최신일 수 있으므로 우선 사용
    const htmlContent = (isRealtime && streamingHtml && streamingHtml.length > (resultData?.html?.length || 0)) 
      ? streamingHtml 
      : (resultData?.html || streamingHtml || '')
    
    // HTML 내용이 너무 짧으면 저장하지 않음 (최소 100자 이상)
    const hasValidContent = htmlContent.length >= 100
    
    // 점사 완료 조건 확인
    // realtime 모드: streamingFinished가 true이고 resultData와 htmlContent가 있어야 함
    // batch 모드: resultData와 htmlContent가 있고 스트리밍이 비활성화되어야 함
    // 직렬점사는 직접 저장하므로, 자동 저장은 streamingFinished가 true일 때만 실행
    const isCompleted = 
      (isRealtime && streamingFinished && resultData && htmlContent && hasValidContent) ||
      (!isRealtime && fortuneViewMode === 'batch' && resultData && htmlContent && hasValidContent && !isStreamingActive && streamingFinished)
    
    // 로그를 조건 충족 시에만 출력하도록 개선 (너무 많은 로그 방지)
    if (isCompleted && resultData && htmlContent && hasValidContent) {
      console.log('[자동 저장] 조건 충족, 저장 시작:', {
        isRealtime,
        fortuneViewMode,
        streamingFinished,
        htmlContentLength: htmlContent.length,
        isStreamingActive,
        requestKey
      })
      autoSavedRef.current = true
      // realtime 모드에서는 streamingHtml을 resultData에 반영하여 저장
      if (isRealtime && streamingHtml && streamingHtml.length > (resultData?.html?.length || 0) && resultData) {
        const updatedResultData = {
          ...resultData,
          html: streamingHtml
        }
        setResultData(updatedResultData)
        // resultData 업데이트 후 저장하도록 약간 지연
        setTimeout(() => {
          saveResultToLocal(false).catch(err => {
            console.error('[자동 저장] 저장 실패:', err)
            autoSavedRef.current = false // 실패 시 재시도 가능하도록
          })
        }, 300)
      } else {
        saveResultToLocal(false).catch(err => {
          console.error('[자동 저장] 저장 실패:', err)
          autoSavedRef.current = false // 실패 시 재시도 가능하도록
        })
      }
    } else if (isRealtime && !streamingFinished && resultData && htmlContent && hasValidContent) {
      // streamingFinished가 아직 false이지만 resultData와 htmlContent가 있으면 대기
      // (직렬점사에서 직접 저장할 예정이므로 자동 저장은 스킵)
      // 로그는 주석 처리하여 너무 많이 출력되지 않도록 함
    }
  }, [isRealtime, fortuneViewMode, streamingFinished, resultData, streamingHtml, isStreamingActive, requestKey, saveResultToLocal])

  // 경과 시간 계산 (완료된 결과만 표시)
  useEffect(() => {
    if (resultData?.startTime) {
      const elapsed = Date.now() - resultData.startTime
      const mins = Math.floor(elapsed / 60000)
      const secs = Math.floor((elapsed % 60000) / 1000)
      setCurrentTime(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
  }, [resultData?.startTime])

  // 점진적 점사 모드: 섹션 파싱 및 순차 공개
  useEffect(() => {
    if (fortuneViewMode !== 'realtime' || typeof window === 'undefined') {
      setParsedMenus([])
      setTotalSubtitles(0)
      setRevealedCount(0)
      setShowRealtimeLoading(false)
      // 캐시 초기화
      thumbnailHtmlCacheRef.current.clear()
      manseHtmlCacheRef.current.clear()
      subtitleHtmlLengthRef.current.clear()
      detailMenuHtmlLengthRef.current.clear()
      subtitleStableCountRef.current.clear()
      detailMenuStableCountRef.current.clear()
      // 타임아웃 정리
      if (parsingTimeoutRef.current) {
        clearTimeout(parsingTimeoutRef.current)
        parsingTimeoutRef.current = null
      }
      return
    }

    const sourceHtml = (() => {
      const resultHtml = resultData?.html || ''
      const streamHtml = streamingHtml || ''
      // 완료 시점에는 항상 완료본(resultHtml) 우선
      if (streamingFinished || !isStreamingActive) {
        return resultHtml || streamHtml
      }
      // 진행 중에는 더 긴 쪽을 우선 (부분 HTML 역전 방지)
      if (streamHtml && resultHtml) {
        return streamHtml.length >= resultHtml.length ? streamHtml : resultHtml
      }
      return streamHtml || resultHtml
    })()
    if (!sourceHtml) {
      // ✅ 버그 수정: sourceHtml이 비어있어도 이전 파싱 결과를 유지
      // 스트리밍 완료 후 빈 HTML로 인해 화면이 비어지는 문제 방지
      // 이전에 파싱된 결과가 있으면 유지하고, 없으면 초기화
      // setParsedMenus([]) - 제거: 이전 결과 유지
      // setTotalSubtitles(0) - 제거: 이전 결과 유지
      // setRevealedCount(0) - 제거: 이전 결과 유지
      setShowRealtimeLoading(false) // 팝업 없이 바로 화면 유지
      // 타임아웃 정리
      if (parsingTimeoutRef.current) {
        clearTimeout(parsingTimeoutRef.current)
        parsingTimeoutRef.current = null
      }
      return
    }
    
    // 디버깅: streamingHtml 변경 감지
    
    // 성능 최적화: 파싱 작업을 딜레이하여 CPU 사용량 감소
    // 실시간 표시를 위해 딜레이를 0ms로 단축 (즉시 실행)
    if (parsingTimeoutRef.current) {
      clearTimeout(parsingTimeoutRef.current)
    }
    
    // requestAnimationFrame을 사용하여 브라우저 렌더링 사이클에 맞춤
    parsingTimeoutRef.current = setTimeout(() => {
      parsingTimeoutRef.current = null

    // 원본 HTML에서 특정 detail-menu-content가 완성되었는지 확인하는 함수
    // menuIndex번째 menu-section 내의 subtitleIndex번째 subtitle-section의 detailMenuIndex번째 상세메뉴 확인
    const isDetailMenuContentComplete = (html: string, subtitleIndex: number, menuIdx: number, detailMenuIndex: number): boolean => {
      // menu-section 찾기
      const menuSectionRegex = /<div[^>]*class="[^"]*menu-section[^"]*"[^>]*>/gi
      const menuMatches: RegExpMatchArray[] = []
      let menuMatch
      while ((menuMatch = menuSectionRegex.exec(html)) !== null) {
        menuMatches.push(menuMatch as RegExpMatchArray)
      }
      
      if (menuIdx >= menuMatches.length) return false
      
      const menuStartMatch = menuMatches[menuIdx]
      const menuStartIndex = menuStartMatch.index!
      const menuStartTag = menuStartMatch[0]
      
      // menu-section의 끝 찾기
      let menuDepth = 1
      let menuCurrentIndex = menuStartIndex + menuStartTag.length
      let menuEndIndex = html.length
      
      while (menuCurrentIndex < html.length && menuDepth > 0) {
        const nextOpenDiv = html.indexOf('<div', menuCurrentIndex)
        const nextCloseDiv = html.indexOf('</div>', menuCurrentIndex)
        
        if (nextCloseDiv === -1) break
        
        if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
          menuDepth++
          menuCurrentIndex = nextOpenDiv + 4
        } else {
          menuDepth--
          if (menuDepth === 0) {
            menuEndIndex = nextCloseDiv + 6
            break
          }
          menuCurrentIndex = nextCloseDiv + 6
        }
      }
      
      // 해당 menu-section 내에서 subtitle-section 찾기
      const menuSectionHtml = html.substring(menuStartIndex, menuEndIndex)
      const subtitleSectionRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi
      const subtitleMatches: RegExpMatchArray[] = []
      let subtitleMatch
      while ((subtitleMatch = subtitleSectionRegex.exec(menuSectionHtml)) !== null) {
        subtitleMatches.push(subtitleMatch as RegExpMatchArray)
      }
      
      if (subtitleIndex >= subtitleMatches.length) return false
      
      const subtitleStartMatch = subtitleMatches[subtitleIndex]
      const subtitleStartIndex = subtitleStartMatch.index!
      const subtitleStartTag = subtitleStartMatch[0]
      
      // subtitle-section의 끝 찾기
      let subtitleDepth = 1
      let subtitleCurrentIndex = subtitleStartIndex + subtitleStartTag.length
      let subtitleEndIndex = -1
      
      while (subtitleCurrentIndex < menuSectionHtml.length && subtitleDepth > 0) {
        const nextOpenDiv = menuSectionHtml.indexOf('<div', subtitleCurrentIndex)
        const nextCloseDiv = menuSectionHtml.indexOf('</div>', subtitleCurrentIndex)
        
        if (nextCloseDiv === -1) break
        
        if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
          subtitleDepth++
          subtitleCurrentIndex = nextOpenDiv + 4
        } else {
          subtitleDepth--
          if (subtitleDepth === 0) {
            subtitleEndIndex = nextCloseDiv + 6
            break
          }
          subtitleCurrentIndex = nextCloseDiv + 6
        }
      }
      
      if (subtitleEndIndex === -1) return false
      
      // subtitle-section 내에서 detail-menu-section 찾기
      const subtitleSectionHtml = menuSectionHtml.substring(subtitleStartIndex, subtitleEndIndex)
      const detailMenuSectionMatch = subtitleSectionHtml.match(/<div[^>]*class="[^"]*detail-menu-section[^"]*"[^>]*>/i)
      if (!detailMenuSectionMatch) return false
      
      // detail-menu-section 내에서 detail-menu-content 찾기
      const detailMenuContentRegex = /<div[^>]*class="[^"]*detail-menu-content[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
      const detailMenuMatches: RegExpMatchArray[] = []
      let detailMenuMatch
      while ((detailMenuMatch = detailMenuContentRegex.exec(subtitleSectionHtml)) !== null) {
        detailMenuMatches.push(detailMenuMatch as RegExpMatchArray)
      }
      
      if (detailMenuIndex >= detailMenuMatches.length) return false
      
      const contentMatch = detailMenuMatches[detailMenuIndex]
      const contentText = contentMatch[1] || ''
      
      // 내용이 있고 최소 길이 이상이면 완성으로 간주 (상세메뉴는 최소 50자 이상, 너무 짧으면 미완성으로 간주)
      return contentText.trim().length > 50
    }

    // 원본 HTML에서 특정 subtitle-section이 완전히 닫혔는지 확인하는 함수
    // menuIndex번째 menu-section 내의 subtitleIndex번째 subtitle-section 확인
    const isSubtitleSectionComplete = (html: string, subtitleIndex: number, menuIdx: number): boolean => {
      // menu-section 찾기
      const menuSectionRegex = /<div[^>]*class="[^"]*menu-section[^"]*"[^>]*>/gi
      const menuMatches: RegExpMatchArray[] = []
      let menuMatch
      while ((menuMatch = menuSectionRegex.exec(html)) !== null) {
        menuMatches.push(menuMatch as RegExpMatchArray)
      }
      
      if (menuIdx >= menuMatches.length) return false
      
      const menuStartMatch = menuMatches[menuIdx]
      const menuStartIndex = menuStartMatch.index!
      const menuStartTag = menuStartMatch[0]
      
      // menu-section의 끝 찾기
      let menuDepth = 1
      let menuCurrentIndex = menuStartIndex + menuStartTag.length
      let menuEndIndex = html.length
      
      while (menuCurrentIndex < html.length && menuDepth > 0) {
        const nextOpenDiv = html.indexOf('<div', menuCurrentIndex)
        const nextCloseDiv = html.indexOf('</div>', menuCurrentIndex)
        
        if (nextCloseDiv === -1) break
        
        if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
          menuDepth++
          menuCurrentIndex = nextOpenDiv + 4
        } else {
          menuDepth--
          if (menuDepth === 0) {
            menuEndIndex = nextCloseDiv + 6
            break
          }
          menuCurrentIndex = nextCloseDiv + 6
        }
      }
      
      // 해당 menu-section 내에서 subtitle-section 찾기
      const menuSectionHtml = html.substring(menuStartIndex, menuEndIndex)
      const subtitleSectionRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi
      const subtitleMatches: RegExpMatchArray[] = []
      let subtitleMatch
      while ((subtitleMatch = subtitleSectionRegex.exec(menuSectionHtml)) !== null) {
        subtitleMatches.push(subtitleMatch as RegExpMatchArray)
      }
      
      if (subtitleIndex >= subtitleMatches.length) return false
      
      const subtitleStartMatch = subtitleMatches[subtitleIndex]
      const subtitleStartIndex = subtitleStartMatch.index!
      const subtitleStartTag = subtitleStartMatch[0]
      
      // subtitle-section의 끝 찾기 (중첩 고려)
      let subtitleDepth = 1
      let subtitleCurrentIndex = subtitleStartIndex + subtitleStartTag.length
      let subtitleEndIndex = -1
      
      while (subtitleCurrentIndex < menuSectionHtml.length && subtitleDepth > 0) {
        const nextOpenDiv = menuSectionHtml.indexOf('<div', subtitleCurrentIndex)
        const nextCloseDiv = menuSectionHtml.indexOf('</div>', subtitleCurrentIndex)
        
        if (nextCloseDiv === -1) break
        
        if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
          subtitleDepth++
          subtitleCurrentIndex = nextOpenDiv + 4
        } else {
          subtitleDepth--
          if (subtitleDepth === 0) {
            subtitleEndIndex = nextCloseDiv + 6
            break
          }
          subtitleCurrentIndex = nextCloseDiv + 6
        }
      }
      
      return subtitleEndIndex > subtitleStartIndex
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(sourceHtml, 'text/html')
    
    // 디버깅: 스트리밍 중 상세메뉴 섹션 존재 여부 확인
    const hasDetailMenuSection = sourceHtml.includes('detail-menu-section')
    if (isStreaming && !hasDetailMenuSection && sourceHtml.length > 500) {
    } else if (isStreaming && hasDetailMenuSection) {
       // 너무 자주 찍히지 않도록 길이 변화가 클 때만 찍거나 해야겠지만, 일단 확인을 위해
    }

    const menuSections = Array.from(doc.querySelectorAll('.menu-section'))

    // ✅ 방어 로직:
    // 점사 HTML이 "완료"로 끝났더라도, 간헐적으로 마지막에 또는 첫번째에
    // <div class="menu-section"><h2 class="menu-title">...</h2></div>
    // 처럼 "메뉴 제목만 있고 소제목/본문이 없는" 빈 섹션이 붙는 경우가 있음.
    // 이 경우 UI에서 '첫번째 대제목만' 덩그러니 렌더링되는 문제가 발생하므로,
    // 첫번째와 마지막에 붙은 "빈 menu-section"은 파싱 대상에서 제외한다. (중간 섹션은 건드리지 않음)
    const cleanedMenuSections = [...menuSections]
    
    // 마지막 빈 섹션 제거
    while (cleanedMenuSections.length > 0) {
      const last = cleanedMenuSections[cleanedMenuSections.length - 1]
      const hasSubSections =
        last.querySelectorAll('.subtitle-section, .detail-menu-section').length > 0
      const hasBodyContent =
        last.querySelectorAll('.subtitle-content, .detail-menu-content').length > 0
      if (hasSubSections || hasBodyContent) break
      cleanedMenuSections.pop()
    }
    
    // 첫번째 빈 섹션 제거 (중복 방지)
    while (cleanedMenuSections.length > 0) {
      const first = cleanedMenuSections[0]
      const hasSubSections =
        first.querySelectorAll('.subtitle-section, .detail-menu-section').length > 0
      const hasBodyContent =
        first.querySelectorAll('.subtitle-content, .detail-menu-content').length > 0
      if (hasSubSections || hasBodyContent) break
      // 첫번째가 빈 섹션이고 다른 섹션이 있으면 제거
      if (cleanedMenuSections.length > 1) {
        cleanedMenuSections.shift()
      } else {
        // 섹션이 하나뿐이면 빈 섹션이어도 유지 (모두 제거되는 것 방지)
        break
      }
    }
    
    // ✅ 중복 대메뉴 제거 (같은 제목의 대메뉴가 연속으로 있으면 하나만 유지)
    // 간헐적으로 스트리밍 완료 시 첫번째 대메뉴가 다시 HTML에 포함되는 문제 방어
    const seenMenuTitles = new Set<string>()
    const deduplicatedMenuSections: Element[] = []
    for (const section of cleanedMenuSections) {
      const titleEl = section.querySelector('.menu-title')
      const titleText = (titleEl?.textContent?.trim() || '').replace(/^\d+(?:-\d+)*(?:-\d+)?\.\s*/, '').trim()
      
      // 같은 제목의 대메뉴가 이미 있으면 건너뛰기 (단, 내용이 더 많은 것을 유지)
      if (seenMenuTitles.has(titleText) && titleText !== '') {
        // 기존에 추가된 섹션과 비교하여 내용이 더 많은 것을 유지
        const existingIndex = deduplicatedMenuSections.findIndex(s => {
          const t = s.querySelector('.menu-title')?.textContent?.trim().replace(/^\d+(?:-\d+)*(?:-\d+)?\.\s*/, '').trim()
          return t === titleText
        })
        if (existingIndex >= 0) {
          const existingSection = deduplicatedMenuSections[existingIndex]
          const existingContentLength = existingSection.querySelectorAll('.subtitle-content, .detail-menu-content').length
          const newContentLength = section.querySelectorAll('.subtitle-content, .detail-menu-content').length
          
          // 새 섹션이 더 많은 내용을 가지면 교체
          if (newContentLength > existingContentLength) {
            deduplicatedMenuSections[existingIndex] = section
          }
        }
        continue
      }
      
      seenMenuTitles.add(titleText)
      deduplicatedMenuSections.push(section)
    }
    
    // cleanedMenuSections를 중복 제거된 배열로 교체
    cleanedMenuSections.length = 0
    cleanedMenuSections.push(...deduplicatedMenuSections)

    // 숫자 접두사 제거 함수 (예: "1. " → "", "1-1. " → "", "1-1-1. " → "")
    const removeNumberPrefix = (text: string): string => {
      if (!text) return text
      // "1. ", "1-1. ", "1-1-1. " 등의 패턴 제거 (더 강력한 패턴)
      return text.replace(/^\d+(?:-\d+)*(?:-\d+)?\.\s*/, '').trim()
        .replace(/^[\d\-\.\s]+/, '').trim() // 추가: 앞부분의 모든 숫자, 하이픈, 점, 공백 제거
    }

    // 만세력 HTML에 오행 스타일 적용 함수 (DOM 직접 수정 대신 HTML 문자열 변환)
    const applyManseStyles = (html: string): string => {
      if (!html) return ''
      
      // 오행별 천간/지지 매핑
      const elementMap: Record<string, string> = {
        // 천간 (天干)
        '甲': 'wood', '乙': 'wood', '갑': 'wood', '을': 'wood',
        '丙': 'fire', '丁': 'fire', '병': 'fire', '정': 'fire',
        '戊': 'earth', '己': 'earth', '무': 'earth', '기': 'earth',
        '庚': 'metal', '辛': 'metal', '경': 'metal', '신': 'metal',
        '壬': 'water', '癸': 'water', '임': 'water', '계': 'water',
        // 지지 (地支)
        '寅': 'wood', '卯': 'wood', '인': 'wood', '묘': 'wood',
        '巳': 'fire', '午': 'fire', '사': 'fire', '오': 'fire',
        '辰': 'earth', '戌': 'earth', '丑': 'earth', '未': 'earth',
        '진': 'earth', '술': 'earth', '축': 'earth', '미': 'earth',
        '申': 'metal', '酉': 'metal', '유': 'metal',
        '子': 'water', '亥': 'water', '자': 'water', '해': 'water',
        // 오행 글자 자체
        '木': 'wood', '목': 'wood',
        '火': 'fire', '화': 'fire',
        '土': 'earth', '토': 'earth',
        '金': 'metal', '금': 'metal',
        '水': 'water', '수': 'water',
      }
      
      // 천간/지지 문자 목록 (크기 확대 적용 대상)
      const ganziChars = new Set([
        '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
        '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
        '갑', '을', '병', '정', '무', '기', '경', '신', '임', '계',
        '자', '축', '인', '묘', '진', '사', '오', '미', '유', '술', '해'
      ])
      
      // 일반 폰트 적용 행 (오행 색상 적용 안 함)
      const normalFontRows = ['십성', '지장간', '십이운성', '십이신살']
      // 2줄 표시 행: 1줄(한글) + 2줄(괄호 포함 한문)
      const twoLineRows = ['십성', '지장간', '십이신살']
      
      // DOMParser로 HTML 파싱
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const table = doc.querySelector('table')
      if (!table) return html
      
      const rows = table.querySelectorAll('tr')
      rows.forEach((row) => {
        const cells = row.querySelectorAll('td')
        if (cells.length === 0) return
        
        // 첫 번째 셀(구분 컬럼)의 텍스트 확인
        const firstCellText = cells[0]?.textContent?.trim() || ''
        
        // 십성, 지장간, 십이운성, 십이신살 행은 일반 폰트 (오행 색상 적용 안 함)
        const isNormalFontRow = normalFontRows.some(keyword => firstCellText.includes(keyword))
        const isTwoLineRow = twoLineRows.some(keyword => firstCellText.includes(keyword))
        
        cells.forEach((cell, cellIndex) => {
          const text = cell.textContent?.trim() || ''
          if (!text) return
          
          // 첫 번째 컬럼(구분 컬럼)은 스타일 변경 안 함
          if (cellIndex === 0) return
          
          // 일반 폰트 행은 스타일 적용 안 함
          if (isNormalFontRow) {
            // ✅ 십성/지장간/십이신살은 2줄 표시로 가독성 개선
            if (isTwoLineRow) {
              const idx = text.indexOf('(')
              if (idx > 0 && text.endsWith(')')) {
                const kor = text.slice(0, idx).trim()
                const hanja = text.slice(idx).trim() // (偏印) 같은 형태 포함
                cell.innerHTML = `<span class="manse-two-line"><span class="manse-two-line-kor">${kor}</span><span class="manse-two-line-hanja">${hanja}</span></span>`
              } else {
                cell.textContent = text
              }
            }
            return
          }
          
          // 셀 전체 내용에 오행 색상 적용 (셀 전체를 하나의 span으로 감싸기)
          // 주요 오행 찾기 (첫 번째로 발견된 오행 사용)
          let mainElement: string | null = null
          let hasGanzi = false
          
          for (const char of text) {
            const element = elementMap[char]
            const isGanzi = ganziChars.has(char)
            
            if (element && !mainElement) {
              mainElement = element
            }
            if (isGanzi) {
              hasGanzi = true
            }
          }
          
          // 오행이 있으면 셀 전체를 하나의 span으로 감싸기
          if (mainElement || hasGanzi) {
            const elementClass = mainElement ? `manse-element-${mainElement}` : ''
            const ganziClass = hasGanzi ? 'manse-ganzi-char' : ''
            cell.innerHTML = `<span class="${elementClass} ${ganziClass}">${text}</span>`
          }
        })
      })
      
      return table.outerHTML
    }

    // ✅ 방어 로직(중복 제목 제거):
    // 간헐적으로 LLM/스트리밍/병합 과정에서 "첫 대메뉴 제목"이 subtitle-content 내부로 섞여 들어가
    // UI에서 대메뉴 제목이 2번(한 번은 React 렌더, 한 번은 contentHtml 내부) 출력되는 경우가 있다.
    // subtitle-content/detail-menu-content 내부에 있는 menu-title은 제거한다.
    const stripMenuTitlesFromContentHtml = (html: string, menuTitle: string): string => {
      if (!html) return ''
      let out = html

      // 1) menu-title 클래스를 가진 요소 자체 제거 (h2/div 등 태그 무관)
      out = out.replace(/<[^>]*class=["'][^"']*\bmenu-title\b[^"']*["'][^>]*>[\s\S]*?<\/[^>]+>/gi, '')

      // 2) 혹시 class가 없고 텍스트로만 반복되는 케이스: "현재 메뉴 제목"과 동일한 heading만 제거
      const safeTitle = (menuTitle || '').trim()
      if (safeTitle) {
        const escaped = safeTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        out = out.replace(new RegExp(`<h2[^>]*>\\s*${escaped}\\s*<\\/h2>`, 'gi'), '')
        out = out.replace(new RegExp(`<div[^>]*>\\s*${escaped}\\s*<\\/div>`, 'gi'), '')
      }

      return out.trim()
    }

    // [추가] 상세메뉴 파싱 및 매핑 로직 개선을 위한 헬퍼 함수
    const extractSections = (html: string, className: string) => {
      const regex = new RegExp(`<div[^>]*class="[^"]*${className}[^"]*"[^>]*>`, 'gi')
      const matches: { start: number; end: number; content: string }[] = []
      let match
      
      while ((match = regex.exec(html)) !== null) {
        const startIndex = match.index
        const startTagLength = match[0].length
        
        // 닫는 태그 찾기 (중첩 div 고려)
        let depth = 1
        let currentIndex = startIndex + startTagLength
        let endIndex = html.length
        
        while (currentIndex < html.length && depth > 0) {
          const nextOpenDiv = html.indexOf('<div', currentIndex)
          const nextCloseDiv = html.indexOf('</div>', currentIndex)
          
          if (nextCloseDiv === -1) break // 닫는 태그 없으면 끝까지
          
          if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
            depth++
            currentIndex = nextOpenDiv + 4
          } else {
            depth--
            if (depth === 0) {
              endIndex = nextCloseDiv + 6
              break
            }
            currentIndex = nextCloseDiv + 6
          }
        }
        
        matches.push({
          start: startIndex,
          end: endIndex,
          content: html.substring(startIndex, endIndex)
        })
      }
      return matches
    }

    // content.menu_items 가져오기
    const content = resultData?.content
    const menuItems = content?.menu_items || []

    // 썸네일/만세력은 ref 캐시에서 가져오거나 새로 추출 (깜빡임 완전 방지)
    let cursor = 0
    const parsed: ParsedMenu[] = cleanedMenuSections.map((section, index) => {
      const titleEl = section.querySelector('.menu-title')
      const titleText = titleEl?.textContent?.trim() || '메뉴'

      // 썸네일: 캐시에 있으면 재사용, 없으면 새로 추출 후 캐시에 저장
      let thumbnailHtml: string | undefined = undefined
      if (thumbnailHtmlCacheRef.current.has(index)) {
        thumbnailHtml = thumbnailHtmlCacheRef.current.get(index)
      } else {
        const thumbnailEl = section.querySelector('.menu-thumbnail')
        if (thumbnailEl) {
          thumbnailHtml = thumbnailEl.outerHTML
          thumbnailHtmlCacheRef.current.set(index, thumbnailHtml)
        }
      }

      // 만세력: 캐시에 있으면 재사용, 없으면 새로 추출 후 스타일 적용하여 캐시에 저장
      let manseHtml: string | undefined = undefined
      if (manseHtmlCacheRef.current.has(index)) {
        manseHtml = manseHtmlCacheRef.current.get(index)
      } else {
        const manseEl = section.querySelector('.manse-ryeok-table')
        if (manseEl) {
          // 만세력 HTML에 오행 스타일 미리 적용 (DOM 직접 수정 방지)
          const styledManseHtml = applyManseStyles(manseEl.outerHTML)
          manseHtml = styledManseHtml
          manseHtmlCacheRef.current.set(index, manseHtml)
        }
      }

      // subtitle-section과 detail-menu-section을 "문서 순서" 그대로 가져오기
      // (DOMParser로 만든 문서는 getBoundingClientRect()가 의미 없어서 정렬하면 순서가 깨질 수 있음)
      const sectionNodes = Array.from(section.querySelectorAll('.subtitle-section, .detail-menu-section'))
      
      // menu_subtitles 배열에서 순서대로 썸네일 정보 가져오기 (평탄화된 배열)
      // form/page.tsx와 동일한 순서로 생성: menu_subtitle 문자열 순서 기준
      // 현재 메뉴(menuIndex)에 속하는 소메뉴만 포함
      const allMenuSubtitles: Array<{
        subtitle: string
        thumbnail?: string
        thumbnail_image_url?: string
        thumbnail_video_url?: string
        interpretation_tool?: string
        isDetailMenu?: boolean
      }> = []
      const seenExpected = new Set<string>()
      
      // content.menu_subtitle을 줄바꿈으로 분리 (form/page.tsx와 동일한 순서)
      const menuSubtitlesList = content?.menu_subtitle ? content.menu_subtitle.split('\n').filter((s: string) => s.trim()) : []
      
      // interpretation_tools 배열 가져오기 (form/page.tsx와 동일)
      const interpretationTools = content?.interpretation_tools ? (Array.isArray(content.interpretation_tools) ? content.interpretation_tools : content.interpretation_tools.split('\n').filter((s: string) => s.trim())) : []
      
      // 현재 메뉴 번호 (1부터 시작)
      const menuNumber = index + 1
      
      // menuSubtitlesList에서 현재 메뉴에 속하는 소메뉴만 필터링 (예: 메뉴 1이면 "1-"로 시작하는 항목)
      const currentMenuSubtitles = menuSubtitlesList.filter((subtitle: string) => {
        const match = subtitle.trim().match(/^(\d+)/)
        return match ? parseInt(match[1]) === menuNumber : false
      })
      
      // 현재 메뉴의 소메뉴들을 순서대로 처리 (form/page.tsx의 menuSubtitlePairs 생성 로직과 동일)
      currentMenuSubtitles.forEach((subtitle: string, subtitleIndex: number) => {
        const trimmedSubtitle = subtitle.trim()
        
        // interpretation_tool 가져오기 (form/page.tsx와 동일한 로직)
        const tool = interpretationTools[subtitleIndex] || interpretationTools[0] || ''
        
        // 해당 소메뉴의 정보 찾기
        const currentMenuItem = menuItems[index]
        let foundSub = null
        if (currentMenuItem?.subtitles && Array.isArray(currentMenuItem.subtitles)) {
          // 정확한 매칭 시도
          foundSub = currentMenuItem.subtitles.find((s: any) => s.subtitle?.trim() === trimmedSubtitle)
          // 매칭 실패 시 부분 매칭 시도 (숫자 접두사 제거 후 비교)
          if (!foundSub) {
            const subtitleWithoutPrefix = trimmedSubtitle.replace(/^\d+[-.]\s*/, '').trim()
            foundSub = currentMenuItem.subtitles.find((s: any) => {
              const sSubtitle = s.subtitle?.trim() || ''
              return sSubtitle === subtitleWithoutPrefix || sSubtitle.includes(subtitleWithoutPrefix) || subtitleWithoutPrefix.includes(sSubtitle)
            })
          }
        }
        
        // 소메뉴 추가 (매칭 실패해도 trimmedSubtitle을 그대로 사용)
        {
          const key = `S:${removeNumberPrefix(trimmedSubtitle).replace(/\s+/g, ' ').trim()}`
          if (!seenExpected.has(key) && key !== 'S:') {
            seenExpected.add(key)
            // thumbnail_image_url과 thumbnail_video_url을 thumbnail 필드에 저장 (하위 호환성)
            const thumbnailImageUrl = foundSub?.thumbnail_image_url || foundSub?.thumbnail || ''
            const thumbnailVideoUrl = foundSub?.thumbnail_video_url || ''
            allMenuSubtitles.push({
              subtitle: trimmedSubtitle,
              thumbnail: thumbnailImageUrl, // 하위 호환성을 위해 thumbnail 필드에 저장
              thumbnail_image_url: thumbnailImageUrl,
              thumbnail_video_url: thumbnailVideoUrl,
              interpretation_tool: foundSub?.interpretation_tool || tool,
              isDetailMenu: false,
            })
          }
        }
        
        // 상세메뉴가 있으면 소메뉴 다음에 순서대로 추가 (평탄화된 구조)
        if (foundSub?.detailMenus && Array.isArray(foundSub.detailMenus)) {
          foundSub.detailMenus.forEach((dm: any) => {
            const dmTitle = (dm?.detailMenu || '').toString().trim()
            if (!dmTitle) return
            const key = `D:${removeNumberPrefix(dmTitle).replace(/\s+/g, ' ').trim()}`
            if (seenExpected.has(key) || key === 'D:') return
            seenExpected.add(key)
            // thumbnail_image_url과 thumbnail_video_url을 thumbnail 필드에 저장 (하위 호환성)
            const thumbnailImageUrl = dm?.thumbnail_image_url || dm?.thumbnail || ''
            const thumbnailVideoUrl = dm?.thumbnail_video_url || ''
            allMenuSubtitles.push({
              subtitle: dmTitle,
              thumbnail: thumbnailImageUrl, // 하위 호환성을 위해 thumbnail 필드에 저장
              thumbnail_image_url: thumbnailImageUrl,
              thumbnail_video_url: thumbnailVideoUrl,
              interpretation_tool: dm?.interpretation_tool || '',
              isDetailMenu: true,
            })
          })
        }
      })
      
      const normalizeTitle = (t: string) => removeNumberPrefix((t || '').toString()).replace(/\s+/g, ' ').trim()
      const titlesMatch = (a: string, b: string) => {
        const na = normalizeTitle(a)
        const nb = normalizeTitle(b)
        if (!na || !nb) return false
        return na === nb || na.includes(nb) || nb.includes(na)
      }
      const extractNodeTitle = (node: Element) => {
        const isDetail = node.classList.contains('detail-menu-section')
        const raw = isDetail
          ? (node.querySelector('.detail-menu-title')?.textContent || node.querySelector('.subtitle-title')?.textContent || '')
          : (node.querySelector('.subtitle-title')?.textContent || '')
        return (raw || '').toString().trim()
      }

      // 예상 항목(소메뉴+상세메뉴)을 먼저 만들고, DOM 섹션을 제목으로 순차 매칭해 내용만 채움
      let nodeCursor = 0
      const subtitles: ParsedSubtitle[] = allMenuSubtitles.map((expected, expectedIdx) => {
        const expectedTitle = (expected?.subtitle || '').toString().trim()
        const expectedIsDetail = !!expected?.isDetailMenu

        let matchedNode: Element | null = null
        for (let i = nodeCursor; i < sectionNodes.length; i++) {
          const node = sectionNodes[i]
          const nodeTitle = extractNodeTitle(node)
          if (titlesMatch(nodeTitle, expectedTitle)) {
            matchedNode = node
            nodeCursor = i + 1
            break
          }
        }

        // DOM 제목 매칭 실패 시: 순서 기반으로 하나만 소비 (스트리밍/부분 HTML에서도 인덱스 밀림 방지)
        if (!matchedNode && nodeCursor < sectionNodes.length) {
          matchedNode = sectionNodes[nodeCursor]
          nodeCursor += 1
        }

        const thumbnail = expected?.thumbnail || expected?.thumbnail_image_url || ''
        const thumbnailImageUrl = expected?.thumbnail_image_url || expected?.thumbnail || ''
        const thumbnailVideoUrl = expected?.thumbnail_video_url || ''
        const interpretationTool = expected?.interpretation_tool || ''

        let contentHtml = ''
        if (matchedNode) {
          if (expectedIsDetail) {
            contentHtml =
              matchedNode.querySelector('.detail-menu-content')?.innerHTML ||
              matchedNode.querySelector('.subtitle-content')?.innerHTML ||
              ''
          } else {
            contentHtml =
              matchedNode.querySelector('.subtitle-content')?.innerHTML ||
              matchedNode.querySelector('.detail-menu-content')?.innerHTML ||
              ''
          }
        }

        // 해석도구 제거 (소메뉴/상세메뉴 공통)
        let cleanedContentHtml = contentHtml || ''
        if (cleanedContentHtml) {
          if (interpretationTool) {
            const escapedTool = interpretationTool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            cleanedContentHtml = cleanedContentHtml
              .replace(new RegExp(escapedTool + '\\s*[:：]\\s*', 'gi'), '')
              .replace(new RegExp(escapedTool + '[^<]*', 'gi'), '')
          }
          cleanedContentHtml = cleanedContentHtml
            .replace(/상세메뉴\s*해석도구[^<]*/gi, '')
            .replace(/해석도구\s*[:：]\s*/gi, '')
            .replace(/\*\*해석도구\*\*\s*[:：]\s*/gi, '')
            .replace(/interpretation[_\s]*tool\s*[:：]\s*/gi, '')
            .replace(/<[^>]*>해석도구[^<]*<\/[^>]*>/gi, '')
            .replace(/해석도구[^<]*/gi, '')
            .replace(/\s*해석도구\s*/gi, '')
            .trim()
        }

        // ✅ 중복 대메뉴 제목 방지: contentHtml 내부에 섞여 들어온 menu-title 제거
        cleanedContentHtml = stripMenuTitlesFromContentHtml(cleanedContentHtml, titleText)

        return {
          title: expectedTitle || `항목 ${expectedIdx + 1}`,
          contentHtml: cleanedContentHtml || '',
          thumbnail: thumbnail,
          thumbnail_image_url: thumbnailImageUrl,
          thumbnail_video_url: thumbnailVideoUrl,
          detailMenus: undefined,
          detailMenuSectionHtml: undefined,
          isDetailMenu: expectedIsDetail,
        }
      })
      const startIndex = cursor
      cursor += subtitles.length

        return {
          title: titleText, // 숫자 접두사 유지
          subtitles,
          startIndex,
          thumbnailHtml,
          manseHtml,
        }
    })

    // 디버깅: parsed 배열 생성 확인
    
    // 디버깅: 첫 번째 메뉴의 첫 번째 소제목 내용 확인
    if (parsed.length > 0 && parsed[0].subtitles.length > 0) {
      const firstSubtitle = parsed[0].subtitles[0]
    }

    // 썸네일/만세력 HTML이 변경되지 않았으면 기존 parsedMenus의 값을 유지 (깜빡임 방지)
    // 스트리밍 중에는 완성되지 않은 섹션은 이전 완성된 상태를 유지
    setParsedMenus((prevParsedMenus) => {
      // ✅ 핵심 수정: streamingFinished가 true이면 무조건 새로운 parsed 반환
      // 클로저 문제 방지를 위해 현재 스코프의 streamingFinished 사용 (의존성 배열에서 최신 값 가져옴)
      const currentStreamingFinished = streamingFinished
      const currentIsStreamingActive = isStreamingActive
      
      // 스트리밍 완료 시: 새로운 parsed를 그대로 반환 (이전 상태와 무관하게)
      if (currentStreamingFinished || !currentIsStreamingActive) {
        return parsed
      }
      
      // ✅ 버그 수정: 기존 필터링 로직 제거
      // parsed는 항상 전체 HTML에서 파싱되므로, 필터링하면 업데이트된 내용이 반영되지 않음
      // 대신 parsed를 기준으로 하되, 이전 완성된 소제목 내용은 유지하는 방식으로 변경
      
      // 첫 번째 파싱이거나 메뉴 개수가 변경된 경우 새로 설정
      if (prevParsedMenus.length === 0 || prevParsedMenus.length !== parsed.length) {
        return parsed
      }

      // 기존 parsedMenus와 새로 파싱한 parsed를 비교하여 완성된 섹션만 업데이트
      const updated = parsed.map((newMenu, menuIndex) => {
        const prevMenu = prevParsedMenus[menuIndex]
        if (!prevMenu) return newMenu
        
        // 썸네일 HTML이 캐시에 있고 기존과 동일하면 기존 값 유지 (객체 참조 유지로 리렌더링 방지)
        if (prevMenu.thumbnailHtml && thumbnailHtmlCacheRef.current.has(menuIndex)) {
          const cachedThumbnail = thumbnailHtmlCacheRef.current.get(menuIndex)
          if (cachedThumbnail === prevMenu.thumbnailHtml) {
            newMenu.thumbnailHtml = prevMenu.thumbnailHtml
          }
        }
        // 만세력 HTML이 캐시에 있고 기존과 동일하면 기존 값 유지
        if (prevMenu.manseHtml && manseHtmlCacheRef.current.has(menuIndex)) {
          const cachedManse = manseHtmlCacheRef.current.get(menuIndex)
          if (cachedManse === prevMenu.manseHtml) {
            newMenu.manseHtml = prevMenu.manseHtml
          }
        }
        
        // 스트리밍 중에는 완성된 섹션만 업데이트하여 부분 표시 방지
        // 원본 HTML에서 해당 subtitle-section이 완전히 닫혔는지 확인
        // 상세메뉴도 subtitles 배열에 포함되므로 소메뉴와 동일하게 처리
        const updatedSubtitles = newMenu.subtitles.map((newSub, subIndex) => {
          const prevSub = prevMenu.subtitles[subIndex]
          
          // 스트리밍 중: contentHtml이 있으면 완성으로 간주 (소메뉴와 상세메뉴 모두 동일)
          const contentHtml = newSub.contentHtml || ''
          const hasContent = contentHtml.trim().length > 0 // 내용이 있으면 완성으로 간주
          
          if (!prevSub) {
            // 새로운 항목: contentHtml이 있으면 표시, 없어도 첫 항목은 표시 (점사 중)
            if (hasContent || subIndex === 0) {
              return newSub
            } else {
              // 미완성: 빈 상태로 유지
              return {
                ...newSub,
                contentHtml: ''
              }
            }
          }
          
          // 기존 항목: contentHtml이 있으면 업데이트
          if (hasContent) {
            return newSub
          } else {
            // 미완성: 이전 상태 유지 (하지만 이전에 완성된 내용이 있으면 유지)
            if (prevSub && prevSub.contentHtml && prevSub.contentHtml.trim().length > 0) {
              return prevSub
            }
            // 이전 상태도 없으면 새 상태 (빈 상태) 반환
            return {
              ...newSub,
              contentHtml: ''
            }
          }
        })
        
        return { ...newMenu, subtitles: updatedSubtitles }
      })
      
      return updated
    })
    
    // 전체 소메뉴 개수 계산: 실제로 스트리밍이 시작된 소제목 수만 카운트 (아직 점사가 안 된 것은 제외)
    // cursor는 현재까지 처리된 소제목 인덱스이므로, 실제로 스트리밍이 진행 중이거나 완료된 소제목 수
    // 스트리밍이 완료된 경우 전체 소제목 수를 사용, 진행 중인 경우 cursor를 사용
    const totalSubtitleCount = parsed.reduce((sum: number, menu: ParsedMenu) => sum + menu.subtitles.length, 0)
    
    // 실제로 점사가 시작된 소제목 수만 카운트 (cursor 기준)
    // cursor가 0이면 아직 시작 안 됨, cursor > 0이면 cursor 개수만큼 시작됨
    const startedSubtitles = streamingFinished || !isStreamingActive 
      ? totalSubtitleCount // 완료된 경우 전체 수 사용
      : Math.max(cursor, 1) // 진행 중인 경우 cursor 기준 (최소 1)
    
    setTotalSubtitles(startedSubtitles)

    // 소제목별 단위로 한 번에 표시:
    // - 스트리밍 중: 항상 마지막 소제목 하나는 "점사중입니다..." 상태로 숨김
    // - 스트리밍 완료: 모든 소제목을 한 번에 표시 (totalSubtitleCount 사용)
    let revealed = 0
    if (cursor === 0) {
      revealed = 0
    } else if (streamingFinished || !isStreamingActive) {
      // 점사 완료 시에는 cursor가 아닌 전체 소제목 수를 사용 (빈 섹션 등으로 인한 cursor 부족 문제 해결)
      revealed = totalSubtitleCount
    } else {
      revealed = Math.max(0, cursor - 1)
    }
    setRevealedCount(revealed)

    // 첫 번째 소제목이 "점사를 준비중입니다." 상태로라도 화면에 표시되는 순간(=cursor > 0)에
    // 진행률을 100%로 설정하고 0.5초 후 팝업 닫기
    if (!firstSubtitleReadyRef.current && cursor > 0) {
      setFirstSubtitleReady(true)
      setStreamingProgress(100) // 애니메이션으로 100%까지 증가
      // 0.5초 후 팝업 닫기 (애니메이션 완료 후)
      setTimeout(() => {
        setShowRealtimePopup(false)
      }, 500)
    }
    
    // 두 번째 소제목이 진행될 때 (cursor >= 2) 진행률을 100%로 설정하고 0.2초 후 팝업 닫기
    if (cursor >= 2 && showRealtimePopup) {
      setStreamingProgress(100) // 애니메이션으로 100%까지 증가
      // 0.5초 딜레이 후 팝업 닫기 (애니메이션 완료 후)
      setTimeout(() => {
        setShowRealtimePopup(false)
      }, 500)
    }

    if (cursor > 0) {
      setShowRealtimeLoading(false) // (기존 플래그, 현재는 사용 안 함)
    }
    }, 0) // 실시간 표시를 위해 딜레이 제거 (즉시 실행)
    
    // 클린업: 컴포넌트 언마운트 시 타임아웃 정리
    return () => {
      if (parsingTimeoutRef.current) {
        clearTimeout(parsingTimeoutRef.current)
        parsingTimeoutRef.current = null
      }
    }
  }, [fortuneViewMode, resultData?.html, streamingHtml, isStreamingActive, streamingFinished, isStreaming])

  // realtime에서 "점사중..."은 실제 진행 중인 1개 항목에만 표시
  const MIN_COMPLETE_CHARS_SUBTITLE = 30
  const MIN_COMPLETE_CHARS_DETAIL = 50
  const isItemComplete = (sub: ParsedSubtitle) => {
    // ✅ 점사가 "완료"로 판정된 경우에는 길이 기준으로 숨기지 않는다.
    // 간혹 특정 항목이 짧게 끝나면 MIN_COMPLETE_CHARS 기준을 못 넘어서
    // activePos가 남아 전체 메뉴가 숨겨지는 문제가 발생할 수 있음.
    if (fortuneViewMode === 'realtime' && streamingFinished) return true
    const len = (sub.contentHtml || '').trim().length
    const min = sub.isDetailMenu ? MIN_COMPLETE_CHARS_DETAIL : MIN_COMPLETE_CHARS_SUBTITLE
    return len >= min
  }
  const activePos = useMemo(() => {
    for (let mi = 0; mi < parsedMenus.length; mi++) {
      const menu = parsedMenus[mi]
      for (let si = 0; si < menu.subtitles.length; si++) {
        const sub = menu.subtitles[si]
        if (!isItemComplete(sub)) {
          return { menuIndex: mi, subIndex: si }
        }
      }
    }
    return null
  }, [parsedMenus])

  // 점사 완료 시에는 진행 위치(activePos)로 UI를 제한하지 않는다.
  const shouldGateByActivePos = fortuneViewMode === 'realtime' && !streamingFinished

  // 실시간 점사에서 완료된 소제목/상세메뉴 내 테이블 폭 조정 (너무 좁은 테이블만 화면폭에 맞춤)
  // 점사 중에는 실행하지 않고, 점사 완료 후 또는 배치 모드에서만 실행 (깜빡임 방지)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!parsedMenus || parsedMenus.length === 0) return
    
    // 실시간 점사 중인지 확인
    const isRealtimeStreamingNow = isRealtime || requestKey || isStreaming || isStreamingActive
    
    // 실시간 점사 중에는 실행하지 않음 (깜빡임 방지)
    if (isRealtimeStreamingNow && !streamingFinished) return
    
    // debounce: 짧은 시간 내 연속 실행 방지
    const timeoutId = setTimeout(() => {
      // 스크롤 위치 저장
      const scrollY = window.scrollY
      
      // requestAnimationFrame으로 DOM 렌더링 후 실행
      const rafId = requestAnimationFrame(() => {
        // 완료된 소제목/상세메뉴 섹션 내의 테이블 찾기 (만세력 테이블 제외)
        const contentElements = document.querySelectorAll('.jeminai-results .subtitle-content, .jeminai-results .detail-menu-content')
        
        let hasAdjustment = false
        
        contentElements.forEach((contentEl) => {
          const tables = contentEl.querySelectorAll('table:not(.manse-ryeok-table)')
          
          tables.forEach((table) => {
            const tableEl = table as HTMLTableElement
            // 이미 처리된 테이블은 건너뛰기
            if (tableEl.dataset.widthAdjusted === 'true') return
            
            const containerWidth = (contentEl as HTMLElement).offsetWidth
            const tableWidth = tableEl.offsetWidth
            
            // 테이블이 컨테이너 폭의 60% 미만인 경우에만 조정
            if (containerWidth > 0 && tableWidth < containerWidth * 0.6) {
              // table-layout: auto로 콘텐츠에 맞게 열 너비 자동 조정
              tableEl.style.width = '100%'
              tableEl.style.tableLayout = 'auto'
              tableEl.style.wordBreak = 'break-word'
              tableEl.dataset.widthAdjusted = 'true'
              hasAdjustment = true
            }
          })
        })
        
        // 표 너비 조정이 있었고, 스크롤 위치가 변경되었다면 복원
        if (hasAdjustment && Math.abs(window.scrollY - scrollY) > 10) {
          requestAnimationFrame(() => {
            window.scrollTo(0, scrollY)
          })
        }
      })
    }, 300) // 300ms debounce
    
    return () => clearTimeout(timeoutId)
  }, [parsedMenus, streamingFinished, isRealtime, requestKey, isStreaming, isStreamingActive])

  // isRealtime이고 점사 진행 중이면 resultData가 없어도 허용 (점사 시작 전)
  // requestKey가 있으면 점사를 시작할 예정이므로 resultData 체크를 건너뜀
  const isRealtimeStreaming = isRealtime || requestKey || isStreaming || isStreamingActive

  // 모바일 Pull-to-Refresh 방지 (우선순위: 스크롤 자연스러움 > 차단 강도)
  // - Android/대부분 브라우저: CSS(overscroll-behavior)만으로 차단 (스크롤 개입 없음)
  // - iOS Safari: CSS만으로는 부족할 수 있어, "최상단에서 아래로 당김"만 매우 좁게 JS로 차단
  useEffect(() => {
    if (typeof window === 'undefined') return

    const root = document.documentElement
    root.classList.add('no-pull-to-refresh')

    const ua = navigator.userAgent || ''
    const isIOS = /iP(hone|ad|od)/.test(ua)
    const isWebKit = /WebKit/.test(ua)
    const isSafari = isIOS && isWebKit && !/CriOS|FxiOS|EdgiOS/.test(ua)

    // Android(Chrome 등)은 overscroll-behavior로 충분히 막히는 경우가 많고,
    // non-passive touchmove는 스크롤을 끈적이게 만들 수 있으므로 아예 사용하지 않는다.
    if (!isSafari) {
      return () => {
        root.classList.remove('no-pull-to-refresh')
      }
    }

    // iOS Safari 전용: 화면 최상단에서 아래로 당기는 제스처만 preventDefault로 차단
    let startY = 0
    const onTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return
      startY = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return
      if (window.scrollY > 0) return
      const currentY = e.touches[0].clientY
      if (currentY > startY + 5) {
        e.preventDefault()
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })

    return () => {
      root.classList.remove('no-pull-to-refresh')
      window.removeEventListener('touchstart', onTouchStart as any)
      window.removeEventListener('touchmove', onTouchMove as any)
    }
  }, [])

  // 만세력 테이블 스타일은 이제 applyManseStyles 함수에서 HTML 문자열 단계에서 적용됨
  // DOM 직접 수정으로 인한 깜빡임 문제 해결

  // 점사 "완료" 시 엔딩북커버로 이동 + 완료 팝업 표시
  // ✅ 개선: streamingFinished가 true가 되면 실제 점사 완료 여부를 확인한 후 팝업 표시
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isRealtimeStreaming) return
    if (!streamingFinished) return
    if (completionPopupShownRef.current) return
    // 에러가 발생한 경우 팝업 표시 안 함
    if (error) return

    // 새로고침/뒤로가기 등으로 중복 표시 방지 (requestKey 우선)
    const storageKey = `result_completion_popup_shown_${requestKey || savedId || 'unknown'}`
    try {
      if (sessionStorage.getItem(storageKey) === '1') {
        completionPopupShownRef.current = true
        return
      }
    } catch {
      // sessionStorage 불가 환경이면 ref만으로 방지
    }

    // ✅ 핵심 수정: 딜레이를 주어 파싱이 완료될 시간을 확보
    // streamingFinished가 true가 되면 800ms 후에 실제 점사 완료 여부 확인 후 팝업 표시
    const timeoutId = setTimeout(() => {
      if (completionPopupShownRef.current) return
      // 에러가 발생한 경우 팝업 표시 안 함 (타임아웃 내에 에러 발생 가능)
      if (error) return
      
      // 실제 점사 완료 여부 확인
      // 1. parsedMenus가 비어있으면 아직 파싱 중이거나 점사가 완료되지 않음
      if (parsedMenus.length === 0) {
        console.log('[완료 팝업] parsedMenus가 비어있음, 팝업 표시 안 함')
        return
      }
      
      // 2. resultData의 content.menu_items와 parsedMenus.length 비교
      const expectedMenuCount = resultData?.content?.menu_items?.length || 0
      const actualMenuCount = parsedMenus.length
      
      // 예상 대메뉴 개수가 있고, 실제 파싱된 대메뉴 개수가 예상보다 적으면 점사가 완료되지 않음
      if (expectedMenuCount > 0 && actualMenuCount < expectedMenuCount) {
        console.log('[완료 팝업] 점사가 완료되지 않음', {
          expectedMenuCount,
          actualMenuCount,
          parsedMenus: parsedMenus.map(m => m.title)
        })
        return
      }
      
      // 3. streamingHtml이 비어있거나 너무 짧으면 점사가 완료되지 않음
      if (!streamingHtml || streamingHtml.length < 100) {
        console.log('[완료 팝업] streamingHtml이 비어있거나 너무 짧음', {
          htmlLength: streamingHtml?.length || 0
        })
        return
      }
      
      try {
        sessionStorage.setItem(storageKey, '1')
      } catch {
        // sessionStorage 불가 환경 무시
      }
      
      completionPopupShownRef.current = true
      
      // 최신 parsedMenus에서 실제 소제목 수 계산
      // (이 시점에서는 파싱이 완료되었을 것)
      const actualTotalSubtitles = parsedMenus.reduce((sum, menu) => sum + menu.subtitles.length, 0)
      
      // 점사율을 100%로 강제 설정
      if (actualTotalSubtitles > 0) {
        setTotalSubtitles(actualTotalSubtitles)
        setRevealedCount(actualTotalSubtitles)
      }
      
      // 애니메이션 완료 후 팝업 표시 (0.3초 후)
      setTimeout(() => {
    setShowCompletionPopup(true)
      }, 300)
    }, 800)
    
    return () => clearTimeout(timeoutId)
  }, [isRealtimeStreaming, streamingFinished, requestKey, savedId, parsedMenus, error, resultData, streamingHtml])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p>결과 로딩 중...</p>
        </div>
      </div>
    )
  }
  
  // content가 없어도 HTML이 있으면 표시 가능 (content는 선택사항)
  // isRealtime이고 점사 진행 중이면 HTML이 없어도 허용 (점사 시작 전)
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>{error || '결과 데이터가 없습니다.'}</p>
        </div>
      </div>
    )
  }
  
  // isRealtime이고 점사 진행 중이 아닐 때만 resultData 체크
  // requestKey가 있으면 점사를 시작할 예정이므로 체크를 건너뜀
  if (!isRealtimeStreaming && (!resultData || !resultData.html)) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>결과 데이터가 없습니다.</p>
        </div>
      </div>
    )
  }

  // 가드 통과 후 안전 분해 (가드에서 resultData 존재 확인했지만 안전을 위해 optional chaining 사용)
  const content = resultData?.content
  const html = resultData?.html || ''
  // ✅ 상단 제목 영역에서는 점사 HTML 전체를 파싱하지 않는다 (오탐/부작용 방지)
  // 만세력 블록 "바로 위 1줄"만 별도로 스타일링한다 (만세력 삽입/파싱 단계에서 처리)
  const startTime = resultData?.startTime
  const model = resultData?.model

  // 모델 이름 표시용
  const modelDisplayName = 
    model === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' :
    model === 'gemini-3-pro-preview' ? 'Gemini 3.0 Pro' :
    model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' :
    model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model || 'Unknown'

  // 경과 시간 계산 (로깅용)
  const elapsedTime = startTime ? Date.now() - startTime : 0

  // 폰트 크기 설정 (관리자 페이지에서 설정한 값 사용)
  const menuFontSize = content?.menu_font_size || 16
  const menuFontBold = content?.menu_font_bold || false
  const subtitleFontSize = content?.subtitle_font_size || 14
  const subtitleFontBold = content?.subtitle_font_bold || false
  const detailMenuFontSize = content?.detail_menu_font_size || 12
  const detailMenuFontBold = content?.detail_menu_font_bold || false
  const bodyFontSize = content?.body_font_size || 11
  const bodyFontBold = content?.body_font_bold || false
  
  // 숫자 접두사 제거 함수 (예: "1. " → "", "1-1. " → "", "1-1-1. " → "")
  const removeNumberPrefix = (text: string): string => {
    if (!text) return text
    // "1. ", "1-1. ", "1-1-1. " 등의 패턴 제거 (더 강력한 패턴)
    return text.replace(/^\d+(?:-\d+)*(?:-\d+)?\.\s*/, '').trim()
      .replace(/^[\d\-\.\s]+/, '').trim() // 추가: 앞부분의 모든 숫자, 하이픈, 점, 공백 제거
  }
  
  // 웹폰트 설정 (관리자 페이지에서 설정한 값 사용 - 각 섹션별 개별 폰트)
  const menuFontFace = content?.menu_font_face || content?.font_face || '' // 하위 호환성
  const subtitleFontFace = content?.subtitle_font_face || content?.font_face || '' // 하위 호환성
  const detailMenuFontFace = content?.detail_menu_font_face || content?.font_face || '' // 하위 호환성
  const bodyFontFace = content?.body_font_face || content?.font_face || '' // 하위 호환성
  
  // @font-face에서 font-family 추출
  const extractFontFamily = (fontFaceCss: string): string | null => {
    if (!fontFaceCss) {
      return null
    }
    // 여러 패턴 지원: font-family: 'FontName' 또는 font-family: FontName
    const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
    if (match) {
      const fontFamily = (match[1] || match[2]?.trim()) || null
      return fontFamily
    }
    return null
  }
  
  const menuFontFamilyName = extractFontFamily(menuFontFace)
  const subtitleFontFamilyName = extractFontFamily(subtitleFontFace)
  const detailMenuFontFamilyName = extractFontFamily(detailMenuFontFace)
  const bodyFontFamilyName = extractFontFamily(bodyFontFace)

  // 컬러 값 추출 (디버깅 및 안정성을 위해)
  const menuColor = content?.menu_color || ''
  const subtitleColor = content?.subtitle_color || ''
  const detailMenuColor = content?.detail_menu_color || ''
  const bodyColor = content?.body_color || ''
  
  // 동적 스타일 생성
  // @font-face 선언 수집 (중복 제거)
  const fontFaces = new Set<string>()
  if (menuFontFace) fontFaces.add(menuFontFace)
  if (subtitleFontFace) fontFaces.add(subtitleFontFace)
  if (detailMenuFontFace) fontFaces.add(detailMenuFontFace)
  if (bodyFontFace) fontFaces.add(bodyFontFace)
  
  const dynamicStyles = `
    ${Array.from(fontFaces).join('\n')}
    /* ✅ 가로 오버플로우(화면 넘어감) 강제 차단 + 긴 텍스트 줄바꿈 */
    html, body {
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
    /* Tailwind container/레이아웃 조합에서 드물게 100vw 요소가 밖으로 튀는 경우 방지 */
    main {
      max-width: 100% !important;
      overflow-x: hidden !important;
    }
    /* 결과 상단 제목/본문에서 긴 한 줄 텍스트가 화면 밖으로 나가지 않게 */
    .result-title,
    .jeminai-results .menu-title,
    .jeminai-results .subtitle-title,
    .jeminai-results .detail-menu-title,
    .jeminai-results h1,
    .jeminai-results h2,
    .jeminai-results h3,
    .jeminai-results p,
    .jeminai-results div {
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      white-space: normal !important;
      max-width: 100% !important;
    }
    /* 만세력은 컨테이너 안에서만 가로 스크롤 */
    .manse-ryeok-container {
      overflow-x: auto !important;
    }
    /* 만세력 테이블 위 1줄(사주명식 정보) 예쁘게 */
    .manse-header-line {
      display: flex !important;
      flex-direction: column !important;
      gap: 6px !important;
      align-items: center !important;
      justify-content: center !important;
      text-align: center !important;
      padding: 10px 12px !important;
      margin: 0 0 10px 0 !important;
      border-radius: 14px !important;
      border: 1px solid rgba(245, 158, 11, 0.25) !important;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 251, 235, 0.9) 100%) !important;
      max-width: 100% !important;
    }
    .manse-header-name {
      font-size: 1.35rem !important;
      font-weight: 800 !important;
      color: #111827 !important;
      line-height: 1.2 !important;
    }
    .manse-header-badges {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 6px !important;
      justify-content: center !important;
      align-items: center !important;
      max-width: 100% !important;
    }
    .manse-header-badge {
      display: inline-flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 6px 10px !important;
      border-radius: 9999px !important;
      border: 1px solid rgba(209, 213, 219, 0.8) !important;
      background: rgba(255, 255, 255, 0.75) !important;
      color: #374151 !important;
      font-size: 0.85rem !important;
      line-height: 1 !important;
      max-width: 100% !important;
      white-space: nowrap !important;
    }
    .manse-header-badge strong {
      color: #111827 !important;
      font-weight: 800 !important;
    }

    /* ✅ 팝업에서는 최대 폭 + 음양오행 등 텍스트가 셀 밖으로 튀지 않도록 폰트/패딩을 조금 낮춤 */
    .manse-ryeok-popup-container {
      width: 100% !important;
      max-width: 100% !important;
    }
    .manse-ryeok-popup-container .manse-ryeok-container {
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto !important;
    }
    .manse-ryeok-popup-container .manse-ryeok-container table,
    .manse-ryeok-popup-container .manse-ryeok-table {
      width: 100% !important;
      max-width: 100% !important;
      table-layout: fixed !important;
    }
    .manse-ryeok-popup-container .manse-ryeok-table td,
    .manse-ryeok-popup-container .manse-ryeok-table th {
      padding: 10px 6px !important;
      font-size: 0.86rem !important;
    }
    @media (max-width: 480px) {
      .manse-ryeok-popup-container .manse-ryeok-table td,
      .manse-ryeok-popup-container .manse-ryeok-table th {
        padding: 8px 4px !important;
        font-size: 0.76rem !important;
      }
    }
    /* 십성/지장간/십이신살: 2줄 표시 */
    .manse-two-line {
      display: inline-block !important;
      white-space: normal !important;
      line-height: 1.15 !important;
    }
    .manse-two-line-kor {
      display: block !important;
      font-weight: 700 !important;
      line-height: 1.15 !important;
    }
    .manse-two-line-hanja {
      display: block !important;
      font-weight: 600 !important;
      opacity: 0.9 !important;
      line-height: 1.15 !important;
      margin-top: 2px !important;
    }
    ${menuFontFamilyName ? `
    .result-title {
      font-family: '${menuFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
    }
    ` : ''}
    .jeminai-results .menu-title {
      font-size: ${menuFontSize}px !important;
      font-weight: ${menuFontBold ? 'bold' : 'normal'} !important;
      line-height: 1.6 !important;
      ${menuFontFamilyName ? `font-family: '${menuFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
      ${menuColor ? `color: ${menuColor} !important;` : ''}
    }
    .jeminai-results .subtitle-title {
      font-size: ${subtitleFontSize}px !important;
      font-weight: ${subtitleFontBold ? 'bold' : 'normal'} !important;
      ${subtitleFontFamilyName ? `font-family: '${subtitleFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
      ${subtitleColor ? `color: ${subtitleColor} !important;` : ''}
    }
    .jeminai-results .detail-menu-title {
      font-size: ${detailMenuFontSize}px !important;
      font-weight: ${detailMenuFontBold ? 'bold' : 'normal'} !important;
      ${detailMenuFontFamilyName ? `font-family: '${detailMenuFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
      ${detailMenuColor ? `color: ${detailMenuColor} !important;` : ''}
    }
    .jeminai-results .subtitle-content {
      font-size: ${bodyFontSize}px !important;
      font-weight: ${bodyFontBold ? 'bold' : 'normal'} !important;
      margin-bottom: 2em !important;
      line-height: 1.8 !important;
      ${bodyFontFamilyName ? `font-family: '${bodyFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
      ${bodyColor ? `color: ${bodyColor} !important;` : ''}
    }
    .jeminai-results .detail-menu-content {
      font-size: ${bodyFontSize}px !important;
      font-weight: ${bodyFontBold ? 'bold' : 'normal'} !important;
      line-height: 1.8 !important;
      margin-bottom: 0 !important;
      ${bodyFontFamilyName ? `font-family: '${bodyFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
      ${bodyColor ? `color: ${bodyColor} !important;` : ''}
    }
    .jeminai-results .detail-menu-container {
      margin-bottom: 2em !important;
    }
    .jeminai-results .detail-menu-section {
      margin-bottom: 2em !important;
    }
    .jeminai-results .detail-menu-section:last-child {
      margin-bottom: 0 !important;
    }
    /* 소제목 구분선 - 마지막 소제목이 아닌 경우에만 */
    .jeminai-results .subtitle-section {
      padding-top: 24px;
      padding-bottom: 24px;
      position: relative;
    }
    .jeminai-results .subtitle-section:not(:last-child)::after {
      content: '';
      display: block;
      width: 300px;
      height: 2px;
      background: linear-gradient(to right, transparent, #e5e7eb, transparent);
      margin: 24px auto 0;
    }
    .jeminai-results .subtitle-section:last-child {
      padding-top: 24px;
      padding-bottom: 24px;
    }
    .loading-dots {
      display: inline-flex;
      gap: 4px;
      align-items: center;
    }
    .loading-dots .dot {
      width: 6px;
      height: 6px;
      border-radius: 9999px;
      background: #ec4899;
      opacity: 0.3;
      animation: dot-bounce 1s infinite;
    }
    .loading-dots .dot:nth-child(2) { animation-delay: 0.15s; }
    .loading-dots .dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes dot-bounce {
      0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
      40% { transform: translateY(-4px); opacity: 1; }
    }
    
    /* 만세력(사주명식) 테이블 고급 스타일 */
    .manse-ryeok-table,
    .manse-ryeok-container .manse-ryeok-table,
    .manse-ryeok-container table {
      width: 100% !important;
      border-collapse: separate !important;
      border-spacing: 0 !important;
      background: linear-gradient(135deg, #fefbf3 0%, #faf6eb 50%, #f5efe0 100%) !important;
      border-radius: 16px !important;
      overflow: hidden !important;
      box-shadow: 
        0 4px 20px rgba(139, 90, 43, 0.12),
        0 2px 8px rgba(139, 90, 43, 0.08),
        inset 0 1px 0 rgba(255, 255, 255, 0.8) !important;
      border: 2px solid transparent !important;
      background-clip: padding-box !important;
      position: relative !important;
      margin: 1.5rem 0 !important;
    }
    
    .manse-ryeok-table::before,
    .manse-ryeok-container .manse-ryeok-table::before,
    .manse-ryeok-container table::before {
      content: '' !important;
      position: absolute !important;
      inset: -2px !important;
      background: linear-gradient(135deg, #d4a853 0%, #c9956c 25%, #8b5a2b 50%, #c9956c 75%, #d4a853 100%) !important;
      border-radius: 18px !important;
      z-index: -1 !important;
    }
    
    .manse-ryeok-table th,
    .manse-ryeok-container .manse-ryeok-table th,
    .manse-ryeok-container table th {
      background: linear-gradient(180deg, #8b5a2b 0%, #6d4422 100%) !important;
      color: #fef8e8 !important;
      font-weight: 700 !important;
      padding: 12px 8px !important;
      text-align: center !important;
      font-size: 0.8rem !important;
      letter-spacing: 0.05em !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
      border-bottom: 2px solid #d4a853 !important;
      white-space: nowrap !important;
      vertical-align: middle !important;
    }
    
    .manse-ryeok-table th:first-child,
    .manse-ryeok-container .manse-ryeok-table th:first-child,
    .manse-ryeok-container table th:first-child {
      border-top-left-radius: 14px !important;
    }
    
    /* 헤더 행의 "구분" 셀만 시주/일주와 동일한 그라데이션 (더 구체적인 선택자) */
    .manse-ryeok-table thead th:first-child,
    .manse-ryeok-container .manse-ryeok-table thead th:first-child,
    .manse-ryeok-container table thead th:first-child,
    .manse-ryeok-table tr:first-child th:first-child,
    .manse-ryeok-container .manse-ryeok-table tr:first-child th:first-child,
    .manse-ryeok-container table tr:first-child th:first-child {
      background: linear-gradient(180deg, #8b5a2b 0%, #6d4422 100%) !important;
      color: #fef8e8 !important;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3) !important;
    }
    
    .manse-ryeok-table th:last-child,
    .manse-ryeok-container .manse-ryeok-table th:last-child,
    .manse-ryeok-container table th:last-child {
      border-top-right-radius: 14px !important;
    }
    
    .manse-ryeok-table td,
    .manse-ryeok-container .manse-ryeok-table td,
    .manse-ryeok-container table td {
      padding: 12px 8px !important;
      text-align: center !important;
      font-size: 0.9rem !important;
      font-weight: 600 !important;
      color: #4a3520 !important;
      border-bottom: 1px solid rgba(139, 90, 43, 0.15) !important;
      background: transparent !important;
      position: relative !important;
      white-space: nowrap !important;
      vertical-align: middle !important;
    }
    
    .manse-ryeok-table tr:last-child td,
    .manse-ryeok-container .manse-ryeok-table tr:last-child td,
    .manse-ryeok-container table tr:last-child td {
      border-bottom: none !important;
    }
    
    .manse-ryeok-table tr:last-child td:first-child,
    .manse-ryeok-container .manse-ryeok-table tr:last-child td:first-child,
    .manse-ryeok-container table tr:last-child td:first-child {
      border-bottom-left-radius: 14px !important;
    }
    
    .manse-ryeok-table tr:last-child td:last-child,
    .manse-ryeok-container .manse-ryeok-table tr:last-child td:last-child,
    .manse-ryeok-container table tr:last-child td:last-child {
      border-bottom-right-radius: 14px !important;
    }
    
    
    .manse-ryeok-table td:not(:last-child),
    .manse-ryeok-container .manse-ryeok-table td:not(:last-child),
    .manse-ryeok-container table td:not(:last-child) {
      border-right: 1px solid rgba(139, 90, 43, 0.12) !important;
    }
    
    .manse-ryeok-table th:not(:last-child),
    .manse-ryeok-container .manse-ryeok-table th:not(:last-child),
    .manse-ryeok-container table th:not(:last-child) {
      border-right: 1px solid rgba(254, 248, 232, 0.2) !important;
    }
    
    /* 천간/지지 글자 스타일 - 한자 강조 */
    .manse-ryeok-table td span,
    .manse-ryeok-container .manse-ryeok-table td span,
    .manse-ryeok-container table td span {
      display: block !important;
      line-height: 1.4 !important;
    }
    
    /* 만세력 컨테이너 스타일 */
    .manse-ryeok-container {
      padding: 8px !important;
      background: linear-gradient(135deg, rgba(212, 168, 83, 0.05) 0%, rgba(139, 90, 43, 0.03) 100%) !important;
      border-radius: 20px !important;
      width: 100% !important;
      max-width: 100% !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      -webkit-overflow-scrolling: touch !important;
      box-sizing: border-box !important;
      display: block !important;
    }
    
    /* 인라인 만세력 (결과 내) */
    .jeminai-results .manse-ryeok-table {
      margin-top: 1rem !important;
      margin-bottom: 1.5rem !important;
    }
    
    /* 만세력이 포함된 부모 컨테이너 overflow 처리 */
    .jeminai-results,
    .menu-section,
    .subtitle-section {
      overflow-x: visible !important;
      max-width: 100% !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }
    
    /* 메인 컨테이너 내 만세력 처리 - 부모 컨테이너가 overflow를 처리하도록 */
    main,
    main .container,
    main .jeminai-results {
      overflow-x: visible !important;
    }
    
    main .manse-ryeok-container {
      max-width: 100% !important;
      width: 100% !important;
      overflow-x: auto !important;
    }
    
    main .manse-ryeok-container table,
    main .manse-ryeok-container .manse-ryeok-table,
    main .manse-ryeok-container table {
      width: auto !important;
      min-width: 600px !important;
      max-width: none !important;
    }
    
    /* 만세력 팝업 컨테이너 */
    .manse-ryeok-popup-container .manse-ryeok-container {
      max-width: 100% !important;
      max-width: calc(100vw - 64px) !important;
      overflow-x: auto !important;
      overflow-y: visible !important;
      -webkit-overflow-scrolling: touch !important;
      box-sizing: border-box !important;
    }
    
    .manse-ryeok-popup-container .manse-ryeok-container table,
    .manse-ryeok-popup-container .manse-ryeok-table {
      max-width: calc(100vw - 64px) !important;
      min-width: 600px !important;
      box-sizing: border-box !important;
    }
    
    @media (max-width: 768px) {
      .manse-ryeok-popup-container .manse-ryeok-container {
        max-width: calc(100vw - 32px) !important;
      }
      .manse-ryeok-popup-container .manse-ryeok-container table,
      .manse-ryeok-popup-container .manse-ryeok-table {
        max-width: calc(100vw - 32px) !important;
        min-width: 500px !important;
      }
    }
    
    @media (max-width: 480px) {
      .manse-ryeok-popup-container .manse-ryeok-container {
        max-width: calc(100vw - 16px) !important;
      }
      .manse-ryeok-popup-container .manse-ryeok-container table,
      .manse-ryeok-popup-container .manse-ryeok-table {
        max-width: calc(100vw - 16px) !important;
        min-width: 400px !important;
      }
    }
    
    /* 오행별 색상 (천간/지지) */
    /* 목(木): 갑, 을, 인, 묘 - 고급 청색 */
    .manse-element-wood {
      color: #1e40af !important;
      text-shadow: 0 1px 2px rgba(30, 64, 175, 0.2) !important;
    }
    /* 화(火): 병, 정, 사, 오 - 고급 적색 (더 진하게) */
    .manse-element-fire {
      color: #991b1b !important;
      text-shadow: 0 1px 2px rgba(153, 27, 27, 0.2) !important;
    }
    /* 토(土): 무, 기, 진, 술, 축, 미 - 약간 짙은 고급 노란색 */
    .manse-element-earth {
      color: #d97706 !important;
      text-shadow: 0 1px 2px rgba(217, 119, 6, 0.2) !important;
    }
    /* 금(金): 경, 신, 신, 유 - 고급 회색 */
    .manse-element-metal {
      color: #6b7280 !important;
      text-shadow: 0 1px 2px rgba(107, 114, 128, 0.2) !important;
    }
    /* 수(水): 임, 계, 자, 해 - 고급 검정색 */
    .manse-element-water {
      color: #1f2937 !important;
      text-shadow: 0 1px 2px rgba(31, 41, 55, 0.3) !important;
    }
    
    /* 천간/지지 폰트 크기 */
    .manse-ganzi-char {
      font-size: 1.2em !important;
      font-weight: 700 !important;
    }
    
    /* 만세력 테이블 기본 스타일 - 적절한 패딩, 가운데 정렬, 줄바꿈 방지 */
    .manse-ryeok-container td,
    .manse-ryeok-table td {
      padding: 12px 8px !important;
      font-size: 0.9rem !important;
      text-align: center !important;
      vertical-align: middle !important;
      white-space: nowrap !important;
    }
    .manse-ryeok-container th,
    .manse-ryeok-table th {
      padding: 12px 8px !important;
      font-size: 0.8rem !important;
      text-align: center !important;
      vertical-align: middle !important;
      white-space: nowrap !important;
    }
    
    /* 만세력 테이블: 화면폭 내에서 실제로 줄어들 수 있게 (가로 넘침 방지) */
    .manse-ryeok-container table,
    .manse-ryeok-container .manse-ryeok-table,
    .manse-ryeok-container table {
      table-layout: fixed !important;
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    
    /* 첫 번째 컬럼(범례) 스타일 - 조금 짙은 단색 배경 */
    .manse-ryeok-container td:first-child,
    .manse-ryeok-table td:first-child {
      font-weight: 700 !important;
      color: #5a4a32 !important;
      background: #d4c4a8 !important;
    }
    
    
    /* 모바일에서 만세력 테이블 폰트/패딩 조절 (폭 안에 들어오게) */
    @media (max-width: 480px) {
      .manse-ryeok-container {
        padding: 4px !important;
      }
      .manse-ryeok-container td,
      .manse-ryeok-table td {
        padding: 6px 2px !important;
        font-size: 0.72rem !important;
      }
      .manse-ryeok-container th,
      .manse-ryeok-table th {
        padding: 6px 2px !important;
        font-size: 0.62rem !important;
      }
      .manse-ganzi-char {
        font-size: 1.05em !important;
      }
    }
    
    @media (max-width: 360px) {
      .manse-ryeok-container td,
      .manse-ryeok-table td {
        padding: 4px 1px !important;
        font-size: 0.68rem !important;
      }
      .manse-ryeok-container th,
      .manse-ryeok-table th {
        padding: 4px 1px !important;
        font-size: 0.58rem !important;
      }
      .manse-ganzi-char {
        font-size: 1em !important;
      }
    }
  `

  // 모델 이름 표시용 (실제 값으로 덮어쓰기)
  const resolvedModelDisplayName = 
    model === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' :
    model === 'gemini-3-pro-preview' ? 'Gemini 3.0 Pro' :
    model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' :
    model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model || 'Unknown'

  // 경과 시간 계산 (실제 값으로 덮어쓰기)
  const resolvedElapsedTime = startTime ? Date.now() - startTime : 0

  const sanitizeHumanReadableText = (text: string): string => {
    if (!text) return ''
    let result = text
      // HTML 태그처럼 보이는 문자열 제거 (예: "<div class=...>")
      .replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '')
      // 모든 한자 제거 (밑줄 유무 관계없이)
      .replace(/[一-龯]/g, '')
      // 엔티티로 들어온 태그 텍스트도 제거될 수 있게 한 번 더 정리
      .replace(/\s+/g, ' ')
      .replace(/\n\s+\n/g, '\n\n')
      .trim()
    
    // 빈 문자열이 되지 않도록 보장 (첫 문장 보존)
    return result || text.replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '').trim()
  }

  const htmlToPlainText = (htmlFragment: string): string => {
    if (typeof window === 'undefined') return ''
    const temp = document.createElement('div')
    temp.innerHTML = htmlFragment || ''
    // 테이블/코드/스크립트/스타일 제거
    temp.querySelectorAll('table, .manse-ryeok-table, style, script, pre, code').forEach((el) => el.remove())
    // innerText를 먼저 가져온 후 한자 제거 (첫 문장 보존)
    const rawText = temp.innerText || temp.textContent || ''
    // HTML 태그 제거 및 한자 제거
    return sanitizeHumanReadableText(rawText)
  }

  const extractTextFromParsedMenus = (): string => {
    if (!parsedMenus || parsedMenus.length === 0) return ''
    const lines: string[] = []
    parsedMenus.forEach((menu) => {
      // 대제목은 한자 제거하지 않고 그대로 사용 (HTML 태그만 제거)
      const menuTitle = (menu.title || '').replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '').trim()
      if (menuTitle) lines.push(menuTitle)
      menu.subtitles.forEach((sub) => {
        // 소제목도 한자 제거하지 않고 그대로 사용 (HTML 태그만 제거)
        const subTitle = (sub.title || '').replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '').trim()
        if (subTitle) lines.push(subTitle)
        // 본문 내용은 한자 제거 적용
        const body = htmlToPlainText(sub.contentHtml || '')
        if (body) lines.push(body)
      })
    })
    return lines.join('\n\n').trim()
  }

  // 사람이 눈으로 읽는 텍스트만 추출 (렌더된 DOM 우선)
  const extractHumanReadableText = (htmlString?: string): string => {
    if (typeof window === 'undefined') return ''

    const pickFromContainer = (container: HTMLElement): string => {
      // clone해서 조작(원본 DOM 영향 없음)
      const clone = container.cloneNode(true) as HTMLElement

      // 테이블/만세력/목차/코드/스크립트/스타일 제거
      clone.querySelectorAll('table, .manse-ryeok-table, #table-of-contents, .toc-container, style, script, pre, code').forEach((el) => el.remove())

      // 읽을 요소만 있으면 그 순서대로, 없으면 전체 innerText
      const nodes = Array.from(
        clone.querySelectorAll('.menu-title, .subtitle-title, .detail-menu-title, .subtitle-content, .detail-menu-content')
      )
      if (nodes.length > 0) {
        const lines = nodes
          .map((el) => {
            const text = (el as HTMLElement).innerText || el.textContent || ''
            const className = String((el as HTMLElement).className || '')
            // 대제목(.menu-title)과 소제목(.subtitle-title, .detail-menu-title)은 한자 제거하지 않음
            if (className.includes('menu-title') || className.includes('subtitle-title') || className.includes('detail-menu-title')) {
              // HTML 태그만 제거하고 한자는 유지
              return text.replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '').replace(/\s+/g, ' ').trim()
            }
            // 본문 내용은 한자 제거 적용
            return sanitizeHumanReadableText(text)
          })
          .filter(Boolean)
        return lines.join('\n\n')
      }

      return sanitizeHumanReadableText((clone as HTMLElement).innerText || clone.textContent || '')
    }

    // 1) 실제 화면에 렌더된 결과(사용자가 보는 텍스트) 우선
    const live =
      (document.querySelector('.jeminai-results') as HTMLElement | null) ||
      (document.getElementById('contentHtml') as HTMLElement | null)
    if (live) return pickFromContainer(live)

    // 2) fallback: HTML 문자열 파싱
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlString || ''
    return pickFromContainer(tempDiv)
  }

  // 텍스트를 청크로 분할하는 함수
  const splitTextIntoChunks = (text: string, maxLength: number): string[] => {
    const chunks: string[] = []
    let currentIndex = 0

    while (currentIndex < text.length) {
      let chunk = text.substring(currentIndex, currentIndex + maxLength)
      
      // 마지막 청크가 아니면 문장 중간에서 잘리지 않도록 처리
      if (currentIndex + maxLength < text.length) {
        const lastSpace = chunk.lastIndexOf(' ')
        const lastPeriod = chunk.lastIndexOf('.')
        const lastComma = chunk.lastIndexOf(',')
        const lastNewline = chunk.lastIndexOf('\n')
        const lastQuestion = chunk.lastIndexOf('?')
        const lastExclamation = chunk.lastIndexOf('!')
        
        const cutPoint = Math.max(
          lastSpace, 
          lastPeriod, 
          lastComma, 
          lastNewline,
          lastQuestion,
          lastExclamation,
          Math.floor(chunk.length * 0.9) // 최소 90%는 유지
        )
        
        if (cutPoint > chunk.length * 0.8) {
          chunk = chunk.substring(0, cutPoint + 1)
        }
      }
      
      chunks.push(chunk.trim())
      currentIndex += chunk.length
    }

    return chunks.filter(chunk => chunk.length > 0)
  }

  // 음성 재생 중지 함수
  const stopTextToSpeech = () => {
    stopAndResetAudio()
    setTtsStatus(null) // 상태 메시지 제거
  }

  // 음성으로 듣기 기능 (현재 결과용) - 청크 단위로 나누어 재생
  const handleTextToSpeech = async () => {
    // 재생 중이면 중지
    if (isPlaying) {
      stopTextToSpeech()
      return
    }

    if (!html) return

    try {
      setIsPlaying(true)
      shouldStopRef.current = false // ref 초기화
      setShouldStop(false) // state 초기화
      setTtsStatus('음성 생성중...') // 초기 상태 메시지
      
      // 1) parsedMenus 기반(사람이 보는 구조) 우선, 2) fallback DOM/HTML 파싱
      let textContent = extractTextFromParsedMenus()
      // parsedMenus가 없거나 빈 경우에만 fallback 사용
      if (!textContent || textContent.trim().length === 0) {
        textContent = extractHumanReadableText(html)
      }
      
      // 내담자 이름 추가 (resultData에서 가져오기)
      const userName = resultData?.userName || ''
      if (userName && textContent) {
        // 이름을 맨 앞에 추가
        textContent = `${userName}님의 점사 결과입니다.\n\n${textContent}`
      }
      
      // extractTextFromParsedMenus에서 이미 한자 제거가 적용되었으므로 여기서는 제거하지 않음
      // (대제목/소제목은 한자 유지, 본문만 한자 제거)
      
      if (!textContent.trim()) {
        alert('읽을 내용이 없습니다.')
        setIsPlaying(false)
        return
      }

      // 컨텐츠에서 TTS 설정 가져오기
      // - provider/voiceId: 기본은 타입캐스트(요청하신 기본 voice id)
      // - speaker: 네이버 TTS일 때만 사용
      // 안전한 기본값: 네이버 (설정 조회 실패 시에도 Typecast 결제 오류로 새지 않게)
      let ttsProvider: 'naver' | 'typecast' = 'naver'
      let typecastVoiceId = 'tc_5ecbbc6099979700087711d8'
      let speaker = 'nara' // 기본값 (naver)
      
      // 1. 먼저 app_settings에서 선택된 화자 확인
      try {
        const selectedSpeaker = await getSelectedSpeaker()
        speaker = selectedSpeaker
      } catch (error) {
      }

      // 1-1. app_settings의 TTS provider/voice id (공개 설정 API)
      try {
        const ttsResp = await fetch('/api/settings/tts', { cache: 'no-store' })
        if (ttsResp.ok) {
          const ttsJson = await ttsResp.json()
          ttsProvider = ttsJson?.tts_provider === 'naver' ? 'naver' : 'typecast'
          typecastVoiceId = (typeof ttsJson?.typecast_voice_id === 'string' && ttsJson.typecast_voice_id.trim() !== '')
            ? ttsJson.typecast_voice_id.trim()
            : typecastVoiceId
        }
      } catch (e) {
      }
      
      // 2. content.id가 있으면 Supabase에서 컨텐츠의 tts_speaker도 확인
      if (content?.id) {
        try {
          const freshContent = await getContentById(content.id)
          
          // 컨텐츠에 tts_speaker가 있고 'nara'가 아니면 사용 (컨텐츠별 설정이 우선)
          if (freshContent?.tts_speaker && freshContent.tts_speaker !== 'nara') {
            speaker = freshContent.tts_speaker
          } else {
          }

          // 컨텐츠별 provider/voice id는 "명시적으로 타입캐스트가 설정된 경우에만" override
          // (contents.tts_provider 기본값이 naver이면, 전역 설정(app_settings)을 덮어쓰는 문제가 생김)
          if ((freshContent as any)?.tts_provider === 'typecast') {
            ttsProvider = 'typecast'
          }
          const vc = String((freshContent as any)?.typecast_voice_id || '').trim()
          if (vc) {
            typecastVoiceId = vc
          }
          
          // content 객체 업데이트
          if (freshContent?.tts_speaker) {
            content.tts_speaker = freshContent.tts_speaker
          }
          ;(content as any).tts_provider = (freshContent as any)?.tts_provider
          ;(content as any).typecast_voice_id = (freshContent as any)?.typecast_voice_id
        } catch (error) {
        }
      } else {
        // content.id가 없으면 app_settings의 화자 사용
      }
      
      // 타입캐스트일 때는 첫 번째 청크를 작게 나누어 빠르게 시작
      // 타입캐스트는 생성 시간이 오래 걸리므로 첫 청크를 500자로 작게 나누고, 나머지는 2000자 유지
      const firstChunkSize = ttsProvider === 'typecast' ? 500 : 2000
      const restChunkSize = 2000
      
      // 첫 번째 청크와 나머지 청크를 분리
      let firstChunk = ''
      let restText = textContent
      
      if (ttsProvider === 'typecast' && textContent.length > firstChunkSize) {
        // 첫 500자를 문장 단위로 자르기
        const tempFirstChunk = textContent.substring(0, firstChunkSize)
        const lastSpace = tempFirstChunk.lastIndexOf(' ')
        const lastPeriod = tempFirstChunk.lastIndexOf('.')
        const lastNewline = tempFirstChunk.lastIndexOf('\n')
        const cutIndex = Math.max(lastPeriod, lastSpace, lastNewline)
        
        if (cutIndex > firstChunkSize * 0.3) { // 30% 이상이면 그 위치에서 자르기
          firstChunk = textContent.substring(0, cutIndex + 1).trim()
          restText = textContent.substring(cutIndex + 1).trim()
        } else {
          firstChunk = tempFirstChunk.trim()
          restText = textContent.substring(firstChunkSize).trim()
        }
      } else {
        firstChunk = textContent
        restText = ''
      }
      
      // 나머지 텍스트를 청크로 분할
      const restChunks = restText ? splitTextIntoChunks(restText, restChunkSize) : []
      const chunks = [firstChunk, ...restChunks].filter(chunk => chunk.trim().length > 0)
      
      // 다음 청크를 미리 로드하는 함수
      const preloadNextChunk = async (chunkIndex: number): Promise<{ url: string; audio: HTMLAudioElement } | null> => {
        if (chunkIndex >= chunks.length || shouldStopRef.current) {
          return null
        }

        try {
          const chunk = chunks[chunkIndex]

          // TTS API 호출 (provider/voiceId 포함)
          const isLocalDebug =
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          const outgoingVoiceId = ttsProvider === 'typecast' ? typecastVoiceId : ''
          if (isLocalDebug) {
            console.log('[tts] request', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId, chunkIndex })
          }

          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
          })
          if (isLocalDebug) {
            console.log('[tts] response', {
              ok: response.ok,
              status: response.status,
              usedProvider: response.headers.get('X-TTS-Provider'),
              usedVoiceId: response.headers.get('X-TTS-VoiceId'),
              chunkIndex
            })
          }

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || `청크 ${chunkIndex + 1} 음성 변환에 실패했습니다.`)
          }

          // 오디오 데이터를 Blob으로 변환
          const audioBlob = await response.blob()
          const url = URL.createObjectURL(audioBlob)
          const audio = new Audio(url)
          
          // 오디오가 로드될 때까지 대기 (타임아웃 추가)
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`청크 ${chunkIndex + 1} 로드 타임아웃`))
            }, 30000) // 30초 타임아웃
            
            audio.oncanplaythrough = () => {
              clearTimeout(timeout)
              resolve()
            }
            audio.onerror = (e) => {
              clearTimeout(timeout)
              reject(new Error(`청크 ${chunkIndex + 1} 로드 실패`))
            }
            audio.load()
          })

          return { url, audio }
        } catch (error) {
          return null
        }
      }

      // 타입캐스트일 때: 첫 번째 청크 생성과 동시에 나머지 청크들도 병렬로 미리 생성 시작
      let preloadedChunks: Map<number, { url: string; audio: HTMLAudioElement }> = new Map()
      
      if (ttsProvider === 'typecast' && chunks.length > 1) {
        // 첫 번째 청크는 즉시 생성, 나머지는 병렬로 미리 생성
        const preloadPromises = []
        for (let i = 1; i < Math.min(chunks.length, 4); i++) { // 최대 3개까지 병렬 생성 (API 제한 고려)
          preloadPromises.push(
            preloadNextChunk(i).then(result => {
              if (result) {
                preloadedChunks.set(i, result)
              }
              return result
            })
          )
        }
        // 병렬 생성은 백그라운드에서 진행 (await 하지 않음)
        Promise.all(preloadPromises).catch(() => {})
      }

      // 각 청크를 순차적으로 재생
      let preloadedChunk: { url: string; audio: HTMLAudioElement } | null = null
      
      for (let i = 0; i < chunks.length; i++) {
        // 중지 플래그 확인 (ref로 실시간 확인)
        if (shouldStopRef.current) {
          if (preloadedChunk) {
            URL.revokeObjectURL(preloadedChunk.url)
          }
          // 미리 로드된 모든 청크 정리
          preloadedChunks.forEach((chunk) => {
            URL.revokeObjectURL(chunk.url)
          })
          preloadedChunks.clear()
          break
        }

        const chunk = chunks[i]

        // 현재 청크 재생
        let currentAudio: HTMLAudioElement
        let currentUrl: string

        // 타입캐스트일 때: 미리 로드된 청크가 있으면 사용
        if (ttsProvider === 'typecast' && preloadedChunks.has(i)) {
          const preloaded = preloadedChunks.get(i)!
          currentAudio = preloaded.audio
          currentUrl = preloaded.url
          preloadedChunks.delete(i)
        } else if (ttsProvider === 'typecast' && i > 0) {
          // 타입캐스트이고 첫 청크가 아닌 경우: 미리 로드된 청크가 준비될 때까지 대기
          let foundPreloaded = false
          let waitCount = 0
          const maxWait = 100 // 최대 10초 대기 (100 * 100ms)
          
          while (!preloadedChunks.has(i) && waitCount < maxWait && !shouldStopRef.current) {
            await new Promise(resolve => setTimeout(resolve, 100))
            waitCount++
          }
          
          if (preloadedChunks.has(i)) {
            const preloaded = preloadedChunks.get(i)!
            currentAudio = preloaded.audio
            currentUrl = preloaded.url
            preloadedChunks.delete(i)
            foundPreloaded = true
          }
          
          if (!foundPreloaded) {
            // 미리 로드 실패 시 즉시 요청
            const isLocalDebug =
              typeof window !== 'undefined' &&
              (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            const outgoingVoiceId = ttsProvider === 'typecast' ? typecastVoiceId : ''
            if (isLocalDebug) {
              console.log('[tts] request (fallback)', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId, chunkIndex: i })
            }

            const response = await fetch('/api/tts', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
            })
            if (isLocalDebug) {
              console.log('[tts] response (fallback)', {
                ok: response.ok,
                status: response.status,
                usedProvider: response.headers.get('X-TTS-Provider'),
                usedVoiceId: response.headers.get('X-TTS-VoiceId'),
                chunkIndex: i
              })
            }

            if (!response.ok) {
              const error = await response.json()
              throw new Error(error.error || `청크 ${i + 1} 음성 변환에 실패했습니다.`)
            }

            const audioBlob = await response.blob()
            currentUrl = URL.createObjectURL(audioBlob)
            currentAudio = new Audio(currentUrl)
          }
        } else if (preloadedChunk) {
          // 기존 방식: 미리 로드된 청크 사용
          currentAudio = preloadedChunk.audio
          currentUrl = preloadedChunk.url
          preloadedChunk = null
        } else {
          // 첫 번째 청크이거나 미리 로드 실패한 경우 즉시 요청
          const isLocalDebug =
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          const outgoingVoiceId = ttsProvider === 'typecast' ? typecastVoiceId : ''
          if (isLocalDebug) {
            console.log('[tts] request', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId, chunkIndex: i })
          }

          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
          })
          if (isLocalDebug) {
            console.log('[tts] response', {
              ok: response.ok,
              status: response.status,
              usedProvider: response.headers.get('X-TTS-Provider'),
              usedVoiceId: response.headers.get('X-TTS-VoiceId'),
              chunkIndex: i
            })
          }

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || `청크 ${i + 1} 음성 변환에 실패했습니다.`)
          }

          const audioBlob = await response.blob()
          currentUrl = URL.createObjectURL(audioBlob)
          currentAudio = new Audio(currentUrl)
          
        }

        // 오디오 재생 (Promise로 대기, 타임아웃 및 에러 처리 개선)
        await new Promise<void>((resolve, reject) => {
          // 중지 플래그 재확인 (ref로 실시간 확인)
          if (shouldStopRef.current) {
            URL.revokeObjectURL(currentUrl)
            resolve()
            return
          }

          currentAudioRef.current = currentAudio // 현재 오디오 저장 (ref 사용, 리렌더링 방지)
          
          // 타임아웃 설정 (5분 - 매우 긴 오디오 대비)
          const timeout = setTimeout(() => {
            currentAudio.pause()
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
            reject(new Error(`청크 ${i + 1} 재생 타임아웃`))
          }, 300000) // 5분
          
          const cleanup = () => {
            clearTimeout(timeout)
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
          }
          
          currentAudio.onended = () => {
            cleanup()
            resolve()
          }
          
          currentAudio.onerror = (e) => {
            cleanup()
            // 에러가 발생해도 다음 청크로 계속 진행하도록 resolve (reject 대신)
            resolve()
          }
          
          currentAudio.onpause = () => {
            // 사용자가 일시정지하거나 페이지가 비활성화된 경우
            if (document.hidden || shouldStopRef.current) {
              cleanup()
              setIsPlaying(false)
            }
          }
          
          // 첫 번째 청크 재생 시작 시점에 "음성 생성 중..." 메시지 제거
          if (i === 0) {
            currentAudio.addEventListener('playing', () => {
              setTtsStatus(null) // 음성이 시작되면 상태 메시지 제거
            }, { once: true })
          }
          
          currentAudio.play().catch((err) => {
            cleanup()
            // play 실패해도 다음 청크로 계속 진행
            resolve()
          })
        })

        // 다음 청크 미리 로드
        if (i < chunks.length - 1) {
          try {
            // 타입캐스트일 때: 이미 미리 로드된 청크가 있으면 스킵, 없으면 추가로 미리 로드
            if (ttsProvider === 'typecast') {
              if (!preloadedChunks.has(i + 1)) {
                // 아직 미리 로드되지 않은 청크는 백그라운드에서 미리 로드
                preloadNextChunk(i + 1).then(result => {
                  if (result) {
                    preloadedChunks.set(i + 1, result)
                  }
                }).catch(() => {})
              }
            } else {
              // 네이버 TTS: 기존 방식 유지 (다음 청크만 미리 로드)
              const nextChunkPromise = preloadNextChunk(i + 1)
              preloadedChunk = await nextChunkPromise
            }
          } catch (err) {
            if (ttsProvider !== 'typecast') {
              preloadedChunk = null
            }
          }
        }

        // 중지 플래그 재확인
        if (shouldStopRef.current) {
          if (preloadedChunk) {
            URL.revokeObjectURL(preloadedChunk.url)
          }
          // 미리 로드된 모든 청크 정리
          preloadedChunks.forEach((chunk) => {
            URL.revokeObjectURL(chunk.url)
          })
          preloadedChunks.clear()
          break
        }
      }

      if (!shouldStopRef.current) {
      } else {
      }
      setIsPlaying(false)
      currentAudioRef.current = null
      setShouldStop(false)
      shouldStopRef.current = false
      setTtsStatus(null) // 상태 메시지 제거
    } catch (error: any) {
      alert(error?.message || '음성 변환에 실패했습니다.')
      setIsPlaying(false)
      currentAudioRef.current = null
      setTtsStatus(null) // 상태 메시지 제거
      setShouldStop(false)
    }
  }

  // 저장된 결과 음성으로 듣기 기능 - 청크 단위로 나누어 재생
  const handleSavedResultTextToSpeech = async (savedResult: any) => {
    if (!savedResult.html || playingResultId === savedResult.id) return

    try {
      setPlayingResultId(savedResult.id)
      
      // 저장된 결과는 HTML 문자열을 직접 파싱하여 텍스트 추출
      // (새 창에서 열린 경우 DOM이 완전히 렌더링되기 전에 실행될 수 있으므로)
      let textContent = ''
      
      // HTML 문자열을 직접 파싱하여 텍스트 추출
      if (typeof window !== 'undefined') {
        const parser = new DOMParser()
        const doc = parser.parseFromString(savedResult.html, 'text/html')
        
        // 테이블/만세력/목차/코드/스크립트/스타일 제거
        doc.querySelectorAll('table, .manse-ryeok-table, #table-of-contents, .toc-container, style, script, pre, code').forEach((el) => el.remove())
        
        // 읽을 요소만 있으면 그 순서대로 추출
        const nodes = Array.from(
          doc.querySelectorAll('.menu-title, .subtitle-title, .detail-menu-title, .subtitle-content, .detail-menu-content')
        )
        
        if (nodes.length > 0) {
          const lines = nodes
            .map((el) => {
              const text = (el as HTMLElement).innerText || el.textContent || ''
              const className = String((el as HTMLElement).className || '')
              // 대제목(.menu-title)과 소제목(.subtitle-title, .detail-menu-title)은 한자 제거하지 않음
              if (className.includes('menu-title') || className.includes('subtitle-title') || className.includes('detail-menu-title')) {
                // HTML 태그만 제거하고 한자는 유지
                return text.replace(/<\s*\/?\s*[a-zA-Z][^>]*>/g, '').replace(/\s+/g, ' ').trim()
              }
              // 본문 내용은 한자 제거 적용
              return sanitizeHumanReadableText(text)
            })
            .filter(Boolean)
          textContent = lines.join('\n\n')
        } else {
          // 요소를 찾지 못한 경우 전체 텍스트 추출
          const body = doc.body || doc.documentElement
          textContent = sanitizeHumanReadableText(body.innerText || body.textContent || '')
        }
      } else {
        // window가 없는 경우 fallback
        textContent = extractHumanReadableText(savedResult.html)
      }
      
      // 내담자 이름 추가
      const userName = savedResult.userName || savedResult.content?.user_info?.name || ''
      if (userName && textContent) {
        // 이름을 맨 앞에 추가
        textContent = `${userName}님의 점사 결과입니다.\n\n${textContent}`
      }
      
      // extractHumanReadableText에서 이미 한자 제거가 적용되었으므로 여기서는 제거하지 않음
      // (대제목/소제목은 한자 유지, 본문만 한자 제거)

      if (!textContent.trim()) {
        alert('읽을 내용이 없습니다.')
        setPlayingResultId(null)
        return
      }

      // 저장된 컨텐츠에서 TTS 설정 가져오기
      // 안전한 기본값: 네이버 (설정 조회 실패 시에도 Typecast 결제 오류로 새지 않게)
      let ttsProvider: 'naver' | 'typecast' = 'naver'
      let typecastVoiceId = 'tc_5ecbbc6099979700087711d8'
      let speaker = 'nara' // 기본값 (naver)
      
      // 1. 먼저 app_settings에서 선택된 화자 확인
      try {
        const selectedSpeaker = await getSelectedSpeaker()
        speaker = selectedSpeaker
      } catch (error) {
      }

      // 1-1. app_settings의 TTS provider/voice id
      try {
        const ttsResp = await fetch('/api/settings/tts', { cache: 'no-store' })
        if (ttsResp.ok) {
          const ttsJson = await ttsResp.json()
          ttsProvider = ttsJson?.tts_provider === 'naver' ? 'naver' : 'typecast'
          typecastVoiceId = (typeof ttsJson?.typecast_voice_id === 'string' && ttsJson.typecast_voice_id.trim() !== '')
            ? ttsJson.typecast_voice_id.trim()
            : typecastVoiceId
        }
      } catch (e) {
      }
      
      // 2. content.id가 있으면 Supabase에서 컨텐츠의 tts_speaker도 확인
      if (savedResult.content?.id) {
        try {
          const freshContent = await getContentById(savedResult.content.id)
          
          // 컨텐츠에 tts_speaker가 있고 'nara'가 아니면 사용 (컨텐츠별 설정이 우선)
          if (freshContent?.tts_speaker && freshContent.tts_speaker !== 'nara') {
            speaker = freshContent.tts_speaker
          } else {
          }
          
          // savedResult.content 객체 업데이트
          if (freshContent?.tts_speaker && savedResult.content) {
            savedResult.content.tts_speaker = freshContent.tts_speaker
          }

          // 컨텐츠별 provider/voice id는 "명시적으로 타입캐스트가 설정된 경우에만" override
          if ((freshContent as any)?.tts_provider === 'typecast') {
            ttsProvider = 'typecast'
          }
          const vc = String((freshContent as any)?.typecast_voice_id || '').trim()
          if (vc) {
            typecastVoiceId = vc
          }
          if (savedResult.content) {
            ;(savedResult.content as any).tts_provider = (freshContent as any)?.tts_provider
            ;(savedResult.content as any).typecast_voice_id = (freshContent as any)?.typecast_voice_id
          }
        } catch (error) {
        }
      } else {
        // content.id가 없으면 app_settings의 화자 사용
      }
      
      // 텍스트를 2000자 단위로 분할
      const maxLength = 2000
      const chunks = splitTextIntoChunks(textContent, maxLength)
      
      // 다음 청크를 미리 로드하는 함수
      const preloadNextChunk = async (chunkIndex: number): Promise<{ url: string; audio: HTMLAudioElement } | null> => {
        if (chunkIndex >= chunks.length) {
          return null
        }

        try {
          const chunk = chunks[chunkIndex]

          // TTS API 호출 (provider/voiceId 포함)
          const isLocalDebug =
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          const outgoingVoiceId = ttsProvider === 'typecast' ? typecastVoiceId : ''
          if (isLocalDebug) {
            console.log('[tts] request', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId })
          }

          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
          })
          if (isLocalDebug) {
            console.log('[tts] response', {
              ok: response.ok,
              status: response.status,
              usedProvider: response.headers.get('X-TTS-Provider'),
              usedVoiceId: response.headers.get('X-TTS-VoiceId'),
            })
          }

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || `청크 ${chunkIndex + 1} 음성 변환에 실패했습니다.`)
          }

          // 오디오 데이터를 Blob으로 변환
          const audioBlob = await response.blob()
          const url = URL.createObjectURL(audioBlob)
          const audio = new Audio(url)
          
          // 오디오가 로드될 때까지 대기 (타임아웃 추가)
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`청크 ${chunkIndex + 1} 로드 타임아웃`))
            }, 30000) // 30초 타임아웃
            
            audio.oncanplaythrough = () => {
              clearTimeout(timeout)
              resolve()
            }
            audio.onerror = (e) => {
              clearTimeout(timeout)
              reject(new Error(`청크 ${chunkIndex + 1} 로드 실패`))
            }
            audio.load()
          })

          return { url, audio }
        } catch (error) {
          return null
        }
      }

      // 각 청크를 순차적으로 재생 (다음 청크는 미리 로드)
      let preloadedChunk: { url: string; audio: HTMLAudioElement } | null = null

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]

        // 다음 청크를 미리 로드 (현재 청크 재생 중에)
        const nextChunkPromise = i < chunks.length - 1 ? preloadNextChunk(i + 1) : Promise.resolve(null)

        // 현재 청크 재생
        let currentAudio: HTMLAudioElement
        let currentUrl: string

        if (preloadedChunk) {
          // 미리 로드된 청크 사용
          currentAudio = preloadedChunk.audio
          currentUrl = preloadedChunk.url
          preloadedChunk = null
        } else {
          // 첫 번째 청크이거나 미리 로드 실패한 경우 즉시 요청
          const isLocalDebug =
            typeof window !== 'undefined' &&
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
          const outgoingVoiceId = ttsProvider === 'typecast' ? typecastVoiceId : ''
          if (isLocalDebug) {
            console.log('[tts] request', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId })
          }

          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
          })
          if (isLocalDebug) {
            console.log('[tts] response', {
              ok: response.ok,
              status: response.status,
              usedProvider: response.headers.get('X-TTS-Provider'),
              usedVoiceId: response.headers.get('X-TTS-VoiceId'),
            })
          }

          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.error || `청크 ${i + 1} 음성 변환에 실패했습니다.`)
          }

          const audioBlob = await response.blob()
          currentUrl = URL.createObjectURL(audioBlob)
          currentAudio = new Audio(currentUrl)
        }

        // 오디오 재생 (Promise로 대기, 타임아웃 및 에러 처리 개선)
        await new Promise<void>((resolve, reject) => {
          currentAudioRef.current = currentAudio // 현재 오디오 저장 (ref 사용, 리렌더링 방지)
          
          // 타임아웃 설정 (5분)
          const timeout = setTimeout(() => {
            currentAudio.pause()
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
            reject(new Error(`청크 ${i + 1} 재생 타임아웃`))
          }, 300000) // 5분
          
          const cleanup = () => {
            clearTimeout(timeout)
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
          }
          
          currentAudio.onended = () => {
            cleanup()
            resolve()
          }
          
          currentAudio.onerror = (e) => {
            cleanup()
            // 에러가 발생해도 다음 청크로 계속 진행
            resolve()
          }
          
          currentAudio.onpause = () => {
            // 사용자가 일시정지하거나 페이지가 비활성화된 경우
            if (document.hidden) {
              cleanup()
              setPlayingResultId(null)
            }
          }
          
          currentAudio.play().catch((err) => {
            cleanup()
            // play 실패해도 다음 청크로 계속 진행
            resolve()
          })
        })

        // 다음 청크 미리 로드 완료 대기 및 저장
        if (i < chunks.length - 1) {
          try {
            preloadedChunk = await nextChunkPromise
            if (preloadedChunk) {
            } else {
            }
          } catch (err) {
            preloadedChunk = null
          }
        }
      }

      setPlayingResultId(null)
      currentAudioRef.current = null
    } catch (error: any) {
      alert(error?.message || '음성 변환에 실패했습니다.')
      setPlayingResultId(null)
      currentAudioRef.current = null
    }
  }

  // 저장된 결과 삭제
  const deleteSavedResult = async (resultId: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const response = await fetch(`/api/saved-results/delete?id=${resultId}`, {
        method: 'DELETE',
        cache: 'no-store' // 프로덕션 환경에서 캐싱 방지
      })
      if (!response.ok) {
        throw new Error('저장된 결과 삭제 실패')
      }
      const result = await response.json()
      if (result.success) {
        // 즉시 로컬 상태에서 제거 (UI 즉시 업데이트)
        setSavedResults((prev) => prev.filter((item: any) => item.id !== resultId))
        // 백그라운드에서 서버와 동기화
        setTimeout(async () => {
          await loadSavedResults()
        }, 100)
      } else {
        throw new Error('저장된 결과 삭제에 실패했습니다.')
      }
    } catch (e) {
      alert('저장된 결과 삭제에 실패했습니다.')
    }
  }

  // 저장된 결과 보기
  const viewSavedResult = async (resultId: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const saved = savedResults.find((r: any) => r.id === resultId)
      
      if (saved) {
        // content가 문자열인 경우 파싱
        let contentObj = saved.content
        if (typeof saved.content === 'string') {
          try {
            contentObj = JSON.parse(saved.content)
          } catch (e) {
            contentObj = saved.content
          }
        } else {
        }
        
        // menu_items가 없거나 불완전한 경우 API에서 완전한 content 가져오기
        const contentId = contentObj?.id || saved.content_id
        if (contentId && (!contentObj?.menu_items || contentObj.menu_items.length === 0)) {
          try {
            const fullContentRes = await fetch(`/api/content/${contentId}?full=true`, { cache: 'no-store' })
            if (fullContentRes.ok) {
              const fullContent = await fullContentRes.json()
              if (fullContent && fullContent.menu_items) {
                // 기존 contentObj에 menu_items와 다른 필드 병합
                contentObj = { ...contentObj, ...fullContent }
              }
            }
          } catch (e) {
            // API 호출 실패 시 기존 데이터 사용
          }
        }
        
        // userName을 안전하게 처리 (템플릿 리터럴 중첩 방지)
        const userNameForScript = saved.userName ? JSON.stringify(saved.userName) : "''"
        
        // contentObj를 JSON 문자열로 변환 (템플릿 리터럴에서 사용)
        const contentObjJson = JSON.stringify(contentObj || {})
        
        // HTML에서 <style> 태그 추출하여 <head>에 넣고, 나머지는 본문에 표시
        let htmlContent = saved.html || ''
        let styleContent = ''
        
        // HTML에 <style> 태그가 포함되어 있는지 확인
        const styleMatch = htmlContent.match(/<style[^>]*>([\s\S]*?)<\/style>/i)
        if (styleMatch) {
          styleContent = styleMatch[1]
          // HTML에서 <style> 태그 제거
          htmlContent = htmlContent.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        }
        
        // 소제목 썸네일 및 만세력 테이블 추가 (저장된 결과) - batch 모드와 동일한 방식
        const menuItems = contentObj?.menu_items || []
        // 만세력 테이블 가져오기 (여러 경로에서 시도)
        let manseRyeokTable = contentObj?.manse_ryeok_table || ''
        
        // HTML에서 만세력 테이블이 이미 있는지 확인
        if (htmlContent) {
          // 먼저 HTML에서 만세력 컨테이너 찾기
          const parser = new DOMParser()
          const tempDoc = parser.parseFromString(htmlContent, 'text/html')
          const existingManse = tempDoc.querySelector('.manse-ryeok-container, .manse-ryeok-wrapper, .manse-ryeok-table')
          
          if (existingManse) {
            // HTML에 이미 만세력이 포함되어 있음
            const wrapper = existingManse.closest('.manse-ryeok-wrapper') || existingManse.closest('.manse-ryeok-container')
            if (wrapper) {
              manseRyeokTable = wrapper.outerHTML
            } else if (existingManse.classList.contains('manse-ryeok-table')) {
              // 테이블만 있는 경우
              manseRyeokTable = '<div class="manse-ryeok-container">' + existingManse.outerHTML + '</div>'
            } else {
              manseRyeokTable = existingManse.outerHTML
            }
          } else if (!manseRyeokTable) {
            // 정규식으로도 시도 (DOMParser가 실패한 경우)
            const manseMatch = htmlContent.match(/<div[^>]*class="[^"]*manse-ryeok-container[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
            if (manseMatch) {
              manseRyeokTable = manseMatch[0]
            } else {
              const tableMatch = htmlContent.match(/<table[^>]*class="[^"]*manse-ryeok-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i)
              if (tableMatch) {
                manseRyeokTable = '<div class="manse-ryeok-container">' + tableMatch[0] + '</div>'
              }
            }
          }
        }

        // ✅ 저장된 결과(보기)에서는 만세력 "바로 위 1줄"만 별도 예쁘게 렌더링하도록 추출
        let manseHeaderHtml = ''
        try {
          if (htmlContent) {
            const headerLineMatch = htmlContent.match(/\[[^\]]*양력[^\]]*음력[^\]]*\]/)
            if (headerLineMatch) {
              const parsed = parsePrettyResultTitle(headerLineMatch[0])
              if (parsed) {
                const timeLabel = parsed.branch ? `${parsed.branch}시` : '시간'
                const timeText = parsed.timeRange ? `(${parsed.timeRange})` : ''
                manseHeaderHtml =
                  `<div class="manse-header-line">` +
                  `<div class="manse-header-name">${parsed.name}</div>` +
                  `<div class="manse-header-badges">` +
                  `<span class="manse-header-badge"><strong>양력</strong> ${parsed.solar}</span>` +
                  `<span class="manse-header-badge"><strong>음력</strong> ${parsed.lunar}</span>` +
                  `<span class="manse-header-badge"><strong>${timeLabel}</strong> ${timeText}</span>` +
                  `</div>` +
                  `</div>`
              }
              // 본문에서는 해당 1줄 제거 (중복 방지)
              htmlContent = htmlContent.replace(headerLineMatch[0], '')
            }
          }
        } catch {
          // 무시
        }
        
        if (menuItems.length > 0 && htmlContent) {
          try {
            // ** 제거는 DOMParser 전에 처리
            let processedHtml = htmlContent.replace(/\*\*/g, '')
            
            const parser = new DOMParser()
            const doc = parser.parseFromString(processedHtml, 'text/html')
            const menuSections = Array.from(doc.querySelectorAll('.menu-section'))
            
            menuSections.forEach((section, menuIndex) => {
              const menuItem = menuItems[menuIndex]
              
              // menu-section에 id 추가 (목차에서 스크롤하기 위해)
              ;(section as HTMLElement).id = `menu-${menuIndex}`
              
              // 대메뉴 썸네일 추가 (아직 없는 경우에만)
              if (menuItem) {
                const menuThumbnailImageUrl = menuItem.thumbnail_image_url || menuItem.thumbnail || ''
                if (menuThumbnailImageUrl && !section.querySelector('.menu-thumbnail-container')) {
                  const menuTitle = section.querySelector('.menu-title')
                  if (menuTitle) {
                    const thumbnailDiv = doc.createElement('div')
                    thumbnailDiv.className = 'menu-thumbnail-container'
                    thumbnailDiv.style.cssText = 'width: 100%; margin-bottom: 32px; margin-top: 8px;'
                    
                    const imgEl = doc.createElement('img')
                    imgEl.src = menuThumbnailImageUrl
                    imgEl.alt = ''
                    imgEl.style.cssText = 'width: 100%; height: auto; object-fit: contain; border-radius: 8px; display: block;'
                    thumbnailDiv.appendChild(imgEl)
                    
                    menuTitle.insertAdjacentElement('afterend', thumbnailDiv)
                  }
                }
              }
              
              // 첫 번째 대메뉴에 만세력 테이블 추가 (아직 없는 경우에만)
              if (menuIndex === 0 && manseRyeokTable && !section.querySelector('.manse-ryeok-table, .manse-ryeok-container, .manse-ryeok-wrapper')) {
                const menuTitle = section.querySelector('.menu-title')
                if (menuTitle) {
                  // manseRyeokTable이 이미 완전한 HTML 구조인지 확인
                  const tempParser = new DOMParser()
                  const tempDoc = tempParser.parseFromString(manseRyeokTable, 'text/html')
                  const existingContainer = tempDoc.querySelector('.manse-ryeok-container')
                  
                  const manseDiv = doc.createElement('div')
                  manseDiv.className = 'manse-ryeok-wrapper'
                  const containerDiv = doc.createElement('div')
                  containerDiv.className = 'manse-ryeok-container'
                  
                  if (existingContainer) {
                    // 이미 컨테이너가 포함되어 있으면 innerHTML만 복사
                    containerDiv.innerHTML = existingContainer.innerHTML
                  } else {
                    // 컨테이너가 없으면 새로 생성
                    containerDiv.innerHTML = manseRyeokTable
                  }
                  
                  // 만세력 헤더(1줄) 추가
                  if (manseHeaderHtml) {
                    const headerDiv = doc.createElement('div')
                    headerDiv.innerHTML = manseHeaderHtml
                    // headerDiv.innerHTML은 wrapper가 생기므로 첫 요소만 append
                    const first = headerDiv.firstElementChild
                    if (first) manseDiv.appendChild(first as HTMLElement)
                  }

                  manseDiv.appendChild(containerDiv)
                  
                  // 오행 판별 함수 (목, 화, 토, 금, 수 글자 포함)
                  const getElement = (char: string): string | null => {
                    if (['갑', '을', '甲', '乙', '인', '묘', '寅', '卯', '목', '木'].includes(char)) return 'wood'
                    if (['병', '정', '丙', '丁', '사', '오', '巳', '午', '화', '火'].includes(char)) return 'fire'
                    if (['무', '기', '戊', '己', '진', '술', '축', '미', '辰', '戌', '丑', '未', '토', '土'].includes(char)) return 'earth'
                    if (['경', '신', '庚', '辛', '유', '申', '酉', '금', '金'].includes(char)) return 'metal'
                    if (['임', '계', '壬', '癸', '자', '해', '子', '亥', '수', '水'].includes(char)) return 'water'
                    return null
                  }
                  
                  // 천간/지지 판별 (크기 확대 대상)
                  const cheonganJiji = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계',
                    '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
                    '자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해',
                    '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
                  
                  // 일반 폰트 적용 행 (오행 색상 적용 안 함)
                  const normalFontRows = ['십성', '지장간', '십이운성', '십이신살']
                  // 2줄 표시 행: 1줄(한글) + 2줄(괄호 포함 한문)
                  const twoLineRows = ['십성', '지장간', '십이신살']
                  
                  // 만세력 테이블 셀에 오행 클래스 적용
                  const rows = containerDiv.querySelectorAll('tr')
                  rows.forEach((row: Element) => {
                    const cells = row.querySelectorAll('td')
                    if (cells.length === 0) return
                    
                    // 첫 번째 셀(구분 컬럼)의 텍스트 확인
                    const firstCellText = cells[0]?.textContent?.trim() || ''
                    
                    // 십성, 지장간, 십이운성, 십이신살 행은 일반 폰트 (오행 색상 적용 안 함)
                    const isNormalFontRow = normalFontRows.some(keyword => firstCellText.includes(keyword))
                    const isTwoLineRow = twoLineRows.some(keyword => firstCellText.includes(keyword))
                    
                    cells.forEach((cell: Element, cellIndex: number) => {
                      const text = cell.textContent?.trim() || ''
                      if (!text) return
                      
                      // 첫 번째 컬럼(구분 컬럼)은 스타일 변경 안 함
                      if (cellIndex === 0) return
                      
                      // 일반 폰트 행은 오행/크기 스타일 적용 안 함
                      if (isNormalFontRow) {
                        // ✅ 십성/지장간/십이신살은 2줄 표시로 가독성 개선
                        if (isTwoLineRow) {
                          const idx = text.indexOf('(')
                          if (idx > 0 && text.endsWith(')')) {
                            const kor = text.slice(0, idx).trim()
                            const hanja = text.slice(idx).trim()
                            cell.innerHTML = `<span class="manse-two-line"><span class="manse-two-line-kor">${kor}</span><span class="manse-two-line-hanja">${hanja}</span></span>`
                          } else {
                            cell.textContent = text
                          }
                        }
                        return
                      }
                      
                      // 셀 전체 내용에 오행 색상 적용 (셀 전체를 하나의 span으로 감싸기)
                      // 주요 오행 찾기 (첫 번째로 발견된 오행 사용)
                      let mainElement: string | null = null
                      let hasGanzi = false
                      
                      for (const char of text) {
                        const element = getElement(char)
                        const isGanzi = cheonganJiji.includes(char)
                        
                        if (element && !mainElement) {
                          mainElement = element
                        }
                        if (isGanzi) {
                          hasGanzi = true
                        }
                      }
                      
                      // 오행이 있으면 셀 전체를 하나의 span으로 감싸기
                      if (mainElement || hasGanzi) {
                        const elementClass = mainElement ? `manse-element-${mainElement}` : ''
                        const ganziClass = hasGanzi ? 'manse-ganzi-char' : ''
                        cell.innerHTML = `<span class="${elementClass} ${ganziClass}">${text}</span>`
                      }
                    })
                  })
                  
                  // 대메뉴 썸네일 다음에 삽입 (없으면 대메뉴 제목 다음에)
                  const menuThumbnail = section.querySelector('.menu-thumbnail-container')
                  if (menuThumbnail) {
                    menuThumbnail.insertAdjacentElement('afterend', manseDiv)
                  } else {
                    menuTitle.insertAdjacentElement('afterend', manseDiv)
                  }
                }
              }
              
              if (menuItem?.subtitles) {
                const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'))
                subtitleSections.forEach((subSection, subIndex) => {
                  const subtitle = menuItem.subtitles[subIndex]
                  
                  // subtitle-section에 id 추가 (목차에서 스크롤하기 위해)
                  ;(subSection as HTMLElement).id = `subtitle-${menuIndex}-${subIndex}`
                  
                  const thumbnailImageUrl = subtitle?.thumbnail_image_url || subtitle?.thumbnail || ''
                  const thumbnailVideoUrl = subtitle?.thumbnail_video_url || ''
                  if (thumbnailImageUrl || thumbnailVideoUrl) {
                    const titleDiv = subSection.querySelector('.subtitle-title')
                    if (titleDiv) {
                      const thumbnailImg = doc.createElement('div')
                      thumbnailImg.className = 'subtitle-thumbnail-container'
                      thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;'
                      if (thumbnailVideoUrl && thumbnailImageUrl) {
                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                        const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                        const containerDiv = doc.createElement('div')
                        containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                        
                        const imgEl = doc.createElement('img')
                        imgEl.src = thumbnailImageUrl
                        imgEl.alt = '' // alt 텍스트 제거 (이미지 로드 전 텍스트 표시 방지)
                        imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0;'
                        imgEl.id = `subtitle-thumbnail-img-result-${menuIndex}-${subIndex}`
                        // 이미지 로드 완료 시 opacity 복원
                        imgEl.onload = function() {
                          imgEl.style.opacity = '1'
                        }
                        
                        const videoEl = doc.createElement('video')
                        videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none;'
                        videoEl.id = `subtitle-thumbnail-video-result-${menuIndex}-${subIndex}`
                        videoEl.poster = thumbnailImageUrl
                        videoEl.setAttribute('autoPlay', '')
                        videoEl.setAttribute('muted', '')
                        videoEl.setAttribute('loop', '')
                        videoEl.setAttribute('playsInline', '')
                        videoEl.setAttribute('preload', 'auto')
                        
                        const sourceEl = doc.createElement('source')
                        sourceEl.src = `${bucketUrl}/${thumbnailVideoUrl}.webm`
                        sourceEl.type = 'video/webm'
                        videoEl.appendChild(sourceEl)
                        
                        containerDiv.appendChild(imgEl)
                        containerDiv.appendChild(videoEl)
                        thumbnailImg.appendChild(containerDiv)
                        
                        // 동영상 로드 및 재생 설정
                        videoEl.addEventListener('loadeddata', function() {
                          if (imgEl) imgEl.style.display = 'none'
                          if (videoEl) {
                            videoEl.style.display = 'block'
                            videoEl.play().catch(() => {
                              // 자동 재생 실패 시 무시 (브라우저 정책)
                            })
                          }
                        })
                        videoEl.addEventListener('canplaythrough', function() {
                          if (imgEl && imgEl.style.display !== 'none') imgEl.style.display = 'none'
                          if (videoEl && videoEl.style.display !== 'block') {
                            videoEl.style.display = 'block'
                            videoEl.play().catch(() => {
                              // 자동 재생 실패 시 무시 (브라우저 정책)
                            })
                          }
                        })
                        // 즉시 로드 시작
                        videoEl.load()
                        // 약간의 지연 후 재생 시도 (브라우저가 준비될 때까지)
                        setTimeout(() => {
                          if (videoEl.readyState >= 2) { // HAVE_CURRENT_DATA 이상
                            if (imgEl) imgEl.style.display = 'none'
                            videoEl.style.display = 'block'
                            videoEl.play().catch(() => {
                              // 자동 재생 실패 시 무시 (브라우저 정책)
                            })
                          }
                        }, 100)
                      } else if (thumbnailImageUrl) {
                        const imgEl = doc.createElement('img')
                        imgEl.src = thumbnailImageUrl
                        imgEl.alt = '' // alt 텍스트 제거 (이미지 로드 전 텍스트 표시 방지)
                        imgEl.style.cssText = 'width: 100%; height: 100%; display: block; object-fit: contain; opacity: 0;'
                        // 이미지 로드 완료 시 opacity 복원
                        imgEl.onload = function() {
                          imgEl.style.opacity = '1'
                        }
                        thumbnailImg.appendChild(imgEl)
                      }
                      titleDiv.parentNode?.insertBefore(thumbnailImg, titleDiv.nextSibling)
                    }
                  }
                  
                  // 상세메뉴 썸네일 추가
                  if (subtitle?.detailMenus && Array.isArray(subtitle.detailMenus)) {
                    const detailMenuSections = Array.from(subSection.querySelectorAll('.detail-menu-section'))
                    detailMenuSections.forEach((detailMenuSection, dmIndex) => {
                      const detailMenu = subtitle.detailMenus[dmIndex]
                      if (detailMenu) {
                        const detailMenuThumbnailImageUrl = detailMenu?.thumbnail_image_url || detailMenu?.thumbnail || ''
                        const detailMenuThumbnailVideoUrl = detailMenu?.thumbnail_video_url || ''
                        if (detailMenuThumbnailImageUrl || detailMenuThumbnailVideoUrl) {
                          const detailMenuTitle = detailMenuSection.querySelector('.detail-menu-title')
                          if (detailMenuTitle) {
                            const thumbnailImg = doc.createElement('div')
                            thumbnailImg.className = 'subtitle-thumbnail-container'
                            thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;'
                            if (detailMenuThumbnailVideoUrl && detailMenuThumbnailImageUrl) {
                              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                              const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                              const containerDiv = doc.createElement('div')
                              containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                              
                              const imgEl = doc.createElement('img')
                              imgEl.src = detailMenuThumbnailImageUrl
                              imgEl.alt = '' // alt 텍스트 제거 (이미지 로드 전 텍스트 표시 방지)
                              imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; opacity: 0;'
                              imgEl.id = `detail-menu-thumbnail-img-result-${menuIndex}-${subIndex}-${dmIndex}`
                              // 이미지 로드 완료 시 opacity 복원
                              imgEl.onload = function() {
                                imgEl.style.opacity = '1'
                              }
                              
                              const videoEl = doc.createElement('video')
                              videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none;'
                              videoEl.id = `detail-menu-thumbnail-video-result-${menuIndex}-${subIndex}-${dmIndex}`
                              videoEl.poster = detailMenuThumbnailImageUrl
                              videoEl.setAttribute('autoPlay', '')
                              videoEl.setAttribute('muted', '')
                              videoEl.setAttribute('loop', '')
                              videoEl.setAttribute('playsInline', '')
                              videoEl.setAttribute('preload', 'auto')
                              
                              const sourceEl = doc.createElement('source')
                              sourceEl.src = `${bucketUrl}/${detailMenuThumbnailVideoUrl}.webm`
                              sourceEl.type = 'video/webm'
                              videoEl.appendChild(sourceEl)
                              
                              containerDiv.appendChild(imgEl)
                              containerDiv.appendChild(videoEl)
                              thumbnailImg.appendChild(containerDiv)
                              
                              // 동영상 로드 및 재생 설정
                              videoEl.addEventListener('loadeddata', function() {
                                if (imgEl) imgEl.style.display = 'none'
                                if (videoEl) {
                                  videoEl.style.display = 'block'
                                  videoEl.play().catch(() => {
                                    // 자동 재생 실패 시 무시 (브라우저 정책)
                                  })
                                }
                              })
                              videoEl.addEventListener('canplaythrough', function() {
                                if (imgEl && imgEl.style.display !== 'none') imgEl.style.display = 'none'
                                if (videoEl && videoEl.style.display !== 'block') {
                                  videoEl.style.display = 'block'
                                  videoEl.play().catch(() => {
                                    // 자동 재생 실패 시 무시 (브라우저 정책)
                                  })
                                }
                              })
                              // 즉시 로드 시작
                              videoEl.load()
                              // 약간의 지연 후 재생 시도 (브라우저가 준비될 때까지)
                              setTimeout(() => {
                                if (videoEl.readyState >= 2) { // HAVE_CURRENT_DATA 이상
                                  if (imgEl) imgEl.style.display = 'none'
                                  videoEl.style.display = 'block'
                                  videoEl.play().catch(() => {
                                    // 자동 재생 실패 시 무시 (브라우저 정책)
                                  })
                                }
                              }, 100)
                            } else if (detailMenuThumbnailImageUrl) {
                              const imgEl = doc.createElement('img')
                              imgEl.src = detailMenuThumbnailImageUrl
                              imgEl.alt = '' // alt 텍스트 제거 (이미지 로드 전 텍스트 표시 방지)
                              imgEl.style.cssText = 'width: 100%; height: 100%; display: block; object-fit: contain; opacity: 0;'
                              // 이미지 로드 완료 시 opacity 복원
                              imgEl.onload = function() {
                                imgEl.style.opacity = '1'
                              }
                              thumbnailImg.appendChild(imgEl)
                            }
                            detailMenuTitle.parentNode?.insertBefore(thumbnailImg, detailMenuTitle.nextSibling)
                          }
                        }
                      }
                    })
                  }
                })
              } else {
              }
            })
            
            processedHtml = doc.documentElement.outerHTML
            // DOMParser가 추가한 html, body 태그 제거
            const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
            if (bodyMatch) {
              processedHtml = bodyMatch[1]
            }
            
            htmlContent = processedHtml
            // 썸네일이 실제로 추가되었는지 확인
            const thumbnailCount = (htmlContent.match(/subtitle-thumbnail-container/g) || []).length
          } catch (e) {
          }
        } else {
          // ** 제거는 여기서도 처리
          if (htmlContent) {
            htmlContent = htmlContent.replace(/\*\*/g, '')
          }
        }
        
        // 목차 HTML 생성
        let tocHtml = ''
        try {
          if (menuItems.length > 0) {
            tocHtml = '<div id="table-of-contents" style="margin-bottom: 24px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding-top: 24px; padding-bottom: 24px;">'
            tocHtml += '<h3 style="font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 16px;">목차</h3>'
            tocHtml += '<div style="display: flex; flex-direction: column; gap: 8px;">'
            
            menuItems.forEach((menuItem: any, mIndex: number) => {
              const menuTitle = (menuItem?.title || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;').replace(/\$/g, '&#36;')
              if (!menuTitle) {
                return
              }
              
              tocHtml += '<div style="display: flex; flex-direction: column; gap: 4px;">'
              const menuId = 'menu-' + mIndex
              const buttonHtml = '<button onclick="document.getElementById(\'' + menuId + '\').scrollIntoView({ behavior: \'smooth\', block: \'start\' })" style="text-align: left; font-size: 16px; font-weight: 600; color: #1f2937; background: none; border: none; cursor: pointer; padding: 4px 0; transition: color 0.2s;" onmouseover="this.style.color=\'#ec4899\'" onmouseout="this.style.color=\'#1f2937\'">' + menuTitle + '</button>'
              tocHtml += buttonHtml
              
              if (menuItem?.subtitles && menuItem.subtitles.length > 0) {
                tocHtml += '<div style="margin-left: 16px; display: flex; flex-direction: column; gap: 2px;">'
                menuItem.subtitles.forEach((subtitle: any, sIndex: number) => {
                  const subTitle = ((subtitle?.title || '').trim()).replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;').replace(/\$/g, '&#36;')
                  if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) return
                  
                  const subtitleId = 'subtitle-' + mIndex + '-' + sIndex
                  tocHtml += '<button onclick="document.getElementById(\'' + subtitleId + '\').scrollIntoView({ behavior: \'smooth\', block: \'start\' })" style="text-align: left; font-size: 14px; color: #4b5563; background: none; border: none; cursor: pointer; padding: 2px 0; transition: color 0.2s;" onmouseover="this.style.color=\'#ec4899\'" onmouseout="this.style.color=\'#4b5563\'">' + subTitle + '</button>'
                })
                tocHtml += '</div>'
              }
              
              tocHtml += '</div>'
            })
            
            tocHtml += '</div>'
            tocHtml += '</div>'
          }
        } catch (e) {
        }
        
        // 플로팅 배너 HTML 생성 (나의 사주명식 보기 + 목차로 이동)
        let bannerHtml = ''
        try {
          if (menuItems.length > 0) {
            bannerHtml = '<div style="position: fixed; bottom: 24px; right: 24px; z-index: 40; display: flex; flex-direction: column; gap: 8px; align-items: flex-end;">'
            
            // 나의 사주명식 보기 버튼 (만세력이 있을 때만 표시)
            if (manseRyeokTable) {
              const mansePopupId = 'manse-popup-' + Date.now()
              const manseButtonHtml = '<button onclick="document.getElementById(\'' + mansePopupId + '\').style.display=\'flex\';" style="background: rgba(236, 72, 153, 0.8); color: white; font-weight: 600; padding: 10px 20px; border-radius: 9999px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); transition: all 0.3s; border: none; cursor: pointer; opacity: 0.8; font-size: 14px;" onmouseover="this.style.opacity=\'1\'; this.style.boxShadow=\'0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)\';" onmouseout="this.style.opacity=\'0.8\'; this.style.boxShadow=\'0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)\';">나의 사주명식 보기</button>'
              bannerHtml += manseButtonHtml
              
              // 만세력 팝업 HTML 추가
              const mansePopupHtml = '<div id="' + mansePopupId + '" style="display: none; position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); align-items: center; justify-content: center; z-index: 100; padding: 16px;">' +
                '<div style="background: white; border-radius: 16px; max-width: 896px; width: 100%; max-height: 90vh; overflow: auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); position: relative; display: flex; flex-direction: column;">' +
                '<button onclick="document.getElementById(\'' + mansePopupId + '\').style.display=\'none\';" style="position: absolute; top: 16px; right: 16px; color: #ec4899; background: none; border: none; cursor: pointer; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: background 0.2s; z-index: 10;" onmouseover="this.style.background=\'rgba(236, 72, 153, 0.1)\';" onmouseout="this.style.background=\'transparent\';">' +
                '<svg style="width: 24px; height: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>' +
                '</button>' +
                '<div style="padding: 24px; padding-top: 64px;">' +
                '<h2 style="font-size: 24px; font-weight: 700; color: #111827; margin-bottom: 24px; text-align: center; background: linear-gradient(to right, #ec4899, #db2777); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;">나의 사주명식 (만세력)</h2>' +
                '<div class="manse-ryeok-popup-container">' + manseRyeokTable.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${') + '</div>' +
                '</div>' +
                '<div style="padding: 16px; border-top: 1px solid #e5e7eb; display: flex; justify-content: center;">' +
                '<button onclick="document.getElementById(\'' + mansePopupId + '\').style.display=\'none\';" style="background: linear-gradient(to right, #ec4899, #db2777); color: white; font-weight: 600; padding: 12px 32px; border-radius: 9999px; border: none; cursor: pointer; transition: all 0.3s;" onmouseover="this.style.transform=\'scale(1.05)\';" onmouseout="this.style.transform=\'scale(1)\';">닫기</button>' +
                '</div>' +
                '</div>' +
                '</div>'
              bannerHtml += mansePopupHtml
            }
            
            // 목차로 이동 버튼
            const tocButtonHtml = '<button onclick="document.getElementById(\'table-of-contents\').scrollIntoView({ behavior: \'smooth\', block: \'start\' })" style="background: linear-gradient(to right, #ec4899, #db2777); color: white; font-weight: 600; padding: 12px 24px; border-radius: 9999px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); transition: all 0.3s; display: flex; align-items: center; gap: 8px; border: none; cursor: pointer; opacity: 0.8;" onmouseover="this.style.opacity=\'1\'; this.style.boxShadow=\'0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)\';" onmouseout="this.style.opacity=\'0.8\'; this.style.boxShadow=\'0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)\';">'
            bannerHtml += tocButtonHtml
            bannerHtml += '<svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">'
            bannerHtml += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />'
            bannerHtml += '</svg>'
            bannerHtml += '<span>목차로 이동</span>'
            bannerHtml += '</button>'
            bannerHtml += '</div>'
          }
        } catch (e) {
        }
        
        // 대메뉴 썸네일 추가 (새 창에서도 다시보기와 동일하게 표시)
          try {
          if (menuItems.length > 0) {
            const parser = new DOMParser()
            const doc = parser.parseFromString(htmlContent, 'text/html')
            const menuSections = Array.from(doc.querySelectorAll('.menu-section'))
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
            const bucketUrl = supabaseUrl ? supabaseUrl + '/storage/v1/object/public/thumbnails' : ''
            
            menuSections.forEach((section, menuIndex) => {
              const menuItem = menuItems[menuIndex]
              if (!menuItem) return
              
              const thumbnailImageUrl = menuItem?.thumbnail_image_url || menuItem?.thumbnail || ''
              const thumbnailVideoUrl = menuItem?.thumbnail_video_url || ''
              
              if (thumbnailImageUrl || thumbnailVideoUrl) {
                const menuTitle = section.querySelector('.menu-title')
                if (menuTitle) {
                  const thumbnailDiv = doc.createElement('div')
                  thumbnailDiv.className = 'menu-thumbnail-container'
                  
                  if (thumbnailVideoUrl && thumbnailImageUrl) {
                    const containerDiv = doc.createElement('div')
                    containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                    
                    const imgEl = doc.createElement('img')
                    imgEl.src = thumbnailImageUrl
                    imgEl.alt = ''
                    imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px;'
                    containerDiv.appendChild(imgEl)
                    
                    const videoEl = doc.createElement('video')
                    videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none; border-radius: 8px;'
                    videoEl.setAttribute('autoplay', '')
                    videoEl.setAttribute('muted', '')
                    videoEl.setAttribute('loop', '')
                    videoEl.setAttribute('playsinline', '')
                    videoEl.poster = thumbnailImageUrl
                    
                    const sourceWebm = doc.createElement('source')
                    sourceWebm.src = bucketUrl + '/' + thumbnailVideoUrl + '.webm'
                    sourceWebm.type = 'video/webm'
                    videoEl.appendChild(sourceWebm)
                    
                    const sourceMp4 = doc.createElement('source')
                    sourceMp4.src = bucketUrl + '/' + thumbnailVideoUrl + '.mp4'
                    sourceMp4.type = 'video/mp4'
                    videoEl.appendChild(sourceMp4)
                    
                    containerDiv.appendChild(videoEl)
                    thumbnailDiv.appendChild(containerDiv)
                  } else if (thumbnailImageUrl) {
                    const imgEl = doc.createElement('img')
                    imgEl.src = thumbnailImageUrl
                    imgEl.alt = ''
                    imgEl.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 8px;'
                    thumbnailDiv.appendChild(imgEl)
                  }
                  
                  menuTitle.insertAdjacentElement('afterend', thumbnailDiv)
                }
              }
            })
            
            // 엔딩북커버 추가 (마지막 menu-section에)
            const endingBookCoverThumbnail = contentObj?.ending_book_cover_thumbnail || ''
            const endingBookCoverThumbnailVideo = contentObj?.ending_book_cover_thumbnail_video || ''
            if (endingBookCoverThumbnail || endingBookCoverThumbnailVideo) {
              const lastSection = menuSections[menuSections.length - 1]
              if (lastSection) {
                const endingBookCoverDiv = doc.createElement('div')
                endingBookCoverDiv.className = 'ending-book-cover-thumbnail-container'
                
                if (endingBookCoverThumbnailVideo && endingBookCoverThumbnail) {
                  const containerDiv = doc.createElement('div')
                  containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                  
                  const imgEl = doc.createElement('img')
                  imgEl.src = endingBookCoverThumbnail
                  imgEl.alt = ''
                  imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px;'
                  containerDiv.appendChild(imgEl)
                  
                  const videoEl = doc.createElement('video')
                  videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none; border-radius: 8px;'
                  videoEl.setAttribute('autoplay', '')
                  videoEl.setAttribute('muted', '')
                  videoEl.setAttribute('loop', '')
                  videoEl.setAttribute('playsinline', '')
                  videoEl.poster = endingBookCoverThumbnail
                  
                  const sourceWebm = doc.createElement('source')
                  sourceWebm.src = bucketUrl + '/' + endingBookCoverThumbnailVideo + '.webm'
                  sourceWebm.type = 'video/webm'
                  videoEl.appendChild(sourceWebm)
                  
                  const sourceMp4 = doc.createElement('source')
                  sourceMp4.src = bucketUrl + '/' + endingBookCoverThumbnailVideo + '.mp4'
                  sourceMp4.type = 'video/mp4'
                  videoEl.appendChild(sourceMp4)
                  
                  containerDiv.appendChild(videoEl)
                  endingBookCoverDiv.appendChild(containerDiv)
                } else if (endingBookCoverThumbnail) {
                  const imgEl = doc.createElement('img')
                  imgEl.src = endingBookCoverThumbnail
                  imgEl.alt = ''
                  imgEl.style.cssText = 'width: 100%; height: 100%; object-fit: contain; border-radius: 8px;'
                  endingBookCoverDiv.appendChild(imgEl)
                }
                
                lastSection.appendChild(endingBookCoverDiv)
              }
            }
            
            const bodyMatch = doc.documentElement.outerHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)
            if (bodyMatch) {
              htmlContent = bodyMatch[1]
            } else {
              htmlContent = doc.body.innerHTML
            }
          }
        } catch (e) {
        }
        
        // 북커버 HTML 생성 (2/3 비율로)
        let bookCoverHtml = ''
        const bookCoverThumbnail = contentObj?.book_cover_thumbnail || ''
        const bookCoverThumbnailVideo = contentObj?.book_cover_thumbnail_video || ''
        if (bookCoverThumbnail || bookCoverThumbnailVideo) {
          try {
            const supabaseUrlForCover = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
            const bucketUrlForCover = supabaseUrlForCover ? supabaseUrlForCover + '/storage/v1/object/public/thumbnails' : ''
            
            if (bookCoverThumbnailVideo && bookCoverThumbnail) {
              bookCoverHtml = '<div class="book-cover-thumbnail-container">' +
                '<div style="position: relative; width: 100%; height: 100%;">' +
                '<img src="' + bookCoverThumbnail + '" alt="" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />' +
                '<video style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none; border-radius: 8px;" autoplay muted loop playsinline poster="' + bookCoverThumbnail + '">' +
                '<source src="' + bucketUrlForCover + '/' + bookCoverThumbnailVideo + '.webm" type="video/webm" />' +
                '<source src="' + bucketUrlForCover + '/' + bookCoverThumbnailVideo + '.mp4" type="video/mp4" />' +
                '</video>' +
                '</div>' +
                '</div>'
            } else if (bookCoverThumbnail) {
              bookCoverHtml = '<div class="book-cover-thumbnail-container">' +
                '<img src="' + bookCoverThumbnail + '" alt="" style="width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" />' +
                '</div>'
            }
            
            // HTML에서 기존 북커버 제거 (중복 방지)
            const parser = new DOMParser()
            const doc = parser.parseFromString(htmlContent, 'text/html')
            const existingBookCover = doc.querySelector('.book-cover-thumbnail-container')
            if (existingBookCover) {
              existingBookCover.remove()
              const bodyMatch = doc.documentElement.outerHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)
              if (bodyMatch) {
                htmlContent = bodyMatch[1]
              } else {
                htmlContent = doc.body.innerHTML
              }
            }
          } catch (e) {
          }
        }
        
        // 템플릿 리터럴 특수 문자 이스케이프
        const safeHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
        const safeTocHtml = tocHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
        const safeBannerHtml = bannerHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
        const safeBookCoverHtml = bookCoverHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${')
        
        // 새 창으로 결과 표시
        // HTML에 이미 웹폰트 스타일이 포함되어 있으므로 그대로 표시
        const newWindow = window.open('', '_blank')
        if (newWindow) {
          newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>${saved.title}</title>
              ${styleContent ? `<style>${styleContent}</style>` : ''}
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                  max-width: 896px;
                  margin: 0 auto;
                  padding: 32px 16px;
                  background: #f9fafb;
                }
                .container {
                  background: transparent;
                  padding: 0;
                }
                .title-container {
                  text-align: center;
                  margin-bottom: 16px;
                }
                h1 {
                  font-size: 30px;
                  font-weight: bold;
                  margin: 0 0 16px 0;
                  color: #111;
                }
                .tts-button-container {
                  text-align: center;
                  margin-bottom: 16px;
                }
                .tts-button {
                  background: linear-gradient(to right, #f9fafb, #f3f4f6);
                  color: #1f2937;
                  border: 1px solid #d1d5db;
                  padding: 6px 12px;
                  border-radius: 8px;
                  font-size: 14px;
                  font-weight: 600;
                  cursor: pointer;
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  gap: 8px;
                  transition: all 0.3s ease;
                  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                  min-width: 140px;
                }
                .tts-button:hover:not(:disabled) {
                  background: linear-gradient(to right, #f3f4f6, #e5e7eb);
                  border-color: #60a5fa;
                  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                  transform: translateY(-1px);
                }
                .tts-button:active:not(:disabled) {
                  transform: translateY(0);
                  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
                }
                .tts-button:disabled {
                  background: linear-gradient(to right, #e5e7eb, #d1d5db);
                  border-color: #d1d5db;
                  cursor: not-allowed;
                  opacity: 0.6;
                }
                .tts-button span:first-child {
                  font-size: 18px;
                  transition: transform 0.2s ease;
                }
                .tts-button:hover:not(:disabled) span:first-child {
                  transform: scale(1.1);
                }
                .spinner {
                  width: 20px;
                  height: 20px;
                  border: 2px solid #3b82f6;
                  border-top-color: transparent;
                  border-radius: 50%;
                  animation: spin 0.8s linear infinite;
                }
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
                .saved-at {
                  color: #6b7280;
                  font-size: 14px;
                  margin-bottom: 32px;
                  text-align: center;
                }
                .menu-section {
                  background: white;
                  border-radius: 12px;
                  padding: 24px;
                  margin-bottom: 24px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .menu-title {
                  font-size: 20px;
                  font-weight: bold;
                  margin-bottom: 16px;
                  color: #111;
                }
                .menu-thumbnail {
                  width: 100%;
                  height: auto;
                  object-fit: contain;
                  border-radius: 8px;
                  margin-bottom: 24px;
                  display: block;
                }
                /* 액박 이미지 숨기기 (이미지 로드 실패 시 표시되는 깨진 이미지 아이콘) */
                img[src=""], img:not([src]), img[alt=""]::before {
                  display: none !important;
                }
                img::before {
                  content: none !important;
                }
                .subtitle-section:not(:last-child) {
                  padding-top: 24px;
                  padding-bottom: 24px;
                  margin-bottom: 24px;
                  position: relative;
                }
                .subtitle-section:not(:last-child)::after {
                  content: '';
                  display: block;
                  width: 300px;
                  height: 2px;
                  background: linear-gradient(to right, transparent, #e5e7eb, transparent);
                  margin: 24px auto 0;
                }
                .subtitle-section:last-child {
                  padding-top: 24px;
                  padding-bottom: 24px;
                }
                .subtitle-title {
                  font-size: 18px;
                  font-weight: 600;
                  margin-bottom: 12px;
                  color: #333;
                }
                .subtitle-content {
                  color: #555;
                  line-height: 1.8;
                  white-space: pre-line;
                }
                .book-cover-thumbnail-container {
                  width: 100%;
                  aspect-ratio: 2/3;
                  margin-bottom: 2.5rem;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                }
                .book-cover-thumbnail-container img,
                .book-cover-thumbnail-container video {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  border-radius: 8px;
                }
                .ending-book-cover-thumbnail-container {
                  width: 100%;
                  aspect-ratio: 2/3;
                  margin-top: 1rem;
                }
                .ending-book-cover-thumbnail-container img,
                .ending-book-cover-thumbnail-container video {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  border-radius: 8px;
                }
                .menu-thumbnail-container {
                  width: 100%;
                  aspect-ratio: 1/1;
                  margin-top: 8px;
                  margin-bottom: 32px;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                }
                .menu-thumbnail-container img,
                .menu-thumbnail-container video {
                  width: 100%;
                  height: 100%;
                  object-fit: contain;
                  border-radius: 8px;
                }
                .subtitle-thumbnail-container {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  width: 300px;
                  height: 300px;
                  margin-left: auto;
                  margin-right: auto;
                  margin-top: 8px;
                  margin-bottom: 8px;
                  background: #f3f4f6;
                  border-radius: 8px;
                  overflow: hidden;
                }
                .subtitle-thumbnail-container img,
                .subtitle-thumbnail-container video {
                  width: 100%;
                  height: 100%;
                  display: block;
                  object-fit: contain;
                }
                
                /* 만세력 테이블 스타일 */
                .manse-ryeok-wrapper {
                  margin: 1.5rem 0 2rem 0;
                }
                .manse-ryeok-container {
                  position: relative;
                  padding: 2px;
                  border-radius: 18px;
                  background: linear-gradient(135deg, #d4a853 0%, #c9956c 25%, #8b5a2b 50%, #c9956c 75%, #d4a853 100%);
                  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(212, 168, 83, 0.5);
                  margin-bottom: 2.5rem;
                  width: 100%;
                  max-width: 100%;
                  overflow-x: auto;
                  overflow-y: visible;
                  -webkit-overflow-scrolling: touch;
                  box-sizing: border-box;
                  display: block;
                }
                .manse-ryeok-container table,
                .manse-ryeok-table {
                  width: 100%;
                  max-width: 100%;
                  border-collapse: separate;
                  border-spacing: 0;
                  background: linear-gradient(180deg, #fefbf3 0%, #f5efe0 100%);
                  border-radius: 16px;
                  overflow: hidden;
                  position: relative;
                  z-index: 1;
                  box-sizing: border-box;
                }
                .manse-ryeok-container th,
                .manse-ryeok-table th {
                  background: linear-gradient(180deg, #8b5a2b 0%, #6d4422 100%);
                  color: #fef8e8;
                  font-weight: 700;
                  padding: 6px 4px;
                  text-align: center;
                  font-size: 0.8rem;
                  letter-spacing: 0.05em;
                  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                  border-bottom: 2px solid #d4a853;
                  white-space: nowrap;
                  vertical-align: middle;
                }
                .manse-ryeok-container td,
                .manse-ryeok-table td {
                  background: transparent;
                  padding: 12px 8px;
                  text-align: center;
                  border-bottom: 1px solid rgba(212, 196, 168, 0.3);
                  white-space: nowrap;
                  vertical-align: middle;
                }
                .manse-ryeok-container tr:last-child td,
                .manse-ryeok-table tr:last-child td {
                  border-bottom: none;
                }
                
                /* 오행별 색상 (천간/지지) */
                /* 목(木): 갑, 을, 인, 묘 - 고급 청색 */
                .manse-element-wood {
                  color: #1e40af;
                  text-shadow: 0 1px 2px rgba(30, 64, 175, 0.2);
                }
                /* 화(火): 병, 정, 사, 오 - 고급 적색 (더 진하게) */
                .manse-element-fire {
                  color: #991b1b;
                  text-shadow: 0 1px 2px rgba(153, 27, 27, 0.2);
                }
                /* 토(土): 무, 기, 진, 술, 축, 미 - 약간 짙은 고급 노란색 */
                .manse-element-earth {
                  color: #d97706;
                  text-shadow: 0 1px 2px rgba(217, 119, 6, 0.2);
                }
                /* 금(金): 경, 신, 신, 유 - 고급 회색 */
                .manse-element-metal {
                  color: #6b7280;
                  text-shadow: 0 1px 2px rgba(107, 114, 128, 0.2);
                }
                /* 수(水): 임, 계, 자, 해 - 고급 검정색 */
                .manse-element-water {
                  color: #1f2937;
                  text-shadow: 0 1px 2px rgba(31, 41, 55, 0.2);
                }
                
                /* 천간/지지 폰트 크기 */
                .manse-ganzi-char {
                  font-size: 1.2em;
                  font-weight: 700;
                }
                
                /* 만세력 테이블 기본 스타일 - 패딩 최소화, 가운데 정렬, 줄바꿈 방지 */
                .manse-ryeok-container td,
                .manse-ryeok-table td {
                  padding: 4px 2px;
                  font-size: 0.85rem;
                  text-align: center;
                  vertical-align: middle;
                  white-space: nowrap;
                }
                .manse-ryeok-container th,
                .manse-ryeok-table th {
                  padding: 12px 8px;
                  font-size: 0.8rem;
                  text-align: center;
                  vertical-align: middle;
                  white-space: nowrap;
                }
                
                /* 만세력 테이블 너비 자동 조절 (화면폭 내) */
                .manse-ryeok-container table,
                .manse-ryeok-container .manse-ryeok-table,
                .manse-ryeok-container table {
                  table-layout: fixed;
                  width: 100%;
                  max-width: 100%;
                  box-sizing: border-box;
                }
                
                /* 첫 번째 컬럼(범례) 스타일 - 조금 짙은 단색 배경 */
                .manse-ryeok-container td:first-child,
                .manse-ryeok-table td:first-child {
                  font-weight: 700;
                  color: #5a4a32;
                  background: #d4c4a8;
                }
                
                /* 헤더 행의 "구분" 셀만 시주/일주와 동일한 그라데이션 (더 구체적인 선택자) */
                .manse-ryeok-table thead th:first-child,
                .manse-ryeok-container .manse-ryeok-table thead th:first-child,
                .manse-ryeok-container table thead th:first-child,
                .manse-ryeok-table tr:first-child th:first-child,
                .manse-ryeok-container .manse-ryeok-table tr:first-child th:first-child,
                .manse-ryeok-container table tr:first-child th:first-child {
                  background: linear-gradient(180deg, #8b5a2b 0%, #6d4422 100%);
                  color: #fef8e8;
                  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
                }
                
                /* 만세력 팝업 컨테이너 */
                .manse-ryeok-popup-container .manse-ryeok-container {
                  width: 100%;
                  max-width: 100%;
                  overflow-x: auto;
                  overflow-y: visible;
                  -webkit-overflow-scrolling: touch;
                  box-sizing: border-box;
                  display: block;
                }
                
                .manse-ryeok-popup-container .manse-ryeok-container table,
                .manse-ryeok-popup-container .manse-ryeok-table {
                  width: auto;
                  min-width: 600px;
                  max-width: none;
                  box-sizing: border-box;
                  display: table;
                }
                
                @media (max-width: 768px) {
                  .manse-ryeok-popup-container .manse-ryeok-container table,
                  .manse-ryeok-popup-container .manse-ryeok-table {
                    min-width: 500px;
                  }
                }
                
                @media (max-width: 480px) {
                  .manse-ryeok-popup-container .manse-ryeok-container table,
                  .manse-ryeok-popup-container .manse-ryeok-table {
                    min-width: 400px;
                  }
                }
                
                /* 모바일에서 만세력 테이블 폰트/패딩 조절 (폭 안에 들어오게) */
                @media (max-width: 480px) {
                  .manse-ryeok-container {
                    padding: 4px;
                  }
                  .manse-ryeok-container td,
                  .manse-ryeok-table td {
                    padding: 6px 2px;
                    font-size: 0.72rem;
                  }
                  .manse-ryeok-container th,
                  .manse-ryeok-table th {
                    padding: 6px 2px;
                    font-size: 0.62rem;
                  }
                  .manse-ganzi-char {
                    font-size: 1.05em;
                  }
                }
                
                @media (max-width: 360px) {
                  .manse-ryeok-container td,
                  .manse-ryeok-table td {
                    padding: 4px 1px;
                    font-size: 0.68rem;
                  }
                  .manse-ryeok-container th,
                  .manse-ryeok-table th {
                    padding: 4px 1px;
                    font-size: 0.58rem;
                  }
                  .manse-ganzi-char {
                    font-size: 1em;
                  }
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="title-container">
                  <h1>${saved.title}</h1>
                </div>
                ${safeBookCoverHtml}
                <div class="tts-button-container">
                  <button id="ttsButton" class="tts-button">
                    <span id="ttsIcon">🔊</span>
                    <span id="ttsText">점사 듣기</span>
                  </button>
                </div>
                ${safeTocHtml}
                <div id="contentHtml">${safeHtml}</div>
              </div>
              ${safeBannerHtml}
              
              <script>
                // 저장된 컨텐츠의 화자 정보를 전역 변수로 설정 (초기값)
                let contentObj;
                try {
                  contentObj = ${contentObjJson};
                } catch (e) {
                  contentObj = {};
                }
                
                window.savedContentSpeaker = ${contentObj?.tts_speaker ? `'${contentObj.tts_speaker.replace(/'/g, "\\'")}'` : "'nara'"};
                window.savedContentId = ${contentObj?.id ? contentObj.id : 'null'};
                // 안전한 기본값: 네이버 (전역 설정은 아래에서 /api/settings/tts로 즉시 반영)
                window.savedContentTtsProvider = ${contentObj?.tts_provider === 'typecast' ? "'typecast'" : (contentObj?.tts_provider === 'naver' ? "'naver'" : "'naver'")};
                window.savedContentTypecastVoiceId = ${contentObj?.typecast_voice_id ? `'${String(contentObj.typecast_voice_id).replace(/'/g, "\\'")}'` : "'tc_5ecbbc6099979700087711d8'"};
                
                // content.id가 있으면 Supabase에서 최신 화자 정보 조회
                if (window.savedContentId) {
                  
                  fetch('/api/content/' + window.savedContentId)
                    .then(response => {
                      return response.json();
                    })
                    .then(data => {
                      if (data.tts_speaker) {
                        window.savedContentSpeaker = data.tts_speaker;
                      } else {
                      }
                      // 컨텐츠는 타입캐스트를 "명시한 경우에만" 전역 설정을 override
                      if (data.tts_provider === 'typecast') {
                        window.savedContentTtsProvider = 'typecast';
                      }
                      if (data.typecast_voice_id) {
                        const vc = String(data.typecast_voice_id || '').trim();
                        if (vc) {
                          window.savedContentTypecastVoiceId = vc;
                        }
                      }
                    })
                    .catch(error => {
                    });
                } else {
                }
                
                let isPlaying = false;
                let currentAudio = null;
                let shouldStop = false;
                
                // 오디오 중지 함수 (여러 곳에서 재사용)
                function stopAndResetAudio() {
                  shouldStop = true;
                  if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    const url = currentAudio.src;
                    if (url && url.startsWith('blob:')) {
                      URL.revokeObjectURL(url); // URL 해제
                    }
                    currentAudio = null;
                  }
                  isPlaying = false;
                  
                  // 버튼 상태 복원
                  const button = document.getElementById('ttsButton');
                  const icon = document.getElementById('ttsIcon');
                  const text = document.getElementById('ttsText');
                  if (button && icon && text) {
                    button.disabled = false;
                    icon.textContent = '🔊';
                    text.textContent = '점사 듣기';
                  }
                }
                
                // 페이지가 비활성화되면 음성 재생 중지
                document.addEventListener('visibilitychange', function() {
                  if (document.hidden) {
                    stopAndResetAudio();
                  }
                });

                // 브라우저 뒤로 가기/앞으로 가기 시 음성 재생 중지
                window.addEventListener('popstate', function(e) {
                  stopAndResetAudio();
                }, true); // 캡처링 단계에서 처리

                // 페이지 언로드 시 음성 재생 중지
                window.addEventListener('beforeunload', function() {
                  stopAndResetAudio();
                });

                function sanitizeHumanReadableText(text) {
                  if (!text) return '';
                  return String(text)
                    .replace(/<\\s*\\/?\\s*[a-zA-Z][^>]*>/g, '')
                    // 모든 한자 제거 (밑줄 유무 관계없이)
                    .replace(/[一-龯]/g, '')
                    .replace(/\\s+/g, ' ')
                    .replace(/\\n\\s+\\n/g, '\\n\\n')
                    .trim();
                }

                // 사람이 눈으로 읽는 텍스트만 추출 (렌더된 DOM 우선)
                function extractHumanReadableText(htmlString) {
                  function pickFromContainer(container) {
                    const clone = container.cloneNode(true);
                    clone.querySelectorAll('table, .manse-ryeok-table, #table-of-contents, .toc-container, style, script, pre, code').forEach(function(el) {
                      el.remove();
                    });

                    const nodes = Array.prototype.slice.call(
                      clone.querySelectorAll('.menu-title, .subtitle-title, .detail-menu-title, .subtitle-content, .detail-menu-content')
                    );
                    if (nodes.length > 0) {
                      const lines = nodes
                        .map(function(el) {
                          const text = (el.innerText || el.textContent || '');
                          const className = String(el.className || '');
                          // 대제목(.menu-title)과 소제목(.subtitle-title, .detail-menu-title)은 한자 제거하지 않음
                          if (className.indexOf('menu-title') !== -1 || className.indexOf('subtitle-title') !== -1 || className.indexOf('detail-menu-title') !== -1) {
                            // HTML 태그만 제거하고 한자는 유지
                            return text.replace(/<\\s*\\/?\\s*[a-zA-Z][^>]*>/g, '').replace(/\\s+/g, ' ').trim();
                          }
                          // 본문 내용은 한자 제거 적용
                          return sanitizeHumanReadableText(text);
                        })
                        .filter(function(s) { return !!s; });
                      return lines.join('\\n\\n');
                    }
                    return sanitizeHumanReadableText(clone.innerText || clone.textContent || '');
                  }

                  const live = document.getElementById('contentHtml');
                  if (live) return pickFromContainer(live);

                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = htmlString || '';
                  return pickFromContainer(tempDiv);
                }

                // 텍스트를 청크로 분할하는 함수
                function splitTextIntoChunks(text, maxLength) {
                  const chunks = [];
                  let currentIndex = 0;

                  while (currentIndex < text.length) {
                    let chunk = text.substring(currentIndex, currentIndex + maxLength);
                    
                    // 마지막 청크가 아니면 문장 중간에서 잘리지 않도록 처리
                    if (currentIndex + maxLength < text.length) {
                      const lastSpace = chunk.lastIndexOf(' ');
                      const lastPeriod = chunk.lastIndexOf('.');
                      const lastComma = chunk.lastIndexOf(',');
                      const lastNewline = chunk.lastIndexOf('\n');
                      const lastQuestion = chunk.lastIndexOf('?');
                      const lastExclamation = chunk.lastIndexOf('!');
                      
                      const cutPoint = Math.max(
                        lastSpace, 
                        lastPeriod, 
                        lastComma, 
                        lastNewline,
                        lastQuestion,
                        lastExclamation,
                        Math.floor(chunk.length * 0.9) // 최소 90%는 유지
                      );
                      
                      if (cutPoint > chunk.length * 0.8) {
                        chunk = chunk.substring(0, cutPoint + 1);
                      }
                    }
                    
                    chunks.push(chunk.trim());
                    currentIndex += chunk.length;
                  }

                  return chunks.filter(chunk => chunk.length > 0);
                }

                // 음성 재생 중지 함수
                function stopTextToSpeech() {
                  stopAndResetAudio();
                }

                // 음성으로 듣기 기능 - 청크 단위로 나누어 재생
                async function handleTextToSpeech() {
                  
                  try {
                    // 재생 중이면 중지
                    if (isPlaying) {
                      stopTextToSpeech();
                      return;
                    }

                    const contentHtmlEl = document.getElementById('contentHtml');
                    if (!contentHtmlEl) {
                      alert('콘텐츠를 찾을 수 없습니다.');
                      return;
                    }
                    
                    const contentHtml = contentHtmlEl.innerHTML;
                    
                    let textContent = extractHumanReadableText(contentHtml);
                    
                    // 내담자 이름 추출 (HTML에서 찾기)
                    let userName = '';
                    try {
                      // HTML에서 이름 찾기 (예: "김철수님" 또는 "김철수" 패턴)
                      const nameMatch = contentHtml.match(/([가-힣]+)(?:님|님의)/);
                      if (nameMatch && nameMatch[1]) {
                        userName = nameMatch[1];
                      } else {
                        // 다른 패턴 시도 (예: "본인 정보" 섹션에서)
                        const nameEl = contentHtmlEl.querySelector('[data-user-name]');
                        if (nameEl) {
                          userName = nameEl.getAttribute('data-user-name') || '';
                        }
                      }
                    } catch (e) {}
                    
                    if (userName && textContent) {
                      // 이름을 맨 앞에 추가
                      textContent = userName + '님의 점사 결과입니다.\\n\\n' + textContent;
                    }
                    
                    // extractHumanReadableText에서 이미 한자 제거가 적용되었으므로 여기서는 제거하지 않음
                    // (대제목/소제목은 한자 유지, 본문만 한자 제거)

                    if (!textContent.trim()) {
                      alert('읽을 내용이 없습니다.');
                      return;
                    }

                    // 화자 정보 가져오기 (항상 Supabase에서 최신 정보 확인)
                    
                    let speaker = window.savedContentSpeaker || 'nara';
                    // undefined/null이면 네이버로 (실제 전역 설정은 /api/settings/tts로 덮어씀)
                    let ttsProvider = (window.savedContentTtsProvider === 'typecast') ? 'typecast' : 'naver';
                    let typecastVoiceId = window.savedContentTypecastVoiceId || 'tc_5ecbbc6099979700087711d8';
                    
                    // 관리자 기본값(app_settings)도 반영
                    try {
                      const ttsResp = await fetch('/api/settings/tts', { cache: 'no-store' });
                      if (ttsResp.ok) {
                        const ttsJson = await ttsResp.json();
                        if (ttsJson && ttsJson.tts_provider) {
                          ttsProvider = (ttsJson.tts_provider === 'naver') ? 'naver' : 'typecast';
                        }
                        if (ttsJson && ttsJson.typecast_voice_id) {
                          const vc = String(ttsJson.typecast_voice_id || '').trim();
                          if (vc) typecastVoiceId = vc;
                        }
                      }
                    } catch (e) {}
                    
                    // content.id가 있으면 Supabase에서 최신 화자 정보 조회
                    if (window.savedContentId) {
                      try {
                        
                        const response = await fetch('/api/content/' + window.savedContentId);
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          throw new Error('API 응답 실패: ' + response.status);
                        }
                        
                        const data = await response.json();
                        
                        if (data.tts_speaker) {
                          speaker = data.tts_speaker;
                          window.savedContentSpeaker = speaker; // 전역 변수 업데이트
                        } else {
                        }
                        if (data.tts_provider === 'typecast') {
                          ttsProvider = 'typecast';
                          window.savedContentTtsProvider = ttsProvider;
                        }
                        if (data.typecast_voice_id) {
                          const vc = String(data.typecast_voice_id || '').trim();
                          if (vc) {
                            typecastVoiceId = vc;
                            window.savedContentTypecastVoiceId = typecastVoiceId;
                          }
                        }
                      } catch (error) {
                        // 조회 실패 시 기존 값 사용
                        speaker = window.savedContentSpeaker || 'nara';
                      }
                    } else {
                    }
                    
                    // 버튼 상태 변경
                    const button = document.getElementById('ttsButton');
                    const icon = document.getElementById('ttsIcon');
                    const text = document.getElementById('ttsText');
                    button.disabled = false;
                    icon.textContent = '⏹️';
                    text.textContent = '듣기 종료';
                    isPlaying = true;
                    shouldStop = false;

                    // 텍스트를 2000자 단위로 분할
                    const maxLength = 2000;
                    const chunks = splitTextIntoChunks(textContent, maxLength);
                    
                    // 다음 청크를 미리 로드하는 함수
                    const preloadNextChunk = async (chunkIndex) => {
                      if (chunkIndex >= chunks.length || shouldStop) {
                        return null;
                      }

                      try {
                        const chunk = chunks[chunkIndex];

                        // TTS API 호출 (provider/voiceId 포함)
                        const isLocalDebug =
                          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                        const outgoingVoiceId = (ttsProvider === 'typecast') ? typecastVoiceId : '';
                        if (isLocalDebug) {
                          console.log('[tts] request', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId });
                        }

                        const response = await fetch('/api/tts', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
                        });
                        if (isLocalDebug) {
                          console.log('[tts] response', {
                            ok: response.ok,
                            status: response.status,
                            usedProvider: response.headers.get('X-TTS-Provider'),
                            usedVoiceId: response.headers.get('X-TTS-VoiceId'),
                          });
                        }

                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || '청크 ' + (chunkIndex + 1) + ' 음성 변환에 실패했습니다.');
                        }

                        // 오디오 데이터를 Blob으로 변환
                        const audioBlob = await response.blob();
                        const url = URL.createObjectURL(audioBlob);
                        const audio = new Audio(url);
                        
                        // 오디오가 로드될 때까지 대기 (타임아웃 추가)
                        await new Promise((resolve, reject) => {
                          const timeout = setTimeout(function() {
                            reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 타임아웃'));
                          }, 30000); // 30초 타임아웃
                          
                          audio.oncanplaythrough = function() {
                            clearTimeout(timeout);
                            resolve();
                          };
                          audio.onerror = function(e) {
                            clearTimeout(timeout);
                            reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 실패'));
                          };
                          audio.load();
                        });

                        return { url, audio };
                      } catch (error) {
                        return null;
                      }
                    };

                    // 각 청크를 순차적으로 재생 (다음 청크는 미리 로드)
                    let preloadedChunk = null;

                    for (let i = 0; i < chunks.length; i++) {
                      // 중지 플래그 확인
                      if (shouldStop) {
                        if (preloadedChunk) {
                          URL.revokeObjectURL(preloadedChunk.url);
                        }
                        break;
                      }

                      const chunk = chunks[i];

                      // 다음 청크를 미리 로드 (현재 청크 재생 중에)
                      const nextChunkPromise = i < chunks.length - 1 ? preloadNextChunk(i + 1) : Promise.resolve(null);

                      // 현재 청크 재생
                      let currentAudioElement;
                      let currentUrl;

                      if (preloadedChunk) {
                        // 미리 로드된 청크 사용
                        currentAudioElement = preloadedChunk.audio;
                        currentUrl = preloadedChunk.url;
                        preloadedChunk = null;
                      } else {
                        // 첫 번째 청크이거나 미리 로드 실패한 경우 즉시 요청
                        
                        const isLocalDebug =
                          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                        const outgoingVoiceId = (ttsProvider === 'typecast') ? typecastVoiceId : '';
                        if (isLocalDebug) {
                          console.log('[tts] request', { provider: ttsProvider, speaker, voiceId: outgoingVoiceId });
                        }

                        const response = await fetch('/api/tts', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ text: chunk, speaker, provider: ttsProvider, voiceId: (ttsProvider === 'typecast' ? typecastVoiceId : '') }),
                        });
                        if (isLocalDebug) {
                          console.log('[tts] response', {
                            ok: response.ok,
                            status: response.status,
                            usedProvider: response.headers.get('X-TTS-Provider'),
                            usedVoiceId: response.headers.get('X-TTS-VoiceId'),
                          });
                        }
                        
                        if (!response.ok) {
                          const error = await response.json();
                          throw new Error(error.error || '청크 ' + (i + 1) + ' 음성 변환에 실패했습니다.');
                        }

                        const audioBlob = await response.blob();
                        currentUrl = URL.createObjectURL(audioBlob);
                        currentAudioElement = new Audio(currentUrl);
                      }

                      // 오디오 재생 (Promise로 대기, 타임아웃 및 에러 처리 개선)
                      await new Promise((resolve, reject) => {
                        // 중지 플래그 재확인
                        if (shouldStop) {
                          URL.revokeObjectURL(currentUrl);
                          resolve();
                          return;
                        }

                        currentAudio = currentAudioElement; // 현재 오디오 저장
                        
                        // 타임아웃 설정 (5분)
                        const timeout = setTimeout(function() {
                          currentAudioElement.pause();
                          URL.revokeObjectURL(currentUrl);
                          currentAudio = null;
                          reject(new Error('청크 ' + (i + 1) + ' 재생 타임아웃'));
                        }, 300000); // 5분
                        
                        const cleanup = function() {
                          clearTimeout(timeout);
                          URL.revokeObjectURL(currentUrl);
                          currentAudio = null;
                        };
                        
                        currentAudioElement.onended = function() {
                          cleanup();
                          resolve();
                        };
                        
                        currentAudioElement.onerror = function(e) {
                          cleanup();
                          // 에러가 발생해도 다음 청크로 계속 진행
                          resolve();
                        };
                        
                        currentAudioElement.onpause = function() {
                          // 사용자가 일시정지하거나 페이지가 비활성화된 경우
                          if (document.hidden || shouldStop) {
                            cleanup();
                            isPlaying = false;
                            button.disabled = false;
                            icon.textContent = '🔊';
                            text.textContent = '점사 듣기';
                          }
                        };
                        
                        currentAudioElement.play().catch(function(err) {
                          cleanup();
                          // play 실패해도 다음 청크로 계속 진행
                          resolve();
                        });
                      });

                      // 다음 청크 미리 로드 완료 대기 및 저장
                      if (i < chunks.length - 1) {
                        try {
                          preloadedChunk = await nextChunkPromise;
                          if (preloadedChunk) {
                          } else {
                          }
                        } catch (err) {
                          preloadedChunk = null;
                        }
                      }

                      // 중지 플래그 재확인
                      if (shouldStop) {
                        if (preloadedChunk) {
                          URL.revokeObjectURL(preloadedChunk.url);
                        }
                        break;
                      }
                    }

                    if (!shouldStop) {
                    } else {
                    }
                    isPlaying = false;
                    shouldStop = false;
                    button.disabled = false;
                    icon.textContent = '🔊';
                    text.textContent = '점사 듣기';
                  } catch (error) {
                    
                    alert(error?.message || '음성 변환에 실패했습니다.');
                    
                    const button = document.getElementById('ttsButton');
                    const icon = document.getElementById('ttsIcon');
                    const text = document.getElementById('ttsText');
                    
                    if (button && icon && text) {
                      isPlaying = false;
                      shouldStop = false;
                      button.disabled = false;
                      icon.textContent = '🔊';
                      text.textContent = '점사 듣기';
                    } else {
                    }
                  }
                }
                
                // 함수를 전역 스코프에 명시적으로 할당 (onclick 핸들러가 작동하도록)
                window.handleTextToSpeech = handleTextToSpeech;
                
                // 버튼에 이벤트 리스너 연결
                function connectTTSButton() {
                  const ttsButton = document.getElementById('ttsButton');
                  if (ttsButton) {
                    // 기존 이벤트 리스너가 있는지 확인하고 제거 (중복 방지)
                    const newHandler = function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (typeof handleTextToSpeech === 'function') {
                        handleTextToSpeech();
                      } else if (typeof window.handleTextToSpeech === 'function') {
                        window.handleTextToSpeech();
                      } else {
                        alert('음성 재생 기능을 초기화하는 중 오류가 발생했습니다.');
                      }
                    };
                    
                    // 기존 이벤트 리스너 제거 후 새로 추가
                    ttsButton.removeEventListener('click', newHandler);
                    ttsButton.addEventListener('click', newHandler);
                    return true;
                  } else {
                    return false;
                  }
                }
                
                // DOM 로드 후 버튼 연결 시도 (여러 번 재시도)
                function initTTSButton() {
                  let retryCount = 0;
                  const maxRetries = 5;
                  
                  const tryConnect = () => {
                    if (connectTTSButton()) {
                    } else if (retryCount < maxRetries) {
                      retryCount++;
                      setTimeout(tryConnect, 200 * retryCount);
                    } else {
                    }
                  };
                  
                  if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', function() {
                      setTimeout(tryConnect, 100);
                    });
                  } else {
                    // 이미 로드된 경우 즉시 실행
                    setTimeout(tryConnect, 100);
                  }
                  
                  // 추가 안전장치: 일정 시간 후에도 재시도
                  setTimeout(function() {
                    const ttsButton = document.getElementById('ttsButton');
                    if (ttsButton) {
                      connectTTSButton();
                    }
                  }, 1000);
                }
                
                initTTSButton();
              </script>
            </body>
            </html>
          `)
          newWindow.document.close()
        }
      } else {
        alert('저장된 결과를 찾을 수 없습니다.')
      }
    } catch (e) {
      alert('저장된 결과를 불러오는데 실패했습니다.')
    }
  }

  // 목차로 이동 함수
  const scrollToTableOfContents = () => {
    const tocElement = document.getElementById('table-of-contents')
    if (tocElement) {
      tocElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // 점사 완료 전 버튼 클릭 시 경고
  const handleButtonClickDuringStreaming = (e: React.MouseEvent) => {
    if (!streamingFinished) {
      e.preventDefault()
      e.stopPropagation()
      alert('점사중이니 완료될때까지 기다려주세요')
      return false
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 슬라이드 메뉴바 */}
      <SlideMenuBar 
        isOpen={showSlideMenu} 
        onClose={() => setShowSlideMenu(false)}
        streamingFinished={streamingFinished}
      />
      
      {/* 나의 이용내역 팝업 */}
      <MyHistoryPopup isOpen={showMyHistoryPopup} onClose={() => setShowMyHistoryPopup(false)} contentId={resultData?.content?.id} />

      {/* 이용약관 팝업 */}
      <TermsPopup isOpen={showTermsPopup} onClose={() => setShowTermsPopup(false)} />
      
      {/* 개인정보처리방침 팝업 */}
      <PrivacyPopup isOpen={showPrivacyPopup} onClose={() => setShowPrivacyPopup(false)} />

      {/* 점사 완료 팝업 */}
      <AlertPopup
        isOpen={showCompletionPopup}
        message={'점사가 모두 완료되었습니다'}
        onClose={() => setShowCompletionPopup(false)}
      />

      {/* 헤더 */}
      <header className="w-full bg-white border-b-2 border-pink-500">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <a 
            href="/"
            className="text-2xl font-bold tracking-tight text-pink-600 hover:text-pink-700 transition-colors cursor-pointer"
            onClick={handleButtonClickDuringStreaming}
          >
            jeuniOn
          </a>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={(e) => {
                if (!streamingFinished) {
                  e.preventDefault()
                  alert('점사중이니 완료될때까지 기다려주세요')
                  return
                }
                setShowMyHistoryPopup(true)
              }}
              className="text-sm font-semibold text-gray-700 hover:text-pink-600 transition-colors"
            >
              나의 이용내역
            </button>
            <button
              type="button"
              onClick={(e) => {
                if (!streamingFinished) {
                  e.preventDefault()
                  alert('점사중이니 완료될때까지 기다려주세요')
                  return
                }
                setShowSlideMenu(true)
              }}
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

      {/* 플로팅 배너 - 점사율 로딩바 + 나의 사주명식 보기 + 목차로 이동 */}
      {parsedMenus.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2">
          {/* 점사율 로딩바 (목차로 이동 버튼 위에 수직 배치, 시작 위치 맞춤) */}
          {/* ✅ 조건 강화: streamingFinished가 true이거나 점사율이 100%이면 숨김 */}
          {!streamingFinished && isStreamingActive && totalSubtitles > 0 && revealedCount < totalSubtitles && (
            <div 
              className="relative overflow-visible py-0.5" 
              style={{ width: tocButtonWidth ? `${tocButtonWidth}px` : 'fit-content', minWidth: '120px' }}
            >
              {/* 배경바 (프로그래스바 뒤) */}
              <div 
                className="absolute inset-0 bg-pink-500/50 rounded-full min-h-[20px]"
                style={{ width: '100%' }}
              />
              {/* 프로그래스바 (배경바 위) */}
              <div 
                className="h-full bg-gradient-to-r from-pink-400 via-pink-500 to-pink-600 transition-all duration-500 ease-out rounded-full flex items-center pl-2 min-h-[20px] relative"
                style={{
                  width: `${Math.min(100, (revealedCount / Math.max(1, totalSubtitles)) * 100)}%`,
                  marginLeft: '2px'
                }}
              >
                <span className="text-xs font-medium text-white whitespace-nowrap">점사율</span>
                <span className="text-xs font-medium text-white whitespace-nowrap absolute right-2">
                  {Math.min(100, Math.round((revealedCount / Math.max(1, totalSubtitles)) * 100))}%
                </span>
              </div>
            </div>
          )}
          
          {/* 나의 사주명식 보기 + 목차로 이동 버튼 (같은 줄에 배치) */}
          <div className="flex items-center gap-2">
            {/* 나의 사주명식 보기 버튼 (목차로 이동 버튼 왼쪽) */}
            {parsedMenus.length > 0 && parsedMenus[0].manseHtml && (
          <button
                onClick={() => setShowMansePopup(true)}
                className="bg-pink-500/80 hover:bg-pink-500/90 text-white font-semibold px-5 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 text-sm"
              >
                나의 사주명식 보기
              </button>
            )}
            
            {/* 목차로 이동 버튼 (타이틀 내용에 맞게 너비 자동 조정) */}
            <button
              ref={tocButtonRef}
            onClick={scrollToTableOfContents}
              className="bg-pink-500/80 hover:bg-pink-500/90 text-white font-semibold px-4 py-2 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 whitespace-nowrap text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span>목차로 이동</span>
          </button>
          </div>
        </div>
      )}
      
      {/* 나의 사주명식 보기 팝업 */}
      {showMansePopup && parsedMenus.length > 0 && parsedMenus[0].manseHtml && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-2 sm:p-4">
          {/* ✅ 최대한 넓게 사용: 모바일에서도 98vw, 데스크탑은 7xl까지 */}
          <div className="bg-white rounded-2xl w-[98vw] max-w-[98vw] sm:max-w-7xl max-h-[92vh] overflow-auto shadow-2xl relative flex flex-col">
            {/* 닫기 버튼 (우측 상단) */}
            <button
              onClick={() => setShowMansePopup(false)}
              className="absolute top-4 right-4 text-pink-500 hover:text-pink-600 transition-colors w-10 h-10 flex items-center justify-center rounded-full hover:bg-pink-50 z-10"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* 만세력 표시 */}
            <div className="p-4 sm:p-8 pt-8 sm:pt-10 flex-1">
              {/* 제목 영역 */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-3">
                  <span className="text-2xl">☯️</span>
                  <h2 className="text-2xl font-bold text-gray-900">
                    나의 사주명식
                  </h2>
                  <span className="text-2xl">☯️</span>
                </div>
              </div>
              
              <div className="manse-ryeok-popup-container w-full">
                <div
                  className="manse-ryeok-container w-full"
                  dangerouslySetInnerHTML={{ __html: parsedMenus[0].manseHtml || '' }}
                />
              </div>
            </div>
            
            {/* 하단 닫기 버튼 */}
            <div className="p-6 border-t border-gray-100">
              <button
                onClick={() => setShowMansePopup(false)}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-300 shadow-lg shadow-pink-500/25 hover:shadow-pink-600/30"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* realtime 전용 로딩 팝업 (batch 폼 팝업과 동일한 UI) */}
      {fortuneViewMode === 'realtime' && isRealtime && showRealtimePopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                {resultData?.userName ? `${resultData.userName}님의 사주명식을 자세히 분석중이에요` : '내담자님의 사주명식을 자세히 분석중이에요'}
              </h3>
              
              {/* 진행률 표시 */}
              <div className="mb-6">
                <div className="w-full bg-gray-200 rounded-full h-3 mb-3">
                  <div 
                    className="bg-gradient-to-r from-pink-500 to-pink-600 h-3 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${streamingProgress}%` }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600">
                  {Math.round(streamingProgress)}%
                </p>
              </div>
              
              {/* 안내 문구 */}
              <div className="mb-4">
                <p className="text-gray-700 font-medium">
                  <span className="text-pink-600">점사가 모두 완료될때까지 현재 화면에서 나가지 마세요!</span>
                </p>
              </div>
              
              {/* 로딩 스피너 */}
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 동적 스타일 주입 */}
      <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl flex-1 w-full">
        {/* 제목 */}
        <div className="mb-8 text-center">
          <h1 className="result-title text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            {content?.content_name || '결과 생성 중...'}
          </h1>

          {/* ✅ 만세력 위 1줄(사주명식 정보 라인)은 만세력 블록 내부에서만 별도 스타일로 표시 */}
          
          {html && (
            <div className="mb-4 flex flex-col items-center gap-2">
              <button
                onClick={handleTextToSpeech}
                className={`bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 text-gray-800 text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 hover:border-blue-400 transition-all duration-300 flex items-center gap-2 shadow-sm hover:shadow-md group ${
                  isPlaying ? 'from-red-50 to-red-100 hover:from-red-100 hover:to-red-200 border-red-300 hover:border-red-400' : ''
                }`}
              >
                {isPlaying ? (
                  <>
                    <span className="text-xl">⏹️</span>
                    <span className="text-gray-800">듣기 종료</span>
                  </>
                ) : (
                  <>
                    <span className="text-xl group-hover:scale-110 transition-transform duration-200">🔊</span>
                    <span className="text-gray-800">점사 듣기</span>
                  </>
                )}
              </button>
              {ttsStatus && (
                <div className="text-xs text-gray-600 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600"></div>
                  <span>{ttsStatus}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 북커버 썸네일 (점사 전에 바로 표시) */}
        {(content?.book_cover_thumbnail || content?.book_cover_thumbnail_video) && (
          <div className="book-cover-thumbnail-container w-full mb-10" style={{ aspectRatio: '2/3' }}>
            {content?.book_cover_thumbnail_video && content?.book_cover_thumbnail ? (
              <SupabaseVideo
                thumbnailImageUrl={content.book_cover_thumbnail}
                videoBaseName={content.book_cover_thumbnail_video}
                className="w-full h-full rounded-lg"
                objectFit="contain"
              />
            ) : content?.book_cover_thumbnail ? (
              <img 
                src={content.book_cover_thumbnail} 
                alt=""
                className="w-full h-full object-contain rounded-lg"
                style={{ opacity: 0 }}
                onLoad={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '1'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : null}
          </div>
        )}

        {/* 결과 출력 */}
        {fortuneViewMode === 'realtime' ? (
          parsedMenus.length > 0 ? (
            <div className="jeminai-results space-y-6">
              {/* 목차 (북커버 썸네일 아래, 테이블 밖) */}
              {parsedMenus.length > 0 && (
                <div id="table-of-contents" className="mb-6 border-t border-b border-gray-200 pt-6 pb-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">목차</h3>
                  <div className="space-y-2">
                    {parsedMenus.map((m, mIndex) => (
                      <div key={`toc-menu-${mIndex}`} className="space-y-1">
                        <button
                          onClick={(e) => {
                            const element = document.getElementById(`menu-${mIndex}`)
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }
                          }}
                          className="text-left text-base font-semibold text-gray-800 hover:text-pink-600 transition-colors w-full py-1"
                        >
                          {m.title}
                        </button>
                        {m.subtitles && m.subtitles.length > 0 && (
                          <div className="ml-4 space-y-1">
                            {m.subtitles.map((sub, sIndex) => {
                              const subTitle = (sub.title || '').trim()
                              if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) return null
                              return (
                                <button
                                  key={`toc-sub-${mIndex}-${sIndex}`}
                                  onClick={() => {
                                    const element = document.getElementById(`subtitle-${mIndex}-${sIndex}`)
                                    if (element) {
                                      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }
                                  }}
                                  className="text-left text-sm text-gray-600 hover:text-pink-600 transition-colors w-full py-0.5"
                                >
                                  {subTitle}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {parsedMenus.map((menu, menuIndex) => {
                // 활성 항목의 메뉴까지만 표시 (이후 메뉴는 숨김)
                if (shouldGateByActivePos && activePos && menuIndex > activePos.menuIndex) return null
                return (
                <div key={`menu-${menuIndex}`} id={`menu-${menuIndex}`} className="menu-section space-y-3">
                  <div 
                    className="menu-title font-bold text-lg text-gray-900"
                    style={{
                      fontSize: `${menuFontSize}px`,
                      fontWeight: menuFontBold ? 'bold' : 'normal',
                      fontFamily: menuFontFamilyName ? `'${menuFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                      color: menuColor || undefined
                    }}
                  >
                    {menu.title}
                  </div>

                  {/* 대메뉴 썸네일 (이미지/동영상) */}
                  {(() => {
                    const menuItem = content?.menu_items?.[menuIndex]
                    const menuThumbnailImageUrl = menuItem?.thumbnail_image_url || menuItem?.thumbnail || ''
                    const menuThumbnailVideoUrl = menuItem?.thumbnail_video_url || ''
                    if (menuThumbnailImageUrl || menuThumbnailVideoUrl) {
                      return (
                        <div className="w-full" style={{ marginBottom: '32px' }}>
                          {menuThumbnailVideoUrl && menuThumbnailImageUrl ? (
                            <SupabaseVideo
                              thumbnailImageUrl={menuThumbnailImageUrl}
                              videoBaseName={menuThumbnailVideoUrl}
                              className="w-full h-auto rounded-lg"
                            />
                          ) : menuThumbnailImageUrl ? (
                            <img 
                              src={menuThumbnailImageUrl} 
                              alt=""
                              className="w-full h-auto object-contain rounded-lg"
                              style={{ opacity: 0 }}
                              onLoad={(e) => {
                                (e.target as HTMLImageElement).style.opacity = '1'
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none'
                              }}
                            />
                          ) : null}
                        </div>
                      )
                    }
                    return null
                  })()}

                  {/* 첫 번째 대제목 아래 만세력 테이블 (1-1 소제목 준비 이후에만 표시) */}
                  {menuIndex === 0 && menu.manseHtml && firstSubtitleReady && (
                    <div
                      className="mt-4 mb-8"
                      dangerouslySetInnerHTML={{ __html: menu.manseHtml }}
                    />
                  )}

                  <div className="space-y-4" style={{ marginTop: (menuIndex === 0 && menu.manseHtml && firstSubtitleReady) ? '0' : '32px' }}>
                    {menu.subtitles.map((sub, subIndex) => {
                      // 활성 항목까지만 표시 (이후 항목은 숨김)
                      if (shouldGateByActivePos && activePos && menuIndex === activePos.menuIndex && subIndex > activePos.subIndex) return null

                      const complete = isItemComplete(sub)
                      const isActive =
                        shouldGateByActivePos &&
                        !!activePos &&
                        menuIndex === activePos.menuIndex &&
                        subIndex === activePos.subIndex &&
                        !complete

                      // 활성 항목이 아닌데 미완성이면 숨김 (점사중 표시 중복 방지)
                      if (!complete && !isActive) return null

                      const title = (sub.title || '').trim() // 숫자 접두사 유지
                      if (!title || title.includes('상세메뉴 해석 목록')) return null

                      return (
                        <div key={`item-${menuIndex}-${subIndex}`} id={`subtitle-${menuIndex}-${subIndex}`} className="subtitle-section space-y-2">
                          <div 
                            className="subtitle-title font-semibold text-gray-900"
                            style={{
                              fontSize: `${subtitleFontSize}px`,
                              fontWeight: subtitleFontBold ? 'bold' : 'normal',
                              fontFamily: subtitleFontFamilyName ? `'${subtitleFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                              color: subtitleColor || undefined
                            }}
                          >
                            {title}
                          </div>
                          {(() => {
                            const thumbnailImageUrl = sub.thumbnail_image_url || sub.thumbnail || ''
                            const thumbnailVideoUrl = sub.thumbnail_video_url || ''
                            if (thumbnailImageUrl || thumbnailVideoUrl) {
                              return (
                                <div className="mx-auto my-2 w-[300px] h-[300px] rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                                  {thumbnailVideoUrl && thumbnailImageUrl ? (
                                    <SupabaseVideo
                                      thumbnailImageUrl={thumbnailImageUrl}
                                      videoBaseName={thumbnailVideoUrl}
                                      className="w-full h-full"
                                      objectFit="contain"
                                    />
                                  ) : thumbnailImageUrl ? (
                                    <img
                                      src={thumbnailImageUrl}
                                      alt=""
                                      className="w-full h-full object-contain"
                                      style={{ display: 'block', opacity: 0 }}
                                      onLoad={(e) => {
                                        (e.target as HTMLImageElement).style.opacity = '1'
                                      }}
                                      onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none'
                                      }}
                                    />
                                  ) : null}
                                </div>
                              )
                            }
                            return null
                          })()}
                          {complete ? (
                            <div 
                              className="subtitle-content text-gray-800" 
                              style={{
                                fontSize: `${bodyFontSize}px`,
                                fontWeight: bodyFontBold ? 'bold' : 'normal',
                                fontFamily: bodyFontFamilyName ? `'${bodyFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                                color: bodyColor || undefined
                              }}
                              dangerouslySetInnerHTML={{ __html: sub.contentHtml || '' }} 
                            />
                          ) : (
                            <div 
                              className="subtitle-content text-gray-400 flex items-center gap-2 py-2"
                              style={{
                                fontSize: `${bodyFontSize}px`,
                                fontWeight: bodyFontBold ? 'bold' : 'normal',
                                fontFamily: bodyFontFamilyName ? `'${bodyFontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined
                              }}
                            >
                              <span>점사중입니다</span>
                              <span className="loading-dots">
                                <span className="dot" />
                                <span className="dot" />
                                <span className="dot" />
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                )
              })}
            </div>
          ) : streamingFinished && html ? (
            // 점사 완료되었지만 parsedMenus가 비어있을 때 html 직접 표시
            <div 
              className="jeminai-results"
              dangerouslySetInnerHTML={{ 
                __html: html 
                  ? (() => {
                      let processedHtml = html.replace(/\*\*/g, '')
                      // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
                      processedHtml = processedHtml
                        .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                        .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                        .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                        .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                        .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                      return processedHtml
                    })()
                  : '' 
              }}
            />
          ) : (
            <div className="jeminai-results space-y-4 text-center text-gray-500">
              <div className="flex justify-center items-center gap-2 text-gray-600">
              점사를 준비중이에요
                <span className="loading-dots">
                  <span className="dot" />
                  <span className="dot" />
                  <span className="dot" />
                </span>
              </div>
            <div className="text-sm text-gray-400">곧 점사내용이 순차적으로 표시되요.</div>
            </div>
          )
        ) : (
          <div 
            className="jeminai-results"
            dangerouslySetInnerHTML={{ 
              __html: html 
                ? (() => {
                    let processedHtml = html.replace(/\*\*/g, '')
                    // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
                    processedHtml = processedHtml
                      // 이전 태그 닫기(>)와 테이블 사이의 모든 줄바꿈/공백/빈줄 완전 제거
                      .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                      // 줄 시작부터 테이블까지의 모든 줄바꿈/공백/빈줄 완전 제거
                      .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                      // 테이블 앞의 모든 공백 문자 제거 (줄바꿈, 공백, 탭 등)
                      .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                      // 텍스트 단락 태그(</p>, </div>, </h3> 등) 뒤의 모든 공백과 줄바꿈 제거 후 테이블
                      .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                      // 모든 종류의 태그 뒤의 연속된 줄바꿈과 공백을 제거하고 테이블 바로 붙이기
                      .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                    
                    // 북커버와 엔딩북커버, 소제목 썸네일 추가 (batch 모드)
                    const menuItems = content?.menu_items || []
                    const bookCoverThumbnail = content?.book_cover_thumbnail || ''
                    const endingBookCoverThumbnail = content?.ending_book_cover_thumbnail || ''
                    
                    if (menuItems.length > 0 || bookCoverThumbnail || endingBookCoverThumbnail) {
                      const parser = new DOMParser()
                      const doc = parser.parseFromString(processedHtml, 'text/html')
                      const menuSections = Array.from(doc.querySelectorAll('.menu-section'))
                      
                      // HTML에 이미 포함된 북커버 썸네일 플레이스홀더 제거 (썸네일이 없는 경우)
                      if (!bookCoverThumbnail && menuSections.length > 0) {
                        const firstSection = menuSections[0]
                        const existingBookCover = firstSection.querySelector('.book-cover-thumbnail-container')
                        if (existingBookCover) {
                          existingBookCover.remove()
                        }
                      }
                      
                      // 북커버 썸네일 추가 (첫 번째 menu-section 안, 제목 위)
                      if (bookCoverThumbnail && menuSections.length > 0) {
                        const firstSection = menuSections[0]
                        const bookCoverDiv = doc.createElement('div')
                        bookCoverDiv.className = 'book-cover-thumbnail-container'
                        bookCoverDiv.style.cssText = 'width: 100%; margin-bottom: 2.5rem; display: flex; justify-content: center;'
                        const bookCoverImg = doc.createElement('img')
                        bookCoverImg.src = bookCoverThumbnail
                        bookCoverImg.alt = ''
                        bookCoverImg.style.cssText = 'width: calc(100% - 48px); max-width: calc(100% - 48px); height: auto; object-fit: contain; display: block; opacity: 0;'
                        bookCoverImg.onload = function() {
                          bookCoverImg.style.opacity = '1'
                        }
                        bookCoverImg.onerror = function() {
                          bookCoverImg.style.display = 'none'
                        }
                        bookCoverDiv.appendChild(bookCoverImg)
                        // 첫 번째 자식 요소(menu-title) 앞에 삽입
                        if (firstSection.firstChild) {
                          firstSection.insertBefore(bookCoverDiv, firstSection.firstChild)
                        } else {
                          firstSection.appendChild(bookCoverDiv)
                        }
                      }
                      
                      // 숫자 접두사 제거 및 상세메뉴 추가
                      menuSections.forEach((section, menuIndex) => {
                        const menuItem = menuItems[menuIndex]
                        
                        // 대메뉴 제목에서 폰트 속성 적용 (숫자 접두사 유지)
                        const menuTitle = section.querySelector('.menu-title')
                        if (menuTitle) {
                          // 숫자 접두사 제거하지 않음
                          const menuBold = content?.menu_font_bold || false
                          const menuSize = content?.menu_font_size || 16
                          const menuFontFace = content?.menu_font_face || content?.font_face || ''
                          const menuFontFamily = menuFontFace ? (() => {
                            const match = menuFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                            return match ? (match[1] || match[2]?.trim()) : null
                          })() : null
                          ;(menuTitle as HTMLElement).style.fontWeight = menuBold ? 'bold' : 'normal'
                          ;(menuTitle as HTMLElement).style.fontSize = `${menuSize}px`
                          if (menuFontFamily) {
                            ;(menuTitle as HTMLElement).style.fontFamily = `'${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`
                          }
                          if (menuColor) {
                            ;(menuTitle as HTMLElement).style.color = menuColor
                          }
                        }
                        
                        if (menuItem?.subtitles) {
                          const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'))
                          subtitleSections.forEach((subSection, subIndex) => {
                            const subtitle = menuItem.subtitles[subIndex]
                            
                            // 소메뉴 제목에서 폰트 속성 적용 (숫자 접두사 유지)
                            const subtitleTitle = subSection.querySelector('.subtitle-title')
                            if (subtitleTitle) {
                              // 숫자 접두사 제거하지 않음
                              const subtitleBold = content?.subtitle_font_bold || false
                              const subtitleSize = content?.subtitle_font_size || 14
                              const subtitleFontFace = content?.subtitle_font_face || content?.font_face || ''
                              const subtitleFontFamily = subtitleFontFace ? (() => {
                                const match = subtitleFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                                return match ? (match[1] || match[2]?.trim()) : null
                              })() : null
                              ;(subtitleTitle as HTMLElement).style.fontWeight = subtitleBold ? 'bold' : 'normal'
                              ;(subtitleTitle as HTMLElement).style.fontSize = `${subtitleSize}px`
                              if (subtitleFontFamily) {
                                ;(subtitleTitle as HTMLElement).style.fontFamily = `'${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`
                              }
                              if (subtitleColor) {
                                ;(subtitleTitle as HTMLElement).style.color = subtitleColor
                              }
                            }
                            
                            // 소제목 썸네일 추가
                            const thumbnailImageUrl = subtitle?.thumbnail_image_url || subtitle?.thumbnail || ''
                            const thumbnailVideoUrl = subtitle?.thumbnail_video_url || ''
                            if (thumbnailImageUrl || thumbnailVideoUrl) {
                              if (subtitleTitle) {
                                const thumbnailImg = doc.createElement('div')
                                thumbnailImg.className = 'subtitle-thumbnail-container'
                                thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;'
                                if (thumbnailVideoUrl && thumbnailImageUrl) {
                                  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                                  const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                                  const containerDiv = doc.createElement('div')
                                  containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                                  
                                  const imgEl = doc.createElement('img')
                                  imgEl.src = thumbnailImageUrl
                                  imgEl.alt = '소제목 썸네일'
                                  imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;'
                                  imgEl.id = `subtitle-thumbnail-img-batch-${menuIndex}-${subIndex}`
                                  
                                  const videoEl = doc.createElement('video')
                                  videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none;'
                                  videoEl.id = `subtitle-thumbnail-video-batch-${menuIndex}-${subIndex}`
                                  videoEl.poster = thumbnailImageUrl
                                  videoEl.setAttribute('autoPlay', '')
                                  videoEl.setAttribute('muted', '')
                                  videoEl.setAttribute('loop', '')
                                  videoEl.setAttribute('playsInline', '')
                                  videoEl.setAttribute('preload', 'auto')
                                  
                                  const sourceEl = doc.createElement('source')
                                  sourceEl.src = `${bucketUrl}/${thumbnailVideoUrl}.webm`
                                  sourceEl.type = 'video/webm'
                                  videoEl.appendChild(sourceEl)
                                  
                                  containerDiv.appendChild(imgEl)
                                  containerDiv.appendChild(videoEl)
                                  thumbnailImg.appendChild(containerDiv)
                                  
                                  // 동영상 로드 및 재생 설정
                                  videoEl.addEventListener('canplay', function() {
                                    if (imgEl) imgEl.style.display = 'none'
                                    if (videoEl) {
                                      videoEl.style.display = 'block'
                                      videoEl.play().catch(() => {
                                        // 자동 재생 실패 시 무시 (브라우저 정책)
                                      })
                                    }
                                  })
                                  videoEl.load()
                                } else if (thumbnailImageUrl) {
                                  const imgEl = doc.createElement('img')
                                  imgEl.src = thumbnailImageUrl
                                  imgEl.alt = ''
                                  imgEl.style.cssText = 'width: 100%; height: 100%; display: block; object-fit: contain; opacity: 0;'
                                  imgEl.onload = function() {
                                    imgEl.style.opacity = '1'
                                  }
                                  imgEl.onerror = function() {
                                    imgEl.style.display = 'none'
                                  }
                                  thumbnailImg.appendChild(imgEl)
                                }
                                subtitleTitle.parentNode?.insertBefore(thumbnailImg, subtitleTitle.nextSibling)
                              }
                            }
                            
                            // 상세메뉴 썸네일 추가
                            if (subtitle?.detailMenus && Array.isArray(subtitle.detailMenus)) {
                              const detailMenuSections = Array.from(subSection.querySelectorAll('.detail-menu-section'))
                              detailMenuSections.forEach((detailMenuSection, dmIndex) => {
                                const detailMenu = subtitle.detailMenus[dmIndex]
                                if (detailMenu) {
                                  const detailMenuThumbnailImageUrl = detailMenu?.thumbnail_image_url || detailMenu?.thumbnail || ''
                                  const detailMenuThumbnailVideoUrl = detailMenu?.thumbnail_video_url || ''
                                  if (detailMenuThumbnailImageUrl || detailMenuThumbnailVideoUrl) {
                                    const detailMenuTitle = detailMenuSection.querySelector('.detail-menu-title')
                                    if (detailMenuTitle) {
                                      const thumbnailImg = doc.createElement('div')
                                      thumbnailImg.className = 'subtitle-thumbnail-container'
                                      thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;'
                                      if (detailMenuThumbnailVideoUrl && detailMenuThumbnailImageUrl) {
                                        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                                        const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                                        const containerDiv = doc.createElement('div')
                                        containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                                        
                                        const imgEl = doc.createElement('img')
                                        imgEl.src = detailMenuThumbnailImageUrl
                                        imgEl.alt = '상세메뉴 썸네일'
                                        imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;'
                                        imgEl.id = `detail-menu-thumbnail-img-batch-${menuIndex}-${subIndex}-${dmIndex}`
                                        
                                        const videoEl = doc.createElement('video')
                                        videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: none;'
                                        videoEl.id = `detail-menu-thumbnail-video-batch-${menuIndex}-${subIndex}-${dmIndex}`
                                        videoEl.poster = detailMenuThumbnailImageUrl
                                        videoEl.setAttribute('autoPlay', '')
                                        videoEl.setAttribute('muted', '')
                                        videoEl.setAttribute('loop', '')
                                        videoEl.setAttribute('playsInline', '')
                                        videoEl.setAttribute('preload', 'auto')
                                        
                                        const sourceEl = doc.createElement('source')
                                        sourceEl.src = `${bucketUrl}/${detailMenuThumbnailVideoUrl}.webm`
                                        sourceEl.type = 'video/webm'
                                        videoEl.appendChild(sourceEl)
                                        
                                        containerDiv.appendChild(imgEl)
                                        containerDiv.appendChild(videoEl)
                                        thumbnailImg.appendChild(containerDiv)
                                        
                                        // 동영상 로드 및 재생 설정
                                        videoEl.addEventListener('canplay', function() {
                                          if (imgEl) imgEl.style.display = 'none'
                                          if (videoEl) {
                                            videoEl.style.display = 'block'
                                            videoEl.play().catch(() => {
                                              // 자동 재생 실패 시 무시 (브라우저 정책)
                                            })
                                          }
                                        })
                                        videoEl.load()
                                      } else if (detailMenuThumbnailImageUrl) {
                                        const imgEl = doc.createElement('img')
                                        imgEl.src = detailMenuThumbnailImageUrl
                                        imgEl.alt = '상세메뉴 썸네일'
                                        imgEl.style.cssText = 'width: 100%; height: 100%; display: block; object-fit: contain;'
                                        thumbnailImg.appendChild(imgEl)
                                      }
                                      detailMenuTitle.parentNode?.insertBefore(thumbnailImg, detailMenuTitle.nextSibling)
                                    }
                                  }
                                }
                              })
                            }
                            
                            // 상세메뉴 추가 (HTML에서 파싱한 내용 사용)
                            // 먼저 HTML에서 detail-menu-section이 있는지 확인
                            const existingDetailMenuSection = subSection.querySelector('.detail-menu-section')
                            
                            if (existingDetailMenuSection) {
                              // HTML에 이미 상세메뉴가 있으면 그대로 사용 (제미나이가 생성한 것)
                              // 스타일 적용 (숫자 접두사 유지)
                              const detailMenuTitles = existingDetailMenuSection.querySelectorAll('.detail-menu-title')
                              detailMenuTitles.forEach((titleEl) => {
                                // 숫자 접두사 제거하지 않음
                                const detailMenuBold = content?.detail_menu_font_bold || false
                                const detailMenuFontFace = content?.detail_menu_font_face || content?.font_face || ''
                                const detailMenuFontFamily = detailMenuFontFace ? (() => {
                                  const match = detailMenuFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                                  return match ? (match[1] || match[2]?.trim()) : null
                                })() : null
                                ;(titleEl as HTMLElement).style.fontSize = `${detailMenuFontSize}px`
                                ;(titleEl as HTMLElement).style.fontWeight = detailMenuBold ? 'bold' : 'normal'
                                if (detailMenuFontFamily) {
                                  ;(titleEl as HTMLElement).style.fontFamily = `'${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`
                                }
                                if (detailMenuColor) {
                                  ;(titleEl as HTMLElement).style.color = detailMenuColor
                                }
                              })
                              
                              const detailMenuContents = existingDetailMenuSection.querySelectorAll('.detail-menu-content')
                              const detailMenus = subtitle?.detailMenus || []
                              detailMenuContents.forEach((contentEl, dmContentIdx) => {
                                // 해석도구 관련 텍스트 제거 (화면에 표시되면 안 됨) - 강화된 제거
                                if (contentEl.innerHTML) {
                                  let contentHtml = contentEl.innerHTML
                                  
                                  // 관리자폼의 해석도구 내용과 매칭하여 제거 (최우선)
                                  const currentDetailMenu = detailMenus[dmContentIdx]
                                  if (currentDetailMenu?.interpretation_tool) {
                                    const interpretationToolText = currentDetailMenu.interpretation_tool
                                    // HTML 태그 제거한 순수 텍스트로 매칭
                                    const toolTextWithoutTags = interpretationToolText.replace(/<[^>]*>/g, '').trim()
                                    if (toolTextWithoutTags) {
                                      const escapedToolTextClean = toolTextWithoutTags.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                                      // 해석도구 내용이 포함된 부분 제거 (태그 포함/미포함 모두)
                                      contentHtml = contentHtml
                                        .replace(new RegExp(escapedToolTextClean, 'gi'), '')
                                        .replace(new RegExp(interpretationToolText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '')
                                    }
                                  }
                                  
                                  contentHtml = contentHtml
                                    .replace(/상세메뉴\s*해석도구[^<]*/gi, '') // 상세메뉴 해석도구 전체 제거
                                    .replace(/해석도구\s*[:：]\s*/gi, '')
                                    .replace(/\*\*해석도구\*\*\s*[:：]\s*/gi, '')
                                    .replace(/interpretation[_\s]*tool\s*[:：]\s*/gi, '')
                                    .replace(/<[^>]*>해석도구[^<]*<\/[^>]*>/gi, '')
                                    .replace(/<[^>]*>상세메뉴\s*해석도구[^<]*<\/[^>]*>/gi, '')
                                    .replace(/해석도구[^<]*/gi, '')
                                    .replace(/\s*해석도구\s*/gi, '') // 공백 사이의 해석도구 제거
                                    .trim() // 최종 공백 정리
                                  contentEl.innerHTML = contentHtml
                                }
                                
                                const bodyBold = content?.body_font_bold || false
                                const bodyFontFace = content?.body_font_face || content?.font_face || ''
                                const bodyFontFamily = bodyFontFace ? (() => {
                                  const match = bodyFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                                  return match ? (match[1] || match[2]?.trim()) : null
                                })() : null
                                ;(contentEl as HTMLElement).style.fontSize = `${bodyFontSize}px`
                                ;(contentEl as HTMLElement).style.fontWeight = bodyBold ? 'bold' : 'normal'
                                if (bodyFontFamily) {
                                  ;(contentEl as HTMLElement).style.fontFamily = `'${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`
                                }
                                if (bodyColor) {
                                  ;(contentEl as HTMLElement).style.color = bodyColor
                                }
                              })
                              
                              // subtitle-content에 폰트 속성 적용
                              const subtitleContent = subSection.querySelector('.subtitle-content')
                              if (subtitleContent) {
                                const bodyBold = content?.body_font_bold || false
                                const bodySize = content?.body_font_size || 11
                                const bodyFontFace = content?.body_font_face || content?.font_face || ''
                                const bodyFontFamily = bodyFontFace ? (() => {
                                  const match = bodyFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                                  return match ? (match[1] || match[2]?.trim()) : null
                                })() : null
                                ;(subtitleContent as HTMLElement).style.fontSize = `${bodySize}px`
                                ;(subtitleContent as HTMLElement).style.fontWeight = bodyBold ? 'bold' : 'normal'
                                if (bodyFontFamily) {
                                  ;(subtitleContent as HTMLElement).style.fontFamily = `'${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`
                                }
                                if (bodyColor) {
                                  ;(subtitleContent as HTMLElement).style.color = bodyColor
                                }
                              }
                              
                              // 상세메뉴가 subtitle-content 앞에 있으면 subtitle-content 다음으로 이동
                              if (subtitleContent && existingDetailMenuSection) {
                                const detailMenuParent = existingDetailMenuSection.parentNode
                                const subtitleContentParent = subtitleContent.parentNode
                                
                                // subtitle-content가 detail-menu-section보다 뒤에 있는지 확인 (DOM 순서)
                                let isDetailMenuBeforeContent = false
                                if (detailMenuParent === subtitleContentParent) {
                                  let currentNode = subtitleContentParent?.firstChild
                                  while (currentNode) {
                                    if (currentNode === existingDetailMenuSection) {
                                      isDetailMenuBeforeContent = true
                                      break
                                    }
                                    if (currentNode === subtitleContent) {
                                      break
                                    }
                                    currentNode = currentNode.nextSibling
                                  }
                                }
                                
                                // detail-menu-section이 subtitle-content 앞에 있으면 이동
                                if (isDetailMenuBeforeContent) {
                                  subtitleContentParent?.insertBefore(existingDetailMenuSection, subtitleContent.nextSibling)
                                }
                              }
                            }
                            // 참고: HTML에 상세메뉴가 없는 경우(제미나이가 생성하지 않은 경우)는 처리하지 않음
                            // 제미나이가 상세메뉴를 생성해야 하므로, 생성되지 않은 경우는 표시하지 않음
                          })
                        }
                      })
                      
                      // 엔딩북커버 썸네일 추가 (마지막 menu-section 안, 소제목들 아래)
                      const endingBookCoverThumbnailImageUrl = content?.ending_book_cover_thumbnail || ''
                      const endingBookCoverThumbnailVideoUrl = content?.ending_book_cover_thumbnail_video || ''
                      if ((endingBookCoverThumbnailImageUrl || endingBookCoverThumbnailVideoUrl) && menuSections.length > 0) {
                        const lastSection = menuSections[menuSections.length - 1]
                        const endingBookCoverDiv = doc.createElement('div')
                        endingBookCoverDiv.className = 'ending-book-cover-thumbnail-container'
                        endingBookCoverDiv.style.cssText = 'width: 100%; margin-top: 1rem; aspect-ratio: 2/3;'
                        if (endingBookCoverThumbnailVideoUrl && endingBookCoverThumbnailImageUrl) {
                          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                          const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                          const containerDiv = doc.createElement('div')
                          containerDiv.style.cssText = 'position: relative; width: 100%; height: 100%;'
                          
                          const endingImg = doc.createElement('img')
                          endingImg.src = endingBookCoverThumbnailImageUrl
                          endingImg.alt = ''
                          endingImg.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px; opacity: 0;'
                          endingImg.id = 'ending-thumbnail-img-batch'
                          endingImg.onload = function() {
                            endingImg.style.opacity = '1'
                          }
                          endingImg.onerror = function() {
                            endingImg.style.display = 'none'
                          }
                          
                          const endingVideo = doc.createElement('video')
                          endingVideo.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px; display: none;'
                          endingVideo.id = 'ending-thumbnail-video-batch'
                          endingVideo.poster = endingBookCoverThumbnailImageUrl
                          endingVideo.setAttribute('autoPlay', '')
                          endingVideo.setAttribute('muted', '')
                          endingVideo.setAttribute('loop', '')
                          endingVideo.setAttribute('playsInline', '')
                          endingVideo.setAttribute('preload', 'auto')
                          
                          const sourceEl = doc.createElement('source')
                          sourceEl.src = `${bucketUrl}/${endingBookCoverThumbnailVideoUrl}.webm`
                          sourceEl.type = 'video/webm'
                          endingVideo.appendChild(sourceEl)
                          
                          containerDiv.appendChild(endingImg)
                          containerDiv.appendChild(endingVideo)
                          endingBookCoverDiv.appendChild(containerDiv)
                          
                          // 동영상 로드 및 재생 설정
                          endingVideo.addEventListener('canplay', function() {
                            if (endingImg) endingImg.style.display = 'none'
                            if (endingVideo) endingVideo.style.display = 'block'
                          })
                          endingVideo.load()
                        } else if (endingBookCoverThumbnailImageUrl) {
                          const endingImg = doc.createElement('img')
                          endingImg.src = endingBookCoverThumbnailImageUrl
                          endingImg.alt = ''
                          endingImg.style.cssText = 'width: 100%; height: 100%; object-fit: contain; display: block; border-radius: 8px; opacity: 0;'
                          endingImg.onload = function() {
                            endingImg.style.opacity = '1'
                          }
                          endingImg.onerror = function() {
                            endingImg.style.display = 'none'
                          }
                          endingBookCoverDiv.appendChild(endingImg)
                        }
                        // 마지막 자식 요소 뒤에 추가
                        lastSection.appendChild(endingBookCoverDiv)
                      }
                      
                      processedHtml = doc.documentElement.outerHTML
                      // DOMParser가 추가한 html, body 태그 제거
                      const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
                      if (bodyMatch) {
                        processedHtml = bodyMatch[1]
                      }
                    }
                    
                    return processedHtml
                  })()
                : '' 
            }}
          />
        )}

        {/* 엔딩 북커버 썸네일 (점사가 모두 완료된 후에만 표시) */}
        {(content?.ending_book_cover_thumbnail || content?.ending_book_cover_thumbnail_video) && (!isRealtimeStreaming || streamingFinished) && (
          <div className="ending-book-cover-thumbnail-container w-full mt-10" style={{ aspectRatio: '2/3' }}>
            {content?.ending_book_cover_thumbnail_video && content?.ending_book_cover_thumbnail ? (
              <SupabaseVideo
                thumbnailImageUrl={content.ending_book_cover_thumbnail}
                videoBaseName={content.ending_book_cover_thumbnail_video}
                className="w-full h-full rounded-lg"
                objectFit="contain"
              />
            ) : content?.ending_book_cover_thumbnail ? (
              <img 
                src={content.ending_book_cover_thumbnail} 
                alt=""
                className="w-full h-full object-contain rounded-lg"
                style={{ opacity: 0 }}
                onLoad={(e) => {
                  (e.target as HTMLImageElement).style.opacity = '1'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
            ) : null}
          </div>
        )}
      </main>

      {/* 푸터: 현재 화면 기준 하단에 붙도록 (컨텐츠가 짧아도 바닥) */}
      <footer className="bg-white border-t border-gray-200 py-6 mt-auto">
        <div className="container mx-auto px-4">
          <div className="text-xs space-y-1 leading-relaxed">
            <div>
              <button
                type="button"
                onClick={() => setShowTermsPopup(true)}
                className="text-pink-600 hover:text-pink-700 underline font-semibold transition-colors"
              >
                이용약관
              </button>
              {' / '}
              <button
                type="button"
                onClick={() => setShowPrivacyPopup(true)}
                className="text-pink-600 hover:text-pink-700 underline font-semibold transition-colors"
              >
                개인정보처리방침
              </button>
            </div>
            <div className="text-gray-600">
              사업자등록번호 : 108-81-84400 │ 통신판매업신고번호 : 2022-서울성동-00643
            </div>
            <div className="text-gray-600">
              02-516-1975 │ service＠fortune82.com
            </div>
            <div className="text-gray-600">
              서울특별시 성동구 상원12길 34 (성수동1가, 서울숲에이원) 213호
            </div>
            <div className="pt-2 text-gray-500">
              Copyright(c) FORTUNE82.COM All Rights Reserved.
            </div>
            <div className="text-gray-600">
              ㈜테크앤조이 │ 대표 : 서주형
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p>로딩 중...</p>
        </div>
      </div>
    }>
      <ResultContent />
    </Suspense>
  )
}
