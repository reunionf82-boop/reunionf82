'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, useRef } from 'react'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import { getContentById, getSelectedSpeaker } from '@/lib/supabase-admin'
import QuestionPopup from '@/components/QuestionPopup'

interface ResultData {
  content: any
  html: string // HTML 결과
  startTime?: number
  model?: string // 사용된 모델 정보
  userName?: string // 사용자 이름
}

function ResultContent() {
  const searchParams = useSearchParams()
  const storageKey = searchParams.get('key')
  const isStreaming = searchParams.get('stream') === 'true'
  const [resultData, setResultData] = useState<ResultData | null>(null)
  const [streamingHtml, setStreamingHtml] = useState('')
  const [isStreamingActive, setIsStreamingActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedResults, setSavedResults] = useState<any[]>([])
  const [streamingProgress, setStreamingProgress] = useState(0)

  // savedResults 변경 시 로깅
  useEffect(() => {
    console.log('결과 페이지: savedResults 변경됨, 길이:', savedResults.length)
    console.log('결과 페이지: savedResults 내용:', savedResults)
  }, [savedResults])
  
  // 추가 질문 횟수 관리 (메뉴별 카운트)
  const [usedQuestionCounts, setUsedQuestionCounts] = useState<Record<string, number>>({})
  const MAX_QUESTIONS = 3

  // 추가 질문 팝업 상태
  const [questionPopup, setQuestionPopup] = useState<{
    isOpen: boolean
    menuTitle: string
    subtitles: string[]
    subtitlesContent: Array<{ title: string; content: string }>
  }>({
    isOpen: false,
    menuTitle: '',
    subtitles: [],
    subtitlesContent: [],
  })

  // 저장된 결과 목록 로드 함수 (useEffect 위에 정의)
  const loadSavedResults = async () => {
    if (typeof window === 'undefined') return
    try {
      console.log('=== 저장된 결과 목록 로드 시작 (결과 페이지) ===')
      const response = await fetch('/api/saved-results/list')
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

  useEffect(() => {
    if (!storageKey) {
      setError('결과 데이터 키가 없습니다.')
      setLoading(false)
      return
    }

    console.log('결과 페이지: 키로 데이터 찾기 시작, 키:', storageKey)
    
    // 기존 방식: 완료된 결과 로드
    const loadData = () => {
      try {
        // 세션 스토리지에서 데이터 가져오기
        const resultDataStr = sessionStorage.getItem(storageKey)
        
        console.log('결과 페이지: sessionStorage에서 데이터 조회, 키:', storageKey)
        console.log('결과 페이지: 데이터 존재 여부:', !!resultDataStr)
        
        if (!resultDataStr) {
          // 모든 키 확인 (디버깅용)
          console.log('결과 페이지: sessionStorage의 모든 키:', Object.keys(sessionStorage))
          setError('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.')
          setLoading(false)
          return
        }

        console.log('결과 페이지: 데이터 파싱 시작, 크기:', resultDataStr.length, 'bytes')
        const parsedData: ResultData = JSON.parse(resultDataStr)
        console.log('결과 페이지: 데이터 파싱 완료, HTML 길이:', parsedData.html?.length || 0)
        console.log('결과 페이지: content 객체:', parsedData.content)
        console.log('결과 페이지: content의 tts_speaker:', parsedData.content?.tts_speaker)
        setResultData(parsedData)
        
        // 저장된 결과 목록 로드
        console.log('결과 페이지: loadSavedResults 호출')
        loadSavedResults()
        
        // 사용 후 세션 스토리지에서 삭제하지 않음 (저장 기능을 위해 유지)
        console.log('결과 페이지: 데이터 로드 완료')
      } catch (e) {
        console.error('결과 데이터 파싱 실패:', e)
        setError('결과 데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    // 약간의 지연 후 데이터 로드
    const timer = setTimeout(loadData, 50)
    
    return () => clearTimeout(timer)
  }, [storageKey, isStreaming])

  // 질문 횟수 로드 (localStorage)
  useEffect(() => {
    if (storageKey) {
      try {
        const savedCounts = localStorage.getItem(`question_counts_${storageKey}`)
        if (savedCounts) {
          setUsedQuestionCounts(JSON.parse(savedCounts))
        } else {
          // 하위 호환성: 기존 단일 카운트가 있다면 초기화 (또는 무시)
          setUsedQuestionCounts({})
        }
      } catch (e) {
        console.error('질문 횟수 로드 실패:', e)
        setUsedQuestionCounts({})
      }
    }
  }, [storageKey])

  // 경과 시간 계산 (완료된 결과만 표시)
  useEffect(() => {
    if (resultData?.startTime) {
      const elapsed = Date.now() - resultData.startTime
      const mins = Math.floor(elapsed / 60000)
      const secs = Math.floor((elapsed % 60000) / 1000)
      setCurrentTime(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
  }, [resultData?.startTime])

  // 버튼 추가 함수 (재사용 가능하도록 분리)
  const addQuestionButtons = useRef<(() => void) | null>(null)

  // HTML 렌더링 후 각 menu-section 끝에 버튼 추가
  useEffect(() => {
    if (!resultData?.html || typeof window === 'undefined') return

    const addButtons = () => {
      const resultsContainer = document.querySelector('.jeminai-results')
      if (!resultsContainer) {
        console.log('jeminai-results 컨테이너를 찾을 수 없습니다.')
        return false
      }

      const menuSections = resultsContainer.querySelectorAll('.menu-section')
      
      if (menuSections.length === 0) {
        console.log('menu-section을 찾을 수 없습니다.')
        return false
      }
      
      console.log(`발견된 menu-section 개수: ${menuSections.length}`)
      
      let buttonsAdded = 0
      menuSections.forEach((menuSection, index) => {
        // 이미 버튼이 추가되어 있는지 확인
        const existingButton = menuSection.querySelector('.question-button-container')
        if (existingButton) {
          console.log(`메뉴 ${index + 1}: 버튼이 이미 존재합니다.`)
          return
        }

        const menuTitleEl = menuSection.querySelector('.menu-title')
        const menuTitle = menuTitleEl?.textContent?.trim() || `메뉴 ${index + 1}`
        
        console.log(`메뉴 ${index + 1}: ${menuTitle}에 버튼 추가 중...`)
        
        // 소제목 정보 추출
        const subtitlesContent: Array<{ title: string; content: string }> = []
        const subtitleSections = menuSection.querySelectorAll('.subtitle-section')
        
        subtitleSections.forEach((section) => {
          const titleEl = section.querySelector('.subtitle-title')
          const contentEl = section.querySelector('.subtitle-content')
          
          if (titleEl && contentEl) {
            subtitlesContent.push({
              title: titleEl.textContent?.trim() || '',
              content: contentEl.textContent?.trim() || '',
            })
          }
        })
        
        const subtitles = subtitlesContent.map(sub => sub.title)

        // 버튼 컨테이너 생성
        const buttonContainer = document.createElement('div')
        buttonContainer.className = 'question-button-container mt-6 mb-4 text-center'
        
        const button = document.createElement('button')
        button.className = 'bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors duration-200'
        button.textContent = '추가 질문하기'
        button.onclick = () => {
          setQuestionPopup({
            isOpen: true,
            menuTitle,
            subtitles,
            subtitlesContent,
          })
        }
        
        buttonContainer.appendChild(button)
        menuSection.appendChild(buttonContainer)
        buttonsAdded++
        
        console.log(`메뉴 ${index + 1}: 버튼 추가 완료`)
      })
      
      return buttonsAdded > 0
    }

    // 함수를 ref에 저장하여 나중에 재사용 가능하도록
    addQuestionButtons.current = addButtons

    // requestAnimationFrame을 사용하여 DOM 렌더링 완료 후 실행
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!addButtons()) {
          // 첫 시도 실패 시 약간의 지연 후 재시도
          setTimeout(() => {
            addButtons()
          }, 200)
        }
      })
    })
  }, [resultData?.html])

  // 팝업이 닫힐 때 버튼이 있는지 확인하고 없으면 다시 추가
  useEffect(() => {
    if (!questionPopup.isOpen && resultData?.html && typeof window !== 'undefined') {
      // 팝업이 닫힌 후 약간의 지연을 두고 버튼 확인
      const timer = setTimeout(() => {
        const resultsContainer = document.querySelector('.jeminai-results')
        if (!resultsContainer) return

        const menuSections = resultsContainer.querySelectorAll('.menu-section')
        let needsReAdd = false

        menuSections.forEach((menuSection) => {
          const existingButton = menuSection.querySelector('.question-button-container')
          if (!existingButton) {
            needsReAdd = true
          }
        })

        if (needsReAdd && addQuestionButtons.current) {
          console.log('팝업 닫힘 후 버튼이 사라진 것을 감지, 버튼 다시 추가')
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              addQuestionButtons.current?.()
            })
          })
        }
      }, 100)

      return () => clearTimeout(timer)
    }
  }, [questionPopup.isOpen, resultData?.html])

  // TTS 재생 중에도 버튼이 유지되도록 주기적으로 확인
  useEffect(() => {
    if (!resultData?.html || typeof window === 'undefined') return

    // TTS 재생 중일 때 주기적으로 버튼 확인
    const checkInterval = setInterval(() => {
      const resultsContainer = document.querySelector('.jeminai-results')
      if (!resultsContainer) return

      const menuSections = resultsContainer.querySelectorAll('.menu-section')
      let needsReAdd = false

      menuSections.forEach((menuSection) => {
        const existingButton = menuSection.querySelector('.question-button-container')
        if (!existingButton) {
          needsReAdd = true
        }
      })

      if (needsReAdd && addQuestionButtons.current) {
        console.log('TTS 재생 중 버튼이 사라진 것을 감지, 버튼 다시 추가')
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            addQuestionButtons.current?.()
          })
        })
      }
    }, 500) // 0.5초마다 확인

    return () => clearInterval(checkInterval)
  }, [resultData?.html, isPlaying, playingResultId]) // isPlaying과 playingResultId도 의존성에 추가

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

  if (error || !resultData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>{error || '결과 데이터가 없습니다.'}</p>
        </div>
      </div>
    )
  }

  // 완료된 결과 표시
  const content = resultData.content
  const html = resultData.html || ''
  const startTime = resultData.startTime
  const model = resultData.model
  
  // 모델 이름 표시용
  const modelDisplayName = model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : model || 'Unknown'

  // 경과 시간 계산 (로깅용)
  const elapsedTime = startTime ? Date.now() - startTime : 0

  console.log('결과 페이지: 데이터 분석 시작')
  console.log('결과 페이지: 경과 시간:', currentTime, `(${elapsedTime}ms)`)
  console.log('결과 페이지: HTML 길이:', html?.length)

  // 폰트 크기 설정 (관리자 페이지에서 설정한 값 사용)
  const menuFontSize = content?.menu_font_size || 16
  const subtitleFontSize = content?.subtitle_font_size || 14
  const bodyFontSize = content?.body_font_size || 11

  // 동적 스타일 생성
  const dynamicStyles = `
    .jeminai-results .menu-title {
      font-size: ${menuFontSize}px !important;
    }
    .jeminai-results .subtitle-title {
      font-size: ${subtitleFontSize}px !important;
    }
    .jeminai-results .subtitle-content {
      font-size: ${bodyFontSize}px !important;
    }
  `

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

  // 질문 제출 핸들러
  const handleQuestionSubmit = async (question: string): Promise<string> => {
    const currentMenuTitle = questionPopup.menuTitle
    const currentCount = usedQuestionCounts[currentMenuTitle] || 0

    // 클라이언트 사이드 방어 코드
    if (currentCount >= MAX_QUESTIONS) {
      throw new Error('이 메뉴에 대한 질문 횟수를 모두 소진했습니다.')
    }

    console.log('질문 제출 API 호출 시작:', {
      question,
      menuTitle: currentMenuTitle,
      subtitles: questionPopup.subtitles,
      subtitlesContent: questionPopup.subtitlesContent,
    })

    const response = await fetch('/api/question', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question,
        menuTitle: questionPopup.menuTitle,
        subtitles: questionPopup.subtitles,
        subtitlesContent: questionPopup.subtitlesContent,
        userName: resultData?.userName || '', // 사용자 이름 전달
      }),
    })

    console.log('API 응답 상태:', response.status, response.statusText)

    if (!response.ok) {
      const error = await response.json()
      console.error('API 오류:', error)
      
      // 재미나이 응답 디버그 정보 표시
      if (error.debug) {
        console.error('=== 재미나이 응답 디버그 정보 ===')
        console.error('Finish Reason:', error.debug.finishReason)
        console.error('Candidates 개수:', error.debug.candidatesCount)
        console.error('첫 번째 Candidate 정보:', error.debug.firstCandidate)
        console.error('Response 전체 구조:', error.debug)
      }
      
      throw new Error(error.error || '답변 생성에 실패했습니다.')
    }

    const data = await response.json()
    console.log('API 응답 데이터:', data)
    
    if (!data.answer) {
      console.error('답변이 없습니다:', data)
      throw new Error('답변을 받지 못했습니다.')
    }
    
    // 질문 횟수 증가 및 저장 (메뉴별)
    const newCount = currentCount + 1
    const newCounts = { ...usedQuestionCounts, [currentMenuTitle]: newCount }
    
    setUsedQuestionCounts(newCounts)
    if (storageKey) {
      localStorage.setItem(`question_counts_${storageKey}`, JSON.stringify(newCounts))
    }

    return data.answer
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

  // 결과를 서버에 저장
  const saveResultToLocal = async () => {
    if (typeof window === 'undefined' || !resultData) {
      console.error('결과 저장 실패: resultData가 없습니다.')
      alert('결과 저장에 실패했습니다. (데이터 없음)')
      return
    }
    
    try {
      const response = await fetch('/api/saved-results/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: content?.content_name || '재회 결과',
          html: html || '',
          content: content, // content 객체 전체 저장 (tts_speaker 포함)
          model: model || 'gemini-2.5-flash', // 모델 정보 저장
          processingTime: currentTime, // 처리 시간 저장
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
        
        // 저장된 결과 목록 다시 로드
        await loadSavedResults()
        alert('결과가 저장되었습니다.')
      } else {
        throw new Error('결과 저장에 실패했습니다.')
      }
    } catch (e) {
      console.error('결과 저장 실패:', e)
      console.error('에러 상세:', e instanceof Error ? e.stack : e)
      alert('결과 저장에 실패했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
    }
  }

  // 저장된 결과 삭제
  const deleteSavedResult = async (resultId: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const response = await fetch(`/api/saved-results/delete?id=${resultId}`, {
        method: 'DELETE'
      })
      if (!response.ok) {
        throw new Error('저장된 결과 삭제 실패')
      }
      const result = await response.json()
      if (result.success) {
        // 목록 다시 로드
        await loadSavedResults()
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
    if (typeof window === 'undefined') return
    
    try {
      const saved = savedResults.find((r: any) => r.id === resultId)
      
      if (saved) {
        // userName을 안전하게 처리 (템플릿 리터럴 중첩 방지)
        const userNameForScript = saved.userName ? JSON.stringify(saved.userName) : "''"
        
        // 새 창으로 결과 표시
        const newWindow = window.open('', '_blank')
        if (newWindow) {
          newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>${saved.title}</title>
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
                  height: 256px;
                  object-fit: cover;
                  border-radius: 8px;
                  margin-bottom: 24px;
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
                .question-button-container {
                  margin-top: 24px;
                  margin-bottom: 16px;
                  text-align: center;
                }
                .question-button {
                  background: #ec4899;
                  color: white;
                  font-weight: 600;
                  padding: 8px 24px;
                  border-radius: 8px;
                  border: none;
                  cursor: pointer;
                  transition: background-color 0.2s;
                }
                .question-button:hover {
                  background: #db2777;
                }
                .question-popup-overlay {
                  position: fixed;
                  inset: 0;
                  background: rgba(0, 0, 0, 0.5);
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  z-index: 50;
                  padding: 16px;
                  opacity: 0;
                  visibility: hidden;
                  pointer-events: none;
                  transition: opacity 0.2s, visibility 0.2s;
                }
                .question-popup-overlay.show {
                  opacity: 1;
                  visibility: visible;
                  pointer-events: auto;
                }
                .question-popup {
                  background: white;
                  border-radius: 20px;
                  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
                  max-width: 32rem;
                  width: 100%;
                  max-height: auto;
                  overflow: visible;
                  transform: scale(0.95);
                  transition: transform 0.2s;
                }
                .question-popup-overlay.show .question-popup {
                  transform: scale(1);
                }
                .question-popup-header {
                  position: relative;
                  background: white;
                  border-bottom: 1px solid #e5e7eb;
                  padding: 12px 20px;
                  border-radius: 20px 20px 0 0;
                  display: flex;
                  align-items: center;
                  justify-content: space-between;
                }
                .question-popup-title {
                  font-size: 20px;
                  font-weight: bold;
                  color: #111827;
                }
                .question-popup-close {
                  color: #9ca3af;
                  font-size: 24px;
                  font-weight: bold;
                  background: none;
                  border: none;
                  cursor: pointer;
                  padding: 0;
                  width: 32px;
                  height: 32px;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                }
                .question-popup-close:hover {
                  color: #4b5563;
                }
                .question-popup-body {
                  padding: 16px 20px;
                }
                .question-popup-prompt {
                  font-size: 16px;
                  color: #4b5563;
                  margin-bottom: 6px;
                }
                .question-popup-prompt strong {
                  font-weight: 600;
                  color: #111827;
                }
                .question-textarea {
                  width: 100%;
                  padding: 10px 14px;
                  padding-right: 18px;
                  border: 1px solid #d1d5db;
                  border-radius: 2px;
                  font-family: inherit;
                  font-size: 17px;
                  resize: none;
                  min-height: calc(17px * 1.4 * 2 + 10px * 2);
                  line-height: 1.4;
                  overflow-y: auto;
                  outline: none;
                }
                .question-textarea:not(:focus) {
                  padding-right: 18px;
                }
                .question-textarea::-webkit-scrollbar {
                  width: 6px;
                }
                .question-textarea::-webkit-scrollbar-track {
                  background: transparent;
                  margin: 2px 0;
                  border-radius: 0;
                }
                .question-textarea::-webkit-scrollbar-thumb {
                  background: #d1d5db;
                  border-radius: 3px;
                }
                .question-textarea::-webkit-scrollbar-thumb:hover {
                  background: #9ca3af;
                }
                .question-textarea:focus {
                  ring: 2px;
                  ring-color: #ec4899;
                  border-color: transparent;
                  padding-right: 18px;
                }
                .question-char-count {
                  margin-top: 4px;
                  text-align: right;
                  font-size: 14px;
                  color: #6b7280;
                }
                .question-error {
                  background: #fef2f2;
                  border: 1px solid #fecaca;
                  color: #991b1b;
                  padding: 10px 14px;
                  border-radius: 12px;
                  font-size: 16px;
                  margin-top: 10px;
                }
                .question-answer {
                  background: #eff6ff;
                  border: 1px solid #bfdbfe;
                  border-radius: 12px;
                  padding: 12px;
                  margin-top: 10px;
                  max-height: 200px;
                  overflow-y: auto;
                }
                .question-answer p {
                  color: #1e40af;
                  white-space: pre-line;
                  line-height: 1.6;
                  margin: 0;
                  font-size: 16px;
                }
                .question-loading {
                  background: #f9fafb;
                  border: 1px solid #e5e7eb;
                  border-radius: 12px;
                  padding: 12px;
                  text-align: center;
                  margin-top: 10px;
                }
                .question-loading-content {
                  display: inline-flex;
                  align-items: center;
                  gap: 8px;
                }
                .question-spinner {
                  width: 20px;
                  height: 20px;
                  border: 2px solid #ec4899;
                  border-top-color: transparent;
                  border-radius: 50%;
                  animation: spin 0.8s linear infinite;
                }
                .question-loading-text {
                  color: #4b5563;
                  font-size: 16px;
                }
                .question-popup-buttons {
                  display: flex;
                  gap: 10px;
                  margin-top: 12px;
                }
                .question-submit-btn {
                  flex: 1;
                  background: #ec4899;
                  color: white;
                  font-weight: 600;
                  padding: 10px 20px;
                  border-radius: 12px;
                  border: none;
                  cursor: pointer;
                  transition: background-color 0.2s;
                  font-size: 17px;
                }
                .question-submit-btn:hover:not(:disabled) {
                  background: #db2777;
                }
                .question-submit-btn:disabled {
                  background: #d1d5db;
                  cursor: not-allowed;
                }
                .question-close-btn {
                  background: #e5e7eb;
                  color: #1f2937;
                  font-weight: 600;
                  padding: 10px 20px;
                  border-radius: 12px;
                  border: none;
                  cursor: pointer;
                  transition: background-color 0.2s;
                  font-size: 17px;
                }
                .question-close-btn:hover {
                  background: #d1d5db;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="title-container">
                  <h1>${saved.title}</h1>
                </div>
                ${saved.content?.thumbnail_url ? `
                <div class="thumbnail-container">
                  <img src="${saved.content.thumbnail_url}" alt="${saved.title}" />
                </div>
                ` : ''}
                <div class="tts-button-container">
                  <button id="ttsButton" class="tts-button">
                    <span id="ttsIcon">🔊</span>
                    <span id="ttsText">점사 듣기</span>
                  </button>
                </div>
                <div class="saved-at">
                  사용 모델: <span style="font-weight: 600; color: #374151;">${saved.model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : saved.model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : saved.model || 'Gemini 2.5 Flash'}</span>
                  ${saved.processingTime ? ` · 처리 시간: <span style="font-weight: 600; color: #374151;">${saved.processingTime}</span>` : ''}
                </div>
                <div id="contentHtml">${saved.html ? saved.html.replace(/\*\*/g, '') : ''}</div>
              </div>
              
              <!-- 추가 질문하기 팝업 -->
              <div id="questionPopupOverlay" class="question-popup-overlay">
                <div class="question-popup">
                  <div class="question-popup-header">
                    <h2 class="question-popup-title">추가 질문하기</h2>
                    <button class="question-popup-close" onclick="closeQuestionPopup()">×</button>
                  </div>
                  <div class="question-popup-body">
                    <div class="question-popup-prompt">
                      <strong id="questionMenuTitle"></strong>에 대한 추가 질문이 있으신가요?
                    </div>
                    <form id="questionForm" onsubmit="handleQuestionSubmit(event)">
                      <textarea
                        id="questionTextarea"
                        class="question-textarea"
                        placeholder="예: 이 부분에 대해 더 자세히 알려주세요"
                        maxlength="100"
                        rows="2"
                      ></textarea>
                      <div class="question-char-count">
                        <span id="questionCharCount">0</span>/100
                      </div>
                      <div id="questionError" class="question-error" style="display: none;"></div>
                      <div id="questionAnswer" class="question-answer" style="display: none;">
                        <p id="questionAnswerText"></p>
                      </div>
                      <div id="questionLoading" class="question-loading" style="display: none;">
                        <div class="question-loading-content">
                          <div class="question-spinner"></div>
                          <span class="question-loading-text">점사 중입니다...</span>
                        </div>
                      </div>
                      <div class="question-popup-buttons">
                        <button type="submit" id="questionSubmitBtn" class="question-submit-btn">질문하기</button>
                        <button type="button" onclick="closeQuestionPopup()" class="question-close-btn">닫기</button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
              
              <script>
                // 저장된 컨텐츠의 화자 정보를 전역 변수로 설정 (초기값)
                console.log('=== 새 창: 페이지 로드 ===');
                console.log('저장된 content 객체:', ${JSON.stringify(saved.content)});
                console.log('저장된 content.id:', ${saved.content?.id ? saved.content.id : 'null'});
                console.log('저장된 content.tts_speaker:', ${saved.content?.tts_speaker ? `'${saved.content.tts_speaker}'` : "'없음'"});
                
                window.savedContentSpeaker = ${saved.content?.tts_speaker ? `'${saved.content.tts_speaker}'` : "'nara'"};
                window.savedContentId = ${saved.content?.id ? saved.content.id : 'null'};
                
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
                
                // 추가 질문하기 기능
                let currentQuestionData = null;
                
                // 질문하기 버튼 추가 함수
                function addQuestionButtons() {
                  const contentHtml = document.getElementById('contentHtml');
                  if (!contentHtml) {
                    console.log('contentHtml을 찾을 수 없습니다.');
                    return false;
                  }
                  
                  // 실제 DOM에서 menu-section 찾기
                  const menuSections = contentHtml.querySelectorAll('.menu-section');
                  
                  if (menuSections.length === 0) {
                    console.log('menu-section을 찾을 수 없습니다.');
                    return false;
                  }
                  
                  console.log('발견된 menu-section 개수:', menuSections.length);
                  
                  let buttonsAdded = 0;
                  menuSections.forEach((menuSection, index) => {
                    // 이미 버튼이 있으면 건너뛰기
                    if (menuSection.querySelector('.question-button-container')) {
                      console.log('메뉴', index + 1, ': 버튼이 이미 존재합니다.');
                      return;
                    }
                    
                    const menuTitleEl = menuSection.querySelector('.menu-title');
                    const menuTitle = menuTitleEl?.textContent?.trim() || '';
                    
                    console.log('메뉴', index + 1, ':', menuTitle, '에 버튼 추가 중...');
                    
                    // 소제목 정보 추출
                    const subtitlesContent = [];
                    const subtitleSections = menuSection.querySelectorAll('.subtitle-section');
                    
                    subtitleSections.forEach((section) => {
                      const titleEl = section.querySelector('.subtitle-title');
                      const contentEl = section.querySelector('.subtitle-content');
                      
                      if (titleEl && contentEl) {
                        subtitlesContent.push({
                          title: titleEl.textContent?.trim() || '',
                          content: contentEl.textContent?.trim() || '',
                        });
                      }
                    });
                    
                    const subtitles = subtitlesContent.map(sub => sub.title);
                    
                    // 버튼 컨테이너 생성
                    const buttonContainer = document.createElement('div');
                    buttonContainer.className = 'question-button-container';
                    
                    const button = document.createElement('button');
                    button.className = 'question-button';
                    button.textContent = '추가 질문하기';
                    button.onclick = () => {
                      openQuestionPopup(menuTitle, subtitles, subtitlesContent);
                    };
                    
                    buttonContainer.appendChild(button);
                    menuSection.appendChild(buttonContainer);
                    buttonsAdded++;
                    
                    console.log('메뉴', index + 1, ': 버튼 추가 완료');
                  });
                  
                  return buttonsAdded > 0;
                }
                
                // 팝업 열기
                function openQuestionPopup(menuTitle, subtitles, subtitlesContent) {
                  currentQuestionData = { menuTitle, subtitles, subtitlesContent };
                  
                  const overlay = document.getElementById('questionPopupOverlay');
                  const menuTitleEl = document.getElementById('questionMenuTitle');
                  
                  if (overlay && menuTitleEl) {
                    menuTitleEl.textContent = menuTitle;
                    overlay.classList.add('show');
                    
                    // 폼 초기화
                    document.getElementById('questionTextarea').value = '';
                    document.getElementById('questionCharCount').textContent = '0';
                    document.getElementById('questionError').style.display = 'none';
                    document.getElementById('questionAnswer').style.display = 'none';
                    document.getElementById('questionLoading').style.display = 'none';
                  }
                }
                
                // 팝업 닫기
                function closeQuestionPopup() {
                  const overlay = document.getElementById('questionPopupOverlay');
                  if (overlay) {
                    overlay.classList.remove('show');
                    currentQuestionData = null;
                    
                    // 폼 초기화
                    document.getElementById('questionTextarea').value = '';
                    document.getElementById('questionCharCount').textContent = '0';
                    document.getElementById('questionError').style.display = 'none';
                    document.getElementById('questionAnswer').style.display = 'none';
                    document.getElementById('questionLoading').style.display = 'none';
                  }
                }
                
                // 텍스트 영역 높이 조정
                const textarea = document.getElementById('questionTextarea');
                const charCount = document.getElementById('questionCharCount');
                
                if (textarea) {
                  // 기본 2줄 높이 계산 (font-size: 17px, line-height: 1.4, padding: 10px)
                  const baseHeight = 17 * 1.4 * 2 + 10 * 2; // 약 67.6px
                  
                  textarea.addEventListener('input', function() {
                    // 문자 수 업데이트
                    if (charCount) {
                      charCount.textContent = this.value.length;
                    }
                    
                    // 높이는 기본 2줄로 고정하고 내용이 많으면 스크롤 표시
                    this.style.height = baseHeight + 'px';
                    this.style.overflowY = 'auto';
                  });
                  
                  // 초기 높이 설정
                  textarea.style.height = baseHeight + 'px';
                }
                
                // 질문 제출
                async function handleQuestionSubmit(event) {
                  event.preventDefault();
                  
                  if (!currentQuestionData) return;
                  
                  const textarea = document.getElementById('questionTextarea');
                  const question = textarea.value.trim();
                  
                  if (!question) {
                    const errorEl = document.getElementById('questionError');
                    errorEl.textContent = '질문을 입력해주세요.';
                    errorEl.style.display = 'block';
                    return;
                  }
                  
                  // UI 업데이트
                  const errorEl = document.getElementById('questionError');
                  const answerEl = document.getElementById('questionAnswer');
                  const loadingEl = document.getElementById('questionLoading');
                  const submitBtn = document.getElementById('questionSubmitBtn');
                  
                  errorEl.style.display = 'none';
                  answerEl.style.display = 'none';
                  loadingEl.style.display = 'block';
                  submitBtn.disabled = true;
                  
                  try {
                    const response = await fetch('/api/question', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                      },
                      body: JSON.stringify({
                        question,
                        menuTitle: currentQuestionData.menuTitle,
                        subtitles: currentQuestionData.subtitles,
                        subtitlesContent: currentQuestionData.subtitlesContent,
                        userName: ${userNameForScript},
                      }),
                    });
                    
                    if (!response.ok) {
                      const error = await response.json();
                      throw new Error(error.error || '답변 생성에 실패했습니다.');
                    }
                    
                    const data = await response.json();
                    
                    if (!data.answer) {
                      throw new Error('답변을 받지 못했습니다.');
                    }
                    
                    // 답변 표시
                    document.getElementById('questionAnswerText').textContent = data.answer;
                    answerEl.style.display = 'block';
                  } catch (err) {
                    errorEl.textContent = err.message || '답변을 생성하는 중 오류가 발생했습니다.';
                    errorEl.style.display = 'block';
                  } finally {
                    loadingEl.style.display = 'none';
                    submitBtn.disabled = false;
                  }
                }
                
                // 오버레이 클릭 시 닫기
                const overlay = document.getElementById('questionPopupOverlay');
                if (overlay) {
                  overlay.addEventListener('click', function(e) {
                    if (e.target === overlay) {
                      closeQuestionPopup();
                    }
                  });
                }
                
                // 페이지 로드 후 버튼 추가
                function initQuestionButtons() {
                  console.log('버튼 추가 초기화 시작');
                  
                  // 여러 번 재시도하는 함수
                  let retryCount = 0;
                  const maxRetries = 10;
                  
                  const tryAddButtons = () => {
                    console.log('버튼 추가 시도:', retryCount + 1);
                    const success = addQuestionButtons();
                    
                    if (!success && retryCount < maxRetries) {
                      retryCount++;
                      // 점진적으로 지연 시간 증가 (200ms, 400ms, 600ms, ...)
                      setTimeout(tryAddButtons, 200 * retryCount);
                    } else if (success) {
                      console.log('버튼 추가 성공');
                    } else {
                      console.log('버튼 추가 실패: 최대 재시도 횟수 초과');
                    }
                  };
                  
                  // requestAnimationFrame을 사용하여 DOM 렌더링 완료 후 실행
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      tryAddButtons();
                    });
                  });
                }
                
                // 여러 이벤트에서 버튼 추가 시도
                // 1. DOMContentLoaded
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', function() {
                    console.log('DOMContentLoaded 이벤트 발생');
                    setTimeout(initQuestionButtons, 100);
                  });
                }
                
                // 2. window.onload
                window.addEventListener('load', function() {
                  console.log('window.onload 이벤트 발생');
                  setTimeout(initQuestionButtons, 100);
                });
                
                // 3. 즉시 실행 시도 (이미 로드된 경우)
                if (document.readyState !== 'loading') {
                  console.log('문서가 이미 로드됨, 즉시 실행');
                  setTimeout(initQuestionButtons, 300);
                }
                
                // 4. 추가 안전장치: 일정 시간 후에도 재시도
                setTimeout(function() {
                  console.log('추가 안전장치: 버튼 확인');
                  const resultsContainer = document.getElementById('contentHtml');
                  if (resultsContainer) {
                    const menuSections = resultsContainer.querySelectorAll('.menu-section');
                    let hasButtons = true;
                    menuSections.forEach((section) => {
                      if (!section.querySelector('.question-button-container')) {
                        hasButtons = false;
                      }
                    });
                    if (!hasButtons) {
                      console.log('추가 안전장치: 버튼이 없어서 다시 추가');
                      initQuestionButtons();
                    }
                  }
                }, 2000); // 2초 후 확인
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
      {/* 추가 질문 팝업 */}
      <QuestionPopup
        isOpen={questionPopup.isOpen}
        onClose={() => setQuestionPopup({ ...questionPopup, isOpen: false })}
        menuTitle={questionPopup.menuTitle}
        subtitles={questionPopup.subtitles}
        onQuestionSubmit={handleQuestionSubmit}
        usedQuestions={usedQuestionCounts[questionPopup.menuTitle] || 0}
        maxQuestions={MAX_QUESTIONS}
      />
      
      {/* 동적 스타일 주입 */}
      <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 제목 */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4 text-center">
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
          {startTime && (
            <div className="text-sm text-gray-500">
              사용 모델: <span className="font-semibold text-gray-700">{modelDisplayName}</span>
              {' · '}
              처리 시간: <span className="font-semibold text-gray-700">{currentTime}</span>
            </div>
          )}
        </div>

        {/* 결과 출력 - HTML 그대로 표시 */}
        <div 
          className="jeminai-results"
          dangerouslySetInnerHTML={{ __html: html ? html.replace(/\*\*/g, '') : '' }}
        />

        {/* 저장된 파일 보기 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 mt-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">저장된 결과</h3>
          <div className="space-y-3">
            {!savedResults || !Array.isArray(savedResults) || savedResults.length === 0 ? (
              <p className="text-sm text-gray-600">저장된 결과가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {savedResults.map((saved: any) => {
                  if (!saved || !saved.id) {
                    console.warn('저장된 결과 항목에 id가 없음:', saved)
                    return null
                  }
                  return (
                    <div key={saved.id} className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p 
                            className="font-semibold text-gray-900 cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => viewSavedResult(saved.id)}
                          >
                            {saved.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {saved.savedAt}
                            {saved.model && (
                              <> · 모델: {saved.model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : saved.model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : saved.model}</>
                            )}
                            {saved.processingTime && (
                              <> · 처리 시간: {saved.processingTime}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => viewSavedResult(saved.id)}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                          >
                            보기
                          </button>
                          <button
                            onClick={() => deleteSavedResult(saved.id)}
                            className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
                </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="mt-8 text-center space-x-4">
          <button
            onClick={() => saveResultToLocal()}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-8 rounded-xl transition-colors duration-200"
          >
            결과 저장
          </button>
          <button
            onClick={() => window.history.back()}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-8 rounded-xl transition-colors duration-200"
          >
            이전으로
          </button>
        </div>
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

