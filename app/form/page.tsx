'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { getContents, getSelectedModel, getSelectedSpeaker, getFortuneViewMode } from '@/lib/supabase-admin'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import { calculateManseRyeok, generateManseRyeokTable, generateManseRyeokText, getDayGanji, type ManseRyeokCaptionInfo, convertSolarToLunarAccurate, convertLunarToSolarAccurate } from '@/lib/manse-ryeok'
import TermsPopup from '@/components/TermsPopup'
import PrivacyPopup from '@/components/PrivacyPopup'

function FormContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const title = searchParams.get('title') || ''
  
  // 모델 상태 관리
  const [model, setModel] = useState<string>('gemini-3-flash-preview')
  
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
          setModel('gemini-3-flash-preview')
        }
      }
    }
    loadModel()
  }, [searchParams])
  
  const [content, setContent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  
  // 재회상품 미리보기 모달 상태
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [modalCurrentIndex, setModalCurrentIndex] = useState(0)
  const [modalTouchStartX, setModalTouchStartX] = useState<number | null>(null)
  const [modalTouchEndX, setModalTouchEndX] = useState<number | null>(null)
  const [modalSwipeOffset, setModalSwipeOffset] = useState(0)
  const [modalIsAnimating, setModalIsAnimating] = useState(false)
  
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
  const [pdfExistsMap, setPdfExistsMap] = useState<Record<string, boolean>>({})
  
  // 스트리밍 로딩 팝업 상태
  const [showLoadingPopup, setShowLoadingPopup] = useState(false)
  const [streamingProgress, setStreamingProgress] = useState(0)
  const [currentSubtitle, setCurrentSubtitle] = useState<string>('')
  
  // 이용약관 팝업 상태
  const [showTermsPopup, setShowTermsPopup] = useState(false)
  
  // 개인정보 수집 및 이용 팝업 상태
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false)
  
  // 동의 안내 팝업 상태
  const [showAgreementAlert, setShowAgreementAlert] = useState(false)
  
  // 필수 정보 필드별 에러 상태
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string
    gender?: string
    birthDate?: string
    partnerName?: string
    partnerGender?: string
    partnerBirthDate?: string
  }>({})
  
  // 음성 재생 상태
  const [playingResultId, setPlayingResultId] = useState<string | null>(null)
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  
  // 궁합형 여부 확인
  const isGonghapType = content?.content_type === 'gonghap'

  // 포털 연동: JWT 토큰에서 사용자 정보 자동 입력
  const [formLocked, setFormLocked] = useState(false) // 포털에서 받은 정보는 읽기 전용
  useEffect(() => {
    const token = searchParams.get('token')
    if (token) {
      // JWT 토큰 검증 및 사용자 정보 가져오기
      fetch('/api/portal/verify-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.userInfo) {
            const userInfo = data.userInfo
            // 사용자 정보 자동 입력
            setName(userInfo.name || '')
            setGender(userInfo.gender || '')
            
            // 생년월일 파싱
            if (userInfo.birthDate) {
              const [y, m, d] = userInfo.birthDate.split('-')
              setYear(y || '')
              setMonth(m || '')
              setDay(d || '')
            }
            
            // 생시 파싱
            if (userInfo.birthTime) {
              setBirthHour(userInfo.birthTime)
            }
            
            // 달력 타입
            if (userInfo.calendarType) {
              setCalendarType(userInfo.calendarType)
            }
            
            // 폼 잠금 (포털에서 받은 정보는 수정 불가)
            setFormLocked(true)
            
            console.log('포털로부터 사용자 정보 자동 입력 완료:', userInfo)
          } else {
            console.error('토큰 검증 실패:', data.error)
            alert('유효하지 않은 접근입니다.')
          }
        })
        .catch((error) => {
          console.error('토큰 검증 오류:', error)
          alert('사용자 정보를 불러오는 중 오류가 발생했습니다.')
        })
    }
  }, [searchParams])

  // 저장된 결과 목록 로드 (서버)
  const loadSavedResults = async () => {
    if (typeof window === 'undefined') return
    try {
      console.log('=== 저장된 결과 목록 로드 시작 ===')
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
      console.log('=== 저장된 결과 목록 로드 완료 ===')
    } catch (e) {
      console.error('저장된 결과 불러오기 실패:', e)
      console.error('에러 상세:', e instanceof Error ? e.stack : e)
      setSavedResults([])
    }
  }

  // PDF 파일 존재 여부 확인
  useEffect(() => {
    const checkPdfExists = async () => {
      if (savedResults.length === 0) return
      
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const checks = await Promise.all(
        savedResults.map(async (saved: any) => {
          if (!saved.id) return null
          try {
            const pdfUrl = `${supabaseUrl}/storage/v1/object/public/pdfs/${saved.id}.pdf`
            const response = await fetch(pdfUrl, { method: 'HEAD' })
            return { id: saved.id, exists: response.ok }
          } catch (error) {
            return { id: saved.id, exists: false }
          }
        })
      )
      
      const newMap: Record<string, boolean> = {}
      checks.forEach(check => {
        if (check) {
          newMap[check.id] = check.exists
        }
      })
      
      setPdfExistsMap(newMap)
    }
    
    checkPdfExists()
  }, [savedResults])

  // 저장된 결과 삭제 (서버)
  const deleteSavedResult = async (resultId: string) => {
    if (typeof window === 'undefined') return
    
    // 삭제 확인
    if (!confirm('정말로 이 결과를 삭제하시겠습니까?')) {
      return
    }
    
    try {
      const response = await fetch(`/api/saved-results/delete?id=${resultId}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '저장된 결과 삭제 실패')
      }
      
      const result = await response.json()
      if (result.success) {
        // 즉시 로컬 상태에서 제거 (UI 즉시 업데이트)
        setSavedResults((prev) => prev.filter((item: any) => item.id !== resultId))
        // 백그라운드에서 서버와 동기화
        setTimeout(async () => {
          await loadSavedResults()
        }, 100)
        // 성공 메시지 (선택적)
        console.log('저장된 결과가 삭제되었습니다.')
      } else {
        throw new Error(result.error || '저장된 결과 삭제에 실패했습니다.')
      }
    } catch (e: any) {
      console.error('저장된 결과 삭제 실패:', e)
      alert(e?.message || '저장된 결과 삭제에 실패했습니다.')
    }
  }

  // HTML에서 텍스트 추출 (태그 제거)
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
  }, [title])

  // 저장된 결과는 컴포넌트 마운트 시와 title 변경 시 모두 로드
  useEffect(() => {
    console.log('Form 페이지: useEffect에서 loadSavedResults 호출')
    loadSavedResults()
  }, [])

  // 페이지 포커스 시 저장된 결과 동기화
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        console.log('Form 페이지: 페이지 포커스 감지, 저장된 결과 동기화')
        loadSavedResults()
      }
    }

    const handleFocus = () => {
      console.log('Form 페이지: window focus 감지, 저장된 결과 동기화')
      loadSavedResults()
    }

    // visibilitychange 이벤트: 탭 전환 시
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // focus 이벤트: 창 포커스 시
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // savedResults 변경 시 로깅
  useEffect(() => {
    console.log('Form 페이지: savedResults 변경됨, 길이:', savedResults.length)
    console.log('Form 페이지: savedResults 내용:', savedResults)
  }, [savedResults])


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
      console.log('Form 페이지: 컨텐츠의 preview_thumbnails:', foundContent?.preview_thumbnails)
      
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
    
    // 에러 상태 초기화
    const errors: typeof fieldErrors = {}
    let hasError = false
    
    // 본인 정보 필수 체크
    if (!name || !name.trim()) {
      errors.name = '이름을 입력해주세요.'
      hasError = true
    }
    
    if (!gender) {
      errors.gender = '성별을 선택해주세요.'
      hasError = true
    }
    
    if (!year || !month || !day) {
      errors.birthDate = '생년월일을 모두 선택해주세요.'
      hasError = true
    }
    
    // 궁합형인 경우 이성 정보 필수 체크
    if (isGonghapType) {
      if (!partnerName || !partnerName.trim()) {
        errors.partnerName = '이름을 입력해주세요.'
        hasError = true
      }
      
      if (!partnerGender) {
        errors.partnerGender = '성별을 선택해주세요.'
        hasError = true
      }
      
      if (!partnerYear || !partnerMonth || !partnerDay) {
        errors.partnerBirthDate = '생년월일을 모두 선택해주세요.'
        hasError = true
      }
    }
    
    if (hasError) {
      setFieldErrors(errors)
      // 첫 번째 에러 필드로 스크롤
      const firstErrorField = document.querySelector('[data-field-error]')
      if (firstErrorField) {
        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      return
    }
    
    // 에러가 없으면 에러 상태 초기화
    setFieldErrors({})
    
    if (!agreeTerms || !agreePrivacy) {
      setShowAgreementAlert(true)
      return
    }
    
    if (!content) {
      alert('컨텐츠 정보를 불러올 수 없습니다.')
      return
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
          currentModel = 'gemini-3-flash-preview'
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
      
      // 만세력 계산
      let manseRyeokTable = '' // HTML 테이블 (화면 표시용)
      let manseRyeokText = '' // 텍스트 형식 (제미나이 프롬프트용)
      let manseRyeokData: any = null // 구조화 만세력 데이터
      let dayGanInfo = null // 일간 정보 저장
      if (year && month && day) {
        try {
          const birthYear = parseInt(year)
          const birthMonth = parseInt(month)
          const birthDay = parseInt(day)
          // 태어난 시를 숫자로 변환 (예: "23-01" -> 23)
          let birthHourNum = 10 // 기본값 10시 (오전 10시)
          if (birthHour) {
            // 지지 문자인 경우 시간 매핑
            const hourMap: { [key: string]: number } = {
              '子': 0, '丑': 2, '寅': 4, '卯': 6, '辰': 8, '巳': 10,
              '午': 12, '未': 14, '申': 16, '酉': 18, '戌': 20, '亥': 22
            }
            if (hourMap[birthHour] !== undefined) {
              birthHourNum = hourMap[birthHour]
            } else {
              const hourMatch = birthHour.match(/(\d+)/)
              if (hourMatch) {
                birthHourNum = parseInt(hourMatch[1])
              }
            }
          }
          
          // 일주 계산하여 일간 얻기
          const dayGanji = getDayGanji(birthYear, birthMonth, birthDay)
          const dayGan = dayGanji.gan
          
          // 일간 오행 정보 추출
          const OHENG_MAP: { [key: string]: string } = {
            '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토', '기': '토', '경': '금', '신': '금', '임': '수', '계': '수'
          }
          const dayGanOhang = OHENG_MAP[dayGan] || ''
          
          // 일간 정보 저장 (한자 포함)
          const SIBGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
          const SIBGAN_HANGUL = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']
          const ganIndex = SIBGAN_HANGUL.indexOf(dayGan)
          const dayGanHanja = ganIndex >= 0 ? SIBGAN[ganIndex] : ''
          
          dayGanInfo = {
            gan: dayGan,
            hanja: dayGanHanja,
            ohang: dayGanOhang,
            fullName: `${dayGan}${dayGanOhang}(${dayGanHanja}${dayGanOhang})`
          }
          
          // 만세력 계산 (일간 기준)
          manseRyeokData = calculateManseRyeok(birthYear, birthMonth, birthDay, birthHourNum, dayGan)
          
          // 캡션 정보 생성
          // 음력/양력 변환
          let convertedDate: { year: number; month: number; day: number } | null = null
          try {
            if (calendarType === 'solar') {
              // 양력인 경우 음력으로 변환
              convertedDate = convertSolarToLunarAccurate(birthYear, birthMonth, birthDay)
            } else if (calendarType === 'lunar' || calendarType === 'lunar-leap') {
              // 음력 또는 음력(윤달)인 경우 양력으로 변환
              convertedDate = convertLunarToSolarAccurate(birthYear, birthMonth, birthDay, calendarType === 'lunar-leap')
            }
          } catch (error) {
            console.error('음력/양력 변환 오류:', error)
            convertedDate = null
          }
          
          const captionInfo: ManseRyeokCaptionInfo = {
            name: name || '',
            year: birthYear,
            month: birthMonth,
            day: birthDay,
            hour: birthHour || null,
            calendarType: calendarType,
            convertedDate: convertedDate
          }
          
          manseRyeokTable = generateManseRyeokTable(manseRyeokData, name, captionInfo) // HTML 테이블 (화면 표시용)
          manseRyeokText = generateManseRyeokText(manseRyeokData) // 텍스트 형식 (제미나이 프롬프트용)
          console.log('만세력 테이블 생성 완료, 일간:', dayGanInfo.fullName)
        } catch (error) {
          console.error('만세력 계산 오류:', error)
        }
      }
      
      // 만세력 생성 검증
      const manseRyeokJsonString = manseRyeokData ? JSON.stringify(manseRyeokData, null, 2) : ''
      console.log('만세력 생성 검증:', {
        year,
        month,
        day,
        birthHour,
        manseRyeokTextLength: manseRyeokText?.length || 0,
        manseRyeokJsonLength: manseRyeokJsonString?.length || 0,
        hasData: !!manseRyeokData
      })
      if (!manseRyeokText || !manseRyeokText.trim() || !manseRyeokData) {
        console.error('만세력 데이터가 생성되지 않았습니다.', { manseRyeokTextLength: manseRyeokText?.length || 0, hasData: !!manseRyeokData })
        alert('만세력 데이터 생성에 실패했습니다. 생년월일/태어난 시를 다시 확인해주세요.')
        setSubmitting(false)
        setShowLoadingPopup(false)
        return
      }

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
        model: currentModel,
        manse_ryeok_table: manseRyeokTable, // HTML 테이블 (화면 표시용)
        manse_ryeok_text: manseRyeokText, // 텍스트 형식 (제미나이 프롬프트용)
        manse_ryeok_json: manseRyeokData ? manseRyeokJsonString : undefined, // 구조화 데이터
        day_gan_info: dayGanInfo // 일간 정보 추가
      }

      // 점사 모드 확인
      let fortuneViewMode: 'batch' | 'realtime' = 'batch'
      try {
        fortuneViewMode = await getFortuneViewMode()
        console.log('Form 페이지: 점사 모드 확인:', fortuneViewMode)
      } catch (error) {
        console.error('Form 페이지: 점사 모드 로드 실패, 기본 batch 사용:', error)
        fortuneViewMode = 'batch'
      }

      // realtime 모드일 경우 즉시 result 페이지로 리다이렉트
      if (fortuneViewMode === 'realtime') {
        console.log('Form 페이지: realtime 모드 감지, result 페이지로 리다이렉트')
        
        // requestKey 생성 및 Supabase에 저장
        const requestKey = `request_${Date.now()}`
        const payload = {
          requestData,
          content,
          startTime,
          model: currentModel,
          userName: name
        }
        
        try {
          // Supabase에 임시 요청 데이터 저장
          const saveResponse = await fetch('/api/temp-request/save', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              requestKey,
              payload
            })
          })

          if (!saveResponse.ok) {
            const errorData = await saveResponse.json()
            throw new Error(errorData.error || '임시 요청 데이터 저장 실패')
          }

          const saveResult = await saveResponse.json()
          console.log('Form 페이지: Supabase에 requestKey 저장 완료:', requestKey)
        } catch (e: any) {
          console.error('Form 페이지: Supabase 저장 실패:', e?.message || e)
          alert('데이터 저장에 실패했습니다. 다시 시도해주세요.')
          setSubmitting(false)
          return
        }
        
        // result 페이지로 리다이렉트 (realtime 모드)
        setSubmitting(false)
        router.push(`/result?requestKey=${requestKey}&stream=true`)
        return
      }

      // batch 모드: 기존 로직 유지 (로딩 팝업 표시 후 스트리밍 수행)
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
      console.log('요청 데이터:', {
        ...requestData,
        manse_ryeok_text_preview: manseRyeokText?.slice(0, 200),
        manse_ryeok_text_length: manseRyeokText?.length,
        manse_ryeok_json_length: requestData.manse_ryeok_json?.length
      })
      
      try {
        await callJeminaiAPIStream(requestData, async (data) => {
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
            
            // 스트리밍 중에도 만세력 테이블을 가능한 한 빨리 삽입 (소제목 단위로 보여질 때)
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
            
            // 만세력 테이블이 있고 첫 번째 menu-section에 없으면 삽입
            if (manseRyeokTable && !finalHtml.includes('manse-ryeok-table')) {
              // 첫 번째 menu-section 찾기
              const firstMenuSectionMatch = finalHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
              
              if (firstMenuSectionMatch) {
                // 썸네일 다음에 만세력 테이블 삽입
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
            
            // 결과 데이터 준비
            const resultData = {
              content, // content 객체 전체 저장 (tts_speaker 포함)
              html: finalHtml,
              startTime: startTime,
              model: currentModel,
              userName: name // 사용자 이름 저장
            }
            
            console.log('Form 페이지: 저장할 resultData의 content:', content)
            console.log('Form 페이지: 저장할 content의 tts_speaker:', content?.tts_speaker)
            
            // batch 모드: 완료된 결과를 Supabase에 저장 (비동기로 실행)
            ;(async () => {
              try {
                const saveResponse = await fetch('/api/saved-results/save', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    title: content?.content_name || '재회 결과',
                    html: finalHtml,
                    content: content,
                    model: currentModel,
                    userName: name,
                    processingTime: Date.now() - startTime
                  })
                })

                if (!saveResponse.ok) {
                  const errorData = await saveResponse.json()
                  throw new Error(errorData.error || '결과 저장 실패')
                }

                const saveResult = await saveResponse.json()
                const savedId = saveResult.data?.id
                console.log('Form 페이지: batch 모드 결과 저장 완료, ID:', savedId)
                
                // 결과 페이지로 이동 (저장된 ID 사용)
                setShowLoadingPopup(false)
                setSubmitting(false)
                router.push(`/result?savedId=${savedId}`)
              } catch (e: any) {
                console.error('Form 페이지: batch 모드 결과 저장 실패:', e?.message || e)
                alert('결과 저장에 실패했습니다. 다시 시도해주세요.')
                setShowLoadingPopup(false)
                setSubmitting(false)
              }
            })()
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
  
  // 유효한 일자 계산 함수 (양력/음력/음력윤달 모두 지원)
  const getValidDays = (yearStr: string, monthStr: string, calendarType: 'solar' | 'lunar' | 'lunar-leap'): number[] => {
    if (!yearStr || !monthStr) {
      return Array.from({ length: 31 }, (_, i) => i + 1)
    }
    
    const year = parseInt(yearStr)
    const month = parseInt(monthStr)
    
    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return Array.from({ length: 31 }, (_, i) => i + 1)
    }
    
    // 양력의 경우
    if (calendarType === 'solar') {
      const daysInMonth = new Date(year, month, 0).getDate()
      return Array.from({ length: daysInMonth }, (_, i) => i + 1)
    }
    
    // 음력의 경우 (간단한 근사치 사용)
    // 음력은 복잡하므로, 양력과 유사하게 처리하되 윤달은 별도 처리
    if (calendarType === 'lunar' || calendarType === 'lunar-leap') {
      // 음력 월의 일수는 대략 29일 또는 30일
      // 실제로는 음력 변환 라이브러리가 필요하지만, 여기서는 양력 기준으로 근사치 사용
      // 음력 윤달의 경우도 동일하게 처리
      const daysInMonth = new Date(year, month, 0).getDate()
      // 음력은 보통 29일 또는 30일이지만, 양력 기준으로 계산
      return Array.from({ length: daysInMonth }, (_, i) => i + 1)
    }
    
    return Array.from({ length: 31 }, (_, i) => i + 1)
  }
  
  // 본인 정보의 유효한 일자
  const validDays = getValidDays(year, month, calendarType)
  
  // 이성 정보의 유효한 일자 (궁합형인 경우)
  const partnerValidDays = getValidDays(partnerYear, partnerMonth, partnerCalendarType)
  
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
      
      {/* 동의 안내 팝업 */}
      {showAgreementAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">안내</h2>
              <button
                onClick={() => setShowAgreementAlert(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>
            
            {/* 내용 */}
            <div className="mb-6">
              <p className="text-gray-700 text-center">
                서비스 이용 약관과 개인정보 수집 및 이용에 동의해주세요.
              </p>
            </div>
            
            {/* 푸터 */}
            <div>
              <button
                onClick={() => setShowAgreementAlert(false)}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
      
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
                    {currentSubtitle !== '내담자님의 사주명식을 자세히 분석중이에요' && 
                     currentSubtitle !== '완료!' && 
                     streamingProgress < 100 && (
                      <span className="text-gray-500"> 점사 중입니다</span>
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
      
      <main className="container mx-auto px-4 sm:px-6 py-8 max-w-4xl w-full">
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

          {/* 재회상품 미리보기 섹션 */}
          {(() => {
            const previewThumbnails = content?.preview_thumbnails
            console.log('Form 페이지: preview_thumbnails 체크', {
              previewThumbnails,
              type: typeof previewThumbnails,
              isArray: Array.isArray(previewThumbnails),
              length: previewThumbnails?.length,
              content: content
            })
            
            // preview_thumbnails가 배열이고, 하나 이상의 유효한 썸네일이 있는지 확인
            let validThumbnails: string[] = []
            if (previewThumbnails) {
              if (Array.isArray(previewThumbnails)) {
                validThumbnails = previewThumbnails.filter((thumb: any) => {
                  const thumbStr = String(thumb || '').trim()
                  return thumbStr && thumbStr.length > 0
                })
              } else if (typeof previewThumbnails === 'string') {
                // 문자열인 경우 파싱 시도
                try {
                  const parsed = JSON.parse(previewThumbnails)
                  if (Array.isArray(parsed)) {
                    validThumbnails = parsed.filter((thumb: any) => {
                      const thumbStr = String(thumb || '').trim()
                      return thumbStr && thumbStr.length > 0
                    })
                  }
                } catch (e) {
                  console.error('preview_thumbnails 파싱 에러:', e)
                }
              }
            }
            
            console.log('Form 페이지: validThumbnails', validThumbnails)
            
            if (validThumbnails.length === 0) {
              console.log('Form 페이지: 재회상품 미리보기 섹션 숨김 (유효한 썸네일 없음)')
              return null
            }
            
            // 모달 열기 함수
            const openPreviewModal = (initialIndex: number) => {
              setModalCurrentIndex(initialIndex)
              setShowPreviewModal(true)
            }
            
            // 모달 내부 네비게이션 함수 (로테이션 없음)
            const handleModalPrev = () => {
              setModalSwipeOffset(0) // 오프셋 초기화
              setModalCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev))
            }
            
            const handleModalNext = () => {
              setModalSwipeOffset(0) // 오프셋 초기화
              setModalCurrentIndex((prev) => (prev < validThumbnails.length - 1 ? prev + 1 : prev))
            }
            
            // 모달 내부 터치 이벤트 핸들러
            const handleModalTouchStart = (e: React.TouchEvent) => {
              setModalTouchStartX(e.touches[0].clientX)
              setModalSwipeOffset(0)
              setModalIsAnimating(false)
            }
            
            const handleModalTouchMove = (e: React.TouchEvent) => {
              if (modalTouchStartX === null) return
              
              const currentX = e.touches[0].clientX
              const distance = modalTouchStartX - currentX
              
              // 스와이프 방향과 반대로 오프셋 적용 (손가락을 따라가도록)
              let offset = -distance
              
              // 경계 체크: 첫 번째에서 오른쪽으로, 마지막에서 왼쪽으로 스와이프 시 제한
              if (modalCurrentIndex === 0 && distance < 0) {
                // 첫 번째에서 오른쪽으로 스와이프 (이전으로 가려는 시도) - 제한
                offset = Math.min(-distance, 30) // 최대 30px까지만
              } else if (modalCurrentIndex === validThumbnails.length - 1 && distance > 0) {
                // 마지막에서 왼쪽으로 스와이프 (다음으로 가려는 시도) - 제한
                offset = Math.max(-distance, -30) // 최대 30px까지만
              }
              
              setModalSwipeOffset(offset)
              setModalTouchEndX(currentX)
            }
            
            const handleModalTouchEnd = () => {
              if (modalTouchStartX === null || modalTouchEndX === null) return
              
              const distance = modalTouchStartX - modalTouchEndX
              const minSwipeDistance = 50
              
              // 경계 체크: 첫 번째에서 이전으로, 마지막에서 다음으로 가는 것 방지
              if (distance > minSwipeDistance) {
                // 왼쪽으로 스와이프 → 다음 이미지로 이동
                // 마지막이 아니면만 이동
                if (modalCurrentIndex < validThumbnails.length - 1) {
                  setModalSwipeOffset(0) // 오프셋 초기화
                  handleModalNext()
                } else {
                  // 경계에서 튕기는 애니메이션
                  setModalIsAnimating(true)
                  setModalSwipeOffset(0)
                  setTimeout(() => setModalIsAnimating(false), 300)
                }
              } else if (distance < -minSwipeDistance) {
                // 오른쪽으로 스와이프 → 이전 이미지로 이동
                // 첫 번째가 아니면만 이동
                if (modalCurrentIndex > 0) {
                  setModalSwipeOffset(0) // 오프셋 초기화
                  handleModalPrev()
                } else {
                  // 경계에서 튕기는 애니메이션
                  setModalIsAnimating(true)
                  setModalSwipeOffset(0)
                  setTimeout(() => setModalIsAnimating(false), 300)
                }
              } else {
                // 스와이프 거리가 부족하면 원래 위치로
                setModalSwipeOffset(0)
              }
              
              setModalTouchStartX(null)
              setModalTouchEndX(null)
            }
            
            return (
              <>
                <div className="mb-6 pb-6 border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">재회상품 미리보기</h2>
                  <div className="flex gap-4 flex-wrap">
                    {validThumbnails.map((thumbnail: string, index: number) => (
                      <img
                        key={index}
                        src={thumbnail}
                        alt={`재회상품 미리보기 ${index + 1}`}
                        className="cursor-pointer rounded-lg shadow-md hover:shadow-lg transition-shadow max-h-48 object-contain"
                        onClick={() => openPreviewModal(index)}
                      />
                    ))}
                  </div>
                </div>
                
                {/* 모달 */}
                {showPreviewModal && validThumbnails.length > 0 && (
                  <div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowPreviewModal(false)}
                  >
                    {/* PC용 좌/우 화살표 버튼 (2개 이상일 때만 표시) */}
                    {validThumbnails.length > 1 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleModalPrev()
                          }}
                          className="hidden md:flex absolute left-4 top-[calc(50%-4px)] -translate-y-0 bg-white hover:bg-gray-100 text-gray-800 font-bold text-2xl w-12 h-12 rounded-full shadow-lg transition-colors z-10 items-center justify-center leading-none"
                          aria-label="이전 썸네일"
                        >
                          <span className="flex items-center justify-center w-full h-full">‹</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleModalNext()
                          }}
                          className="hidden md:flex absolute right-4 top-[calc(50%-4px)] -translate-y-0 bg-white hover:bg-gray-100 text-gray-800 font-bold text-2xl w-12 h-12 rounded-full shadow-lg transition-colors z-10 items-center justify-center leading-none"
                          aria-label="다음 썸네일"
                        >
                          <span className="flex items-center justify-center w-full h-full">›</span>
                        </button>
                      </>
                    )}
                    
                    {/* 모달 컨텐츠 래퍼 */}
                    <div
                      className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center"
                      onClick={(e) => e.stopPropagation()}
                      onTouchStart={handleModalTouchStart}
                      onTouchMove={handleModalTouchMove}
                      onTouchEnd={handleModalTouchEnd}
                    >
                      {/* 이미지 캐러셀 */}
                      <div className="relative overflow-hidden w-full flex items-center justify-center">
                        <div
                          className="flex transition-transform duration-300 ease-in-out"
                          style={{ 
                            transform: `translateX(calc(-${modalCurrentIndex * 100}% + ${modalSwipeOffset}px))`,
                            transition: modalIsAnimating ? 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)' : (modalSwipeOffset === 0 ? 'transform 0.3s ease-in-out' : 'none')
                          }}
                        >
                          {validThumbnails.map((thumbnail: string, index: number) => (
                            <div key={index} className="min-w-full flex flex-col items-center">
                              {/* 이미지 컨테이너 (닫기 버튼 위치 기준) */}
                              <div className="relative inline-block">
                                {/* 플로팅 닫기 버튼 (우측 상단) */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setShowPreviewModal(false)
                                  }}
                                  className="absolute top-2 md:top-[18px] right-2 bg-black bg-opacity-60 hover:bg-opacity-80 text-white rounded-full w-10 h-10 flex items-center justify-center z-20 transition-all duration-200 shadow-lg"
                                  aria-label="닫기"
                                >
                                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                                <img
                                  src={thumbnail}
                                  alt={`재회상품 미리보기 ${index + 1}`}
                                  className="max-w-full max-h-[90vh] object-contain"
                                />
                              </div>
                              {/* 인디케이터 (2개 이상일 때만 표시, 썸네일 바로 아래) */}
                              {validThumbnails.length > 1 && (
                                <div className="flex justify-center gap-2 mt-4">
                                  {validThumbnails.map((_, idx: number) => (
                                    <button
                                      key={idx}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setModalCurrentIndex(idx)
                                      }}
                                      className={`w-2 h-2 rounded-full transition-colors ${
                                        idx === modalCurrentIndex ? 'bg-pink-500' : 'bg-gray-300'
                                      }`}
                                      aria-label={`썸네일 ${idx + 1}로 이동`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* 본인 정보 및 이성 정보 입력 폼 */}
          <div className="pt-6 mt-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">본인 정보</h2>
          
          <div className="space-y-6">
            {/* 이름 */}
            <div data-field-error={fieldErrors.name ? 'name' : undefined}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이름
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (fieldErrors.name) {
                    setFieldErrors(prev => ({ ...prev, name: undefined }))
                  }
                }}
                className={`w-full bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                  fieldErrors.name ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="이름을 입력하세요"
                required
              />
              {fieldErrors.name && (
                <div className="relative mt-2">
                  <div className="absolute top-0 left-0 bg-red-500 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 whitespace-nowrap">
                    {fieldErrors.name}
                    <div className="absolute -top-1.5 left-4 w-3 h-3 bg-red-500 transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>

            {/* 성별 */}
            <div data-field-error={fieldErrors.gender ? 'gender' : undefined}>
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
                    onChange={(e) => {
                      setGender(e.target.value as 'male')
                      if (fieldErrors.gender) {
                        setFieldErrors(prev => ({ ...prev, gender: undefined }))
                      }
                    }}
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
                    onChange={(e) => {
                      setGender(e.target.value as 'female')
                      if (fieldErrors.gender) {
                        setFieldErrors(prev => ({ ...prev, gender: undefined }))
                      }
                    }}
                    className="w-5 h-5 text-pink-500"
                  />
                  <span className="text-gray-700">여자</span>
                </label>
              </div>
              {fieldErrors.gender && (
                <div className="relative mt-2">
                  <div className="absolute top-0 left-0 bg-red-500 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 whitespace-nowrap">
                    {fieldErrors.gender}
                    <div className="absolute -top-1.5 left-4 w-3 h-3 bg-red-500 transform rotate-45"></div>
                  </div>
                </div>
              )}
            </div>

            {/* 생년월일 */}
            <div data-field-error={fieldErrors.birthDate ? 'birthDate' : undefined}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                생년월일
              </label>
              {/* 양력/음력 선택 */}
              <div className="flex gap-2 sm:gap-4 mb-3">
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
              
              {/* 년/월/일 선택 */}
              <div className="flex flex-row gap-3">
                {/* 년도 */}
                <select
                  value={year}
                  onChange={(e) => {
                    setYear(e.target.value)
                    // 년도가 변경되면 일자가 유효 범위를 벗어날 수 있으므로 초기화
                    if (e.target.value && month) {
                      const newValidDays = getValidDays(e.target.value, month, calendarType)
                      if (day && parseInt(day) > newValidDays.length) {
                        setDay('')
                      }
                    }
                    if (fieldErrors.birthDate && e.target.value && month && day) {
                      setFieldErrors(prev => ({ ...prev, birthDate: undefined }))
                    }
                  }}
                  className={`flex-1 min-w-[100px] bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                    fieldErrors.birthDate ? 'border-red-500' : 'border-gray-300'
                  }`}
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
                  onChange={(e) => {
                    setMonth(e.target.value)
                    // 월이 변경되면 일자가 유효 범위를 벗어날 수 있으므로 초기화
                    if (e.target.value && year) {
                      const newValidDays = getValidDays(year, e.target.value, calendarType)
                      if (day && parseInt(day) > newValidDays.length) {
                        setDay('')
                      }
                    }
                    if (fieldErrors.birthDate && year && e.target.value && day) {
                      setFieldErrors(prev => ({ ...prev, birthDate: undefined }))
                    }
                  }}
                  className={`flex-1 min-w-[80px] bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                    fieldErrors.birthDate ? 'border-red-500' : 'border-gray-300'
                  }`}
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
                  onChange={(e) => {
                    setDay(e.target.value)
                    if (fieldErrors.birthDate && year && month && e.target.value) {
                      setFieldErrors(prev => ({ ...prev, birthDate: undefined }))
                    }
                  }}
                  className={`flex-1 min-w-[80px] bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                    fieldErrors.birthDate ? 'border-red-500' : 'border-gray-300'
                  }`}
                  required
                >
                  <option value="">일</option>
                  {validDays.map((d) => (
                    <option key={d} value={d}>{d}일</option>
                  ))}
                </select>
              </div>
              {fieldErrors.birthDate && (
                <div className="relative mt-2">
                  <div className="absolute top-0 left-0 bg-red-500 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 whitespace-nowrap">
                    {fieldErrors.birthDate}
                    <div className="absolute -top-1.5 left-4 w-3 h-3 bg-red-500 transform rotate-45"></div>
                  </div>
                </div>
              )}
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
                <div data-field-error={fieldErrors.partnerName ? 'partnerName' : undefined}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    이름
                  </label>
                  <input
                    type="text"
                    value={partnerName}
                    onChange={(e) => {
                      setPartnerName(e.target.value)
                      if (fieldErrors.partnerName) {
                        setFieldErrors(prev => ({ ...prev, partnerName: undefined }))
                      }
                    }}
                    className={`w-full bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                      fieldErrors.partnerName ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="이름을 입력하세요"
                    required
                  />
                  {fieldErrors.partnerName && (
                    <div className="relative mt-2">
                      <div className="absolute top-0 left-0 bg-red-500 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 whitespace-nowrap">
                        {fieldErrors.partnerName}
                        <div className="absolute -top-1.5 left-4 w-3 h-3 bg-red-500 transform rotate-45"></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 성별 */}
                <div data-field-error={fieldErrors.partnerGender ? 'partnerGender' : undefined}>
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
                        onChange={(e) => {
                          setPartnerGender(e.target.value as 'male')
                          if (fieldErrors.partnerGender) {
                            setFieldErrors(prev => ({ ...prev, partnerGender: undefined }))
                          }
                        }}
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
                        onChange={(e) => {
                          setPartnerGender(e.target.value as 'female')
                          if (fieldErrors.partnerGender) {
                            setFieldErrors(prev => ({ ...prev, partnerGender: undefined }))
                          }
                        }}
                        className="w-5 h-5 text-pink-500"
                      />
                      <span className="text-gray-700">여자</span>
                    </label>
                  </div>
                  {fieldErrors.partnerGender && (
                    <div className="relative mt-2">
                      <div className="absolute top-0 left-0 bg-red-500 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 whitespace-nowrap">
                        {fieldErrors.partnerGender}
                        <div className="absolute -top-1.5 left-4 w-3 h-3 bg-red-500 transform rotate-45"></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 생년월일 */}
                <div data-field-error={fieldErrors.partnerBirthDate ? 'partnerBirthDate' : undefined}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    생년월일
                  </label>
                  {/* 양력/음력 선택 */}
                  <div className="flex gap-2 sm:gap-4 mb-3">
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
                  
                  {/* 년/월/일 선택 */}
                  <div className="flex flex-row gap-3">
                    {/* 년도 */}
                    <select
                      value={partnerYear}
                      onChange={(e) => {
                        setPartnerYear(e.target.value)
                        // 년도가 변경되면 일자가 유효 범위를 벗어날 수 있으므로 초기화
                        if (e.target.value && partnerMonth) {
                          const newValidDays = getValidDays(e.target.value, partnerMonth, partnerCalendarType)
                          if (partnerDay && parseInt(partnerDay) > newValidDays.length) {
                            setPartnerDay('')
                          }
                        }
                        if (fieldErrors.partnerBirthDate && e.target.value && partnerMonth && partnerDay) {
                          setFieldErrors(prev => ({ ...prev, partnerBirthDate: undefined }))
                        }
                      }}
                      className={`flex-1 min-w-[100px] bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                        fieldErrors.partnerBirthDate ? 'border-red-500' : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setPartnerMonth(e.target.value)
                        // 월이 변경되면 일자가 유효 범위를 벗어날 수 있으므로 초기화
                        if (e.target.value && partnerYear) {
                          const newValidDays = getValidDays(partnerYear, e.target.value, partnerCalendarType)
                          if (partnerDay && parseInt(partnerDay) > newValidDays.length) {
                            setPartnerDay('')
                          }
                        }
                        if (fieldErrors.partnerBirthDate && partnerYear && e.target.value && partnerDay) {
                          setFieldErrors(prev => ({ ...prev, partnerBirthDate: undefined }))
                        }
                      }}
                      className={`flex-1 min-w-[80px] bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                        fieldErrors.partnerBirthDate ? 'border-red-500' : 'border-gray-300'
                      }`}
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
                      onChange={(e) => {
                        setPartnerDay(e.target.value)
                        if (fieldErrors.partnerBirthDate && partnerYear && partnerMonth && e.target.value) {
                          setFieldErrors(prev => ({ ...prev, partnerBirthDate: undefined }))
                        }
                      }}
                      className={`flex-1 min-w-[80px] bg-gray-50 border rounded-lg px-3 sm:px-4 py-2.5 sm:py-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent ${
                        fieldErrors.partnerBirthDate ? 'border-red-500' : 'border-gray-300'
                      }`}
                      required
                    >
                      <option value="">일</option>
                      {partnerValidDays.map((d) => (
                        <option key={d} value={d}>{d}일</option>
                      ))}
                    </select>
                  </div>
                  {fieldErrors.partnerBirthDate && (
                    <div className="relative mt-2">
                      <div className="absolute top-0 left-0 bg-red-500 text-white text-sm px-3 py-2 rounded-lg shadow-lg z-10 whitespace-nowrap">
                        {fieldErrors.partnerBirthDate}
                        <div className="absolute -top-1.5 left-4 w-3 h-3 bg-red-500 transform rotate-45"></div>
                      </div>
                    </div>
                  )}
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

        {/* 서버에 저장된 결과 목록 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">서버에 저장된 결과</h3>
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
                  
                  // 디버깅: saved 객체 전체 확인
                  console.log(`저장된 결과 ${saved.id} 전체 데이터:`, saved)
                  
                  // 60일 경과 여부 확인 (텍스트 딤처리 및 보기 버튼 숨김용, 한국 시간 기준)
                  const isExpired60d = saved.savedAtISO ? (() => {
                    // savedAtISO는 한국 시간으로 저장된 시간
                    const savedDateKST = new Date(saved.savedAtISO)
                    const nowUTC = new Date()
                    const nowKST = new Date(nowUTC.getTime() + (9 * 60 * 60 * 1000)) // UTC+9
                    
                    // 한국 시간 기준으로 시간 차이 계산
                    const diffTime = nowKST.getTime() - savedDateKST.getTime()
                    const diffDays = diffTime / (1000 * 60 * 60 * 24) // 밀리초를 일로 변환
                    const expired = diffDays >= 60
                    
                    console.log(`[60일 체크 - 텍스트 딤처리 및 보기 버튼 숨김] 저장된 결과 ${saved.id}: savedAtISO=${saved.savedAtISO}, diffDays=${diffDays.toFixed(2)}, isExpired=${expired}`)
                    return expired
                  })() : false
                  
                  console.log(`[최종] 저장된 결과 ${saved.id}: isExpired60d=${isExpired60d}, 텍스트 딤처리=${isExpired60d}, 보기 버튼 표시=${!isExpired60d}`)
                  
                  return (
                  <div key={saved.id} className="bg-white rounded-lg p-4 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-semibold ${isExpired60d ? 'text-gray-400' : 'text-gray-900'}`}>{saved.title}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {saved.savedAt}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!isExpired60d && (
                        <>
                        {/* PDF 다운로드 버튼 - PDF 파일이 존재할 때만 표시 */}
                        {pdfExistsMap[saved.id] === true && (
                        <button
                          onClick={async () => {
                            try {
                              const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                              const pdfUrl = `${supabaseUrl}/storage/v1/object/public/pdfs/${saved.id}.pdf`
                              
                              // PDF 존재 여부 확인
                              const checkResponse = await fetch(pdfUrl, { method: 'HEAD' })
                              
                              if (checkResponse.ok) {
                                // PDF 다운로드
                                const downloadResponse = await fetch(pdfUrl)
                                const blob = await downloadResponse.blob()
                                const url = window.URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = url
                                a.download = `${saved.title || '재회 결과'}.pdf`
                                document.body.appendChild(a)
                                a.click()
                                document.body.removeChild(a)
                                window.URL.revokeObjectURL(url)
                              } else {
                                alert('PDF 파일을 찾을 수 없습니다.')
                              }
                            } catch (error) {
                              console.error('PDF 다운로드 실패:', error)
                              alert('PDF 다운로드에 실패했습니다.')
                            }
                          }}
                          className="bg-green-400 hover:bg-green-500 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-1"
                          title="PDF 다운로드"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                          <span>PDF</span>
                        </button>
                        )}
                        {/* 보기 버튼 */}
                        <button
                          onClick={() => {
                            if (typeof window === 'undefined') return
                            try {
                              // userName을 안전하게 처리 (템플릿 리터럴 중첩 방지)
                              const userNameForScript = saved.userName ? JSON.stringify(saved.userName) : "''"
                              
                              // HTML 처리 (result 페이지 batch 모드와 동일한 로직)
                              let htmlContent = saved.html || '';
                              htmlContent = htmlContent.replace(/\*\*/g, '');
                              
                              // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
                              htmlContent = htmlContent
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
                              
                              const contentObj = saved.content || {};
                              const menuItems = contentObj?.menu_items || [];
                              const bookCoverThumbnail = contentObj?.book_cover_thumbnail || '';
                              const endingBookCoverThumbnail = contentObj?.ending_book_cover_thumbnail || '';
                              
                              if (menuItems.length > 0 || bookCoverThumbnail || endingBookCoverThumbnail) {
                                try {
                                  const parser = new DOMParser();
                                  const doc = parser.parseFromString(htmlContent, 'text/html');
                                  const menuSections = Array.from(doc.querySelectorAll('.menu-section'));
                                  
                                  // 북커버 썸네일 추가 (첫 번째 menu-section 안, 제목 위)
                                  if (bookCoverThumbnail && menuSections.length > 0) {
                                    const firstSection = menuSections[0];
                                    const bookCoverDiv = doc.createElement('div');
                                    bookCoverDiv.className = 'book-cover-thumbnail-container';
                                    bookCoverDiv.style.cssText = 'width: 100%; margin-bottom: 2.5rem; display: flex; justify-content: center;';
                                    bookCoverDiv.innerHTML = '<img src="' + bookCoverThumbnail + '" alt="북커버 썸네일" style="width: 100%; height: auto; object-fit: contain; display: block;" />';
                                    // 첫 번째 자식 요소(menu-title) 앞에 삽입
                                    if (firstSection.firstChild) {
                                      firstSection.insertBefore(bookCoverDiv, firstSection.firstChild);
                                    } else {
                                      firstSection.appendChild(bookCoverDiv);
                                    }
                                  }
                                  
                                  // 소제목 썸네일 추가
                                  menuSections.forEach((section, menuIndex) => {
                                    const menuItem = menuItems[menuIndex];
                                    if (menuItem?.subtitles) {
                                      const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'));
                                      subtitleSections.forEach((subSection, subIndex) => {
                                        const subtitle = menuItem.subtitles[subIndex];
                                        if (subtitle?.thumbnail) {
                                          const titleDiv = subSection.querySelector('.subtitle-title');
                                          if (titleDiv) {
                                            const thumbnailImg = doc.createElement('div');
                                            thumbnailImg.className = 'subtitle-thumbnail-container';
                                            thumbnailImg.style.cssText = 'display: flex; justify-content: center; width: 50%; margin-left: auto; margin-right: auto;';
                                            thumbnailImg.innerHTML = '<img src="' + subtitle.thumbnail + '" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" />';
                                            titleDiv.parentNode?.insertBefore(thumbnailImg, titleDiv.nextSibling);
                                          }
                                        }
                                      });
                                    }
                                  });
                                  
                                  // 엔딩북커버 썸네일 추가 (마지막 menu-section 안, 소제목들 아래)
                                  if (endingBookCoverThumbnail && menuSections.length > 0) {
                                    const lastSection = menuSections[menuSections.length - 1];
                                    const endingBookCoverDiv = doc.createElement('div');
                                    endingBookCoverDiv.className = 'ending-book-cover-thumbnail-container';
                                    endingBookCoverDiv.style.cssText = 'width: 100%; margin-top: 1rem; display: flex; justify-content: center;';
                                    endingBookCoverDiv.innerHTML = '<img src="' + endingBookCoverThumbnail + '" alt="엔딩북커버 썸네일" style="width: 100%; height: auto; object-fit: contain; display: block;" />';
                                    // 마지막 자식 요소 뒤에 추가
                                    lastSection.appendChild(endingBookCoverDiv);
                                  }
                                  
                                  htmlContent = doc.documentElement.outerHTML;
                                  // DOMParser가 추가한 html, body 태그 제거
                                  const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                                  if (bodyMatch) {
                                    htmlContent = bodyMatch[1];
                                  }
                                } catch (e) {
                                  console.error('HTML 처리 실패:', e);
                                }
                              }
                              
                              // 템플릿 리터럴 특수 문자 이스케이프
                              const safeHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                              
                              const newWindow = window.open('', '_blank')
                              if (newWindow) {
                                const savedMenuFontSize = saved.content?.menu_font_size || 16
                                const savedSubtitleFontSize = saved.content?.subtitle_font_size || 14
                                const savedBodyFontSize = saved.content?.body_font_size || 11
                                
                                // 웹폰트 적용
                                const fontFace = saved.content?.font_face || ''
                                const extractFontFamily = (fontFaceCss: string): string | null => {
                                  if (!fontFaceCss) return null
                                  const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                                  return match ? (match[1] || match[2]?.trim()) : null
                                }
                                const fontFamilyName = extractFontFamily(fontFace)

                                const savedDynamicStyles = `
                                  .menu-title { font-size: ${savedMenuFontSize}px !important; }
                                  .subtitle-title { font-size: ${savedSubtitleFontSize}px !important; }
                                  .subtitle-content { font-size: ${savedBodyFontSize}px !important; }
                                `
                                
                                const fontStyles = fontFamilyName ? `
                                  * {
                                    font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  body, body *, h1, h2, h3, h4, h5, h6, p, div, span {
                                    font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  .jeminai-results, .jeminai-results * {
                                    font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  .menu-section, .menu-section * {
                                    font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  .menu-title, .subtitle-title, .subtitle-content {
                                    font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                ` : ''

                                newWindow.document.write(`
                                  <!DOCTYPE html>
                                  <html>
                                  <head>
                                    <meta charset="UTF-8">
                                    <title>${saved.title}</title>
                                    <style>
                                      ${fontFace ? fontFace : ''}
                                      ${fontStyles}
                                      body {
                                        font-family: ${fontFamilyName ? `'${fontFamilyName}', ` : ''}-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
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
                                        object-fit: contain;
                                        max-height: 400px;
                                      }
                                      .thumbnail-container {
                                        border-radius: 0;
                                      }
                                      .thumbnail-container img {
                                        border-radius: 0;
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
                                     .question-button-container {
                                       margin-top: 24px;
                                       margin-bottom: 16px;
                                       text-align: center;
                                       display: none; /* 추가 질문하기 버튼 숨김 */
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
                                        z-index: 9999;
                                        padding: 16px;
                                        opacity: 0;
                                        visibility: hidden;
                                        pointer-events: none;
                                        transition: opacity 0.2s, visibility 0.2s;
                                        overflow: hidden;
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
                                        overflow: hidden;
                                        transform: scale(0.95);
                                        transition: transform 0.2s;
                                        position: relative;
                                        z-index: 10000;
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
                                        overflow: hidden;
                                        box-sizing: border-box;
                                      }
                                      .question-popup-prompt {
                                        font-size: 16px;
                                        color: #4b5563;
                                        margin-bottom: 12px;
                                        display: flex;
                                        justify-content: space-between;
                                        align-items: flex-start;
                                      }
                                      .question-popup-prompt-text {
                                        flex: 1;
                                      }
                                      .question-popup-prompt strong {
                                        font-weight: 600;
                                        color: #111827;
                                      }
                                      .question-remaining-badge {
                                        background: #f3f4f6;
                                        padding: 4px 12px;
                                        border-radius: 9999px;
                                        font-size: 12px;
                                        font-weight: 500;
                                        color: #4b5563;
                                        white-space: nowrap;
                                        margin-left: 8px;
                                      }
                                      .question-remaining-badge .remaining-count {
                                        color: #ec4899;
                                        font-weight: bold;
                                      }
                                      .question-remaining-badge .remaining-count.limit-reached {
                                        color: #ef4444;
                                      }
                                      .question-hint-text {
                                        font-size: 12px;
                                        color: #9ca3af;
                                        margin-top: 4px;
                                      }
                                      .question-textarea {
                                        width: 100%;
                                        max-width: 100%;
                                        padding: 10px 14px;
                                        padding-right: 18px;
                                        border: 1px solid #d1d5db;
                                        border-radius: 2px;
                                        font-family: inherit;
                                        font-size: 17px;
                                        resize: none;
                                        min-height: calc(17px * 1.4 * 2 + 10px * 2);
                                        line-height: 1.4;
                                        overflow-y: hidden;
                                        outline: none;
                                        box-sizing: border-box;
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
                                        border: 1px solid #ec4899;
                                        padding-right: 18px;
                                        outline: none;
                                      }
                                      .question-textarea:disabled {
                                        background: #f3f4f6;
                                        cursor: not-allowed;
                                        color: #9ca3af;
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
                                        background: #d1d5db !important;
                                        color: #9ca3af !important;
                                        cursor: not-allowed !important;
                                        opacity: 1;
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
                                      ${savedDynamicStyles}
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
                                      <div id="contentHtml">${safeHtml}</div>
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
                                            <div class="question-popup-prompt-text">
                                              <strong id="questionMenuTitle"></strong>에 대한 추가 질문이 있으신가요?
                                            </div>
                                            <div class="question-remaining-badge">
                                              남은 질문: <span id="questionRemainingCount" class="remaining-count">3</span> / <span id="questionMaxCount">3</span>회
                                            </div>
                                          </div>
                                          <form id="questionForm" onsubmit="handleQuestionSubmit(event)">
                                            <textarea
                                              id="questionTextarea"
                                              class="question-textarea"
                                              placeholder="예: 이 부분에 대해 더 자세히 알려주세요 (50자 이내)"
                                              maxlength="50"
                                              rows="2"
                                            ></textarea>
                                            <div style="margin-top: 4px; display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
                                              <span class="question-hint-text">한 번에 하나의 질문만 가능합니다.</span>
                                              <div class="question-char-count" style="margin-top: 0;">
                                                <span id="questionCharCount">0</span>/50
                                              </div>
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
                                      // 저장된 컨텐츠의 화자 정보를 전역 변수로 설정
                                      window.savedContentSpeaker = ${saved.content?.tts_speaker ? `'${saved.content.tts_speaker}'` : "'nara'"};
                                      window.savedContentId = ${saved.content?.id ? saved.content.id : 'null'};
                                      
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
                                            text.textContent = '점사 듣기';
                                          }
                                        }
                                      });

                                      // HTML에서 텍스트 추출 (화면에 보이는 텍스트만)
                                      function extractTextFromHtml(htmlString) {
                                        // 실제 DOM에서 contentHtml 요소를 사용 (렌더링된 상태에서 추출)
                                        const contentHtml = document.getElementById('contentHtml');
                                        if (!contentHtml) {
                                          // 폴백: 임시 div 사용
                                          const tempDiv = document.createElement('div');
                                          tempDiv.innerHTML = htmlString;
                                          
                                          // 테이블 요소 제거
                                          const tables = tempDiv.querySelectorAll('table, .manse-ryeok-table');
                                          tables.forEach(table => table.remove());
                                          
                                          // style, script 태그 제거
                                          const hiddenTags = tempDiv.querySelectorAll('style, script');
                                          hiddenTags.forEach(tag => tag.remove());
                                          
                                          return tempDiv.innerText || '';
                                        }
                                        
                                        // 실제 DOM에서 클론 생성 (렌더링된 상태 유지)
                                        const clone = contentHtml.cloneNode(true);
                                        
                                        // 테이블 요소 제거
                                        const tables = clone.querySelectorAll('table, .manse-ryeok-table');
                                        tables.forEach(table => table.remove());
                                        
                                        // style, script 태그 제거
                                        const hiddenTags = clone.querySelectorAll('style, script');
                                        hiddenTags.forEach(tag => tag.remove());
                                        
                                        // innerText 사용 (화면에 보이는 텍스트만 추출)
                                        // innerText는 CSS로 숨겨진 요소의 텍스트를 자동으로 제외함
                                        return clone.innerText || '';
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

                                      // 오디오 중지 함수 (여러 곳에서 재사용)
                                      function stopAndResetAudio() {
                                        console.log('새 창: 오디오 중지 요청');
                                        shouldStop = true;
                                        
                                        // 모든 오디오 즉시 중지
                                        if (currentAudio) {
                                          try {
                                            console.log('새 창: 오디오 중지 시도:', currentAudio.src);
                                            currentAudio.pause();
                                            currentAudio.currentTime = 0;
                                            const url = currentAudio.src;
                                            if (url && url.startsWith('blob:')) {
                                              URL.revokeObjectURL(url);
                                            }
                                            currentAudio = null;
                                            console.log('새 창: 오디오 중지 완료');
                                          } catch (e) {
                                            console.error('새 창: 오디오 중지 중 오류:', e);
                                            currentAudio = null;
                                          }
                                        }
                                        
                                        // 모든 오디오 요소 찾아서 중지 (안전장치)
                                        try {
                                          const allAudios = document.querySelectorAll('audio');
                                          allAudios.forEach(audio => {
                                            if (!audio.paused) {
                                              console.log('새 창: 추가 오디오 요소 중지:', audio.src);
                                              audio.pause();
                                              audio.currentTime = 0;
                                            }
                                          });
                                        } catch (e) {
                                          console.error('새 창: 추가 오디오 중지 중 오류:', e);
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

                                      // 음성 재생 중지 함수
                                      function stopTextToSpeech() {
                                        console.log('stopTextToSpeech 호출됨');
                                        stopAndResetAudio();
                                      }

                                      // 음성으로 듣기 기능 - 청크 단위로 나누어 재생 (result 페이지와 동일한 로직)
                                      async function handleTextToSpeech() {
                                        // 재생 중이면 중지 (즉시 체크)
                                        if (isPlaying) {
                                          stopTextToSpeech();
                                          return;
                                        }

                                        // 즉시 플래그 설정 및 버튼 상태 변경 (중복 실행 방지)
                                        isPlaying = true;
                                        shouldStop = false; // 새 재생 시작 시에만 false로 초기화
                                        
                                        const button = document.getElementById('ttsButton');
                                        const icon = document.getElementById('ttsIcon');
                                        const text = document.getElementById('ttsText');
                                        
                                        if (!button || !icon || !text) {
                                          isPlaying = false;
                                          alert('버튼을 찾을 수 없습니다.');
                                          return;
                                        }
                                        
                                        button.disabled = false;
                                        icon.textContent = '⏹️';
                                        text.textContent = '듣기 종료';

                                        try {
                                          const contentHtml = document.getElementById('contentHtml');
                                          if (!contentHtml) {
                                            isPlaying = false;
                                            button.disabled = false;
                                            icon.textContent = '🔊';
                                            text.textContent = '점사 듣기';
                                            alert('내용을 찾을 수 없습니다.');
                                            return;
                                          }
                                          
                                          const textContent = extractTextFromHtml(contentHtml.innerHTML);

                                          if (!textContent.trim()) {
                                            isPlaying = false;
                                            button.disabled = false;
                                            icon.textContent = '🔊';
                                            text.textContent = '점사 듣기';
                                            alert('읽을 내용이 없습니다.');
                                            return;
                                          }
                                          
                                          // 화자 정보 가져오기 (result 페이지와 동일한 로직)
                                          let speaker = window.savedContentSpeaker || 'nara';
                                          
                                          // content.id가 있으면 Supabase에서 최신 화자 정보 조회
                                          if (window.savedContentId) {
                                            try {
                                              console.log('새 창: Supabase에서 화자 정보 조회 시작');
                                              const response = await fetch('/api/content/' + window.savedContentId);
                                              
                                              if (response.ok) {
                                                const data = await response.json();
                                                if (data.tts_speaker) {
                                                  speaker = data.tts_speaker;
                                                  window.savedContentSpeaker = speaker; // 전역 변수 업데이트
                                                  console.log('새 창: Supabase에서 조회한 화자:', speaker);
                                                }
                                              }
                                            } catch (error) {
                                              console.error('새 창: Supabase에서 화자 조회 실패:', error);
                                              // 조회 실패 시 기존 값 사용
                                              speaker = window.savedContentSpeaker || 'nara';
                                            }
                                          }

                                          // 텍스트를 2000자 단위로 분할
                                          const maxLength = 2000;
                                          const chunks = splitTextIntoChunks(textContent, maxLength);
                                          
                                          console.log('음성 변환 시작, 전체 텍스트 길이:', textContent.length, '자, 청크 수:', chunks.length, ', 화자:', speaker);

                                          // 다음 청크를 미리 로드하는 함수 (result 페이지와 동일)
                                          const preloadNextChunk = async (chunkIndex) => {
                                            if (chunkIndex >= chunks.length || shouldStop) {
                                              return null;
                                            }

                                            try {
                                              const chunk = chunks[chunkIndex];
                                              
                                              // 로드 전에 shouldStop 재확인
                                              if (shouldStop) {
                                                console.log('새 창: 미리 로드 중지 (shouldStop)');
                                                return null;
                                              }
                                              
                                              console.log('새 창: 청크', chunkIndex + 1, '/', chunks.length, '미리 로드 중, 길이:', chunk.length, '자');

                                              const response = await fetch('/api/tts', {
                                                method: 'POST',
                                                headers: {
                                                  'Content-Type': 'application/json',
                                                },
                                                body: JSON.stringify({ text: chunk, speaker }),
                                              });

                                              // 응답 받은 후에도 shouldStop 재확인
                                              if (shouldStop) {
                                                console.log('새 창: 미리 로드 중지 (응답 후 shouldStop)');
                                                return null;
                                              }

                                              if (!response.ok) {
                                                const error = await response.json();
                                                throw new Error(error.error || '청크 ' + (chunkIndex + 1) + ' 음성 변환에 실패했습니다.');
                                              }

                                              const audioBlob = await response.blob();
                                              
                                              // Blob 생성 후에도 shouldStop 재확인
                                              if (shouldStop) {
                                                console.log('새 창: 미리 로드 중지 (Blob 생성 후 shouldStop)');
                                                return null;
                                              }
                                              
                                              const url = URL.createObjectURL(audioBlob);
                                              const audio = new Audio(url);
                                              
                                              // 오디오가 로드될 때까지 대기 (타임아웃 추가)
                                              await new Promise((resolve, reject) => {
                                                // 로드 중에도 shouldStop 체크
                                                const stopCheckInterval = setInterval(() => {
                                                  if (shouldStop) {
                                                    clearInterval(stopCheckInterval);
                                                    clearTimeout(timeout);
                                                    URL.revokeObjectURL(url);
                                                    reject(new Error('중지됨'));
                                                  }
                                                }, 100);
                                                
                                                const timeout = setTimeout(() => {
                                                  clearInterval(stopCheckInterval);
                                                  reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 타임아웃'));
                                                }, 30000); // 30초 타임아웃
                                                
                                                audio.oncanplaythrough = () => {
                                                  clearInterval(stopCheckInterval);
                                                  clearTimeout(timeout);
                                                  resolve();
                                                };
                                                audio.onerror = (e) => {
                                                  clearInterval(stopCheckInterval);
                                                  clearTimeout(timeout);
                                                  console.error('새 창: 청크 ' + (chunkIndex + 1) + ' 오디오 로드 에러:', e);
                                                  reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 실패'));
                                                };
                                                audio.load();
                                              });

                                              // 로드 완료 후에도 shouldStop 재확인
                                              if (shouldStop) {
                                                console.log('새 창: 미리 로드 중지 (로드 완료 후 shouldStop)');
                                                URL.revokeObjectURL(url);
                                                return null;
                                              }

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
                                              const timeout = setTimeout(() => {
                                                console.error('새 창: 청크 ' + (i + 1) + ' 재생 타임아웃');
                                                currentAudioElement.pause();
                                                URL.revokeObjectURL(currentUrl);
                                                currentAudio = null;
                                                reject(new Error('청크 ' + (i + 1) + ' 재생 타임아웃'));
                                              }, 300000); // 5분
                                              
                                              // shouldStop 체크를 위한 인터벌 (재생 중 주기적으로 체크)
                                              const stopCheckInterval = setInterval(() => {
                                                if (shouldStop) {
                                                  console.log('새 창: shouldStop 감지, 오디오 즉시 중지');
                                                  clearInterval(stopCheckInterval);
                                                  clearTimeout(timeout);
                                                  try {
                                                    currentAudioElement.pause();
                                                    currentAudioElement.currentTime = 0;
                                                  } catch (e) {
                                                    console.error('오디오 중지 중 오류:', e);
                                                  }
                                                  URL.revokeObjectURL(currentUrl);
                                                  currentAudio = null;
                                                  isPlaying = false;
                                                  button.disabled = false;
                                                  icon.textContent = '🔊';
                                                  text.textContent = '점사 듣기';
                                                  resolve();
                                                }
                                              }, 100); // 100ms마다 체크
                                              
                                              const cleanup = () => {
                                                clearInterval(stopCheckInterval);
                                                clearTimeout(timeout);
                                                URL.revokeObjectURL(currentUrl);
                                                currentAudio = null;
                                              };
                                              
                                              currentAudioElement.onended = () => {
                                                console.log('새 창: 청크 ' + (i + 1) + ' 재생 완료');
                                                cleanup();
                                                resolve();
                                              };
                                              
                                              currentAudioElement.onerror = (e) => {
                                                console.error('새 창: 청크 ' + (i + 1) + ' 재생 중 오류:', e, currentAudioElement.error);
                                                cleanup();
                                                // 에러가 발생해도 다음 청크로 계속 진행
                                                console.warn('새 창: 청크 ' + (i + 1) + ' 재생 실패, 다음 청크로 진행');
                                                resolve();
                                              };
                                              
                                              currentAudioElement.onpause = () => {
                                                // 사용자가 일시정지하거나 페이지가 비활성화된 경우
                                                if (document.hidden || shouldStop) {
                                                  cleanup();
                                                  isPlaying = false;
                                                  button.disabled = false;
                                                  icon.textContent = '🔊';
                                                  text.textContent = '점사 듣기';
                                                }
                                              };
                                              
                                              currentAudioElement.play().catch((err) => {
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
                                          }
                                        }
                                      }
                                      
                                      // 함수를 전역 스코프에 명시적으로 할당 (onclick 핸들러가 작동하도록)
                                      window.handleTextToSpeech = handleTextToSpeech;
                                      window.stopTextToSpeech = stopTextToSpeech;
                                      window.stopAndResetAudio = stopAndResetAudio;
                                      console.log('handleTextToSpeech, stopTextToSpeech, stopAndResetAudio 함수를 전역 스코프에 할당 완료');
                                      
                                      // 버튼에 이벤트 리스너 연결
                                      function connectTTSButton() {
                                        const ttsButton = document.getElementById('ttsButton');
                                        if (ttsButton) {
                                          console.log('TTS 버튼 발견, 이벤트 리스너 추가');
                                          
                                          // 기존 onclick 핸들러 제거 (있다면)
                                          ttsButton.onclick = null;
                                          
                                          // 새 핸들러 설정
                                          ttsButton.onclick = function(e) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            console.log('TTS 버튼 클릭 이벤트 발생, isPlaying:', isPlaying);
                                            
                                            // 재생 중이면 중지
                                            if (isPlaying) {
                                              console.log('재생 중지 요청');
                                              if (typeof stopTextToSpeech === 'function') {
                                                stopTextToSpeech();
                                              } else if (typeof window.stopTextToSpeech === 'function') {
                                                window.stopTextToSpeech();
                                              } else {
                                                console.error('stopTextToSpeech 함수를 찾을 수 없습니다.');
                                                // 폴백: 직접 중지
                                                stopAndResetAudio();
                                              }
                                              return;
                                            }
                                            
                                            // 함수 호출 (버튼 상태는 handleTextToSpeech 내부에서 관리)
                                            if (typeof handleTextToSpeech === 'function') {
                                              handleTextToSpeech();
                                            } else if (typeof window.handleTextToSpeech === 'function') {
                                              window.handleTextToSpeech();
                                            } else {
                                              console.error('handleTextToSpeech 함수를 찾을 수 없습니다.');
                                              alert('음성 재생 기능을 초기화하는 중 오류가 발생했습니다.');
                                            }
                                          };
                                          
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
                                      
                                      // 전역 함수로 노출 (외부에서 호출 가능하도록)
                                      window.initTTSButton = initTTSButton;
                                      
                                      // 추가 질문하기 기능
                                      let currentQuestionData = null;
                                      const MAX_QUESTIONS = 3;
                                      let usedQuestionCounts = {};
                                      
                                      // localStorage에서 질문 횟수 로드
                                      try {
                                        const savedCounts = localStorage.getItem('question_counts_' + ${JSON.stringify(saved.id)});
                                        if (savedCounts) {
                                          usedQuestionCounts = JSON.parse(savedCounts);
                                        }
                                      } catch (e) {
                                        console.error('질문 횟수 로드 실패:', e);
                                        usedQuestionCounts = {};
                                      }
                                      
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
                                          
                                          // 남은 질문 수 업데이트
                                          const currentMenuTitle = menuTitle;
                                          const currentCount = usedQuestionCounts[currentMenuTitle] || 0;
                                          const remaining = Math.max(0, MAX_QUESTIONS - currentCount);
                                          const remainingCountEl = document.getElementById('questionRemainingCount');
                                          const maxCountEl = document.getElementById('questionMaxCount');
                                          
                                          if (remainingCountEl) {
                                            remainingCountEl.textContent = remaining;
                                            if (remaining === 0) {
                                              remainingCountEl.classList.add('limit-reached');
                                            } else {
                                              remainingCountEl.classList.remove('limit-reached');
                                            }
                                          }
                                          if (maxCountEl) {
                                            maxCountEl.textContent = MAX_QUESTIONS;
                                          }
                                          
                                          // 폼 초기화
                                          const textarea = document.getElementById('questionTextarea');
                                          const submitBtn = document.getElementById('questionSubmitBtn');
                                          const errorEl = document.getElementById('questionError');
                                          
                                          if (textarea) {
                                            textarea.value = '';
                                            textarea.disabled = remaining === 0;
                                          }
                                          const charCountEl = document.getElementById('questionCharCount');
                                          if (charCountEl) {
                                            charCountEl.textContent = '0';
                                          }
                                          const answerEl = document.getElementById('questionAnswer');
                                          if (answerEl) {
                                            answerEl.style.display = 'none';
                                          }
                                          const loadingEl = document.getElementById('questionLoading');
                                          if (loadingEl) {
                                            loadingEl.style.display = 'none';
                                          }
                                          
                                          // 질문 횟수 소진 시 에러 메시지 표시 및 버튼 비활성화
                                          if (remaining === 0) {
                                            if (errorEl) {
                                              errorEl.textContent = '이 메뉴에 대한 질문 횟수를 모두 소진했습니다.';
                                              errorEl.style.display = 'block';
                                            }
                                            if (submitBtn) {
                                              submitBtn.disabled = true;
                                            }
                                          } else {
                                            if (errorEl) {
                                              errorEl.style.display = 'none';
                                            }
                                            if (submitBtn) {
                                              submitBtn.disabled = false;
                                            }
                                          }
                                        }
                                      }
                                      
                                      // 팝업 닫기
                                      function closeQuestionPopup() {
                                        const overlay = document.getElementById('questionPopupOverlay');
                                        if (overlay) {
                                          overlay.classList.remove('show');
                                          currentQuestionData = null;
                                          
                                          // 폼 초기화
                                          const textarea = document.getElementById('questionTextarea');
                                          const charCountEl = document.getElementById('questionCharCount');
                                          const errorEl = document.getElementById('questionError');
                                          const answerEl = document.getElementById('questionAnswer');
                                          const loadingEl = document.getElementById('questionLoading');
                                          
                                          if (textarea) {
                                            textarea.value = '';
                                          }
                                          if (charCountEl) {
                                            charCountEl.textContent = '0';
                                          }
                                          if (errorEl) {
                                            errorEl.style.display = 'none';
                                          }
                                          if (answerEl) {
                                            answerEl.style.display = 'none';
                                          }
                                          if (loadingEl) {
                                            loadingEl.style.display = 'none';
                                          }
                                        }
                                      }
                                      
                                      // 텍스트 영역 높이 조정
                                      const textarea = document.getElementById('questionTextarea');
                                      const charCount = document.getElementById('questionCharCount');
                                      
                                      if (textarea) {
                                        // 기본 2줄 높이 계산 (font-size: 17px, line-height: 1.4, padding: 10px)
                                        const baseHeight = 17 * 1.4 * 2 + 10 * 2; // 약 67.6px
                                        
                                        textarea.addEventListener('input', function() {
                                          // 50자 제한
                                          if (this.value.length > 50) {
                                            this.value = this.value.substring(0, 50);
                                          }
                                          
                                          // 문자 수 업데이트
                                          if (charCount) {
                                            charCount.textContent = this.value.length;
                                          }
                                          
                                          // 버튼 활성화/비활성화
                                          const submitBtn = document.getElementById('questionSubmitBtn');
                                          const errorEl = document.getElementById('questionError');
                                          const currentMenuTitle = currentQuestionData?.menuTitle;
                                          const currentCount = currentMenuTitle ? (usedQuestionCounts[currentMenuTitle] || 0) : 0;
                                          const remaining = Math.max(0, MAX_QUESTIONS - currentCount);
                                          
                                          if (submitBtn && errorEl) {
                                            if (remaining === 0) {
                                              submitBtn.disabled = true;
                                              errorEl.textContent = '이 메뉴에 대한 질문 횟수를 모두 소진했습니다.';
                                              errorEl.style.display = 'block';
                                              this.disabled = true;
                                            } else {
                                              submitBtn.disabled = !this.value.trim();
                                              // 에러 메시지가 "질문 횟수 소진" 메시지가 아닐 때만 숨김
                                              if (errorEl.textContent === '이 메뉴에 대한 질문 횟수를 모두 소진했습니다.') {
                                                errorEl.style.display = 'none';
                                              }
                                              this.disabled = false;
                                            }
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
                                        
                                        const currentMenuTitle = currentQuestionData.menuTitle;
                                        const currentCount = usedQuestionCounts[currentMenuTitle] || 0;
                                        
                                        // 질문 횟수 제한 체크
                                        if (currentCount >= MAX_QUESTIONS) {
                                          const errorEl = document.getElementById('questionError');
                                          errorEl.textContent = '이 메뉴에 대한 질문 횟수를 모두 소진했습니다.';
                                          errorEl.style.display = 'block';
                                          return;
                                        }
                                        
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
                                        
                                        // 이번 질문 제출 후 남은 질문이 0이 되는지 미리 계산
                                        const newCount = currentCount + 1;
                                        const remainingAfterSubmit = Math.max(0, MAX_QUESTIONS - newCount);
                                        
                                        // 남은 질문이 0이 되면 즉시 버튼 비활성화 및 UI 업데이트
                                        if (remainingAfterSubmit === 0) {
                                          // 남은 질문 수 즉시 업데이트
                                          const remainingCountEl = document.getElementById('questionRemainingCount');
                                          if (remainingCountEl) {
                                            remainingCountEl.textContent = '0';
                                            remainingCountEl.classList.add('limit-reached');
                                          }
                                          
                                          // 에러 메시지 표시
                                          errorEl.textContent = '이 메뉴에 대한 질문 횟수를 모두 소진했습니다.';
                                          errorEl.style.display = 'block';
                                          
                                          // 버튼 즉시 비활성화 (회색 딤 처리)
                                          submitBtn.disabled = true;
                                          
                                          // 텍스트 영역 비활성화
                                          if (textarea) {
                                            textarea.disabled = true;
                                          }
                                        } else {
                                          // 로딩 중에는 일시적으로 비활성화 (답변 받으면 다시 활성화)
                                          submitBtn.disabled = true;
                                        }
                                        
                                        try {
                                          console.log('질문 제출 API 호출 시작:', {
                                            question,
                                            menuTitle: currentQuestionData.menuTitle,
                                            subtitles: currentQuestionData.subtitles,
                                            subtitlesContent: currentQuestionData.subtitlesContent,
                                          });
                                          
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
                                          
                                          console.log('API 응답 상태:', response.status, response.statusText);
                                          
                                          if (!response.ok) {
                                            const error = await response.json();
                                            console.error('API 오류:', error);
                                            
                                            // 재미나이 응답 디버그 정보 표시
                                            if (error.debug) {
                                              console.error('=== 재미나이 응답 디버그 정보 ===');
                                              console.error('Finish Reason:', error.debug.finishReason);
                                              console.error('Candidates 개수:', error.debug.candidatesCount);
                                              console.error('첫 번째 Candidate 정보:', error.debug.firstCandidate);
                                              console.error('Response 전체 구조:', error.debug);
                                            }
                                            
                                            throw new Error(error.error || '답변 생성에 실패했습니다.');
                                          }
                                          
                                          const data = await response.json();
                                          console.log('API 응답 데이터:', data);
                                          
                                          if (!data.answer) {
                                            console.error('답변이 없습니다:', data);
                                            throw new Error('답변을 받지 못했습니다.');
                                          }
                                          
                                          // 질문 횟수 증가 및 저장 (메뉴별)
                                          const newCount = currentCount + 1;
                                          usedQuestionCounts[currentMenuTitle] = newCount;
                                          
                                          try {
                                            localStorage.setItem('question_counts_' + ${JSON.stringify(saved.id)}, JSON.stringify(usedQuestionCounts));
                                          } catch (e) {
                                            console.error('질문 횟수 저장 실패:', e);
                                          }
                                          
                                          // 남은 질문 수는 이미 제출 시점에 업데이트했으므로 여기서는 확인만
                                          const remaining = Math.max(0, MAX_QUESTIONS - newCount);
                                          
                                          // 남은 질문이 0이면 버튼은 이미 비활성화되어 있음 (제출 시점에 처리)
                                          // 답변 표시 후에도 버튼 상태 유지
                                          if (remaining === 0) {
                                            // 버튼은 이미 비활성화되어 있으므로 상태 유지
                                            if (submitBtn) {
                                              submitBtn.disabled = true;
                                            }
                                            if (textarea) {
                                              textarea.disabled = true;
                                            }
                                          } else {
                                            // 남은 질문이 있으면 버튼 다시 활성화 (다음 질문 가능)
                                            if (submitBtn) {
                                              submitBtn.disabled = false;
                                            }
                                            if (textarea) {
                                              textarea.disabled = false;
                                            }
                                          }
                                          
                                          // 답변 표시
                                          document.getElementById('questionAnswerText').textContent = data.answer;
                                          answerEl.style.display = 'block';
                                        } catch (err) {
                                          errorEl.textContent = err.message || '답변을 생성하는 중 오류가 발생했습니다.';
                                          errorEl.style.display = 'block';
                                        } finally {
                                          loadingEl.style.display = 'none';
                                          
                                          // 남은 질문이 0이 아니면 버튼 다시 활성화
                                          const finalRemaining = Math.max(0, MAX_QUESTIONS - (usedQuestionCounts[currentMenuTitle] || 0));
                                          if (finalRemaining > 0) {
                                            submitBtn.disabled = false;
                                          }
                                          // 남은 질문이 0이면 버튼은 이미 비활성화되어 있으므로 그대로 유지
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
                                      
                                      // 전역 함수 할당 (onclick 핸들러가 작동하도록)
                                      window.closeQuestionPopup = closeQuestionPopup;
                                      window.handleQuestionSubmit = handleQuestionSubmit;
                                      window.initQuestionButtons = initQuestionButtons;
                                      console.log('전역 함수 할당 완료');
                                      
                                      // document.write() 후 DOM이 완전히 로드되도록 보장
                                      if (document.readyState === 'complete') {
                                        console.log('문서가 이미 완료됨, 즉시 버튼 추가 시도');
                                        setTimeout(initQuestionButtons, 100);
                                      } else {
                                        window.addEventListener('load', function() {
                                          console.log('새 창 로드 완료, 버튼 추가 시도');
                                          setTimeout(initQuestionButtons, 100);
                                        });
                                      }
                                    </script>
                                  </body>
                                  </html>
                                `)
                                newWindow.document.close()
                                
                                // document.close() 후에도 버튼 추가 및 TTS 버튼 연결 시도 (안전장치)
                                // 주의: initTTSButton은 내부에서 이미 한 번만 실행되도록 보장되므로
                                // 외부에서 다시 호출해도 중복 등록되지 않습니다.
                                setTimeout(() => {
                                  try {
                                    if (newWindow.document.readyState === 'complete') {
                                      const windowWithCustomProps = newWindow as Window & {
                                        initQuestionButtons?: () => void
                                      }
                                      if (windowWithCustomProps.initQuestionButtons) {
                                        console.log('외부에서 버튼 추가 함수 호출');
                                        windowWithCustomProps.initQuestionButtons();
                                      }
                                      // TTS 버튼은 내부에서 이미 초기화되므로 외부 호출 불필요
                                      // 필요시에만 호출 (중복 방지 로직이 내부에 있음)
                                    }
                                  } catch (e) {
                                    console.error('외부에서 함수 호출 실패:', e);
                                  }
                                }, 500)
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
                        </>
                        )}
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

