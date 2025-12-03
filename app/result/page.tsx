'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState, useRef } from 'react'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import { getContentById, getSelectedSpeaker } from '@/lib/supabase-admin'

interface ResultData {
  content: any
  html: string // HTML 결과
  startTime?: number
  model?: string // 사용된 모델 정보
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

  // 저장된 결과 목록 로드 함수 (useEffect 위에 정의)
  const loadSavedResults = () => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('saved_jeminai_results')
      if (saved) {
        const parsed = JSON.parse(saved)
        setSavedResults(parsed)
      } else {
        setSavedResults([])
      }
    } catch (e) {
      console.error('저장된 결과 불러오기 실패:', e)
      setSavedResults([])
    }
  }

  // 경과 시간 상태 (모든 hooks는 early return 이전에 정의)
  const [currentTime, setCurrentTime] = useState('0:00')
  const [isPlaying, setIsPlaying] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [playingResultId, setPlayingResultId] = useState<string | null>(null) // 재생 중인 저장된 결과 ID
  const currentAudioRef = useRef<HTMLAudioElement | null>(null) // 현재 재생 중인 오디오 (ref로 관리하여 리렌더링 방지)
  const [shouldStop, setShouldStop] = useState(false) // 재생 중지 플래그

  // 페이지가 비활성화되면 음성 재생 중지
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && currentAudioRef.current) {
        // 페이지가 숨겨지면 오디오 중지
        currentAudioRef.current.pause()
        currentAudioRef.current.currentTime = 0
        currentAudioRef.current = null
        setIsPlaying(false)
        setPlayingResultId(null)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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

  // 경과 시간 계산 (완료된 결과만 표시)
  useEffect(() => {
    if (resultData?.startTime) {
      const elapsed = Date.now() - resultData.startTime
      const mins = Math.floor(elapsed / 60000)
      const secs = Math.floor((elapsed % 60000) / 1000)
      setCurrentTime(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
  }, [resultData?.startTime])

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

  // HTML에서 텍스트 추출 (태그 제거)
  const extractTextFromHtml = (htmlString: string): string => {
    if (typeof window === 'undefined') return ''
    const tempDiv = document.createElement('div')
    tempDiv.innerHTML = htmlString
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
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.currentTime = 0
      currentAudioRef.current = null
    }
    setShouldStop(true)
    setIsPlaying(false)
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
      setShouldStop(false)
      
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
        if (chunkIndex >= chunks.length || shouldStop) {
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
          
          // 오디오가 로드될 때까지 대기
          await new Promise<void>((resolve, reject) => {
            audio.oncanplaythrough = () => resolve()
            audio.onerror = () => reject(new Error(`청크 ${chunkIndex + 1} 로드 실패`))
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
        // 중지 플래그 확인
        if (shouldStop) {
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

        // 오디오 재생 (Promise로 대기)
        await new Promise<void>((resolve, reject) => {
          // 중지 플래그 재확인
          if (shouldStop) {
            URL.revokeObjectURL(currentUrl)
            resolve()
            return
          }

          currentAudioRef.current = currentAudio // 현재 오디오 저장 (ref 사용, 리렌더링 방지)
          
          currentAudio.onended = () => {
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
            resolve()
          }
          
          currentAudio.onerror = () => {
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
            reject(new Error(`청크 ${i + 1} 재생 중 오류가 발생했습니다.`))
          }
          
          currentAudio.onpause = () => {
            // 사용자가 일시정지하거나 페이지가 비활성화된 경우
            if (document.hidden || shouldStop) {
              currentAudioRef.current = null
              setIsPlaying(false)
            }
          }
          
          currentAudio.play().catch(reject)
        })

        // 다음 청크 미리 로드 완료 대기 및 저장
        if (i < chunks.length - 1) {
          preloadedChunk = await nextChunkPromise
        }

        // 중지 플래그 재확인
        if (shouldStop) {
          console.log('재생 중지됨 (재생 후)')
          if (preloadedChunk) {
            URL.revokeObjectURL(preloadedChunk.url)
          }
          break
        }
      }

      if (!shouldStop) {
        console.log('모든 청크 재생 완료')
      }
      setIsPlaying(false)
      currentAudioRef.current = null
      setShouldStop(false)
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
          
          // 오디오가 로드될 때까지 대기
          await new Promise<void>((resolve, reject) => {
            audio.oncanplaythrough = () => resolve()
            audio.onerror = () => reject(new Error(`청크 ${chunkIndex + 1} 로드 실패`))
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

        // 오디오 재생 (Promise로 대기)
        await new Promise<void>((resolve, reject) => {
          currentAudioRef.current = currentAudio // 현재 오디오 저장 (ref 사용, 리렌더링 방지)
          
          currentAudio.onended = () => {
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
            resolve()
          }
          
          currentAudio.onerror = () => {
            URL.revokeObjectURL(currentUrl)
            currentAudioRef.current = null
            reject(new Error(`청크 ${i + 1} 재생 중 오류가 발생했습니다.`))
          }
          
          currentAudio.onpause = () => {
            // 사용자가 일시정지하거나 페이지가 비활성화된 경우
            if (document.hidden) {
              currentAudioRef.current = null
              setPlayingResultId(null)
            }
          }
          
          currentAudio.play().catch(reject)
        })

        // 다음 청크 미리 로드 완료 대기 및 저장
        if (i < chunks.length - 1) {
          preloadedChunk = await nextChunkPromise
        }
      }

      console.log('모든 청크 재생 완료')
      setPlayingResultId(null)
      currentAudioRef.current = null
    } catch (error: any) {
      console.error('저장된 결과 음성 변환 실패:', error)
      alert(error?.message || '음성 변환에 실패했습니다.')
      setPlayingResultId(null)
      currentAudioRef.current = null
    }
  }

  // 결과를 로컬에 저장
  const saveResultToLocal = () => {
    if (typeof window === 'undefined' || !resultData) {
      console.error('결과 저장 실패: resultData가 없습니다.')
      alert('결과 저장에 실패했습니다. (데이터 없음)')
      return
    }
    
    try {
      const currentSaved = [...savedResults]
      const newResult = {
        id: `result_${Date.now()}`,
        title: content?.content_name || '재회 결과',
        html: html || '',
        savedAt: new Date().toLocaleString('ko-KR'),
        content: content, // content 객체 전체 저장 (tts_speaker 포함)
        model: model || 'gemini-2.5-flash', // 모델 정보 저장
        processingTime: currentTime // 처리 시간 저장 (timeString 대신 currentTime 사용)
      }
      
      console.log('저장할 결과:', newResult)
      console.log('저장할 컨텐츠의 tts_speaker:', content?.tts_speaker)
      
      currentSaved.unshift(newResult) // 최신 결과를 맨 위에
      const maxSaved = 50 // 최대 50개만 저장
      const trimmedResults = currentSaved.slice(0, maxSaved)
      
      localStorage.setItem('saved_jeminai_results', JSON.stringify(trimmedResults))
      setSavedResults(trimmedResults) // 상태 업데이트
      alert('결과가 저장되었습니다.')
      
      // 페이지 새로고침하지 않고 상태만 업데이트
    } catch (e) {
      console.error('결과 저장 실패:', e)
      console.error('에러 상세:', e instanceof Error ? e.stack : e)
      alert('결과 저장에 실패했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
    }
  }

  // 저장된 결과 삭제
  const deleteSavedResult = (resultId: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const updatedResults = savedResults.filter((r: any) => r.id !== resultId)
      localStorage.setItem('saved_jeminai_results', JSON.stringify(updatedResults))
      setSavedResults(updatedResults)
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
                  max-width: 1200px;
                  margin: 0 auto;
                  padding: 20px;
                  background: #f5f5f5;
                }
                .container {
                  background: white;
                  border-radius: 12px;
                  padding: 24px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                .title-container {
                  margin-bottom: 8px;
                }
                h1 {
                  font-size: 28px;
                  font-weight: bold;
                  margin: 0 0 12px 0;
                  color: #111;
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
                  display: flex;
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
                  color: #666;
                  font-size: 14px;
                  margin-bottom: 24px;
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
              </style>
            </head>
            <body>
              <div class="container">
                <div class="title-container">
                  <h1>${saved.title}</h1>
                </div>
                <div style="margin-bottom: 16px;">
                  <button id="ttsButton" class="tts-button" onclick="handleTextToSpeech()">
                    <span id="ttsIcon">🔊</span>
                    <span id="ttsText">음성으로 듣기</span>
                  </button>
                </div>
                <div class="saved-at">
                  저장일시: ${saved.savedAt}<br/>
                  ${saved.model ? `모델: ${saved.model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : saved.model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : saved.model}<br/>` : ''}
                  ${saved.processingTime ? `처리 시간: ${saved.processingTime}` : ''}
                </div>
                <div id="contentHtml">${saved.html}</div>
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
                
                // 페이지가 비활성화되면 음성 재생 중지
                document.addEventListener('visibilitychange', function() {
                  if (document.hidden && currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    currentAudio = null;
                    isPlaying = false;
                    
                    // 버튼 상태 복원
                    const button = document.getElementById('ttsButton');
                    const icon = document.getElementById('ttsIcon');
                    const text = document.getElementById('ttsText');
                    if (button && icon && text) {
                      button.disabled = false;
                      icon.textContent = '🔊';
                      text.textContent = '음성으로 듣기';
                    }
                  }
                });

                // HTML에서 텍스트 추출
                function extractTextFromHtml(htmlString) {
                  const tempDiv = document.createElement('div');
                  tempDiv.innerHTML = htmlString;
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
                  if (currentAudio) {
                    currentAudio.pause();
                    currentAudio.currentTime = 0;
                    currentAudio = null;
                  }
                  shouldStop = true;
                  isPlaying = false;
                  
                  const button = document.getElementById('ttsButton');
                  const icon = document.getElementById('ttsIcon');
                  const text = document.getElementById('ttsText');
                  if (button && icon && text) {
                    button.disabled = false;
                    icon.textContent = '🔊';
                    text.textContent = '음성으로 듣기';
                  }
                }

                // 음성으로 듣기 기능 - 청크 단위로 나누어 재생
                async function handleTextToSpeech() {
                  // 재생 중이면 중지
                  if (isPlaying) {
                    stopTextToSpeech();
                    return;
                  }

                  try {
                    const contentHtml = document.getElementById('contentHtml').innerHTML;
                    const textContent = extractTextFromHtml(contentHtml);

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
                        
                        // 오디오가 로드될 때까지 대기
                        await new Promise((resolve, reject) => {
                          audio.oncanplaythrough = () => resolve();
                          audio.onerror = () => reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 실패'));
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

                      // 오디오 재생 (Promise로 대기)
                      await new Promise((resolve, reject) => {
                        // 중지 플래그 재확인
                        if (shouldStop) {
                          URL.revokeObjectURL(currentUrl);
                          resolve();
                          return;
                        }

                        currentAudio = currentAudioElement; // 현재 오디오 저장
                        
                        currentAudioElement.onended = () => {
                          URL.revokeObjectURL(currentUrl);
                          currentAudio = null;
                          resolve();
                        };
                        
                        currentAudioElement.onerror = () => {
                          URL.revokeObjectURL(currentUrl);
                          currentAudio = null;
                          reject(new Error('청크 ' + (i + 1) + ' 재생 중 오류가 발생했습니다.'));
                        };
                        
                        currentAudioElement.onpause = () => {
                          // 사용자가 일시정지하거나 페이지가 비활성화된 경우
                          if (document.hidden || shouldStop) {
                            currentAudio = null;
                            isPlaying = false;
                            button.disabled = false;
                            icon.textContent = '🔊';
                            text.textContent = '음성으로 듣기';
                          }
                        };
                        
                        currentAudioElement.play().catch(reject);
                      });

                      // 다음 청크 미리 로드 완료 대기 및 저장
                      if (i < chunks.length - 1) {
                        preloadedChunk = await nextChunkPromise;
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
                      console.log('모든 청크 재생 완료');
                    }
                    isPlaying = false;
                    shouldStop = false;
                    button.disabled = false;
                    icon.textContent = '🔊';
                    text.textContent = '음성으로 듣기';
                  } catch (error) {
                    console.error('음성 변환 실패:', error);
                    alert(error?.message || '음성 변환에 실패했습니다.');
                    const button = document.getElementById('ttsButton');
                    const icon = document.getElementById('ttsIcon');
                    const text = document.getElementById('ttsText');
                    isPlaying = false;
                    shouldStop = false;
                    button.disabled = false;
                    icon.textContent = '🔊';
                    text.textContent = '음성으로 듣기';
                  }
                }
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
      {/* 동적 스타일 주입 */}
      <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 제목 */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {content?.content_name || '결과 생성 중...'}
          </h1>
          {html && (
            <div className="mb-4">
              <button
                onClick={handleTextToSpeech}
                className={`bg-gradient-to-r from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 text-gray-800 text-sm font-semibold px-3 py-1.5 rounded-lg border border-gray-300 hover:border-blue-400 transition-all duration-300 flex items-center gap-2 mx-auto shadow-sm hover:shadow-md group ${
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
                    <span className="text-gray-800">음성으로 듣기</span>
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
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* 저장된 파일 보기 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 mt-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">저장된 결과</h3>
          <div className="space-y-3">
            {savedResults.length === 0 ? (
              <p className="text-sm text-gray-600">저장된 결과가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {savedResults.map((saved: any) => (
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
                  ))}
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

