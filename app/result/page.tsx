'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, useRef, useMemo, memo, useCallback } from 'react'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import { getContentById, getSelectedSpeaker, getFortuneViewMode } from '@/lib/supabase-admin'
import html2canvas from 'html2canvas'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'

interface ResultData {
  content: any
  html: string // HTML 결과
  startTime?: number
  model?: string // 사용된 모델 정보
  userName?: string // 사용자 이름
  isSecondRequest?: boolean // 2차 요청 완료 여부
}

interface ParsedSubtitle {
  title: string
  contentHtml: string
  thumbnail?: string
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

function ResultContent() {
  const searchParams = useSearchParams()
  
  // sessionStorage에서 데이터 가져오기 (URL 파라미터 대신, 하위 호환성 유지)
  const [storageKey, setStorageKey] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [requestKey, setRequestKey] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [isRealtime, setIsRealtime] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false) // 데이터 로드 완료 플래그
  
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
      setRequestKey(storedRequestKey)
      setIsStreaming(storedStream === 'true')
      setIsRealtime(storedStream === 'true' && !!storedRequestKey)
      // 사용 후 삭제 (한 번만 사용)
      sessionStorage.removeItem('result_requestKey')
      sessionStorage.removeItem('result_stream')
      console.log('Result 페이지: sessionStorage에서 requestKey 가져옴:', storedRequestKey)
      setDataLoaded(true)
      return
    }
    
    if (storedSavedId) {
      setSavedId(storedSavedId)
      // 사용 후 삭제 (한 번만 사용)
      sessionStorage.removeItem('result_savedId')
      console.log('Result 페이지: sessionStorage에서 savedId 가져옴:', storedSavedId)
      setDataLoaded(true)
      return
    }
    
    if (storedStorageKey) {
      setStorageKey(storedStorageKey)
      // 사용 후 삭제 (한 번만 사용)
      sessionStorage.removeItem('result_key')
      console.log('Result 페이지: sessionStorage에서 storageKey 가져옴:', storedStorageKey)
      setDataLoaded(true)
      return
    }
    
    // 2. URL 파라미터 확인 (하위 호환성)
    const urlStorageKey = searchParams.get('key')
    const urlSavedId = searchParams.get('savedId')
    const urlRequestKey = searchParams.get('requestKey')
    const urlIsStreaming = searchParams.get('stream') === 'true'
    
    if (urlStorageKey) {
      setStorageKey(urlStorageKey)
      console.log('Result 페이지: URL에서 storageKey 가져옴:', urlStorageKey)
    }
    
    if (urlSavedId) {
      setSavedId(urlSavedId)
      console.log('Result 페이지: URL에서 savedId 가져옴:', urlSavedId)
    }
    
    if (urlRequestKey) {
      setRequestKey(urlRequestKey)
      setIsStreaming(urlIsStreaming)
      setIsRealtime(urlIsStreaming && !!urlRequestKey)
      console.log('Result 페이지: URL에서 requestKey 가져옴:', urlRequestKey)
    }
    
    setDataLoaded(true)
  }, [searchParams, dataLoaded])
  
  // requestKey나 isStreaming이 변경되면 isRealtime 업데이트
  useEffect(() => {
    setIsRealtime(isStreaming && !!requestKey)
  }, [isStreaming, requestKey])
  const [resultData, setResultData] = useState<ResultData | null>(null)
  const [streamingHtml, setStreamingHtml] = useState('')
  const [isStreamingActive, setIsStreamingActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // resultData가 로드되면 썸네일을 sessionStorage에 저장 (form 페이지로 돌아갈 때 사용)
  useEffect(() => {
    if (resultData?.content?.thumbnail_url && typeof window !== 'undefined') {
      sessionStorage.setItem('form_thumbnail_url', resultData.content.thumbnail_url)
      sessionStorage.setItem('form_title', resultData.content.content_name || '')
      console.log('Result 페이지: 썸네일 URL을 sessionStorage에 저장:', resultData.content.thumbnail_url)
    }
  }, [resultData])
  const [savedResults, setSavedResults] = useState<any[]>([])
  const [streamingProgress, setStreamingProgress] = useState(0) // realtime 가짜 로딩/진행률
  const [fortuneViewMode, setFortuneViewMode] = useState<'batch' | 'realtime'>('batch')
  const [parsedMenus, setParsedMenus] = useState<ParsedMenu[]>([])
  const [totalSubtitles, setTotalSubtitles] = useState(0)
  const [revealedCount, setRevealedCount] = useState(0)
  const [showRealtimeLoading, setShowRealtimeLoading] = useState(false) // 기존 플래그(사용 안함)
  const [showRealtimePopup, setShowRealtimePopup] = useState(false) // realtime 전용 로딩 팝업
  const [firstSubtitleReady, setFirstSubtitleReady] = useState(false) // 1-1 소제목 준비 여부
  const firstSubtitleReadyRef = useRef(false)
  const [streamingFinished, setStreamingFinished] = useState(false) // 스트리밍 완료 여부 (realtime)
  const thumbnailHtmlCacheRef = useRef<Map<number, string>>(new Map()) // 썸네일 HTML 캐시 (메뉴 인덱스별)
  const manseHtmlCacheRef = useRef<Map<number, string>>(new Map()) // 만세력 HTML 캐시 (메뉴 인덱스별)
  const autoSavedRef = useRef(false) // 자동 저장 여부 (중복 저장 방지)

  // savedResults 변경 시 로깅
  useEffect(() => {
    console.log('결과 페이지: savedResults 변경됨, 길이:', savedResults.length)
    console.log('결과 페이지: savedResults 내용:', savedResults)
  }, [savedResults])

  // firstSubtitleReady ref 동기화 (타이머/인터벌에서 최신 값 사용)
  useEffect(() => {
    firstSubtitleReadyRef.current = firstSubtitleReady
  }, [firstSubtitleReady])

  // 점사 모드 로드
  useEffect(() => {
    const loadMode = async () => {
      try {
        const mode = await getFortuneViewMode()
        setFortuneViewMode(mode === 'realtime' ? 'realtime' : 'batch')
        console.log('결과 페이지: 점사 모드 로드', mode)
        // 결제 성공 진입 시 팝업 없이 바로 결과 화면으로 전환
        setShowRealtimeLoading(false)
      } catch (e) {
        console.error('결과 페이지: 점사 모드 로드 실패, 기본 batch 사용', e)
        setFortuneViewMode('batch')
        setShowRealtimeLoading(false)
      }
    }
    loadMode()

    // 결제 성공 진입 플래그가 있는 경우 팝업 강제 비활성화
    const paid = searchParams.get('paid')
    if (paid === 'true') {
      setShowRealtimeLoading(false)
    }
  }, [searchParams])
  

  // 저장된 결과 목록 로드 함수 (useEffect 위에 정의)
  const loadSavedResults = async () => {
    if (typeof window === 'undefined') return
    try {
      console.log('=== 저장된 결과 목록 로드 시작 (결과 페이지) ===')
      const response = await fetch('/api/saved-results/list', {
        cache: 'no-store' // 프로덕션 환경에서 캐싱 방지
      })
      console.log('API 응답 상태:', response.status, response.statusText)
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API 응답 실패:', response.status, errorText)
        throw new Error(`저장된 결과 목록 조회 실패: ${response.status}`)
      }
      
      const result = await response.json()
      console.log('API 응답 데이터:', result)
      console.log('result.success:', result.success)
      console.log('result.data:', result.data)
      console.log('result.data 길이:', result.data?.length || 0)
      
      if (result.success) {
        const data = result.data || []
        console.log('저장된 결과 설정:', data.length, '개')
        // 디버깅: 첫 번째 항목의 savedAtISO 확인
        if (data.length > 0) {
          console.log('첫 번째 저장된 결과 샘플:', data[0])
          console.log('첫 번째 항목의 savedAtISO:', data[0].savedAtISO)
        }
        setSavedResults(data)
      } else {
        console.warn('API 응답에서 success가 false:', result.error || result.details)
        setSavedResults([])
      }
      console.log('=== 저장된 결과 목록 로드 완료 (결과 페이지) ===')
    } catch (e) {
      console.error('저장된 결과 불러오기 실패:', e)
      console.error('에러 상세:', e instanceof Error ? e.stack : e)
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

  // 오디오 중지 함수 (여러 곳에서 재사용)
  const stopAndResetAudio = () => {
    console.log('오디오 중지 요청')
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
        console.log('페이지 숨김 감지, 오디오 중지')
        stopAndResetAudio()
      }
    }

    const handlePopState = (e: PopStateEvent) => {
      console.log('popstate 이벤트 감지 (뒤로가기/앞으로가기), 오디오 중지', e)
      stopAndResetAudio()
    }

    const handleBeforeUnload = () => {
      console.log('beforeunload 이벤트 감지, 오디오 중지')
      stopAndResetAudio()
    }

    // 이벤트 리스너 등록 (캡처링 단계에서도 처리)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('popstate', handlePopState, true) // 캡처링 단계에서 처리
    window.addEventListener('beforeunload', handleBeforeUnload)
    
    // cleanup: 페이지 언마운트 시 오디오 중지
    return () => {
      console.log('컴포넌트 언마운트, 오디오 중지')
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
        console.warn('결과 페이지: 구버전 key 파라미터 사용 중. savedId를 사용하세요.')
        setError('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.')
        setLoading(false)
      }
      return
    }

    console.log('결과 페이지: savedId로 데이터 찾기 시작, ID:', savedId)
    
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

        console.log('결과 페이지: 저장된 결과 조회 완료, HTML 길이:', savedResult.html?.length || 0)
        
        // ResultData 형식으로 변환
        const parsedData: ResultData = {
          content: savedResult.content || null,
          html: savedResult.html || '',
          startTime: savedResult.processingTime ? Date.now() - savedResult.processingTime : undefined,
          model: savedResult.model,
          userName: savedResult.userName
        }
        
        setResultData(parsedData)
        
        // 저장된 결과 목록 로드
        console.log('결과 페이지: loadSavedResults 호출')
        loadSavedResults()

        console.log('결과 페이지: 데이터 로드 완료')
      } catch (e: any) {
        console.error('결과 데이터 로드 실패:', e)
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

    console.log('결과 페이지: realtime 모드 진입, requestKey:', requestKey)

    let cancelled = false
    let fakeProgressInterval: NodeJS.Timeout | null = null

    const startStreaming = async () => {
      try {
        // Supabase에서 임시 요청 데이터 조회
        const getResponse = await fetch(`/api/temp-request/get?requestKey=${requestKey}`)
        
        if (!getResponse.ok) {
          const errorData = await getResponse.json()
          console.error('결과 페이지: requestKey에 대한 요청 데이터를 찾을 수 없습니다.', requestKey, errorData)
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
          console.error('결과 페이지: payload 데이터가 없습니다.', getResult)
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
        const { requestData, content, startTime, model, userName } = payload

        if (cancelled) return

        // 초기 상태 설정: 화면은 바로 결과 레이아웃으로 전환
        setResultData({
          content,
          html: '',
          startTime,
          model,
          userName,
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

        // 가짜 진행률: 1초에 2%씩 97%까지 증가 (첫 소제목 준비 전까지)
        fakeProgressInterval = setInterval(() => {
          if (firstSubtitleReadyRef.current) {
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            return
          }

          setStreamingProgress((prev) => {
            if (prev >= 97) return prev
            const next = prev + 2
            return next > 97 ? 97 : next
          })
        }, 1000)

        let accumulatedHtml = ''
        const manseRyeokTable: string | undefined = payload?.requestData?.manse_ryeok_table

        // 2차 요청을 위한 헬퍼 함수
        const startSecondRequest = async (firstHtml: string, remainingSubtitleIndices: number[], completedSubtitleIndices: number[] = []) => {
          console.log('=== 2차 요청 시작 ===')
          console.log('남은 소제목 개수:', remainingSubtitleIndices.length, '개')
          console.log('남은 소제목 인덱스:', remainingSubtitleIndices.join(', '))
          console.log('완료된 소제목 개수:', completedSubtitleIndices.length, '개')
          console.log('완료된 소제목 인덱스:', completedSubtitleIndices.join(', '))
          console.log('1차 HTML 길이:', firstHtml.length, '자')
          console.log('=== 2차 요청 시작 ===')
          
          // 남은 소제목만 추출
          const remainingSubtitles = remainingSubtitleIndices.map((index: number) => requestData.menu_subtitles[index])
          
          // 완료된 소제목 정보 추출 (프롬프트에 포함하기 위해)
          const completedSubtitles = completedSubtitleIndices.map((index: number) => requestData.menu_subtitles[index])
          
          // 2차 요청 데이터 생성
          const secondRequestData = {
            ...requestData,
            menu_subtitles: remainingSubtitles,
            isSecondRequest: true, // 2차 요청 플래그
            completedSubtitles: completedSubtitles, // 완료된 소제목 정보 (프롬프트에 포함)
            completedSubtitleIndices: completedSubtitleIndices, // 완료된 소제목 인덱스
          }
          
          // 2차 요청 시작
          await callJeminaiAPIStream(secondRequestData, (data) => {
            if (cancelled) return
            
            console.log('결과 페이지: 2차 스트리밍 콜백:', data.type)
            
            if (data.type === 'start') {
              // 2차 요청 시작 시 1차 HTML 유지 및 로딩 상태 활성화
              console.log('2차 요청 스트리밍 시작, 1차 HTML 길이:', firstHtml.length, '자')
              setIsStreamingActive(true)
              setStreamingFinished(false)
            } else if (data.type === 'chunk') {
              // 2차 HTML을 누적
              accumulatedHtml = firstHtml + (data.text || '')
              
              // HTML 정리
              accumulatedHtml = accumulatedHtml
                .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                .replace(/\*\*/g, '')
              
              setStreamingHtml(accumulatedHtml)
            } else if (data.type === 'done') {
              // 2차 요청 완료: 1차 HTML + 2차 HTML 병합
              const secondHtml = data.html || ''
              let mergedHtml = firstHtml + secondHtml
              
              // HTML 정리
              mergedHtml = mergedHtml
                .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                .replace(/\*\*/g, '')
              
              // 만세력 테이블 삽입 (아직 없으면)
              if (manseRyeokTable && !mergedHtml.includes('manse-ryeok-table')) {
                const firstMenuSectionMatch = mergedHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
                if (firstMenuSectionMatch) {
                  const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)
                  if (thumbnailMatch) {
                    mergedHtml = mergedHtml.replace(
                      /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  } else {
                    const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                    if (menuTitleMatch) {
                      mergedHtml = mergedHtml.replace(
                        /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                        `$1\n${manseRyeokTable}`
                      )
                    } else {
                      mergedHtml = mergedHtml.replace(
                        /(<div class="menu-section">)\s*/,
                        `$1\n${manseRyeokTable}`
                      )
                    }
                  }
                }
              }
              
              setStreamingHtml(mergedHtml)
              
              // 2차 요청 완료 상세 로그
              console.log('=== 2차 요청 완료 및 HTML 병합 완료 ===')
              console.log('1차 HTML 길이:', firstHtml.length, '자')
              console.log('2차 HTML 길이:', secondHtml.length, '자')
              console.log('병합된 HTML 길이:', mergedHtml.length, '자')
              console.log('병합 비율: 1차', Math.round((firstHtml.length / mergedHtml.length) * 100) + '%', '/ 2차', Math.round((secondHtml.length / mergedHtml.length) * 100) + '%')
              console.log('=== 2차 요청 완료 및 HTML 병합 완료 ===')
              
              const finalResult: ResultData = {
                content,
                html: mergedHtml,
                startTime,
                model,
                userName,
                isSecondRequest: true, // 2차 요청 완료 플래그
              }
              setResultData(finalResult)
              
              console.log('결과 페이지: 2차 요청 완료, 전체 결과 완료')
              
              setIsStreamingActive(false)
              setStreamingFinished(true)
              setStreamingProgress(100)
              setLoading(false)
              setShowRealtimePopup(false)
              console.log('=== 재미나이 API 스트리밍 완료 (1차 + 2차) ===')
            } else if (data.type === 'error') {
              console.error('결과 페이지: 2차 스트리밍 에러:', data.error)
              setError(data.error || '2차 점사 진행 중 문제가 발생했습니다.')
              setIsStreamingActive(false)
              setStreamingFinished(true)
            }
          })
        }
        
        await callJeminaiAPIStream(requestData, (data) => {
          if (cancelled) return

          console.log('결과 페이지: realtime 스트리밍 콜백:', data.type)

          if (data.type === 'start') {
            accumulatedHtml = ''
          } else if (data.type === 'partial_done') {
            // 1차 요청 부분 완료: 2차 요청 자동 시작
            console.log('=== 1차 요청 부분 완료, 2차 요청 시작 ===')
            console.log('1차 요청 완료된 HTML 길이:', (data.html || accumulatedHtml).length, '자')
            console.log('완료된 소제목 인덱스:', data.completedSubtitles || [])
            console.log('남은 소제목 인덱스:', data.remainingSubtitles || [])
            console.log('남은 소제목 개수:', (data.remainingSubtitles || []).length, '개')
            console.log('=== 1차 요청 부분 완료, 2차 요청 시작 ===')
            
            const firstHtml = data.html || accumulatedHtml
            const remainingIndices = data.remainingSubtitles || []
            const completedIndices = data.completedSubtitles || []
            
            if (remainingIndices.length > 0) {
              // 1차 HTML 저장
              setStreamingHtml(firstHtml)
              
              // 2차 요청 시작 전 로딩 상태 활성화
              setIsStreamingActive(true)
              setStreamingFinished(false)
              
              // 2차 요청 시작 (비동기로 실행, await하지 않음)
              startSecondRequest(firstHtml, remainingIndices, completedIndices).catch((err) => {
                console.error('2차 요청 실패:', err)
                setError('2차 점사 진행 중 문제가 발생했습니다.')
                setIsStreamingActive(false)
                setStreamingFinished(true)
              })
            } else {
              // 남은 소제목이 없으면 완료 처리
              setStreamingHtml(firstHtml)
              const finalResult: ResultData = {
                content,
                html: firstHtml,
                startTime,
                model,
                userName,
              }
              setResultData(finalResult)
              setIsStreamingActive(false)
              setStreamingFinished(true)
              setStreamingProgress(100)
              setLoading(false)
              setShowRealtimePopup(false)
            }
          } else if (data.type === 'chunk') {
            accumulatedHtml += data.text || ''

            // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
            // 테이블 태그 앞의 모든 줄바꿈을 제거하고 CSS로 간격 조정
            accumulatedHtml = accumulatedHtml
              // 이전 태그 닫기(>)와 테이블 사이의 모든 줄바꿈/공백 제거
              .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              // 줄 시작부터 테이블까지의 모든 줄바꿈/공백 제거
              .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              // 테이블 앞의 공백 문자 제거 (줄바꿈 없이 바로 붙이기)
              .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              // 텍스트 단락 태그(</p>, </div>, </h3> 등) 뒤의 모든 공백과 줄바꿈 제거 후 테이블
              .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              // 모든 종류의 태그 뒤의 연속된 줄바꿈과 공백을 제거하고 테이블 바로 붙이기
              .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              // ** 문자 제거 (마크다운 강조 표시 제거)
              .replace(/\*\*/g, '')

            // 스트리밍 중에도 만세력 테이블을 가능한 한 빨리 삽입
            if (manseRyeokTable && !accumulatedHtml.includes('manse-ryeok-table')) {
              const firstMenuSectionMatch = accumulatedHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
              if (firstMenuSectionMatch) {
                const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)

                if (thumbnailMatch) {
                  // 썸네일 바로 다음에 삽입 (줄바꿈 한 줄만)
                  accumulatedHtml = accumulatedHtml.replace(
                    /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                    `$1\n${manseRyeokTable}`
                  )
                } else {
                  const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                  if (menuTitleMatch) {
                    // 메뉴 제목 다음에 삽입 (줄바꿈 한 줄만)
                    accumulatedHtml = accumulatedHtml.replace(
                      /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  } else {
                    // 첫 번째 menu-section 시작 부분에 삽입 (줄바꿈 한 줄만)
                    accumulatedHtml = accumulatedHtml.replace(
                      /(<div class="menu-section">)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  }
                }
              }
            }

            setStreamingHtml(accumulatedHtml)
          } else if (data.type === 'done') {
            let finalHtml = data.html || accumulatedHtml

            // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
            // 테이블 태그 앞의 모든 줄바꿈을 제거하고 CSS로 간격 조정
            finalHtml = finalHtml
              // 이전 태그 닫기(>)와 테이블 사이의 모든 줄바꿈/공백 제거
              .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              // 줄 시작부터 테이블까지의 모든 줄바꿈/공백 제거
              .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              // 테이블 앞의 공백 문자 제거 (줄바꿈 없이 바로 붙이기)
              .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              // 텍스트 단락 태그(</p>, </div>, </h3> 등) 뒤의 모든 공백과 줄바꿈 제거 후 테이블
              .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              // 모든 종류의 태그 뒤의 연속된 줄바꿈과 공백을 제거하고 테이블 바로 붙이기
              .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              // ** 문자 제거 (마크다운 강조 표시 제거)
              .replace(/\*\*/g, '')

            // 만세력 테이블이 있고 첫 번째 menu-section에 없으면 삽입 (batch 모드와 동일한 위치 규칙, 중복 방지)
            if (manseRyeokTable && !finalHtml.includes('manse-ryeok-table')) {
              const firstMenuSectionMatch = finalHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
              if (firstMenuSectionMatch) {
                const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)

                if (thumbnailMatch) {
                  // 썸네일 바로 다음에 삽입 (줄바꿈 한 줄만)
                  finalHtml = finalHtml.replace(
                    /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                    `$1\n${manseRyeokTable}`
                  )
                } else {
                  // 썸네일이 없으면 메뉴 제목 다음에 삽입 (줄바꿈 한 줄만)
                  const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                  if (menuTitleMatch) {
                    finalHtml = finalHtml.replace(
                      /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  } else {
                    // 메뉴 제목도 없으면 첫 번째 menu-section 시작 부분에 삽입 (줄바꿈 한 줄만)
                    finalHtml = finalHtml.replace(
                      /(<div class="menu-section">)\s*/,
                      `$1\n${manseRyeokTable}`
                    )
                  }
                }
              }
            }

            setStreamingHtml(finalHtml)

            const finalResult: ResultData = {
              content,
              html: finalHtml,
              startTime,
              model,
              userName,
            }
            setResultData(finalResult)

            // sessionStorage 대신 Supabase에 저장하므로 여기서는 저장하지 않음
            // (이미 saved_results 테이블에 저장됨)
            console.log('결과 페이지: realtime 모드, 최종 결과 완료')

            setIsStreamingActive(false)
            setStreamingFinished(true)
            setStreamingProgress(100)
            setLoading(false)
            setShowRealtimePopup(false)
            console.log('=== 재미나이 API 스트리밍 완료 ===')
          } else if (data.type === 'error') {
            console.error('결과 페이지: realtime 스트리밍 에러:', data.error)
            // 429 Rate Limit 에러는 점사중... 메시지가 이미 떠 있으므로 에러 메시지 표시하지 않음
            if (data.error && (data.error.includes('429') || data.error.includes('Rate Limit'))) {
              console.error('429 Rate Limit 에러 - 에러 메시지 표시하지 않음 (점사중... 메시지가 이미 표시됨)')
              setIsStreamingActive(false)
              setStreamingFinished(true)
            } else {
              // 서버/클라이언트에서 이미 사용자 친화적 메시지를 보냈으므로 그대로 사용
              setError(data.error || '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.')
              setIsStreamingActive(false)
              setStreamingFinished(true)
            }
          }
        })
      } catch (e: any) {
        if (cancelled) return
        console.error('결과 페이지: realtime 스트리밍 중 예외 발생:', e)
        
        // 429 Rate Limit 에러는 점사중... 메시지가 이미 떠 있으므로 에러 메시지 표시하지 않음
        if (e?.message && (e.message.includes('429') || e.message.includes('Rate Limit'))) {
          console.error('429 Rate Limit 에러 - 에러 메시지 표시하지 않음 (점사중... 메시지가 이미 표시됨)')
          setIsStreamingActive(false)
          setLoading(false)
          return
        }
        
        // 에러 메시지가 이미 사용자 친화적이면 그대로 사용
        const errorMsg = e?.message && (
          e.message.includes('잠시 후') || 
          e.message.includes('대기 중') ||
          e.message.includes('시도해주세요')
        ) ? e.message : '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
        
        setError(errorMsg)
        setIsStreamingActive(false)
        setLoading(false)
      }
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
          console.log('결과 페이지: 스트리밍 중 페이지가 다시 보이게 됨 (전화/메신저 종료 후 복귀 등)')
          // 스트림은 백그라운드에서도 계속 진행되므로 별도 처리 불필요
          // lib/jeminai.ts의 visibilitychange 핸들러가 타임아웃 방지 처리
        } else {
          console.log('결과 페이지: 페이지가 보이게 됨, 저장된 결과 동기화')
          loadSavedResults()
        }
      } else {
        if (isRealtime) {
          // 스트리밍 중 백그라운드로 전환 (전화 수신, 메신저 알림 탭, 다른 앱으로 이동 등)
          console.log('결과 페이지: 스트리밍 중 백그라운드로 전환됨 (전화/메신저/다른 앱 등), 스트림은 계속 진행됩니다.')
        }
      }
    }

    const handleFocus = () => {
      if (!isRealtime) {
        console.log('결과 페이지: 윈도우 포커스, 저장된 결과 동기화')
        loadSavedResults()
      } else {
        // 스트리밍 중 포커스 복귀
        console.log('결과 페이지: 스트리밍 중 윈도우 포커스 복귀')
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
  const saveResultToLocal = useCallback(async (showAlert: boolean = true) => {
    if (typeof window === 'undefined' || !resultData) {
      console.error('결과 저장 실패: resultData가 없습니다.')
      if (showAlert) {
        alert('결과 저장에 실패했습니다. (데이터 없음)')
      }
      return
    }
    
    // requestKey 저장 (나중에 temp_requests 삭제용)
    const currentRequestKey = requestKey
    
    try {
      // resultData에서 필요한 값들 가져오기
      const content = resultData.content
      const html = resultData.html || ''
      const model = resultData.model
      const fontFace = content?.font_face || ''
      
      // HTML에 웹폰트 스타일 포함하여 저장
      let htmlWithFont = html || ''
      if (fontFace) {
        // font-family 추출
        const match = fontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
        const extractedFontFamily = match ? (match[1] || match[2]?.trim()) : null
        
        // HTML 앞부분에 웹폰트 스타일 추가
        const fontStyle = `
<style>
${fontFace}
${extractedFontFamily ? `
* {
  font-family: '${extractedFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
}
body, body *, h1, h2, h3, h4, h5, h6, p, div, span {
  font-family: '${extractedFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
}
.jeminai-results, .jeminai-results * {
  font-family: '${extractedFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
}
.menu-section, .menu-section * {
  font-family: '${extractedFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
}
.menu-title, .subtitle-title, .subtitle-content {
  font-family: '${extractedFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
}
` : ''}
</style>
`
        htmlWithFont = fontStyle + htmlWithFont
      }
      
      // currentTime 계산 (resultData.startTime이 있으면)
      let processingTime = '0:00'
      if (resultData.startTime) {
        const elapsed = Date.now() - resultData.startTime
        const mins = Math.floor(elapsed / 60000)
        const secs = Math.floor((elapsed % 60000) / 1000)
        processingTime = `${mins}:${secs.toString().padStart(2, '0')}`
      }
      
      const response = await fetch('/api/saved-results/save', {
        method: 'POST',
        cache: 'no-store', // 프로덕션 환경에서 캐싱 방지
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: resultData.isSecondRequest 
            ? `${content?.content_name || '재회 결과'}+2차` 
            : (content?.content_name || '재회 결과'),
          html: htmlWithFont, // 웹폰트가 포함된 HTML 저장
          content: content, // content 객체 전체 저장 (tts_speaker 포함)
          model: model || 'gemini-3-flash-preview', // 모델 정보 저장
          processingTime: processingTime, // 처리 시간 저장
          userName: resultData?.userName || '' // 사용자 이름 저장
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || '결과 저장에 실패했습니다.')
      }

      const result = await response.json()
      
      if (result.success) {
        console.log('저장된 결과:', result.data)
        console.log('저장할 컨텐츠의 tts_speaker:', content?.tts_speaker)
        
        // 저장된 결과 ID 저장 (동기화 확인용)
        const savedResultId = result.data?.id
        
        // 저장된 결과를 리스트 맨 위에 추가 (즉시 반영)
        if (result.data) {
          setSavedResults((prev) => {
            // 중복 제거 (같은 ID가 있으면 제거)
            const filtered = prev.filter((item: any) => item.id !== result.data.id)
            // 새 데이터를 맨 위에 추가
            return [result.data, ...filtered]
          })
        }
        
        if (showAlert) {
          alert('결과가 저장되었습니다.')
        } else {
          console.log('점사 완료: 결과가 자동으로 저장되었습니다.')
        }
        
        // PDF 생성 및 업로드 (클라이언트 사이드로 처리, 백그라운드에서도 실행)
        if (savedResultId && typeof window !== 'undefined') {
          console.log('=== 클라이언트 사이드 PDF 생성 시작 ===')
          console.log('savedResultId:', savedResultId)
          
          // 백그라운드에서도 실행되도록 보장하는 함수
          const generatePdfInBackground = async () => {
            try {
              // 실제 렌더링된 메인 컨테이너 찾기
              const mainContainer = document.querySelector('main.container') as HTMLElement
              if (!mainContainer) {
                throw new Error('메인 컨테이너를 찾을 수 없습니다.')
              }
              
              console.log('메인 컨테이너 찾음, PDF 생성 시작...')
              
              // 컨테이너 내용 확인
              const containerText = mainContainer.innerText || ''
              const containerHTML = mainContainer.innerHTML || ''
              console.log('컨테이너 텍스트 길이:', containerText.length)
              console.log('컨테이너 HTML 길이:', containerHTML.length)
              
              if (containerText.trim().length < 10 && containerHTML.length < 100) {
                console.warn('경고: 컨테이너 내용이 거의 없습니다. 추가 대기 시간...')
                await new Promise(resolve => setTimeout(resolve, 3000))
              }
              
              // 컨테이너 높이 확인
              const containerHeight = mainContainer.scrollHeight || mainContainer.offsetHeight || 0
              console.log('컨테이너 높이:', containerHeight, 'px')
              
              if (containerHeight < 100) {
                console.warn('경고: 컨테이너 높이가 너무 작습니다. 추가 대기 시간...')
                await new Promise(resolve => setTimeout(resolve, 3000))
              }
              
              // 모든 버튼 제거 (TTS 버튼, 점사 보기 버튼 등) - 실제 DOM에서 제거하지 않고 캡처 시 제외
              const buttonsToHide = mainContainer.querySelectorAll(
                '.tts-button-container, .tts-button, #ttsButton, ' +
                '.question-button-container, .question-button, ' +
                'button[class*="view"], button[class*="보기"], ' +
                'a[class*="view"], a[class*="보기"]'
              )
              const originalDisplay: string[] = []
              buttonsToHide.forEach((btn) => {
                const htmlBtn = btn as HTMLElement
                originalDisplay.push(htmlBtn.style.display)
                htmlBtn.style.display = 'none'
              })
              
              // 모든 이미지가 로드될 때까지 대기
              console.log('이미지 로드 대기 시작...')
              const images = mainContainer.querySelectorAll('img')
              console.log(`발견된 이미지 개수: ${images.length}개`)
              
              if (images.length > 0) {
                const imageLoadPromises = Array.from(images).map((img: HTMLImageElement, index) => {
                  return new Promise<void>((resolve) => {
                    // 이미 로드된 이미지는 즉시 resolve
                    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
                      console.log(`이미지 ${index + 1}/${images.length} 이미 로드됨:`, img.src.substring(0, 50))
                      resolve()
                      return
                    }
                    
                    // 로드 실패한 이미지도 resolve (에러가 있어도 계속 진행)
                    if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0) {
                      console.warn(`이미지 ${index + 1}/${images.length} 로드 실패:`, img.src.substring(0, 50))
                      resolve()
                      return
                    }
                    
                    // 타임아웃 설정 (15초)
                    const timeout = setTimeout(() => {
                      console.warn(`이미지 ${index + 1}/${images.length} 로드 타임아웃:`, img.src.substring(0, 50))
                      resolve() // 타임아웃되어도 계속 진행
                    }, 15000)
                    
                    // 로드 성공
                    img.onload = () => {
                      clearTimeout(timeout)
                      console.log(`이미지 ${index + 1}/${images.length} 로드 성공:`, img.src.substring(0, 50))
                      resolve()
                    }
                    
                    // 로드 실패
                    img.onerror = () => {
                      clearTimeout(timeout)
                      console.warn(`이미지 ${index + 1}/${images.length} 로드 에러:`, img.src.substring(0, 50))
                      resolve() // 에러가 있어도 계속 진행
                    }
                    
                    // 이미 src가 있는데 complete가 false인 경우 재설정하여 로드 강제
                    if (img.src && !img.complete) {
                      const originalSrc = img.src
                      img.src = ''
                      setTimeout(() => {
                        img.src = originalSrc
                      }, 0)
                    }
                  })
                })
                
                await Promise.all(imageLoadPromises)
                console.log(`이미지 로드 대기 완료 (${images.length}개 이미지)`)
              } else {
                console.log('이미지가 없습니다.')
              }
              
              // 폰트 로드 대기
              await document.fonts.ready
              console.log('폰트 로드 완료')
              
              // 추가 안정화 대기 시간 (렌더링 완료 보장)
              await new Promise(resolve => setTimeout(resolve, 2000))
              
              // 최종 컨테이너 상태 확인
              const finalHeight = mainContainer.scrollHeight || mainContainer.offsetHeight || 0
              const finalText = mainContainer.innerText || ''
              console.log('최종 컨테이너 높이:', finalHeight, 'px')
              console.log('최종 컨테이너 텍스트 길이:', finalText.length)
              
              if (finalHeight < 100 || finalText.trim().length < 10) {
                console.error('경고: 컨테이너 내용이 충분하지 않습니다. PDF 생성이 실패할 수 있습니다.')
                console.error('컨테이너 HTML 일부:', mainContainer.innerHTML.substring(0, 500))
              }
              
              // html2canvas로 캡처 (백그라운드에서도 실행되도록 옵션 설정)
              console.log('html2canvas로 캡처 시작...')
              const canvas = await html2canvas(mainContainer, {
                useCORS: true,
                allowTaint: false,
                scale: 2, // 고해상도
                logging: true, // 디버깅을 위해 로깅 활성화
                backgroundColor: '#f9fafb',
                removeContainer: false,
                imageTimeout: 20000, // 이미지 로드 타임아웃 20초로 증가
                foreignObjectRendering: false, // 외부 객체 렌더링 비활성화 (안정성 향상)
                onclone: (clonedDoc, element) => {
                  // 복제된 문서에서 모든 버튼 제거
                  const clonedButtons = clonedDoc.querySelectorAll(
                    '.tts-button-container, .tts-button, #ttsButton, ' +
                    '.question-button-container, .question-button, ' +
                    'button[class*="view"], button[class*="보기"], ' +
                    'a[class*="view"], a[class*="보기"]'
                  )
                  clonedButtons.forEach(btn => btn.remove())
                  
                  // 복제된 컨테이너 확인
                  const clonedContainer = clonedDoc.querySelector('main.container')
                  if (clonedContainer) {
                    const clonedText = clonedContainer.textContent || ''
                    const clonedHeight = clonedContainer.scrollHeight || 0
                    console.log('복제된 컨테이너 텍스트 길이:', clonedText.length)
                    console.log('복제된 컨테이너 높이:', clonedHeight, 'px')
                  }
                }
              })
              
              // 원래 display 복원
              buttonsToHide.forEach((btn, index) => {
                const htmlBtn = btn as HTMLElement
                htmlBtn.style.display = originalDisplay[index] || ''
              })
              
              console.log('캔버스 생성 완료, 크기:', canvas.width, 'x', canvas.height)
              
              // 캔버스가 비어있는지 확인 (여러 영역 샘플링)
              const ctx = canvas.getContext('2d')
              if (ctx) {
                // 여러 영역에서 샘플링 (상단, 중간, 하단)
                const sampleRegions = [
                  { x: 0, y: 0, w: Math.min(canvas.width, 200), h: Math.min(canvas.height, 200) },
                  { x: Math.max(0, canvas.width / 2 - 100), y: Math.max(0, canvas.height / 2 - 100), w: 200, h: 200 },
                  { x: Math.max(0, canvas.width - 200), y: Math.max(0, canvas.height - 200), w: 200, h: 200 }
                ]
                
                let totalNonWhitePixels = 0
                let totalPixels = 0
                
                for (const region of sampleRegions) {
                  if (region.x < canvas.width && region.y < canvas.height) {
                    const imageData = ctx.getImageData(region.x, region.y, region.w, region.h)
                    const pixels = imageData.data
                    totalPixels += pixels.length / 4
                    
                    for (let i = 0; i < pixels.length; i += 4) {
                      const r = pixels[i]
                      const g = pixels[i + 1]
                      const b = pixels[i + 2]
                      // 배경색(#f9fafb = rgb(249, 250, 251))과 다른 픽셀 확인
                      if (!(r >= 249 && r <= 251 && g >= 249 && g <= 251 && b >= 249 && b <= 251)) {
                        totalNonWhitePixels++
                      }
                    }
                  }
                }
                
                const nonWhitePercentage = totalPixels > 0 ? (totalNonWhitePixels / totalPixels) * 100 : 0
                console.log('캔버스 샘플링 결과 (여러 영역):', {
                  totalPixels,
                  totalNonWhitePixels,
                  percentage: nonWhitePercentage.toFixed(2) + '%',
                  canvasSize: `${canvas.width}x${canvas.height}`
                })
                
                if (nonWhitePercentage < 1) {
                  console.error('경고: 캔버스가 거의 비어있습니다. 추가 대기 후 재시도...')
                  // 추가 대기 후 재시도
                  await new Promise(resolve => setTimeout(resolve, 5000))
                  
                  // 컨테이너 상태 재확인
                  const retryHeight = mainContainer.scrollHeight || mainContainer.offsetHeight || 0
                  const retryText = mainContainer.innerText || ''
                  console.log('재시도 전 컨테이너 상태:', { height: retryHeight, textLength: retryText.length })
                  
                  // 다시 캡처 시도
                  console.log('캔버스 재캡처 시도...')
                  const retryCanvas = await html2canvas(mainContainer, {
                    useCORS: true,
                    allowTaint: false,
                    scale: 2,
                    logging: true,
                    backgroundColor: '#f9fafb',
                    removeContainer: false,
                    imageTimeout: 20000,
                    foreignObjectRendering: false,
                    windowWidth: mainContainer.scrollWidth,
                    windowHeight: mainContainer.scrollHeight,
                    onclone: (clonedDoc) => {
                      const clonedButtons = clonedDoc.querySelectorAll(
                        '.tts-button-container, .tts-button, #ttsButton, ' +
                        '.question-button-container, .question-button, ' +
                        'button[class*="view"], button[class*="보기"], ' +
                        'a[class*="view"], a[class*="보기"]'
                      )
                      clonedButtons.forEach(btn => btn.remove())
                    }
                  })
                  
                  // 재시도 캔버스 확인
                  const retryCtx = retryCanvas.getContext('2d')
                  if (retryCtx) {
                    let retryTotalNonWhitePixels = 0
                    let retryTotalPixels = 0
                    
                    for (const region of sampleRegions) {
                      if (region.x < retryCanvas.width && region.y < retryCanvas.height) {
                        const retryImageData = retryCtx.getImageData(region.x, region.y, region.w, region.h)
                        const retryPixels = retryImageData.data
                        retryTotalPixels += retryPixels.length / 4
                        
                        for (let i = 0; i < retryPixels.length; i += 4) {
                          const r = retryPixels[i]
                          const g = retryPixels[i + 1]
                          const b = retryPixels[i + 2]
                          if (!(r >= 249 && r <= 251 && g >= 249 && g <= 251 && b >= 249 && b <= 251)) {
                            retryTotalNonWhitePixels++
                          }
                        }
                      }
                    }
                    
                    const retryPercentage = retryTotalPixels > 0 ? (retryTotalNonWhitePixels / retryTotalPixels) * 100 : 0
                    console.log('재시도 캔버스 샘플링 결과:', {
                      totalPixels: retryTotalPixels,
                      nonWhitePixels: retryTotalNonWhitePixels,
                      percentage: retryPercentage.toFixed(2) + '%',
                      canvasSize: `${retryCanvas.width}x${retryCanvas.height}`
                    })
                    
                    if (retryPercentage > nonWhitePercentage) {
                      console.log('재시도 캔버스가 더 나음. 재시도 캔버스 사용')
                      canvas.width = retryCanvas.width
                      canvas.height = retryCanvas.height
                      ctx.clearRect(0, 0, canvas.width, canvas.height)
                      ctx.drawImage(retryCanvas, 0, 0)
                    } else if (retryPercentage < 1) {
                      throw new Error('캔버스가 비어있습니다. 콘텐츠가 렌더링되지 않았을 수 있습니다.')
                    }
                  }
                }
              }
              
              // jsPDF로 PDF 생성 (여러 페이지로 분할)
              console.log('PDF 생성 시작...')
              
              // jsPDF 최대 페이지 크기: 14400 userUnit (약 381mm)
              // px 단위로 변환하면 약 14400px (96 DPI 기준)
              const MAX_PAGE_HEIGHT = 14400
              const MAX_PAGE_WIDTH = 14400 // 최대 페이지 너비도 14400px
              
              const canvasWidth = canvas.width
              const canvasHeight = canvas.height
              
              // 가로가 최대값을 초과하면 비율에 맞춰 스케일링
              let scale = 1
              let pdfWidth = canvasWidth
              if (canvasWidth > MAX_PAGE_WIDTH) {
                scale = MAX_PAGE_WIDTH / canvasWidth
                pdfWidth = MAX_PAGE_WIDTH
                console.warn(`⚠️ 캔버스 너비(${canvasWidth}px)가 최대 페이지 너비(${MAX_PAGE_WIDTH}px)를 초과합니다. 스케일링: ${(scale * 100).toFixed(1)}%`)
              }
              
              const pageHeight = MAX_PAGE_HEIGHT
              
              console.log(`캔버스 크기: ${canvasWidth}x${canvasHeight}px, 스케일: ${(scale * 100).toFixed(1)}%, PDF 너비: ${pdfWidth}px`)
              console.log(`페이지 높이: ${pageHeight}px, 예상 페이지 수: ${Math.ceil(canvasHeight / pageHeight)}`)
              
              // 첫 번째 페이지 생성
              const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'px',
                format: [pdfWidth, pageHeight]
              })
              
              // 원본 캔버스 높이 기준으로 페이지 분할 (스케일링은 PDF 추가 시 적용)
              let sourceY = 0 // 원본 캔버스의 Y 위치
              let pageNumber = 0
              
              while (sourceY < canvasHeight) {
                if (pageNumber > 0) {
                  pdf.addPage([pdfWidth, pageHeight], 'portrait')
                }
                
                // 현재 페이지에 들어갈 원본 캔버스 높이 계산
                const remainingHeight = canvasHeight - sourceY
                const sourceHeight = Math.min(pageHeight / scale, remainingHeight) // 원본 캔버스에서 가져올 높이
                const pdfPageHeight = sourceHeight * scale // PDF 페이지에 표시될 높이
                
                // 원본 캔버스에서 해당 부분을 잘라서 새 캔버스에 그리기
                const tempCanvas = document.createElement('canvas')
                tempCanvas.width = pdfWidth
                tempCanvas.height = pdfPageHeight
                const tempCtx = tempCanvas.getContext('2d')
                
                if (tempCtx) {
                  // 원본 캔버스의 해당 부분을 새 캔버스에 복사 (스케일링 적용)
                  tempCtx.drawImage(
                    canvas,
                    0, sourceY, canvasWidth, sourceHeight, // 소스 영역 (원본 캔버스)
                    0, 0, pdfWidth, pdfPageHeight // 대상 영역 (새 캔버스, 스케일링 적용)
                  )
                  
                  // 이미지 데이터로 변환
                  const imgData = tempCanvas.toDataURL('image/png', 1.0)
                  
                  // PDF 페이지에 추가
                  pdf.addImage(
                    imgData,
                    'PNG',
                    0,
                    0,
                    pdfWidth,
                    pdfPageHeight,
                    undefined,
                    'FAST'
                  )
                  
                  console.log(`페이지 ${pageNumber + 1} 추가 완료 (원본 y: ${sourceY}px, 원본 높이: ${sourceHeight}px, PDF 높이: ${pdfPageHeight}px)`)
                }
                
                // 원본 캔버스의 다음 위치로 이동
                sourceY += sourceHeight
                pageNumber++
              }
              
              const pdfBlobSize = pdf.output('blob').size
              console.log(`PDF 생성 완료, 총 ${pageNumber}페이지 (크기: ${pdfWidth}x${pageHeight}px), 크기: ${pdfBlobSize}bytes`)
              
              // 크기가 최대값을 초과하는 경우 정보 출력
              if (canvasWidth > MAX_PAGE_WIDTH) {
                console.warn(`⚠️ 컨텐츠 너비(${canvasWidth}px)가 최대 페이지 너비(${MAX_PAGE_WIDTH}px)를 초과합니다. 스케일링이 적용되었습니다.`)
              }
              if (canvasHeight > MAX_PAGE_HEIGHT / scale) {
                const scaledHeight = canvasHeight * scale
                console.log(`ℹ️ 컨텐츠 높이(${scaledHeight}px)가 최대 페이지 높이(${MAX_PAGE_HEIGHT}px)를 초과하여 ${pageNumber}페이지로 분할되었습니다.`)
              }
              
              // PDF를 Blob으로 변환
              const pdfBlob = pdf.output('blob')
              
              // 200MB 제한 확인
              const maxSize = 200 * 1024 * 1024
              if (pdfBlob.size > maxSize) {
                throw new Error(`PDF 파일 크기가 200MB를 초과합니다 (${(pdfBlob.size / 1024 / 1024).toFixed(2)}MB)`)
              }
              
              // Supabase Storage에 업로드
              console.log('Supabase Storage에 업로드 시작...')
              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
              const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
              
              if (!supabaseUrl || !supabaseAnonKey) {
                throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
              }
              
              const supabase = createClient(supabaseUrl, supabaseAnonKey)
              
              const fileName = `${savedResultId}.pdf`
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('pdfs')
                .upload(fileName, pdfBlob, {
                  cacheControl: '3600',
                  upsert: true,
                  contentType: 'application/pdf'
                })
              
              if (uploadError) {
                console.error('Supabase PDF 업로드 에러:', uploadError)
                throw new Error(uploadError.message || 'PDF 업로드에 실패했습니다.')
              }
              
              // 공개 URL 생성
              const { data: urlData } = supabase.storage
                .from('pdfs')
                .getPublicUrl(fileName)
              
              console.log('=== 클라이언트 사이드 PDF 생성 및 업로드 성공 ===')
              console.log('PDF URL:', urlData.publicUrl)
              console.log('PDF 경로:', fileName)
              
              // temp_requests 데이터 삭제 (realtime 모드에서 사용한 경우)
              const currentRequestKey = requestKey
              if (currentRequestKey) {
                try {
                  const deleteResponse = await fetch(`/api/temp-request/delete?requestKey=${currentRequestKey}`, {
                    method: 'DELETE'
                  })
                  if (deleteResponse.ok) {
                    console.log('temp_requests 데이터 삭제 완료:', currentRequestKey)
                  } else {
                    console.warn('temp_requests 삭제 실패:', await deleteResponse.text())
                  }
                } catch (deleteError) {
                  console.warn('temp_requests 삭제 실패 (무시):', deleteError)
                }
              }
            } catch (pdfError) {
              console.error('=== PDF 생성/업로드 실패 ===')
              console.error('에러 타입:', typeof pdfError)
              console.error('에러 메시지:', pdfError instanceof Error ? pdfError.message : String(pdfError))
              console.error('에러 스택:', pdfError instanceof Error ? pdfError.stack : 'N/A')
              console.error('전체 에러 객체:', pdfError)
              // PDF 생성 실패해도 저장은 성공한 것으로 처리 (사용자에게 알리지 않음)
            }
          }
          
          // 백그라운드에서도 실행되도록 보장
          // html2canvas는 백그라운드에서도 작동하므로 즉시 실행
          // visibilitychange 이벤트로 페이지 전환을 추적하되, 실행은 계속 진행
          let isGenerating = false
          let generationPromise: Promise<void> | null = null
          
          const startGeneration = async () => {
            if (isGenerating) {
              console.log('PDF 생성이 이미 진행 중입니다.')
              return generationPromise
            }
            isGenerating = true
            console.log('PDF 생성 시작 (백그라운드 지원)')
            
            generationPromise = generatePdfInBackground().finally(() => {
              isGenerating = false
              generationPromise = null
            })
            
            return generationPromise
          }
          
          // visibilitychange 이벤트 리스너 추가 (백그라운드에서도 계속 실행 보장)
          const visibilityHandler = () => {
            if (document.hidden) {
              console.log('페이지가 백그라운드로 전환됨, PDF 생성은 계속 진행됩니다.')
            } else {
              console.log('페이지가 다시 보이게 됨, PDF 생성 상태 확인')
            }
          }
          document.addEventListener('visibilitychange', visibilityHandler)
          
          // 즉시 시작 (비동기로 실행, await하지 않음)
          // 백그라운드로 가도 계속 실행됨
          startGeneration().catch((err) => {
            console.error('PDF 생성 시작 실패:', err)
            document.removeEventListener('visibilitychange', visibilityHandler)
          }).then(() => {
            // 완료 후 리스너 제거
            document.removeEventListener('visibilitychange', visibilityHandler)
          })
        } else {
          console.warn('=== PDF 생성 건너뜀 ===')
          console.warn('savedResultId:', savedResultId)
          console.warn('typeof window:', typeof window)
        }
        
        // 저장된 결과 목록 다시 로드 (DB 동기화를 위해 충분한 시간 대기)
        // DB에 저장 후 인덱싱/캐싱 시간을 고려하여 1.5초 후 조회
        setTimeout(async () => {
          console.log('저장 후 리스트 동기화 시작, 저장된 ID:', savedResultId)
          await loadSavedResults()
          
          // 동기화 후 새로 저장된 항목이 포함되어 있는지 확인
          setSavedResults((prev) => {
            const hasNewItem = prev.some((item: any) => item.id === savedResultId)
            if (!hasNewItem && result.data) {
              console.warn('⚠️ 동기화 후 새로 저장된 항목이 없음, 다시 추가')
              // 새로 저장된 항목이 없으면 다시 추가
              const filtered = prev.filter((item: any) => item.id !== result.data.id)
              return [result.data, ...filtered]
            }
            return prev
          })
          
          console.log('저장 후 리스트 동기화 완료')
        }, 1500)
      } else {
        throw new Error('결과 저장에 실패했습니다.')
      }
    } catch (e) {
      console.error('결과 저장 실패:', e)
      console.error('에러 상세:', e instanceof Error ? e.stack : e)
      if (showAlert) {
        alert('결과 저장에 실패했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
      }
    }
  }, [resultData, loadSavedResults, setSavedResults])

  // 점사 완료 시 자동 저장 - early return 이전에 정의
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    // 이미 자동 저장했으면 건너뛰기
    if (autoSavedRef.current) return
    
    // html 값 가져오기 (resultData에서 직접)
    const htmlContent = resultData?.html || ''
    
    // 점사 완료 조건 확인
    const isCompleted = 
      (fortuneViewMode === 'realtime' && streamingFinished && resultData && htmlContent) ||
      (fortuneViewMode === 'batch' && resultData && htmlContent && !isStreamingActive)
    
    if (isCompleted && resultData && htmlContent) {
      console.log('점사 완료 감지: 자동 저장 시작')
      autoSavedRef.current = true
      saveResultToLocal(false) // alert 없이 자동 저장
    }
  }, [fortuneViewMode, streamingFinished, resultData, isStreamingActive, saveResultToLocal])

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
      return
    }

    const sourceHtml = streamingHtml || resultData?.html
    if (!sourceHtml) {
      setParsedMenus([])
      setTotalSubtitles(0)
      setRevealedCount(0)
      setShowRealtimeLoading(false) // 팝업 없이 바로 화면 유지
      return
    }

    const parser = new DOMParser()
    const doc = parser.parseFromString(sourceHtml, 'text/html')
    const menuSections = Array.from(doc.querySelectorAll('.menu-section'))

    // content.menu_items 가져오기
    const content = resultData?.content
    const menuItems = content?.menu_items || []

    // 썸네일/만세력은 ref 캐시에서 가져오거나 새로 추출 (깜빡임 완전 방지)
    let cursor = 0
    const parsed: ParsedMenu[] = menuSections.map((section, index) => {
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

      // 만세력: 캐시에 있으면 재사용, 없으면 새로 추출 후 캐시에 저장
      let manseHtml: string | undefined = undefined
      if (manseHtmlCacheRef.current.has(index)) {
        manseHtml = manseHtmlCacheRef.current.get(index)
      } else {
        const manseEl = section.querySelector('.manse-ryeok-table')
        if (manseEl) {
          manseHtml = manseEl.outerHTML
          manseHtmlCacheRef.current.set(index, manseHtml)
        }
      }

      const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'))
      
      // content.menu_items에서 해당 메뉴의 subtitles 정보 가져오기
      const currentMenuItem = menuItems[index]
      const menuSubtitles = currentMenuItem?.subtitles || []
      
      const subtitles: ParsedSubtitle[] = subtitleSections.map((sub, subIdx) => {
        // menu_items의 subtitles에서 썸네일 찾기 (순서로 매칭)
        const subtitleThumbnail = menuSubtitles[subIdx]?.thumbnail || ''
        
        return {
          title: sub.querySelector('.subtitle-title')?.textContent?.trim() || '',
          contentHtml: sub.querySelector('.subtitle-content')?.innerHTML || '',
          thumbnail: subtitleThumbnail
        }
      })
      const startIndex = cursor
      cursor += subtitles.length

      return {
        title: titleText,
        subtitles,
        startIndex,
        thumbnailHtml,
        manseHtml,
      }
    })

    // 썸네일/만세력 HTML이 변경되지 않았으면 기존 parsedMenus의 값을 유지 (깜빡임 방지)
    setParsedMenus((prevParsedMenus) => {
      // 첫 번째 파싱이거나 메뉴 개수가 변경된 경우 새로 설정
      if (prevParsedMenus.length === 0 || prevParsedMenus.length !== parsed.length) {
        return parsed
      }

      // 기존 parsedMenus와 새로 파싱한 parsed를 비교하여 썸네일/만세력 HTML 유지
      const updated = parsed.map((newMenu, index) => {
        const prevMenu = prevParsedMenus[index]
        // 썸네일 HTML이 캐시에 있고 기존과 동일하면 기존 값 유지 (객체 참조 유지로 리렌더링 방지)
        if (prevMenu && prevMenu.thumbnailHtml && thumbnailHtmlCacheRef.current.has(index)) {
          const cachedThumbnail = thumbnailHtmlCacheRef.current.get(index)
          if (cachedThumbnail === prevMenu.thumbnailHtml) {
            newMenu.thumbnailHtml = prevMenu.thumbnailHtml
          }
        }
        // 만세력 HTML이 캐시에 있고 기존과 동일하면 기존 값 유지
        if (prevMenu && prevMenu.manseHtml && manseHtmlCacheRef.current.has(index)) {
          const cachedManse = manseHtmlCacheRef.current.get(index)
          if (cachedManse === prevMenu.manseHtml) {
            newMenu.manseHtml = prevMenu.manseHtml
          }
        }
        return newMenu
      })
      
      return updated
    })
    setTotalSubtitles(cursor)

    // 소제목별 단위로 한 번에 표시:
    // - 스트리밍 중: 항상 마지막 소제목 하나는 "점사중입니다..." 상태로 숨김
    // - 스트리밍 완료: 모든 소제목을 한 번에 표시
    let revealed = 0
    if (cursor === 0) {
      revealed = 0
    } else if (streamingFinished || !isStreamingActive) {
      revealed = cursor
    } else {
      revealed = Math.max(0, cursor - 1)
    }
    setRevealedCount(revealed)

    // 첫 번째 소제목이 "점사를 준비중입니다." 상태로라도 화면에 표시되는 순간(=cursor > 0)에
    // 진행률을 100%로 설정하고 500ms 후 팝업 닫기
    if (!firstSubtitleReadyRef.current && cursor > 0) {
      setFirstSubtitleReady(true)
      setStreamingProgress(100)
      // 500ms 후 팝업 닫기
      setTimeout(() => {
        setShowRealtimePopup(false)
      }, 500)
    }
    
    // 두 번째 소제목이 진행될 때 (cursor >= 2) 진행률을 100%로 설정하고 팝업 닫기
    if (cursor >= 2 && showRealtimePopup) {
      setStreamingProgress(100)
      setShowRealtimePopup(false)
    }

    if (cursor > 0) {
      setShowRealtimeLoading(false) // (기존 플래그, 현재는 사용 안 함)
    }
  }, [fortuneViewMode, resultData?.html, streamingHtml, isStreamingActive, streamingFinished])

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

  if (error || !resultData || !resultData.content) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>{error || '결과 데이터가 없습니다.'}</p>
        </div>
      </div>
    )
  }

  // 가드 통과 후 안전 분해
  const content = resultData.content
  const html = resultData.html || ''
  const startTime = resultData.startTime
  const model = resultData.model

  // 모델 이름 표시용
  const modelDisplayName = model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' : model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : model || 'Unknown'

  // 경과 시간 계산 (로깅용)
  const elapsedTime = startTime ? Date.now() - startTime : 0

  console.log('결과 페이지: 데이터 분석 시작')
  console.log('결과 페이지: 경과 시간:', currentTime, `(${elapsedTime}ms)`)
  console.log('결과 페이지: HTML 길이:', html?.length)

  // 폰트 크기 설정 (관리자 페이지에서 설정한 값 사용)
  const menuFontSize = content?.menu_font_size || 16
  const subtitleFontSize = content?.subtitle_font_size || 14
  const bodyFontSize = content?.body_font_size || 11
  
  // 웹폰트 설정 (관리자 페이지에서 설정한 값 사용)
  const fontFace = content?.font_face || ''
  
  // 디버깅: font_face 확인
  console.log('결과 페이지: content 객체:', content)
  console.log('결과 페이지: font_face 값:', fontFace)
  
  // @font-face에서 font-family 추출
  const extractFontFamily = (fontFaceCss: string): string | null => {
    if (!fontFaceCss) {
      console.log('결과 페이지: fontFaceCss가 비어있음')
      return null
    }
    // 여러 패턴 지원: font-family: 'FontName' 또는 font-family: FontName
    const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
    if (match) {
      const fontFamily = (match[1] || match[2]?.trim()) || null
      console.log('결과 페이지: 추출된 font-family:', fontFamily)
      return fontFamily
    }
    console.log('결과 페이지: font-family 추출 실패')
    return null
  }
  
  const fontFamilyName = extractFontFamily(fontFace)
  console.log('결과 페이지: 최종 fontFamilyName:', fontFamilyName)

  // 동적 스타일 생성
  const dynamicStyles = `
    ${fontFace ? fontFace : ''}
    ${fontFamilyName ? `
    .result-title {
      font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
    }
    .jeminai-results {
      font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
    }
    .jeminai-results * {
      font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
    }
    ` : ''}
    .jeminai-results .menu-title {
      font-size: ${menuFontSize}px !important;
    }
    .jeminai-results .subtitle-title {
      font-size: ${subtitleFontSize}px !important;
    }
    .jeminai-results .subtitle-content {
      font-size: ${bodyFontSize}px !important;
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
  `

  // 모델 이름 표시용 (실제 값으로 덮어쓰기)
  const resolvedModelDisplayName = model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' : model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : model || 'Unknown'

  // 경과 시간 계산 (실제 값으로 덮어쓰기)
  const resolvedElapsedTime = startTime ? Date.now() - startTime : 0

  // HTML에서 텍스트 추출 (태그 제거, 테이블 제외)
  const extractTextFromHtml = (htmlString: string): string => {
    if (typeof window === 'undefined') return ''
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlString
    
    // 테이블 요소 제거 (manse-ryeok-table 클래스를 가진 테이블 및 모든 table 요소)
    const tables = tempDiv.querySelectorAll('table, .manse-ryeok-table')
    tables.forEach(table => table.remove())
    
    return tempDiv.textContent || tempDiv.innerText || ''
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
      
      // HTML에서 텍스트 추출
      const textContent = extractTextFromHtml(html)
      
      if (!textContent.trim()) {
        alert('읽을 내용이 없습니다.')
        setIsPlaying(false)
        return
      }

      // 컨텐츠에서 화자 정보 가져오기 (app_settings의 선택된 화자 우선 사용)
      let speaker = 'nara' // 기본값
      
      // 1. 먼저 app_settings에서 선택된 화자 확인
      try {
        const selectedSpeaker = await getSelectedSpeaker()
        console.log('결과 페이지: app_settings에서 선택된 화자:', selectedSpeaker)
        speaker = selectedSpeaker
      } catch (error) {
        console.error('결과 페이지: app_settings에서 화자 조회 실패:', error)
      }
      
      // 2. content.id가 있으면 Supabase에서 컨텐츠의 tts_speaker도 확인
      if (content?.id) {
        try {
          console.log('결과 페이지: Supabase에서 컨텐츠 정보 조회 중, content.id:', content.id)
          const freshContent = await getContentById(content.id)
          console.log('결과 페이지: 컨텐츠의 tts_speaker:', freshContent?.tts_speaker)
          
          // 컨텐츠에 tts_speaker가 있고 'nara'가 아니면 사용 (컨텐츠별 설정이 우선)
          if (freshContent?.tts_speaker && freshContent.tts_speaker !== 'nara') {
            speaker = freshContent.tts_speaker
            console.log('결과 페이지: 컨텐츠의 tts_speaker 사용:', speaker)
          } else {
            console.log('결과 페이지: 컨텐츠의 tts_speaker가 없거나 nara이므로 app_settings의 화자 사용:', speaker)
          }
          
          // content 객체 업데이트
          if (freshContent?.tts_speaker) {
            content.tts_speaker = freshContent.tts_speaker
          }
        } catch (error) {
          console.error('결과 페이지: Supabase에서 컨텐츠 조회 실패:', error)
        }
      } else {
        // content.id가 없으면 app_settings의 화자 사용
        console.log('결과 페이지: content.id가 없어서 app_settings의 화자 사용:', speaker)
      }
      
      console.log('결과 페이지: 현재 content 객체:', content)
      console.log('결과 페이지: content의 tts_speaker:', content?.tts_speaker)
      console.log('결과 페이지: 최종 사용할 화자:', speaker)

      // 텍스트를 2000자 단위로 분할
      const maxLength = 2000
      const chunks = splitTextIntoChunks(textContent, maxLength)
      
      console.log(`음성 변환 시작, 전체 텍스트 길이: ${textContent.length}자, 청크 수: ${chunks.length}, 화자: ${speaker}`)

      // 다음 청크를 미리 로드하는 함수
      const preloadNextChunk = async (chunkIndex: number): Promise<{ url: string; audio: HTMLAudioElement } | null> => {
        if (chunkIndex >= chunks.length || shouldStopRef.current) {
          return null
        }

        try {
          const chunk = chunks[chunkIndex]
          console.log(`청크 ${chunkIndex + 1}/${chunks.length} 미리 로드 중, 길이: ${chunk.length}자`)

          // TTS API 호출 (화자 정보 포함)
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker }),
          })

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
              console.error(`청크 ${chunkIndex + 1} 오디오 로드 에러:`, e)
              reject(new Error(`청크 ${chunkIndex + 1} 로드 실패`))
            }
            audio.load()
          })

          console.log(`청크 ${chunkIndex + 1} 미리 로드 완료`)
          return { url, audio }
        } catch (error) {
          console.error(`청크 ${chunkIndex + 1} 미리 로드 실패:`, error)
          return null
        }
      }

      // 각 청크를 순차적으로 재생 (다음 청크는 미리 로드)
      let preloadedChunk: { url: string; audio: HTMLAudioElement } | null = null

      for (let i = 0; i < chunks.length; i++) {
        // 중지 플래그 확인 (ref로 실시간 확인)
        if (shouldStopRef.current) {
          console.log('재생 중지됨')
          if (preloadedChunk) {
            URL.revokeObjectURL(preloadedChunk.url)
          }
          break
        }

        const chunk = chunks[i]
        console.log(`청크 ${i + 1}/${chunks.length} 재생 시작, 길이: ${chunk.length}자`)

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
          console.log(`청크 ${i + 1} 미리 로드된 오디오 사용`)
        } else {
          // 첫 번째 청크이거나 미리 로드 실패한 경우 즉시 요청
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker }),
          })

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
            console.error(`청크 ${i + 1} 재생 타임아웃`)
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
            console.log(`청크 ${i + 1} 재생 완료`)
            cleanup()
            resolve()
          }
          
          currentAudio.onerror = (e) => {
            console.error(`청크 ${i + 1} 재생 중 오류:`, e, currentAudio.error)
            cleanup()
            // 에러가 발생해도 다음 청크로 계속 진행하도록 resolve (reject 대신)
            console.warn(`청크 ${i + 1} 재생 실패, 다음 청크로 진행`)
            resolve()
          }
          
          currentAudio.onpause = () => {
            // 사용자가 일시정지하거나 페이지가 비활성화된 경우
            if (document.hidden || shouldStopRef.current) {
              cleanup()
              setIsPlaying(false)
            }
          }
          
          currentAudio.play().catch((err) => {
            console.error(`청크 ${i + 1} play() 실패:`, err)
            cleanup()
            // play 실패해도 다음 청크로 계속 진행
            console.warn(`청크 ${i + 1} play 실패, 다음 청크로 진행`)
            resolve()
          })
        })

        // 다음 청크 미리 로드 완료 대기 및 저장
        if (i < chunks.length - 1) {
          try {
            preloadedChunk = await nextChunkPromise
            if (preloadedChunk) {
              console.log(`청크 ${i + 2} 미리 로드 완료`)
            } else {
              console.warn(`청크 ${i + 2} 미리 로드 실패 (null 반환)`)
            }
          } catch (err) {
            console.error(`청크 ${i + 2} 미리 로드 중 에러:`, err)
            preloadedChunk = null
          }
        }

        // 중지 플래그 재확인
        if (shouldStopRef.current) {
          console.log('재생 중지됨 (재생 후)')
          if (preloadedChunk) {
            URL.revokeObjectURL(preloadedChunk.url)
          }
          break
        }
      }

      if (!shouldStopRef.current) {
        console.log('모든 청크 재생 완료')
      } else {
        console.log('재생이 중지되었습니다')
      }
      setIsPlaying(false)
      currentAudioRef.current = null
      setShouldStop(false)
      shouldStopRef.current = false
    } catch (error: any) {
      console.error('음성 변환 실패:', error)
      alert(error?.message || '음성 변환에 실패했습니다.')
      setIsPlaying(false)
      currentAudioRef.current = null
      setShouldStop(false)
    }
  }

  // 저장된 결과 음성으로 듣기 기능 - 청크 단위로 나누어 재생
  const handleSavedResultTextToSpeech = async (savedResult: any) => {
    if (!savedResult.html || playingResultId === savedResult.id) return

    try {
      setPlayingResultId(savedResult.id)
      
      // HTML에서 텍스트 추출
      const textContent = extractTextFromHtml(savedResult.html)
      
      if (!textContent.trim()) {
        alert('읽을 내용이 없습니다.')
        setPlayingResultId(null)
        return
      }

      // 저장된 컨텐츠에서 화자 정보 가져오기 (app_settings의 선택된 화자 우선 사용)
      let speaker = 'nara' // 기본값
      
      // 1. 먼저 app_settings에서 선택된 화자 확인
      try {
        const selectedSpeaker = await getSelectedSpeaker()
        console.log('저장된 결과: app_settings에서 선택된 화자:', selectedSpeaker)
        speaker = selectedSpeaker
      } catch (error) {
        console.error('저장된 결과: app_settings에서 화자 조회 실패:', error)
      }
      
      // 2. content.id가 있으면 Supabase에서 컨텐츠의 tts_speaker도 확인
      if (savedResult.content?.id) {
        try {
          console.log('저장된 결과: Supabase에서 컨텐츠 정보 조회 중, content.id:', savedResult.content.id)
          const freshContent = await getContentById(savedResult.content.id)
          console.log('저장된 결과: 컨텐츠의 tts_speaker:', freshContent?.tts_speaker)
          
          // 컨텐츠에 tts_speaker가 있고 'nara'가 아니면 사용 (컨텐츠별 설정이 우선)
          if (freshContent?.tts_speaker && freshContent.tts_speaker !== 'nara') {
            speaker = freshContent.tts_speaker
            console.log('저장된 결과: 컨텐츠의 tts_speaker 사용:', speaker)
          } else {
            console.log('저장된 결과: 컨텐츠의 tts_speaker가 없거나 nara이므로 app_settings의 화자 사용:', speaker)
          }
          
          // savedResult.content 객체 업데이트
          if (freshContent?.tts_speaker && savedResult.content) {
            savedResult.content.tts_speaker = freshContent.tts_speaker
          }
        } catch (error) {
          console.error('저장된 결과: Supabase에서 컨텐츠 조회 실패:', error)
        }
      } else {
        // content.id가 없으면 app_settings의 화자 사용
        console.log('저장된 결과: content.id가 없어서 app_settings의 화자 사용:', speaker)
      }
      
      console.log('저장된 결과의 content 객체:', savedResult.content)
      console.log('저장된 결과의 tts_speaker:', savedResult.content?.tts_speaker)
      console.log('저장된 결과: 최종 사용할 화자:', speaker)

      // 텍스트를 2000자 단위로 분할
      const maxLength = 2000
      const chunks = splitTextIntoChunks(textContent, maxLength)
      
      console.log(`저장된 결과 음성 변환 시작, 전체 텍스트 길이: ${textContent.length}자, 청크 수: ${chunks.length}, 화자: ${speaker}`)

      // 다음 청크를 미리 로드하는 함수
      const preloadNextChunk = async (chunkIndex: number): Promise<{ url: string; audio: HTMLAudioElement } | null> => {
        if (chunkIndex >= chunks.length) {
          return null
        }

        try {
          const chunk = chunks[chunkIndex]
          console.log(`저장된 결과: 청크 ${chunkIndex + 1}/${chunks.length} 미리 로드 중, 길이: ${chunk.length}자`)

          // TTS API 호출 (화자 정보 포함)
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker }),
          })

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
              console.error(`저장된 결과: 청크 ${chunkIndex + 1} 오디오 로드 에러:`, e)
              reject(new Error(`청크 ${chunkIndex + 1} 로드 실패`))
            }
            audio.load()
          })

          console.log(`저장된 결과: 청크 ${chunkIndex + 1} 미리 로드 완료`)
          return { url, audio }
        } catch (error) {
          console.error(`저장된 결과: 청크 ${chunkIndex + 1} 미리 로드 실패:`, error)
          return null
        }
      }

      // 각 청크를 순차적으로 재생 (다음 청크는 미리 로드)
      let preloadedChunk: { url: string; audio: HTMLAudioElement } | null = null

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        console.log(`저장된 결과: 청크 ${i + 1}/${chunks.length} 재생 시작, 길이: ${chunk.length}자`)

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
          console.log(`저장된 결과: 청크 ${i + 1} 미리 로드된 오디오 사용`)
        } else {
          // 첫 번째 청크이거나 미리 로드 실패한 경우 즉시 요청
          const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: chunk, speaker }),
          })

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
            console.error(`저장된 결과: 청크 ${i + 1} 재생 타임아웃`)
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
            console.log(`저장된 결과: 청크 ${i + 1} 재생 완료`)
            cleanup()
            resolve()
          }
          
          currentAudio.onerror = (e) => {
            console.error(`저장된 결과: 청크 ${i + 1} 재생 중 오류:`, e, currentAudio.error)
            cleanup()
            // 에러가 발생해도 다음 청크로 계속 진행
            console.warn(`저장된 결과: 청크 ${i + 1} 재생 실패, 다음 청크로 진행`)
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
            console.error(`저장된 결과: 청크 ${i + 1} play() 실패:`, err)
            cleanup()
            // play 실패해도 다음 청크로 계속 진행
            console.warn(`저장된 결과: 청크 ${i + 1} play 실패, 다음 청크로 진행`)
            resolve()
          })
        })

        // 다음 청크 미리 로드 완료 대기 및 저장
        if (i < chunks.length - 1) {
          try {
            preloadedChunk = await nextChunkPromise
            if (preloadedChunk) {
              console.log(`저장된 결과: 청크 ${i + 2} 미리 로드 완료`)
            } else {
              console.warn(`저장된 결과: 청크 ${i + 2} 미리 로드 실패 (null 반환)`)
            }
          } catch (err) {
            console.error(`저장된 결과: 청크 ${i + 2} 미리 로드 중 에러:`, err)
            preloadedChunk = null
          }
        }
      }

      console.log('저장된 결과: 모든 청크 재생 완료')
      setPlayingResultId(null)
      currentAudioRef.current = null
    } catch (error: any) {
      console.error('저장된 결과 음성 변환 실패:', error)
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
      console.error('저장된 결과 삭제 실패:', e)
      alert('저장된 결과 삭제에 실패했습니다.')
    }
  }

  // 저장된 결과 보기
  const viewSavedResult = (resultId: string) => {
    console.log('=== viewSavedResult 함수 실행 시작 ===', resultId)
    if (typeof window === 'undefined') return
    
    try {
      const saved = savedResults.find((r: any) => r.id === resultId)
      console.log('저장된 결과 찾기:', saved ? '찾음' : '없음')
      
      if (saved) {
        console.log('저장된 결과 원본:', saved)
        // content가 문자열인 경우 파싱
        let contentObj = saved.content
        console.log('저장된 결과 content 타입:', typeof saved.content)
        if (typeof saved.content === 'string') {
          try {
            contentObj = JSON.parse(saved.content)
            console.log('content 파싱 성공:', contentObj)
          } catch (e) {
            console.error('content 파싱 실패:', e)
            contentObj = saved.content
          }
        } else {
          console.log('content는 이미 객체:', contentObj)
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
        
        // 소제목 썸네일 추가 (저장된 결과) - batch 모드와 동일한 방식
        const menuItems = contentObj?.menu_items || []
        console.log('=== 저장된 결과: 소제목 썸네일 추가 시작 ===')
        console.log('저장된 결과: contentObj:', contentObj)
        console.log('저장된 결과: contentObj 타입:', typeof contentObj)
        console.log('저장된 결과: menuItems:', menuItems)
        console.log('저장된 결과: menuItems.length:', menuItems.length)
        console.log('저장된 결과: htmlContent 길이:', htmlContent?.length || 0)
        
        if (menuItems.length > 0 && htmlContent) {
          try {
            // ** 제거는 DOMParser 전에 처리
            let processedHtml = htmlContent.replace(/\*\*/g, '')
            
            const parser = new DOMParser()
            const doc = parser.parseFromString(processedHtml, 'text/html')
            const menuSections = Array.from(doc.querySelectorAll('.menu-section'))
            
            console.log('저장된 결과: menuSections.length:', menuSections.length)
            
            menuSections.forEach((section, menuIndex) => {
              const menuItem = menuItems[menuIndex]
              console.log(`저장된 결과: menu[${menuIndex}]:`, menuItem)
              if (menuItem?.subtitles) {
                console.log(`저장된 결과: menu[${menuIndex}] subtitles:`, menuItem.subtitles)
                const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'))
                console.log(`저장된 결과: menu[${menuIndex}] subtitleSections.length:`, subtitleSections.length)
                subtitleSections.forEach((subSection, subIndex) => {
                  const subtitle = menuItem.subtitles[subIndex]
                  console.log(`저장된 결과: menu[${menuIndex}] subtitle[${subIndex}]:`, subtitle)
                  if (subtitle?.thumbnail) {
                    console.log(`저장된 결과: menu[${menuIndex}] subtitle[${subIndex}] thumbnail:`, subtitle.thumbnail)
                    const titleDiv = subSection.querySelector('.subtitle-title')
                    if (titleDiv) {
                      const thumbnailImg = doc.createElement('div')
                      thumbnailImg.className = 'subtitle-thumbnail-container'
                      thumbnailImg.style.cssText = 'display: flex; justify-content: center; width: 50%; margin-left: auto; margin-right: auto;'
                      thumbnailImg.innerHTML = `<img src="${subtitle.thumbnail}" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" />`
                      titleDiv.parentNode?.insertBefore(thumbnailImg, titleDiv.nextSibling)
                      console.log(`저장된 결과: 썸네일 추가 완료 - menu[${menuIndex}] subtitle[${subIndex}]`)
                    } else {
                      console.warn(`저장된 결과: .subtitle-title을 찾을 수 없음 - menu[${menuIndex}] subtitle[${subIndex}]`)
                    }
                  } else {
                    console.log(`저장된 결과: 썸네일 없음 - menu[${menuIndex}] subtitle[${subIndex}]`)
                  }
                })
              } else {
                console.log(`저장된 결과: menu[${menuIndex}]에 subtitles 없음`)
              }
            })
            
            processedHtml = doc.documentElement.outerHTML
            // DOMParser가 추가한 html, body 태그 제거
            const bodyMatch = processedHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i)
            if (bodyMatch) {
              processedHtml = bodyMatch[1]
            }
            
            htmlContent = processedHtml
            console.log('저장된 결과: 소제목 썸네일 추가 완료, htmlContent 길이:', htmlContent.length)
            console.log('저장된 결과: htmlContent에 썸네일 포함 여부:', htmlContent.includes('subtitle-thumbnail-container'))
            // 썸네일이 실제로 추가되었는지 확인
            const thumbnailCount = (htmlContent.match(/subtitle-thumbnail-container/g) || []).length
            console.log('저장된 결과: 추가된 썸네일 개수:', thumbnailCount)
          } catch (e) {
            console.error('소제목 썸네일 추가 실패:', e)
            console.error('에러 스택:', e instanceof Error ? e.stack : '')
          }
        } else {
          console.log('저장된 결과: menuItems가 없거나 htmlContent가 비어있음', { menuItemsLength: menuItems.length, hasHtmlContent: !!htmlContent })
          // ** 제거는 여기서도 처리
          if (htmlContent) {
            htmlContent = htmlContent.replace(/\*\*/g, '')
          }
        }
        
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
                .thumbnail-container {
                  width: 100%;
                  margin-bottom: 16px;
                }
                .thumbnail-container img {
                  width: 100%;
                  height: auto;
                  object-fit: cover;
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
                .subtitle-section {
                  padding-top: 24px;
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
                .subtitle-thumbnail-container {
                  display: flex;
                  justify-content: center;
                  width: 50%;
                  margin-left: auto;
                  margin-right: auto;
                  margin-top: 8px;
                  margin-bottom: 8px;
                }
                .subtitle-thumbnail-container img {
                  width: 100%;
                  height: auto;
                  display: block;
                  border-radius: 8px;
                  object-fit: contain;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="title-container">
                  <h1>${saved.title}</h1>
                </div>
                ${contentObj?.thumbnail_url ? `
                <div class="thumbnail-container">
                  <img src="${contentObj.thumbnail_url}" alt="${saved.title}" />
                </div>
                ` : ''}
                <div class="tts-button-container">
                  <button id="ttsButton" class="tts-button">
                    <span id="ttsIcon">🔊</span>
                    <span id="ttsText">점사 듣기</span>
                  </button>
                </div>
                <div id="contentHtml">${(() => {
                  // htmlContent를 안전하게 이스케이프하여 템플릿 리터럴에 삽입
                  try {
                    let safeHtml = htmlContent || '';
                    // 템플릿 리터럴 특수 문자 이스케이프
                    safeHtml = safeHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                    return safeHtml;
                  } catch (e) {
                    console.error('HTML 이스케이프 실패:', e);
                    return '';
                  }
                })()}</div>
              </div>
              
              <script>
                // 저장된 컨텐츠의 화자 정보를 전역 변수로 설정 (초기값)
                console.log('=== 새 창: 페이지 로드 ===');
                let contentObj;
                try {
                  contentObj = ${contentObjJson};
                  console.log('새 창: contentObj 파싱 성공:', contentObj);
                } catch (e) {
                  console.error('새 창: contentObj 파싱 실패:', e);
                  contentObj = {};
                }
                console.log('저장된 content 객체:', contentObj);
                console.log('저장된 content.id:', contentObj?.id ? contentObj.id : 'null');
                console.log('저장된 content.tts_speaker:', contentObj?.tts_speaker ? contentObj.tts_speaker : '없음');
                console.log('저장된 content.font_face:', contentObj?.font_face || '없음');
                
                window.savedContentSpeaker = ${contentObj?.tts_speaker ? `'${contentObj.tts_speaker.replace(/'/g, "\\'")}'` : "'nara'"};
                window.savedContentId = ${contentObj?.id ? contentObj.id : 'null'};
                
                console.log('초기 window.savedContentSpeaker:', window.savedContentSpeaker);
                console.log('초기 window.savedContentId:', window.savedContentId);
                
                // content.id가 있으면 Supabase에서 최신 화자 정보 조회
                if (window.savedContentId) {
                  console.log('새 창: 페이지 로드 시 Supabase에서 화자 정보 조회 시작');
                  console.log('  - API URL: /api/content/' + window.savedContentId);
                  
                  fetch('/api/content/' + window.savedContentId)
                    .then(response => {
                      console.log('  - 페이지 로드 시 API 응답 상태:', response.status, response.statusText);
                      return response.json();
                    })
                    .then(data => {
                      console.log('  - 페이지 로드 시 API 응답 데이터:', data);
                      console.log('  - 페이지 로드 시 API 응답의 tts_speaker:', data.tts_speaker);
                      if (data.tts_speaker) {
                        window.savedContentSpeaker = data.tts_speaker;
                        console.log('  - 페이지 로드 시 Supabase에서 조회한 화자:', data.tts_speaker);
                      } else {
                        console.warn('  - 페이지 로드 시 API 응답에 tts_speaker가 없음');
                      }
                    })
                    .catch(error => {
                      console.error('새 창: 페이지 로드 시 Supabase에서 화자 조회 실패:', error);
                    });
                } else {
                  console.log('새 창: window.savedContentId가 없어서 페이지 로드 시 Supabase 조회 건너뜀');
                }
                console.log('==============================');
                
                let isPlaying = false;
                let currentAudio = null;
                let shouldStop = false;
                
                // 오디오 중지 함수 (여러 곳에서 재사용)
                function stopAndResetAudio() {
                  console.log('새 창: 오디오 중지 요청');
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
                    console.log('새 창: 페이지 숨김 감지, 오디오 중지');
                    stopAndResetAudio();
                  }
                });

                // 브라우저 뒤로 가기/앞으로 가기 시 음성 재생 중지
                window.addEventListener('popstate', function(e) {
                  console.log('새 창: popstate 이벤트 감지 (뒤로가기/앞으로가기), 오디오 중지', e);
                  stopAndResetAudio();
                }, true); // 캡처링 단계에서 처리

                // 페이지 언로드 시 음성 재생 중지
                window.addEventListener('beforeunload', function() {
                  console.log('새 창: beforeunload 이벤트 감지, 오디오 중지');
                  stopAndResetAudio();
                });

                // HTML에서 텍스트 추출 (테이블 제외)
                function extractTextFromHtml(htmlString) {
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = htmlString;
                  
                  // 테이블 요소 제거 (manse-ryeok-table 클래스를 가진 테이블 및 모든 table 요소)
                  const tables = tempDiv.querySelectorAll('table, .manse-ryeok-table');
                  tables.forEach(function(table) {
                    table.remove();
                  });
                  
                  return tempDiv.textContent || tempDiv.innerText || '';
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
                  console.log('=== handleTextToSpeech 함수 호출됨 ===');
                  
                  try {
                    // 재생 중이면 중지
                    if (isPlaying) {
                      console.log('이미 재생 중이므로 중지');
                      stopTextToSpeech();
                      return;
                    }

                    const contentHtmlEl = document.getElementById('contentHtml');
                    if (!contentHtmlEl) {
                      console.error('contentHtml 요소를 찾을 수 없습니다.');
                      alert('콘텐츠를 찾을 수 없습니다.');
                      return;
                    }
                    
                    const contentHtml = contentHtmlEl.innerHTML;
                    console.log('contentHtml 길이:', contentHtml.length);
                    
                    const textContent = extractTextFromHtml(contentHtml);
                    console.log('추출된 텍스트 길이:', textContent.length);

                    if (!textContent.trim()) {
                      alert('읽을 내용이 없습니다.');
                      return;
                    }

                    // 화자 정보 가져오기 (항상 Supabase에서 최신 정보 확인)
                    console.log('=== 새 창: 음성으로 듣기 시작 ===');
                    console.log('초기 window.savedContentSpeaker:', window.savedContentSpeaker);
                    console.log('초기 window.savedContentId:', window.savedContentId);
                    
                    let speaker = window.savedContentSpeaker || 'nara';
                    console.log('초기 speaker 값:', speaker);
                    
                    // content.id가 있으면 Supabase에서 최신 화자 정보 조회
                    if (window.savedContentId) {
                      try {
                        console.log('새 창: Supabase에서 화자 정보 조회 시작');
                        console.log('  - API URL: /api/content/' + window.savedContentId);
                        console.log('  - content.id:', window.savedContentId);
                        
                        const response = await fetch('/api/content/' + window.savedContentId);
                        console.log('  - API 응답 상태:', response.status, response.statusText);
                        
                        if (!response.ok) {
                          const errorText = await response.text();
                          console.error('  - API 응답 에러:', errorText);
                          throw new Error('API 응답 실패: ' + response.status);
                        }
                        
                        const data = await response.json();
                        console.log('  - API 응답 데이터:', data);
                        console.log('  - API 응답의 tts_speaker:', data.tts_speaker);
                        
                        if (data.tts_speaker) {
                          speaker = data.tts_speaker;
                          window.savedContentSpeaker = speaker; // 전역 변수 업데이트
                          console.log('  - Supabase에서 조회한 화자:', speaker);
                        } else {
                          console.warn('  - API 응답에 tts_speaker가 없음, 기존 값 사용:', speaker);
                        }
                      } catch (error) {
                        console.error('새 창: Supabase에서 화자 조회 실패:', error);
                        console.error('  - 에러 상세:', error);
                        // 조회 실패 시 기존 값 사용
                        speaker = window.savedContentSpeaker || 'nara';
                        console.log('  - 조회 실패로 인한 기존 값 사용:', speaker);
                      }
                    } else {
                      console.log('새 창: window.savedContentId가 없어서 Supabase 조회 건너뜀');
                      console.log('  - 기존 window.savedContentSpeaker 사용:', speaker);
                    }
                    
                    console.log('새 창: 최종 사용할 화자:', speaker);
                    console.log('==============================');

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
                    
                    console.log('음성 변환 시작, 전체 텍스트 길이:', textContent.length, '자, 청크 수:', chunks.length, ', 화자:', speaker);

                    // 다음 청크를 미리 로드하는 함수
                    const preloadNextChunk = async (chunkIndex) => {
                      if (chunkIndex >= chunks.length || shouldStop) {
                        return null;
                      }

                      try {
                        const chunk = chunks[chunkIndex];
                        console.log('새 창: 청크', chunkIndex + 1, '/', chunks.length, '미리 로드 중, 길이:', chunk.length, '자');

                        // TTS API 호출 (화자 정보 포함)
                        const response = await fetch('/api/tts', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ text: chunk, speaker }),
                        });

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
                            console.error('새 창: 청크 ' + (chunkIndex + 1) + ' 오디오 로드 에러:', e);
                            reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 실패'));
                          };
                          audio.load();
                        });

                        console.log('새 창: 청크', chunkIndex + 1, '미리 로드 완료');
                        return { url, audio };
                      } catch (error) {
                        console.error('새 창: 청크', chunkIndex + 1, '미리 로드 실패:', error);
                        return null;
                      }
                    };

                    // 각 청크를 순차적으로 재생 (다음 청크는 미리 로드)
                    let preloadedChunk = null;

                    for (let i = 0; i < chunks.length; i++) {
                      // 중지 플래그 확인
                      if (shouldStop) {
                        console.log('재생 중지됨');
                        if (preloadedChunk) {
                          URL.revokeObjectURL(preloadedChunk.url);
                        }
                        break;
                      }

                      const chunk = chunks[i];
                      console.log('새 창: 청크', i + 1, '/', chunks.length, '재생 시작, 길이:', chunk.length, '자');

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
                        console.log('새 창: 청크', i + 1, '미리 로드된 오디오 사용');
                      } else {
                        // 첫 번째 청크이거나 미리 로드 실패한 경우 즉시 요청
                        console.log('새 창: TTS API 호출 전 화자 확인');
                        console.log('  - window.savedContentSpeaker:', window.savedContentSpeaker);
                        console.log('  - 사용할 speaker 변수:', speaker);
                        console.log('  - API 요청 body (일부):', JSON.stringify({ text: chunk.substring(0, 50) + '...', speaker }));
                        
                        const response = await fetch('/api/tts', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({ text: chunk, speaker }),
                        });
                        
                        console.log('새 창: TTS API 응답 상태:', response.status);

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
                          console.error('새 창: 청크 ' + (i + 1) + ' 재생 타임아웃');
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
                          console.log('새 창: 청크 ' + (i + 1) + ' 재생 완료');
                          cleanup();
                          resolve();
                        };
                        
                        currentAudioElement.onerror = function(e) {
                          console.error('새 창: 청크 ' + (i + 1) + ' 재생 중 오류:', e, currentAudioElement.error);
                          cleanup();
                          // 에러가 발생해도 다음 청크로 계속 진행
                          console.warn('새 창: 청크 ' + (i + 1) + ' 재생 실패, 다음 청크로 진행');
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
                          console.error('새 창: 청크 ' + (i + 1) + ' play() 실패:', err);
                          cleanup();
                          // play 실패해도 다음 청크로 계속 진행
                          console.warn('새 창: 청크 ' + (i + 1) + ' play 실패, 다음 청크로 진행');
                          resolve();
                        });
                      });

                      // 다음 청크 미리 로드 완료 대기 및 저장
                      if (i < chunks.length - 1) {
                        try {
                          preloadedChunk = await nextChunkPromise;
                          if (preloadedChunk) {
                            console.log('새 창: 청크 ' + (i + 2) + ' 미리 로드 완료');
                          } else {
                            console.warn('새 창: 청크 ' + (i + 2) + ' 미리 로드 실패 (null 반환)');
                          }
                        } catch (err) {
                          console.error('새 창: 청크 ' + (i + 2) + ' 미리 로드 중 에러:', err);
                          preloadedChunk = null;
                        }
                      }

                      // 중지 플래그 재확인
                      if (shouldStop) {
                        console.log('재생 중지됨 (재생 후)');
                        if (preloadedChunk) {
                          URL.revokeObjectURL(preloadedChunk.url);
                        }
                        break;
                      }
                    }

                    if (!shouldStop) {
                      console.log('새 창: 모든 청크 재생 완료');
                    } else {
                      console.log('새 창: 재생이 중지되었습니다');
                    }
                    isPlaying = false;
                    shouldStop = false;
                    button.disabled = false;
                    icon.textContent = '🔊';
                    text.textContent = '점사 듣기';
                  } catch (error) {
                    console.error('=== 음성 변환 실패 ===');
                    console.error('에러 객체:', error);
                    console.error('에러 메시지:', error?.message);
                    console.error('에러 스택:', error?.stack);
                    console.error('===================');
                    
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
                      console.error('버튼 요소를 찾을 수 없습니다.');
                    }
                  }
                }
                
                // 함수를 전역 스코프에 명시적으로 할당 (onclick 핸들러가 작동하도록)
                window.handleTextToSpeech = handleTextToSpeech;
                console.log('handleTextToSpeech 함수를 전역 스코프에 할당 완료');
                
                // 버튼에 이벤트 리스너 연결
                function connectTTSButton() {
                  const ttsButton = document.getElementById('ttsButton');
                  if (ttsButton) {
                    console.log('TTS 버튼 발견, 이벤트 리스너 추가');
                    // 기존 이벤트 리스너가 있는지 확인하고 제거 (중복 방지)
                    const newHandler = function(e) {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('TTS 버튼 클릭 이벤트 발생');
                      if (typeof handleTextToSpeech === 'function') {
                        handleTextToSpeech();
                      } else if (typeof window.handleTextToSpeech === 'function') {
                        window.handleTextToSpeech();
                      } else {
                        console.error('handleTextToSpeech 함수를 찾을 수 없습니다.');
                        alert('음성 재생 기능을 초기화하는 중 오류가 발생했습니다.');
                      }
                    };
                    
                    // 기존 이벤트 리스너 제거 후 새로 추가
                    ttsButton.removeEventListener('click', newHandler);
                    ttsButton.addEventListener('click', newHandler);
                    console.log('TTS 버튼 이벤트 리스너 연결 완료');
                    return true;
                  } else {
                    console.warn('TTS 버튼을 찾을 수 없습니다.');
                    return false;
                  }
                }
                
                // DOM 로드 후 버튼 연결 시도 (여러 번 재시도)
                function initTTSButton() {
                  let retryCount = 0;
                  const maxRetries = 5;
                  
                  const tryConnect = () => {
                    if (connectTTSButton()) {
                      console.log('TTS 버튼 연결 성공');
                    } else if (retryCount < maxRetries) {
                      retryCount++;
                      console.log('TTS 버튼 연결 재시도:', retryCount);
                      setTimeout(tryConnect, 200 * retryCount);
                    } else {
                      console.error('TTS 버튼 연결 실패: 최대 재시도 횟수 초과');
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
                      console.log('추가 안전장치: 버튼 확인 및 재연결');
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
      console.error('저장된 결과 보기 실패:', e)
      alert('저장된 결과를 불러오는데 실패했습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
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
                    className="bg-gradient-to-r from-pink-500 to-pink-600 h-3 rounded-full transition-all duration-300"
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
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 제목 */}
        <div className="mb-8 text-center">
          <h1 className="result-title text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
            {content?.content_name || '결과 생성 중...'}
          </h1>
          
          {/* 썸네일 */}
          {content?.thumbnail_url && (
            <div className="mb-4 w-full">
              <img 
                src={content.thumbnail_url} 
                alt={content?.content_name || '썸네일'}
                className="w-full h-auto object-cover"
              />
            </div>
          )}
          
          {html && (
            <div className="mb-4 flex justify-center">
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
            </div>
          )}
        </div>

        {/* 결과 출력 */}
        {fortuneViewMode === 'realtime' ? (
          parsedMenus.length > 0 ? (
            <div className="jeminai-results space-y-6">
              {parsedMenus.map((menu, menuIndex) => (
                <div key={`menu-${menuIndex}`} className="menu-section space-y-3">
                  {/* 북커버 썸네일 (첫 번째 대제목 라운드 박스 안, 제목 위) */}
                  {menuIndex === 0 && content?.book_cover_thumbnail && (
                    <div className="book-cover-thumbnail-container w-full mb-10">
                      <img 
                        src={content.book_cover_thumbnail} 
                        alt="북커버 썸네일"
                        className="w-full h-auto"
                        style={{ 
                          objectFit: 'contain', 
                          display: 'block' 
                        }}
                      />
                    </div>
                  )}
                  
                  <div className="menu-title font-bold text-lg text-gray-900">{menu.title}</div>

                  {/* 대제목별 썸네일 */}
                  {menu.thumbnailHtml && (
                    <ThumbnailDisplay html={menu.thumbnailHtml} menuIndex={menuIndex} />
                  )}

                  {/* 첫 번째 대제목 아래 만세력 테이블 (1-1 소제목 준비 이후에만 표시) */}
                  {menuIndex === 0 && menu.manseHtml && firstSubtitleReady && (
                    <div
                      className="mt-4"
                      dangerouslySetInnerHTML={{ __html: menu.manseHtml }}
                    />
                  )}

                  <div className="space-y-4">
                    {menu.subtitles.map((sub, subIndex) => {
                      const globalIndex = menu.startIndex + subIndex
                      const isRevealed = globalIndex < revealedCount
                      return (
                        <div key={`subtitle-${menuIndex}-${subIndex}`} className="subtitle-section space-y-2">
                          {sub.title && (
                            <div className="subtitle-title font-semibold text-gray-900">
                              {sub.title}
                            </div>
                          )}
                          {sub.thumbnail && (
                            <div className="flex justify-center" style={{ width: '50%', marginLeft: 'auto', marginRight: 'auto' }}>
                              <img 
                                src={sub.thumbnail} 
                                alt="소제목 썸네일"
                                className="w-full h-auto rounded-lg"
                                style={{ display: 'block', objectFit: 'contain' }}
                              />
                            </div>
                          )}
                          {isRevealed ? (
                            <div
                              className="subtitle-content text-gray-800"
                              dangerouslySetInnerHTML={{ __html: sub.contentHtml }}
                            />
                          ) : (
                            <div className="subtitle-content text-gray-400 flex items-center gap-2">
                              점사중입니다
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
                  
                  {/* 엔딩북커버 썸네일 (마지막 대제목 라운드 박스 안, 소제목들 아래) */}
                  {menuIndex === parsedMenus.length - 1 && content?.ending_book_cover_thumbnail && (
                    <div className="ending-book-cover-thumbnail-container w-full mt-4">
                      <img 
                        src={content.ending_book_cover_thumbnail} 
                        alt="엔딩북커버 썸네일"
                        className="w-full h-auto"
                        style={{ 
                          objectFit: 'contain', 
                          display: 'block' 
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
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
                      
                      // 북커버 썸네일 추가 (첫 번째 menu-section 안, 제목 위)
                      if (bookCoverThumbnail && menuSections.length > 0) {
                        const firstSection = menuSections[0]
                        const bookCoverDiv = doc.createElement('div')
                        bookCoverDiv.className = 'book-cover-thumbnail-container'
                        bookCoverDiv.style.cssText = 'width: 100%; margin-bottom: 2.5rem; display: flex; justify-content: center;'
                        bookCoverDiv.innerHTML = `<img src="${bookCoverThumbnail}" alt="북커버 썸네일" style="width: calc(100% - 48px); max-width: calc(100% - 48px); height: auto; object-fit: contain; display: block;" />`
                        // 첫 번째 자식 요소(menu-title) 앞에 삽입
                        if (firstSection.firstChild) {
                          firstSection.insertBefore(bookCoverDiv, firstSection.firstChild)
                        } else {
                          firstSection.appendChild(bookCoverDiv)
                        }
                      }
                      
                      // 소제목 썸네일 추가
                      menuSections.forEach((section, menuIndex) => {
                        const menuItem = menuItems[menuIndex]
                        if (menuItem?.subtitles) {
                          const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'))
                          subtitleSections.forEach((subSection, subIndex) => {
                            const subtitle = menuItem.subtitles[subIndex]
                            if (subtitle?.thumbnail) {
                              const titleDiv = subSection.querySelector('.subtitle-title')
                              if (titleDiv) {
                                const thumbnailImg = doc.createElement('div')
                                thumbnailImg.className = 'subtitle-thumbnail-container'
                                thumbnailImg.style.cssText = 'display: flex; justify-content: center; width: 50%; margin-left: auto; margin-right: auto;'
                                thumbnailImg.innerHTML = `<img src="${subtitle.thumbnail}" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" />`
                                titleDiv.parentNode?.insertBefore(thumbnailImg, titleDiv.nextSibling)
                              }
                            }
                          })
                        }
                      })
                      
                      // 엔딩북커버 썸네일 추가 (마지막 menu-section 안, 소제목들 아래)
                      if (endingBookCoverThumbnail && menuSections.length > 0) {
                        const lastSection = menuSections[menuSections.length - 1]
                        const endingBookCoverDiv = doc.createElement('div')
                        endingBookCoverDiv.className = 'ending-book-cover-thumbnail-container'
                        endingBookCoverDiv.style.cssText = 'width: 100%; margin-top: 1rem; display: flex; justify-content: center;'
                        endingBookCoverDiv.innerHTML = `<img src="${endingBookCoverThumbnail}" alt="엔딩북커버 썸네일" style="width: 100%; height: auto; object-fit: contain; display: block;" />`
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
      </main>
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

