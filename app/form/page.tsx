'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { getContents, getSelectedModel, getSelectedSpeaker } from '@/lib/supabase-admin'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import TermsPopup from '@/components/TermsPopup'
import PrivacyPopup from '@/components/PrivacyPopup'

function FormContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const title = searchParams.get('title') || ''
  
  // 모델 상태 관리
  const [model, setModel] = useState<string>('gemini-2.5-flash')
  
  // URL 파라미터와 Supabase에서 모델 가져오기
  useEffect(() => {
    const loadModel = async () => {
      const urlModel = searchParams.get('model')
      if (urlModel) {
        setModel(urlModel)
        console.log('Form 페이지: URL에서 모델 가져옴:', urlModel)
      } else {
        try {
          const savedModel = await getSelectedModel()
          setModel(savedModel)
          console.log('Form 페이지: Supabase에서 모델 가져옴:', savedModel)
        } catch (error) {
          console.error('모델 로드 실패, 기본값 사용:', error)
          setModel('gemini-2.5-flash')
        }
      }
    }
    loadModel()
  }, [searchParams])
  
  const [content, setContent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // 본인 정보 폼 상태
  const [name, setName] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')
  const [calendarType, setCalendarType] = useState<'solar' | 'lunar' | 'lunar-leap'>('solar')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [birthHour, setBirthHour] = useState('')
  
  // 이성 정보 폼 상태 (궁합형일 경우)
  const [partnerName, setPartnerName] = useState('')
  const [partnerGender, setPartnerGender] = useState<'male' | 'female' | ''>('')
  const [partnerCalendarType, setPartnerCalendarType] = useState<'solar' | 'lunar' | 'lunar-leap'>('solar')
  const [partnerYear, setPartnerYear] = useState('')
  const [partnerMonth, setPartnerMonth] = useState('')
  const [partnerDay, setPartnerDay] = useState('')
  const [partnerBirthHour, setPartnerBirthHour] = useState('')
  
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [savedResults, setSavedResults] = useState<any[]>([])
  
  // 스트리밍 로딩 팝업 상태
  const [showLoadingPopup, setShowLoadingPopup] = useState(false)
  const [streamingProgress, setStreamingProgress] = useState(0)
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('')
  
  // 이용약관 팝업 상태
  const [showTermsPopup, setShowTermsPopup] = useState(false)
  
  // 개인정보 수집 및 이용 팝업 상태
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false)
  
  // 음성 재생 상태
  const [playingResultId, setPlayingResultId] = useState<string | null>(null)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  
  // 궁합형 여부 확인
  const isGonghapType = content?.content_type === 'gonghap'

  // 저장된 결과 목록 로드
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

      // 저장된 컨텐츠에서 화자 정보 가져오기 (기본값: nara)
      const speaker = savedResult.content?.tts_speaker || 'nara'

      // 텍스트를 2000자 단위로 분할
      const maxLength = 2000
      const chunks = splitTextIntoChunks(textContent, maxLength)
      
      console.log(`저장된 결과 음성 변환 시작, 전체 텍스트 길이: ${textContent.length}자, 청크 수: ${chunks.length}, 화자: ${speaker}`)

      // 각 청크를 순차적으로 변환하고 재생
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        console.log(`청크 ${i + 1}/${chunks.length} 처리 중, 길이: ${chunk.length}자`)

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
          throw new Error(error.error || `청크 ${i + 1} 음성 변환에 실패했습니다.`)
        }

        // 오디오 데이터를 Blob으로 변환
        const audioBlob = await response.blob()
        const url = URL.createObjectURL(audioBlob)

        // 오디오 재생 (Promise로 대기)
        await new Promise<void>((resolve, reject) => {
          const audio = new Audio(url)
          setCurrentAudio(audio) // 현재 오디오 저장
          
          audio.onended = () => {
            URL.revokeObjectURL(url)
            setCurrentAudio(null)
            resolve()
          }
          
          audio.onerror = () => {
            URL.revokeObjectURL(url)
            setCurrentAudio(null)
            reject(new Error(`청크 ${i + 1} 재생 중 오류가 발생했습니다.`))
          }
          
          audio.onpause = () => {
            // 사용자가 일시정지하거나 페이지가 비활성화된 경우
            if (document.hidden) {
              setCurrentAudio(null)
              setPlayingResultId(null)
            }
          }
          
          audio.play().catch(reject)
        })
      }

      console.log('모든 청크 재생 완료')
      setPlayingResultId(null)
      setCurrentAudio(null)
    } catch (error: any) {
      console.error('저장된 결과 음성 변환 실패:', error)
      alert(error?.message || '음성 변환에 실패했습니다.')
      setPlayingResultId(null)
      setCurrentAudio(null)
    }
  }

  // 페이지가 비활성화되면 음성 재생 중지
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && currentAudio) {
        // 페이지가 숨겨지면 오디오 중지
        currentAudio.pause()
        currentAudio.currentTime = 0
        setCurrentAudio(null)
        setPlayingResultId(null)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [currentAudio])

  useEffect(() => {
    loadContent()
    loadSavedResults()
  }, [title])

  const loadContent = async () => {
    try {
      const data = await getContents()
      let decodedTitle = title
      try {
        decodedTitle = decodeURIComponent(title)
      } catch (e) {
        // 이미 디코딩되었거나 잘못된 형식인 경우 원본 사용
        decodedTitle = title
      }
      const foundContent = data?.find((item: any) => item.content_name === decodedTitle)
      console.log('Form 페이지: 로드된 컨텐츠:', foundContent)
      console.log('Form 페이지: 컨텐츠의 tts_speaker (원본):', foundContent?.tts_speaker)
      
      // tts_speaker가 없거나 'nara'이면 app_settings에서 선택된 화자 사용
      if (foundContent && (!foundContent.tts_speaker || foundContent.tts_speaker === 'nara')) {
        try {
          const selectedSpeaker = await getSelectedSpeaker()
          console.log('Form 페이지: app_settings에서 선택된 화자:', selectedSpeaker)
          foundContent.tts_speaker = selectedSpeaker
          console.log('Form 페이지: 컨텐츠의 tts_speaker (업데이트됨):', foundContent.tts_speaker)
        } catch (error) {
          console.error('Form 페이지: 선택된 화자 조회 실패:', error)
        }
      }
      
      setContent(foundContent || null)
    } catch (error) {
      console.error('컨텐츠 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreeTerms || !agreePrivacy) {
      alert('서비스 이용 약관과 개인정보 수집 및 이용에 동의해주세요.')
      return
    }
    
    if (!content) {
      alert('컨텐츠 정보를 불러올 수 없습니다.')
      return
    }
    
    // 궁합형인 경우 이성 정보 필수 체크
    if (isGonghapType) {
      if (!partnerName || !partnerGender || !partnerYear || !partnerMonth || !partnerDay) {
        alert('이성 정보를 모두 입력해주세요.')
        return
      }
    }

    setSubmitting(true)

    // 시작 시간 기록
    const startTime = Date.now()
    console.log('결제 처리 시작 시간:', new Date(startTime).toISOString())

    try {
      // 상품 메뉴 소제목 파싱
      const menuSubtitles = content.menu_subtitle ? content.menu_subtitle.split('\n').filter((s: string) => s.trim()) : []
      const interpretationTools = content.interpretation_tool ? content.interpretation_tool.split('\n').filter((s: string) => s.trim()) : []
      const subtitleCharCount = parseInt(content.subtitle_char_count) || 500

      console.log('메뉴 소제목:', menuSubtitles)
      console.log('해석도구:', interpretationTools)

      if (menuSubtitles.length === 0) {
        alert('상품 메뉴 소제목이 설정되지 않았습니다.')
        setSubmitting(false)
        return
      }

      // 상품 메뉴 소제목과 해석도구 1:1 페어링
      const menuSubtitlePairs = menuSubtitles.map((subtitle: string, index: number) => {
        // 해석도구가 소제목보다 적으면 첫 번째 해석도구를 반복 사용
        const tool = interpretationTools[index] || interpretationTools[0] || ''
        return {
          subtitle: subtitle.trim(),
          interpretation_tool: tool,
          char_count: subtitleCharCount
        }
      })

      console.log('페어링된 데이터:', menuSubtitlePairs)

      // 현재 사용할 모델 확인 (최신 상태 - URL 파라미터 우선, 없으면 Supabase, 그것도 없으면 기본값)
      const urlModelParam = searchParams.get('model')
      let currentModel = urlModelParam
      
      if (!currentModel) {
        try {
          currentModel = await getSelectedModel()
          console.log('Form 페이지: Supabase에서 모델 가져옴:', currentModel)
        } catch (error) {
          console.error('모델 로드 실패, 기본값 사용:', error)
          currentModel = 'gemini-2.5-flash'
        }
      } else {
        console.log('Form 페이지: URL 파라미터 모델:', urlModelParam)
      }
      
      console.log('Form 페이지: 최종 사용할 모델:', currentModel)

      // 재미나이 API 호출
      const birthDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      const partnerBirthDate = isGonghapType 
        ? `${partnerYear}-${partnerMonth.padStart(2, '0')}-${partnerDay.padStart(2, '0')}`
        : undefined
      
      // 요청 데이터 준비 (결과 페이지에서 스트리밍으로 받기 위해)
      const requestData = {
        role_prompt: content.role_prompt || '',
        restrictions: content.restrictions || '',
        menu_subtitles: menuSubtitlePairs,
        menu_items: content.menu_items || [],
        user_info: {
          name,
          gender: gender === 'male' ? '남자' : '여자',
          birth_date: birthDate,
          birth_hour: birthHour || undefined
        },
        partner_info: isGonghapType ? {
          name: partnerName,
          gender: partnerGender === 'male' ? '남자' : '여자',
          birth_date: partnerBirthDate || '',
          birth_hour: partnerBirthHour || undefined
        } : undefined,
        model: currentModel
      }

      // 로딩 팝업 표시
      setShowLoadingPopup(true)
      setStreamingProgress(0)
      setCurrentSubtitle('내담자님의 사주명식을 자세히 분석중이에요')
      
      // 소제목 수 계산
      const totalSubtitles = menuSubtitlePairs.length
      console.log('전체 소제목 수:', totalSubtitles)
      
      // 가짜 로딩바 (스트리밍 도착 전까지 계속 증가)
      let fakeProgressInterval: NodeJS.Timeout | null = null
      let fakeProgressStartTime = Date.now()
      let isStreamingStarted = false
      let streamingStartProgress = 0
      let completedSubtitles = 0 // 완료된 소제목 수
      
      // 가짜 로딩바 시작 (스트리밍 도착 전까지 계속 증가, 최대 95%까지)
      fakeProgressInterval = setInterval(() => {
        if (isStreamingStarted) {
          // 스트리밍이 시작되면 가짜 로딩바 중지
          if (fakeProgressInterval) {
            clearInterval(fakeProgressInterval)
            fakeProgressInterval = null
          }
          return
        }
        
        const elapsed = Date.now() - fakeProgressStartTime
        // 초기 30초 동안 빠르게 증가 (0% -> 30%), 그 이후 느리게 증가 (30% -> 95%)
        let fakeProgress = 0
        if (elapsed <= 30000) {
          // 처음 30초: 0% -> 30%
          fakeProgress = (elapsed / 30000) * 30
        } else {
          // 30초 이후: 30% -> 95% (매우 느리게 증가, 약 2분 동안)
          const additionalTime = elapsed - 30000
          const additionalProgress = Math.min(65, (additionalTime / 120000) * 65) // 2분 동안 65% 증가
          fakeProgress = 30 + additionalProgress
        }
        
        fakeProgress = Math.min(95, fakeProgress) // 최대 95%
        setStreamingProgress(fakeProgress)
        streamingStartProgress = fakeProgress
      }, 100) // 100ms마다 업데이트
      
      // 스트리밍 시작
      let accumulatedHtml = ''
      let finalHtml = ''
      
      console.log('=== 스트리밍 시작 ===')
      console.log('요청 데이터:', requestData)
      
      try {
        await callJeminaiAPIStream(requestData, (data) => {
          console.log('스트리밍 콜백 호출:', data.type, data)
          
          if (data.type === 'start') {
            console.log('스트리밍 시작')
            accumulatedHtml = ''
            isStreamingStarted = true
            completedSubtitles = 0
            
            // 가짜 로딩바 중지
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            
            // 스트리밍 시작 시점의 진행도를 기준으로 실제 진행도 계산
            setStreamingProgress(Math.max(streamingStartProgress, 5))
            setCurrentSubtitle('내담자님의 사주명식을 자세히 분석중이에요')
          } else if (data.type === 'chunk') {
            accumulatedHtml += data.text || ''
            
            // 현재 생성 중인 소제목 추출 및 완료된 소제목 수 계산
            // HTML에서 subtitle-title 클래스를 가진 요소 찾기
            const subtitleMatch = accumulatedHtml.match(/<h3[^>]*class="subtitle-title"[^>]*>([^<]+)<\/h3>/g)
            if (subtitleMatch && subtitleMatch.length > 0) {
              // 완료된 소제목 수 업데이트 (감지된 소제목 수)
              const detectedSubtitles = subtitleMatch.length
              if (detectedSubtitles > completedSubtitles) {
                completedSubtitles = detectedSubtitles
                console.log(`소제목 ${completedSubtitles}/${totalSubtitles} 감지됨`)
                
                // 소제목이 감지되면 진행도를 즉시 업데이트
                // 스트리밍 시작 시점의 진행도부터 95%까지를 소제목 수에 따라 분배
                const baseProgress = streamingStartProgress || 30
                const remainingProgress = 95 - baseProgress
                
                // 완료된 소제목 비율에 따라 진행도 계산
                // 소제목이 감지되면 해당 소제목의 진행도를 즉시 반영
                const subtitleProgress = baseProgress + (completedSubtitles / totalSubtitles) * remainingProgress
                setStreamingProgress(Math.min(95, subtitleProgress))
              }
              
              // 현재 생성 중인 소제목 표시
              const lastMatch = subtitleMatch[subtitleMatch.length - 1]
              const subtitleText = lastMatch.replace(/<[^>]+>/g, '').trim()
              // 숫자-숫자 패턴 제거 (예: "1-1. 소제목" -> "소제목")
              const cleanSubtitle = subtitleText.replace(/^\d+-\d+[\.\s]\s*/, '').trim()
              if (cleanSubtitle) {
                setCurrentSubtitle(cleanSubtitle)
              }
            } else {
              // 아직 소제목이 생성되지 않았으면 첫 번째 소제목 예상
              if (menuSubtitlePairs.length > 0 && accumulatedHtml.length > 100) {
                const firstSubtitle = menuSubtitlePairs[0].subtitle.replace(/^\d+-\d+[\.\s]\s*/, '').trim()
                setCurrentSubtitle(firstSubtitle)
              }
            }
          } else if (data.type === 'done') {
            console.log('스트리밍 완료')
            console.log('최종 HTML 길이:', (data.html || accumulatedHtml).length)
            
            // 가짜 로딩바 중지
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            
            setStreamingProgress(100)
            setCurrentSubtitle('완료!')
            finalHtml = data.html || accumulatedHtml
            
            if (!finalHtml) {
              throw new Error('생성된 결과가 없습니다.')
            }
            
            // 결과 데이터 준비
            const resultData = {
              content, // content 객체 전체 저장 (tts_speaker 포함)
              html: finalHtml,
              startTime: startTime,
              model: currentModel
            }
            
            console.log('Form 페이지: 저장할 resultData의 content:', content)
            console.log('Form 페이지: 저장할 content의 tts_speaker:', content?.tts_speaker)
            
            // 세션 스토리지에 저장
            const storageKey = `result_${Date.now()}`
            const resultDataStr = JSON.stringify(resultData)
            sessionStorage.setItem(storageKey, resultDataStr)
            
            console.log('결과 데이터 저장 완료, 키:', storageKey)
            
            // 약간의 지연 후 결과 페이지로 이동
            setTimeout(() => {
              setShowLoadingPopup(false)
              setSubmitting(false)
              router.push(`/result?key=${storageKey}`)
            }, 500)
          } else if (data.type === 'error') {
            console.error('스트리밍 에러:', data.error)
            
            // 가짜 로딩바 중지
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            
            setShowLoadingPopup(false)
            setSubmitting(false)
            alert(data.error || '스트리밍 중 오류가 발생했습니다.')
          }
        })
        
        console.log('스트리밍 호출 완료')
      } catch (streamError: any) {
        console.error('=== 스트리밍 호출 실패 ===')
        console.error('에러 타입:', typeof streamError)
        console.error('에러 객체:', streamError)
        console.error('에러 메시지:', streamError?.message)
        console.error('에러 스택:', streamError?.stack)
        
        // 가짜 로딩바 중지
        if (fakeProgressInterval) {
          clearInterval(fakeProgressInterval)
          fakeProgressInterval = null
        }
        
        setShowLoadingPopup(false)
        setSubmitting(false)
        alert(streamError?.message || '결제 처리 중 오류가 발생했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
      }
    } catch (error: any) {
      console.error('재미나이 API 호출 실패:', error)
      const errorMessage = error?.message || '결제 처리 중 오류가 발생했습니다.'
      console.error('에러 상세:', error)
      alert(`${errorMessage}\n\n개발자 도구 콘솔을 확인해주세요.`)
      setSubmitting(false)
    }
  }

  // 년도, 월, 일 옵션 생성
  const years = Array.from({ length: 76 }, (_, i) => 2025 - i)
  const months = Array.from({ length: 12 }, (_, i) => i + 1)
  const days = Array.from({ length: 31 }, (_, i) => i + 1)
  
  const birthHours = [
    { value: '', label: '태어난 시 - 모름' },
    { value: '子', label: '子(자) 23:30 ~ 01:29' },
    { value: '丑', label: '丑(축) 01:30 ~ 03:29' },
    { value: '寅', label: '寅(인) 03:30 ~ 05:29' },
    { value: '卯', label: '卯(묘) 05:30 ~ 07:29' },
    { value: '辰', label: '辰(진) 07:30 ~ 09:29' },
    { value: '巳', label: '巳(사) 09:30 ~ 11:29' },
    { value: '午', label: '午(오) 11:30 ~ 13:29' },
    { value: '未', label: '未(미) 13:30 ~ 15:29' },
    { value: '申', label: '申(신) 15:30 ~ 17:29' },
    { value: '酉', label: '酉(유) 17:30 ~ 19:29' },
    { value: '戌', label: '戌(술) 19:30 ~ 21:29' },
    { value: '亥', label: '亥(해) 21:30 ~ 23:29' },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p>로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* 이용약관 팝업 */}
      <TermsPopup isOpen={showTermsPopup} onClose={() => setShowTermsPopup(false)} />
      
      {/* 개인정보 수집 및 이용 팝업 */}
      <PrivacyPopup isOpen={showPrivacyPopup} onClose={() => setShowPrivacyPopup(false)} />
      
      {/* 스트리밍 로딩 팝업 */}
      {showLoadingPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900 mb-6">결과 생성 중...</h3>
              
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
              
              {/* 현재 생성 중인 소제목 */}
              {currentSubtitle && (
                <div className="mb-4">
                  <p className="text-gray-700 font-medium">
                    <span className="text-pink-600">{currentSubtitle}</span>
                    {currentSubtitle !== '내담자님의 사주명식을 자세히 분석중이에요' && (
                      <span className="text-gray-500">을 만들고 있어요</span>
                    )}
                  </p>
                </div>
              )}
              
              {/* 로딩 스피너 */}
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 상단 썸네일 영역 */}
        {content?.thumbnail_url ? (
          <div className="relative mb-8 overflow-hidden shadow-sm">
            <div className="relative h-96">
              <img 
                src={content.thumbnail_url} 
                alt={content.content_name || '썸네일'}
                className="w-full h-full object-cover"
              />
              {/* NEW 태그 */}
              {content?.is_new && (
                <div className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-lg">
                  NEW
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative mb-8 overflow-hidden shadow-sm">
            <div className="relative h-96 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900">
              {/* NEW 태그 */}
              {content?.is_new && (
                <div className="absolute top-4 left-4 bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-md shadow-lg">
                  NEW
                </div>
              )}
            </div>
          </div>
        )}

        {/* 제목 */}
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 text-center leading-tight">
          {content?.content_name || (() => {
            try {
              return decodeURIComponent(title)
            } catch (e) {
              return title
            }
          })()}
        </h1>

        {/* 단일 배경 라운드박스 (소개, 추천, 상품 메뉴 구성, 본인 정보) */}
        <div className="bg-gray-100 rounded-xl p-6 md:p-8 mb-8">
          {/* 소개 섹션 */}
          {content?.introduction && (
            <div className="mb-6 pb-6 border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
              <h2 className="text-xl font-bold text-gray-900 mb-4">소개</h2>
              <div 
                className="text-gray-700 leading-relaxed whitespace-pre-line"
                dangerouslySetInnerHTML={{ __html: content.introduction }}
              />
            </div>
          )}

          {/* 추천 섹션 */}
          {content?.recommendation && (
            <div className="mb-6 pb-6 border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                이런 분께 추천해요 ✨
              </h2>
              <div 
                className="text-gray-700 leading-loose whitespace-pre-line"
                dangerouslySetInnerHTML={{ __html: content.recommendation }}
              />
            </div>
          )}

          {/* 상품 메뉴 구성 */}
          {content?.menu_items && content.menu_items.length > 0 && (
            <div className="mb-6 pb-6 border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
              <h2 className="text-xl font-bold text-gray-900 mb-4">상품 메뉴 구성</h2>
              <div className="space-y-3">
                {content.menu_items.map((item: any, index: number) => {
                  const itemValue = typeof item === 'string' ? item : (item.value || item)
                  return (
                    <div 
                      key={index} 
                      className="text-gray-700"
                      dangerouslySetInnerHTML={{ __html: itemValue }}
                    />
                  )
                })}
              </div>
            </div>
          )}

          {/* 본인 정보 및 이성 정보 입력 폼 */}
          <div className="pt-6 mt-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">본인 정보</h2>
          
          <div className="space-y-6">
            {/* 이름 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                placeholder="이름을 입력하세요"
                required
              />
            </div>

            {/* 성별 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                성별
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === 'male'}
                    onChange={(e) => setGender(e.target.value as 'male')}
                    className="w-5 h-5 text-pink-500"
                  />
                  <span className="text-gray-700">남자</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === 'female'}
                    onChange={(e) => setGender(e.target.value as 'female')}
                    className="w-5 h-5 text-pink-500"
                  />
                  <span className="text-gray-700">여자</span>
                </label>
              </div>
            </div>

            {/* 생년월일 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                생년월일
              </label>
              <div className="flex flex-wrap gap-3">
                {/* 양력/음력 선택 */}
                <div className="flex gap-2 mb-3 w-full">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="calendarType"
                      value="solar"
                      checked={calendarType === 'solar'}
                      onChange={(e) => setCalendarType(e.target.value as 'solar')}
                      className="w-4 h-4 text-pink-500"
                    />
                    <span className="text-sm text-gray-700">양력</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="calendarType"
                      value="lunar"
                      checked={calendarType === 'lunar'}
                      onChange={(e) => setCalendarType(e.target.value as 'lunar')}
                      className="w-4 h-4 text-pink-500"
                    />
                    <span className="text-sm text-gray-700">음력</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="calendarType"
                      value="lunar-leap"
                      checked={calendarType === 'lunar-leap'}
                      onChange={(e) => setCalendarType(e.target.value as 'lunar-leap')}
                      className="w-4 h-4 text-pink-500"
                    />
                    <span className="text-sm text-gray-700">음력(윤)</span>
                  </label>
                </div>

                {/* 년도 */}
                <select
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="flex-1 min-w-[120px] bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                >
                  <option value="">년도</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}년</option>
                  ))}
                </select>

                {/* 월 */}
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  className="flex-1 min-w-[100px] bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                >
                  <option value="">월</option>
                  {months.map((m) => (
                    <option key={m} value={m}>{m}월</option>
                  ))}
                </select>

                {/* 일 */}
                <select
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                  className="flex-1 min-w-[100px] bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  required
                >
                  <option value="">일</option>
                  {days.map((d) => (
                    <option key={d} value={d}>{d}일</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 태어난 시 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                태어난 시
              </label>
              <select
                value={birthHour}
                onChange={(e) => setBirthHour(e.target.value)}
                className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              >
                {birthHours.map((hour) => (
                  <option key={hour.value} value={hour.value}>
                    {hour.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 이성 정보 입력 폼 (궁합형인 경우) */}
            {isGonghapType && (
              <>
                <div className="border-t border-gray-300 pt-6 mt-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">이성 정보</h2>
                  
                  <div className="space-y-6">
                {/* 이름 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    이름
                  </label>
                  <input
                    type="text"
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                    placeholder="이름을 입력하세요"
                    required
                  />
                </div>

                {/* 성별 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    성별
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="partnerGender"
                        value="male"
                        checked={partnerGender === 'male'}
                        onChange={(e) => setPartnerGender(e.target.value as 'male')}
                        className="w-5 h-5 text-pink-500"
                      />
                      <span className="text-gray-700">남자</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="partnerGender"
                        value="female"
                        checked={partnerGender === 'female'}
                        onChange={(e) => setPartnerGender(e.target.value as 'female')}
                        className="w-5 h-5 text-pink-500"
                      />
                      <span className="text-gray-700">여자</span>
                    </label>
                  </div>
                </div>

                {/* 생년월일 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    생년월일
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {/* 양력/음력 선택 */}
                    <div className="flex gap-2 mb-3 w-full">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="partnerCalendarType"
                          value="solar"
                          checked={partnerCalendarType === 'solar'}
                          onChange={(e) => setPartnerCalendarType(e.target.value as 'solar')}
                          className="w-4 h-4 text-pink-500"
                        />
                        <span className="text-sm text-gray-700">양력</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="partnerCalendarType"
                          value="lunar"
                          checked={partnerCalendarType === 'lunar'}
                          onChange={(e) => setPartnerCalendarType(e.target.value as 'lunar')}
                          className="w-4 h-4 text-pink-500"
                        />
                        <span className="text-sm text-gray-700">음력</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="partnerCalendarType"
                          value="lunar-leap"
                          checked={partnerCalendarType === 'lunar-leap'}
                          onChange={(e) => setPartnerCalendarType(e.target.value as 'lunar-leap')}
                          className="w-4 h-4 text-pink-500"
                        />
                        <span className="text-sm text-gray-700">음력(윤)</span>
                      </label>
                    </div>

                    {/* 년도 */}
                    <select
                      value={partnerYear}
                      onChange={(e) => setPartnerYear(e.target.value)}
                      className="flex-1 min-w-[120px] bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    >
                      <option value="">년도</option>
                      {years.map((y) => (
                        <option key={y} value={y}>{y}년</option>
                      ))}
                    </select>

                    {/* 월 */}
                    <select
                      value={partnerMonth}
                      onChange={(e) => setPartnerMonth(e.target.value)}
                      className="flex-1 min-w-[100px] bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    >
                      <option value="">월</option>
                      {months.map((m) => (
                        <option key={m} value={m}>{m}월</option>
                      ))}
                    </select>

                    {/* 일 */}
                    <select
                      value={partnerDay}
                      onChange={(e) => setPartnerDay(e.target.value)}
                      className="flex-1 min-w-[100px] bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                      required
                    >
                      <option value="">일</option>
                      {days.map((d) => (
                        <option key={d} value={d}>{d}일</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 태어난 시 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    태어난 시
                  </label>
                  <select
                    value={partnerBirthHour}
                    onChange={(e) => setPartnerBirthHour(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-300 rounded-lg px-4 py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  >
                    {birthHours.map((hour) => (
                      <option key={hour.value} value={hour.value}>
                        {hour.label}
                      </option>
                    ))}
                  </select>
                </div>
                  </div>
                </div>
              </>
            )}

            {/* 약관 동의 */}
            <div className="space-y-3 pt-4 border-t border-gray-200">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agreeTerms"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  className="w-5 h-5 text-pink-500 rounded mt-0.5"
                  required
                />
                <label htmlFor="agreeTerms" className="text-sm text-gray-700 cursor-pointer flex-1">
                  서비스 이용 약관에 동의{' '}
                  <span 
                    className="text-pink-500 underline cursor-pointer hover:text-pink-600"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setShowTermsPopup(true)
                    }}
                  >
                    [이용약관보기]
                  </span>
                </label>
              </div>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="agreePrivacy"
                  checked={agreePrivacy}
                  onChange={(e) => setAgreePrivacy(e.target.checked)}
                  className="w-5 h-5 text-pink-500 rounded mt-0.5"
                  required
                />
                <label htmlFor="agreePrivacy" className="text-sm text-gray-700 cursor-pointer flex-1">
                  개인정보 수집 및 이용동의{' '}
                  <span 
                    className="text-pink-500 underline cursor-pointer hover:text-pink-600"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setShowPrivacyPopup(true)
                    }}
                  >
                    [고지내용보기]
                  </span>
                </label>
              </div>
            </div>

            {/* 버튼 영역 */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>처리 중...</span>
                  </>
                ) : (
                  '결제하기'
                )}
              </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-4 px-8 rounded-xl transition-colors duration-200"
              >
                이전으로
              </button>
            </div>
          </div>
          </div>
        </div>

        {/* 이용안내 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">이용안내</h3>
          <div className="space-y-2 text-sm text-gray-700">
            <p>※ 회원님의 실수로 인하여 결제된 서비스에 대해서는 교환 및 환불이 안됩니다.</p>
            <p>※ 재회 결과는 60일간 메인→하단 비회원 다시보기에서 이용하실 수 있습니다.</p>
          </div>
        </div>

        {/* 저장된 결과 목록 */}
        {savedResults.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
            <h3 className="text-lg font-bold text-gray-900 mb-4">저장된 결과</h3>
            <div className="space-y-3">
              <div className="space-y-2">
                {savedResults.map((saved: any) => (
                  <div key={saved.id} className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">{saved.title}</p>
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
                          onClick={() => {
                            if (typeof window === 'undefined') return
                            try {
                              const newWindow = window.open('', '_blank')
                              if (newWindow) {
                                const savedMenuFontSize = saved.content?.menu_font_size || 16
                                const savedSubtitleFontSize = saved.content?.subtitle_font_size || 14
                                const savedBodyFontSize = saved.content?.body_font_size || 11

                                const savedDynamicStyles = `
                                  .menu-title { font-size: ${savedMenuFontSize}px !important; }
                                  .subtitle-title { font-size: ${savedSubtitleFontSize}px !important; }
                                  .subtitle-content { font-size: ${savedBodyFontSize}px !important; }
                                `

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
                                      h1 {
                                        font-size: 28px;
                                        font-weight: bold;
                                        margin-bottom: 8px;
                                        color: #111;
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
                                      .title-container {
                                        margin-bottom: 8px;
                                      }
                                      .tts-button {
                                        background: linear-gradient(to right, #f9fafb, #f3f4f6);
                                        color: #1f2937;
                                        border: 1px solid #d1d5db;
                                        padding: 12px 24px;
                                        border-radius: 12px;
                                        font-size: 14px;
                                        font-weight: 600;
                                        cursor: pointer;
                                        display: flex;
                                        align-items: center;
                                        justify-content: center;
                                        gap: 12px;
                                        transition: all 0.3s ease;
                                        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                                        min-width: 180px;
                                        margin-bottom: 16px;
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
                                        font-size: 20px;
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
                                      ${savedDynamicStyles}
                                    </style>
                                  </head>
                                  <body>
                                    <div class="container">
                                      <div class="title-container">
                                        <h1>${saved.title}</h1>
                                      </div>
                                      <div>
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
                                      // 저장된 컨텐츠의 화자 정보를 전역 변수로 설정
                                      window.savedContentSpeaker = ${saved.content?.tts_speaker ? `'${saved.content.tts_speaker}'` : "'nara'"};
                                      
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
                                            const lastNewline = chunk.lastIndexOf('\\n');
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
                                          
                                          console.log('음성 변환 시작, 전체 텍스트 길이:', textContent.length, '자, 청크 수:', chunks.length);

                                          // 각 청크를 순차적으로 변환하고 재생
                                          for (let i = 0; i < chunks.length; i++) {
                                            // 중지 플래그 확인
                                            if (shouldStop) {
                                              console.log('재생 중지됨');
                                              break;
                                            }

                                            const chunk = chunks[i];
                                            console.log('청크', i + 1, '/', chunks.length, '처리 중, 길이:', chunk.length, '자');

                                            // TTS API 호출 (화자 정보 포함)
                                            const speaker = window.savedContentSpeaker || 'nara';
                                            const response = await fetch('/api/tts', {
                                              method: 'POST',
                                              headers: {
                                                'Content-Type': 'application/json',
                                              },
                                              body: JSON.stringify({ text: chunk, speaker }),
                                            });

                                            if (!response.ok) {
                                              const error = await response.json();
                                              throw new Error(error.error || '청크 ' + (i + 1) + ' 음성 변환에 실패했습니다.');
                                            }

                                            // 중지 플래그 재확인
                                            if (shouldStop) {
                                              console.log('재생 중지됨 (API 호출 후)');
                                              break;
                                            }

                                            // 오디오 데이터를 Blob으로 변환
                                            const audioBlob = await response.blob();
                                            const url = URL.createObjectURL(audioBlob);

                                            // 오디오 재생 (Promise로 대기)
                                            await new Promise((resolve, reject) => {
                                              // 중지 플래그 재확인
                                              if (shouldStop) {
                                                URL.revokeObjectURL(url);
                                                resolve();
                                                return;
                                              }

                                              const audio = new Audio(url);
                                              currentAudio = audio; // 현재 오디오 저장
                                              
                                              audio.onended = () => {
                                                URL.revokeObjectURL(url);
                                                currentAudio = null;
                                                resolve();
                                              };
                                              
                                              audio.onerror = () => {
                                                URL.revokeObjectURL(url);
                                                currentAudio = null;
                                                reject(new Error('청크 ' + (i + 1) + ' 재생 중 오류가 발생했습니다.'));
                                              };
                                              
                                              audio.onpause = () => {
                                                // 사용자가 일시정지하거나 페이지가 비활성화된 경우
                                                if (document.hidden || shouldStop) {
                                                  currentAudio = null;
                                                  isPlaying = false;
                                                  button.disabled = false;
                                                  icon.textContent = '🔊';
                                                  text.textContent = '음성으로 듣기';
                                                }
                                              };
                                              
                                              audio.play().catch(reject);
                                            });

                                            // 중지 플래그 재확인
                                            if (shouldStop) {
                                              console.log('재생 중지됨 (재생 후)');
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
                            } catch (e) {
                              console.error('저장된 결과 보기 실패:', e)
                              alert('저장된 결과를 불러오는데 실패했습니다.')
                            }
                          }}
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
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function FormPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p>로딩 중...</p>
        </div>
      </div>
    }>
      <FormContent />
    </Suspense>
  )
}

