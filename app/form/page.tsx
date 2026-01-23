'use client'

import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { getContents, getContentById, getSelectedModel, getSelectedSpeaker, getFortuneViewMode, getUseSequentialFortune } from '@/lib/supabase-admin'
import { callJeminaiAPIStream } from '@/lib/jeminai'
import { calculateManseRyeok, generateManseRyeokTable, generateManseRyeokText, getDayGanji, type ManseRyeokCaptionInfo, convertSolarToLunarAccurate, convertLunarToSolarAccurate } from '@/lib/manse-ryeok'
import TermsPopup from '@/components/TermsPopup'
import PrivacyPopup from '@/components/PrivacyPopup'
import MyHistoryPopup from '@/components/MyHistoryPopup'
import AlertPopup from '@/components/AlertPopup'
import SlideMenuBar from '@/components/SlideMenuBar'
import SupabaseVideo from '@/components/SupabaseVideo'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

function FormContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // sessionStorage에서 title 가져오기 (URL 파라미터 대신)
  const [title, setTitle] = useState<string>('')
  
  // 모델 상태 관리
  const [model, setModel] = useState<string>('gemini-3-flash-preview')
  
  // sessionStorage와 URL 파라미터에서 데이터 가져오기 (하위 호환성 유지)
  useEffect(() => {
    const loadData = async () => {
      // 결제 성공(localStorage) 확인 (페이지 로드 시 즉시 확인)
      if (typeof window !== 'undefined') {
        const storedOid = localStorage.getItem('payment_success_oid')
        const storedTimestamp = localStorage.getItem('payment_success_timestamp')
        
        if (storedOid && storedTimestamp) {
          const timestamp = parseInt(storedTimestamp)
          const now = Date.now()
          // 1시간(3600000ms) 이내의 결제 성공 정보만 처리 (사용자가 오래 결제창을 열어놓은 경우 대비)
          if (now - timestamp < 3600000) {
            console.log('[결제 성공] 페이지 로드 시 localStorage에서 결제 성공 정보 발견:', storedOid)
            // content가 로드될 때까지 기다리지 않고 즉시 처리하려고 하면 안됨
            // content 로드 후 useEffect에서 처리됨
          }
        }
      }
      
      // 결제 실패 URL 처리 (code, msg 파라미터)
      const code = searchParams.get('code')
      const msg = searchParams.get('msg')
      if (code || msg) {
        // code와 msg는 콘솔에만 표시
        console.log('[결제 실패]', { code, msg })
        // 처리 중 상태 해제
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        // 자체 팝업으로 메시지 표시
        showAlertMessage('결제 시스템의 일시적 문제가 있었습니다.\n결제를 다시 시도해 주세요!')
        // URL에서 파라미터 제거
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          url.searchParams.delete('code')
          url.searchParams.delete('msg')
          window.history.replaceState({}, '', url.toString())
        }
      }

      // 1. sessionStorage 우선 확인 (새로운 방식)
      if (typeof window !== 'undefined') {
        const storedTitle = sessionStorage.getItem('form_title')
        const storedModel = sessionStorage.getItem('form_model')
        
        if (storedTitle) {
          setTitle(storedTitle)
          // 삭제하지 않음 (result에서 돌아올 때 재사용 가능하도록 유지)
        }
        
        if (storedModel) {
          setModel(storedModel)
          // 삭제하지 않음 (result에서 돌아올 때 재사용 가능하도록 유지)
          return // sessionStorage에서 가져왔으면 종료
        }
      }
      
      // 2. URL 파라미터 확인 (하위 호환성)
      const urlTitle = searchParams.get('title')
      const urlModel = searchParams.get('model')
      
      if (urlTitle) {
        setTitle(urlTitle)
      }
      
      if (urlModel) {
        setModel(urlModel)
      } else {
        // 3. Supabase에서 모델 가져오기 (기본값)
        try {
          const savedModel = await getSelectedModel()
          setModel(savedModel)
        } catch (error) {
          setModel('gemini-3-flash-preview')
        }
      }
    }
    loadData()
  }, [searchParams])
  
  // 페이지 포커스 시 sessionStorage에서 title 다시 확인 (result에서 돌아올 때 대응)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && typeof window !== 'undefined') {
        const storedTitle = sessionStorage.getItem('form_title')
        if (storedTitle && storedTitle !== title) {
          setTitle(storedTitle)
        }
      }
    }
    
    const handleFocus = () => {
      if (typeof window !== 'undefined') {
        const storedTitle = sessionStorage.getItem('form_title')
        if (storedTitle && storedTitle !== title) {
          setTitle(storedTitle)
        }
      }
    }
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [title])
  
  const [content, setContent] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const introductionIframeRef = useRef<HTMLIFrameElement>(null)
  const recommendationIframeRef = useRef<HTMLIFrameElement>(null)
  const menuItemsIframeRef = useRef<HTMLIFrameElement>(null)
  const [expandedReviewImage, setExpandedReviewImage] = useState<string | null>(null)

  // iframe 높이 자동 조정 (프론트홈과 동일한 방식)
  useEffect(() => {
    if (!content?.introduction && !content?.recommendation && !content?.menu_composition && !content?.menu_items) return

    const adjustIframeHeight = (iframeRef: React.RefObject<HTMLIFrameElement>) => {
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
    const timer = setTimeout(() => {
      if (content?.introduction) adjustIframeHeight(introductionIframeRef)
      if (content?.recommendation) adjustIframeHeight(recommendationIframeRef)
      if (content?.menu_composition) adjustIframeHeight(menuItemsIframeRef)
      else if (content?.menu_items && content.menu_items.length > 0) adjustIframeHeight(menuItemsIframeRef)
    }, 100)
    const interval = setInterval(() => {
      if (content?.introduction) adjustIframeHeight(introductionIframeRef)
      if (content?.recommendation) adjustIframeHeight(recommendationIframeRef)
      if (content?.menu_composition) adjustIframeHeight(menuItemsIframeRef)
      else if (content?.menu_items && content.menu_items.length > 0) adjustIframeHeight(menuItemsIframeRef)
    }, 500) // 주기적으로 높이 확인

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [content?.introduction, content?.recommendation, content?.menu_composition, content?.menu_items])
  
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
  
  const [submitting, setSubmitting] = useState(false)
  const [savedResults, setSavedResults] = useState<any[]>([])
  const [pdfExistsMap, setPdfExistsMap] = useState<Record<string, boolean>>({})
  
  // 리뷰 관련 상태
  const [clickCount, setClickCount] = useState<number>(0)
  const [reviews, setReviews] = useState<any[]>([])
  const [bestReviews, setBestReviews] = useState<any[]>([])
  const [activeReviewTab, setActiveReviewTab] = useState<'reviews' | 'best'>('reviews')
  const [expandedReviews, setExpandedReviews] = useState<Set<number>>(new Set()) // 확장된 리뷰 ID
  const [pdfGeneratedMap, setPdfGeneratedMap] = useState<Record<string, boolean>>({}) // PDF 생성 여부 추적
  const [showPdfConfirmPopup, setShowPdfConfirmPopup] = useState(false) // PDF 생성 확인 팝업
  const [selectedPdfResult, setSelectedPdfResult] = useState<any>(null) // PDF 생성할 결과
  
  // 결제 팝업 상태
  const [showPaymentPopup, setShowPaymentPopup] = useState(false)
  const [paymentProcessingMethod, setPaymentProcessingMethod] = useState<null | 'card' | 'mobile'>(null)
  const [phoneNumber1, setPhoneNumber1] = useState('010')
  const [phoneNumber2, setPhoneNumber2] = useState('')
  const [phoneNumber3, setPhoneNumber3] = useState('')
  const [password, setPassword] = useState('')
  
  // 결제 창 참조 (닫기용)
  const paymentWindowRef = useRef<Window | null>(null)

  // 제출이 끝나면(성공/실패 포함) 결제 버튼 로딩 상태 해제
  useEffect(() => {
    if (!submitting && paymentProcessingMethod !== null) {
      setPaymentProcessingMethod(null)
    }
  }, [submitting, paymentProcessingMethod])
  
  // 약관 동의 상태
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  
  // 알림 팝업 상태
  const [showAlert, setShowAlert] = useState(false)
  const [alertMessage, setAlertMessage] = useState('')
  
  // 로딩 팝업 상태 (PDF 생성 등)
  const [showLoadingPopup, setShowLoadingPopup] = useState(false)
  const [streamingProgress, setStreamingProgress] = useState(0)
  const [currentSubtitle, setCurrentSubtitle] = useState('')
  
  // window 객체에 showAlertMessage 함수 등록 (inline script에서 사용)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).showAlertMessage = (message: string) => {
        setAlertMessage(message)
        setShowAlert(true)
      }
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).showAlertMessage
      }
    }
  }, [])
  
  // 개인정보 수집 및 이용 팝업 상태
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false)
  
  // 나의 이용내역 팝업 상태
  const [showMyHistoryPopup, setShowMyHistoryPopup] = useState(false)
  
  // 슬라이드 메뉴바 상태
  const [showSlideMenu, setShowSlideMenu] = useState(false)
  
  // 동의 안내 팝업 상태
  const [showAgreementAlert, setShowAgreementAlert] = useState(false)
  
  // 이용약관 팝업 상태
  const [showTermsPopup, setShowTermsPopup] = useState(false)
  
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
  
  // 썸네일 이미지 로드 실패 상태 관리
  const [thumbnailError, setThumbnailError] = useState(false)
  const [thumbnailRetried, setThumbnailRetried] = useState(false)
  const [previewThumbnailErrors, setPreviewThumbnailErrors] = useState<Record<number, boolean>>({})
  const [previewThumbnailRetried, setPreviewThumbnailRetried] = useState<Record<number, boolean>>({})
  
  // sessionStorage에서 썸네일 URL 가져오기 (메뉴 페이지에서 로드된 썸네일 재사용)
  const [cachedThumbnailImageUrl, setCachedThumbnailImageUrl] = useState<string | null>(null)
  const [cachedThumbnailVideoUrl, setCachedThumbnailVideoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedThumbnailImageUrl = sessionStorage.getItem('form_thumbnail_image_url')
      const storedThumbnailVideoUrl = sessionStorage.getItem('form_thumbnail_video_url')
      if (storedThumbnailImageUrl) {
        setCachedThumbnailImageUrl(storedThumbnailImageUrl)
      }
      if (storedThumbnailVideoUrl) {
        setCachedThumbnailVideoUrl(storedThumbnailVideoUrl)
      }
    }
  }, [])
  
  // title이 변경될 때 sessionStorage에서 썸네일 다시 확인 (result에서 돌아올 때)
  useEffect(() => {
    if (typeof window !== 'undefined' && title) {
      const storedThumbnailImageUrl = sessionStorage.getItem('form_thumbnail_image_url')
      const storedThumbnailVideoUrl = sessionStorage.getItem('form_thumbnail_video_url')
      if (storedThumbnailImageUrl && !cachedThumbnailImageUrl) {
        setCachedThumbnailImageUrl(storedThumbnailImageUrl)
      }
      if (storedThumbnailVideoUrl && !cachedThumbnailVideoUrl) {
        setCachedThumbnailVideoUrl(storedThumbnailVideoUrl)
      }
    }
  }, [title, cachedThumbnailImageUrl, cachedThumbnailVideoUrl])
  
  // 궁합형 여부 확인
  const isGonghapType = content?.content_type === 'gonghap'
  
  const thumbnailImageUrl = cachedThumbnailImageUrl || content?.thumbnail_url || null
  const thumbnailVideoUrl = cachedThumbnailVideoUrl || content?.thumbnail_video_url || null
  const hasVideo = !!thumbnailVideoUrl

  // 포털 연동: JWT 토큰에서 사용자 정보 자동 입력
  const [formLocked, setFormLocked] = useState(false) // 포털에서 받은 정보는 읽기 전용
  const [isLoadingFromStorage, setIsLoadingFromStorage] = useState(true) // LocalStorage 로딩 중 플래그
  
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
            setIsLoadingFromStorage(false)
          } else {
            showAlertMessage('유효하지 않은 접근입니다.')
            setIsLoadingFromStorage(false)
          }
        })
        .catch((error) => {
          showAlertMessage('사용자 정보를 불러오는 중 오류가 발생했습니다.')
          setIsLoadingFromStorage(false)
        })
    } else {
      // 포털 토큰이 없으면 LocalStorage에서 정보 불러오기
      if (typeof window !== 'undefined') {
        try {
          const savedUserInfo = localStorage.getItem('userInfo')
          if (savedUserInfo && savedUserInfo.trim()) {
            const userInfo = JSON.parse(savedUserInfo)
            
            // 본인 정보
            if (userInfo.name) setName(userInfo.name)
            if (userInfo.gender) setGender(userInfo.gender)
            if (userInfo.calendarType) setCalendarType(userInfo.calendarType)
            if (userInfo.year) setYear(userInfo.year)
            if (userInfo.month) setMonth(userInfo.month)
            if (userInfo.day) setDay(userInfo.day)
            if (userInfo.birthHour) setBirthHour(userInfo.birthHour)
            
            // 이성 정보 (공합 타입일 경우)
            if (userInfo.partnerName) setPartnerName(userInfo.partnerName)
            if (userInfo.partnerGender) setPartnerGender(userInfo.partnerGender)
            if (userInfo.partnerCalendarType) setPartnerCalendarType(userInfo.partnerCalendarType)
            if (userInfo.partnerYear) setPartnerYear(userInfo.partnerYear)
            if (userInfo.partnerMonth) setPartnerMonth(userInfo.partnerMonth)
            if (userInfo.partnerDay) setPartnerDay(userInfo.partnerDay)
            if (userInfo.partnerBirthHour) setPartnerBirthHour(userInfo.partnerBirthHour)
          }
        } catch (error) {
        } finally {
          setIsLoadingFromStorage(false)
        }
      } else {
        setIsLoadingFromStorage(false)
      }
    }
  }, [searchParams])

  // 사용자 정보 변경 시 LocalStorage에 자동 저장 (포털 토큰이 없을 때만)
  useEffect(() => {
    if (isLoadingFromStorage || formLocked) return // 로딩 중이거나 포털에서 받은 정보는 저장하지 않음
    
    if (typeof window !== 'undefined') {
      try {
        const userInfo: any = {
          // 본인 정보
          name,
          gender,
          calendarType,
          year,
          month,
          day,
          birthHour,
        }
        
        // 이성 정보 (공합 타입일 경우)
        if (isGonghapType) {
          userInfo.partnerName = partnerName
          userInfo.partnerGender = partnerGender
          userInfo.partnerCalendarType = partnerCalendarType
          userInfo.partnerYear = partnerYear
          userInfo.partnerMonth = partnerMonth
          userInfo.partnerDay = partnerDay
          userInfo.partnerBirthHour = partnerBirthHour
        }
        
        localStorage.setItem('userInfo', JSON.stringify(userInfo))
      } catch (error) {
      }
    }
  }, [
    name, gender, calendarType, year, month, day, birthHour,
    partnerName, partnerGender, partnerCalendarType, partnerYear, partnerMonth, partnerDay, partnerBirthHour,
    isGonghapType, isLoadingFromStorage, formLocked
  ])

  // 저장된 결과 목록 로드 (서버)
  const loadSavedResults = async () => {
    if (typeof window === 'undefined') return
    try {
      const response = await fetch('/api/saved-results/list')
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`저장된 결과 목록 조회 실패: ${response.status}`)
      }
      
      const result = await response.json()
      
      if (result.success) {
        const data = result.data || []
        setSavedResults(data)
        // PDF 생성 여부 확인
        const generatedMap: Record<string, boolean> = {}
        data.forEach((item: any) => {
          generatedMap[item.id] = item.pdf_generated === true
        })
        setPdfGeneratedMap(generatedMap)
      } else {
        setSavedResults([])
        setPdfGeneratedMap({})
      }
    } catch (e) {
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
      } else {
        throw new Error(result.error || '저장된 결과 삭제에 실패했습니다.')
      }
    } catch (e: any) {
      showAlertMessage(e?.message || '저장된 결과 삭제에 실패했습니다.')
    }
  }

  // HTML에서 썸네일 이미지에 onerror 핸들러 추가 (재시도 포함)
  const addImageErrorHandlers = (html: string): string => {
    // menu-thumbnail 클래스를 가진 이미지 태그에 onerror 핸들러 추가 (재시도 포함)
    return html.replace(
      /(<img[^>]*class="[^"]*menu-thumbnail[^"]*"[^>]*)(\/?>)/g,
      (match, imgTag, closing) => {
        // 이미 onerror가 있는지 확인
        if (imgTag.includes('onerror')) {
          return match + closing
        }
        // 재시도 로직이 포함된 onerror 핸들러 추가
        const originalSrc = imgTag.match(/src=["']([^"']+)["']/)?.[1] || ''
        return imgTag + ' data-retry-count="0" data-original-src="' + originalSrc.replace(/"/g, '&quot;') + '" onerror="if(this.dataset.retryCount===\'0\') { this.dataset.retryCount=\'1\'; this.src=this.dataset.originalSrc+\'?retry=\'+Date.now(); } else { this.onerror=null; this.style.display=\'none\'; if(this.parentElement) { this.parentElement.style.background=\'linear-gradient(to bottom right, #1e3a8a, #7c3aed, #ec4899)\'; this.parentElement.style.minHeight=\'200px\'; } }"' + closing
      }
    )
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
        showAlertMessage('읽을 내용이 없습니다.')
        setPlayingResultId(null)
        return
      }

      // 저장된 컨텐츠에서 TTS 설정 가져오기
      // 기본은 app_settings(=관리자 선택)로 결정하고, 컨텐츠가 "명시적으로 타입캐스트"를 가진 경우에만 override
      let speaker = savedResult.content?.tts_speaker || 'nara'
      // 안전한 기본값: 네이버 (설정 조회 실패 시에도 Typecast 결제 오류로 새지 않게)
      let ttsProvider: 'naver' | 'typecast' = 'naver'
      let typecastVoiceId = 'tc_5ecbbc6099979700087711d8'

      // app_settings 기본값(공개 설정 API)도 반영
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

      // 컨텐츠별 override:
      // - provider가 'typecast'로 명시된 경우에만 타입캐스트로 전환
      // - voice id는 "타입캐스트일 때 사용할 값"일 뿐, 제공자를 강제하지 않는다
      const contentVoiceId = (savedResult.content?.typecast_voice_id && String(savedResult.content.typecast_voice_id).trim() !== '')
        ? String(savedResult.content.typecast_voice_id).trim()
        : ''
      if (contentVoiceId) {
        typecastVoiceId = contentVoiceId
      }
      if (savedResult.content?.tts_provider === 'typecast') {
        ttsProvider = 'typecast'
      }

      // 텍스트를 2000자 단위로 분할
      const maxLength = 2000
      const chunks = splitTextIntoChunks(textContent, maxLength)

      // 각 청크를 순차적으로 변환하고 재생
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]

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

      setPlayingResultId(null)
      setCurrentAudio(null)
    } catch (error: any) {
      showAlertMessage(error?.message || '음성 변환에 실패했습니다.')
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
    if (title) {
      setLoading(true)
    loadContent()
    }
  }, [title])

  // content가 변경될 때 썸네일 에러 상태 초기화 및 캐시된 썸네일 업데이트
  useEffect(() => {
    setThumbnailError(false)
    setThumbnailRetried(false)
    setPreviewThumbnailErrors({})
    setPreviewThumbnailRetried({})
    
    // content가 로드되면 썸네일 URL 업데이트 (캐시된 썸네일 대신 사용)
    if (content?.thumbnail_url) {
      setCachedThumbnailImageUrl(content.thumbnail_url)
      setCachedThumbnailVideoUrl(content.thumbnail_video_url)
    }
  }, [content])

  // 저장된 결과는 컴포넌트 마운트 시와 title 변경 시 모두 로드
  useEffect(() => {
    loadSavedResults()
    
    // result 페이지 미리 로드 (페이지 이동 지연 최소화)
    router.prefetch('/result')
  }, [])

  // 페이지 포커스 시 저장된 결과 동기화
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadSavedResults()
      }
    }

    const handleFocus = () => {
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

  // PDF 생성 확인 팝업 열기
  const handlePdfButtonClick = (saved: any) => {
    // 이미 생성된 경우 팝업 표시하지 않음
    if (pdfGeneratedMap[saved.id]) {
      return
    }
    setSelectedPdfResult(saved)
    setShowPdfConfirmPopup(true)
  }

  // PDF 생성 확인 후 실제 생성
  const handleConfirmPdfGeneration = async () => {
    if (!selectedPdfResult) return
    setShowPdfConfirmPopup(false)
    await handleClientSidePdf(selectedPdfResult)
  }

  // 클라이언트 사이드 PDF 생성 함수 ("보기" 버튼과 동일한 HTML 처리)
  const handleClientSidePdf = async (saved: any) => {
    if (typeof window === 'undefined') return
    
    // 이미 생성된 경우 중복 생성 방지
    if (pdfGeneratedMap[saved.id]) {
      showAlertMessage('이미 PDF가 생성되었습니다. 소장용으로 1회만 생성이 가능합니다.')
      return
    }
    
    // 로딩 상태 표시
    const btnText = document.getElementById(`pdf-btn-text-${saved.id}`)
    const btnIcon = document.getElementById(`pdf-btn-icon-${saved.id}`)
    const btn = btnText?.parentElement as HTMLButtonElement
    const originalText = btnText ? btnText.innerText : 'PDF 생성'
    const originalHtml = btnText ? btnText.innerHTML : 'PDF 생성'
    
    if (btnText) {
      btnText.innerHTML = `
        <span class="flex items-center gap-1">
          생성 중
          <span class="flex space-x-1 items-center h-full pt-1">
            <span class="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
            <span class="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
            <span class="w-1 h-1 bg-white rounded-full animate-bounce"></span>
          </span>
        </span>
      `
    }
    if (btnIcon) btnIcon.style.display = 'none'
    
    let styleElement: HTMLStyleElement | null = null;
    let container: HTMLElement | null = null;
    let originalScrollY: number | undefined;
    let originalScrollX: number | undefined;
    
    try {
      // "보기" 버튼과 동일한 HTML 처리
      let htmlContent = saved.html || '';
      htmlContent = htmlContent.replace(/\*\*/g, '');
      
      // 테이블 정제
      htmlContent = htmlContent
        .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
        .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
        .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
        .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
        .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
      
      const contentObj = saved.content || {};
      const menuItems = contentObj?.menu_items || [];
      const bookCoverThumbnailImageUrl = contentObj?.book_cover_thumbnail || '';
      const bookCoverThumbnailVideoUrl = contentObj?.book_cover_thumbnail_video || '';
      const endingBookCoverThumbnailImageUrl = contentObj?.ending_book_cover_thumbnail || '';
      const endingBookCoverThumbnailVideoUrl = contentObj?.ending_book_cover_thumbnail_video || '';
      
      // DOMParser로 썸네일 추가 ("보기" 버튼과 동일)
      if (menuItems.length > 0 || bookCoverThumbnailImageUrl || bookCoverThumbnailVideoUrl || endingBookCoverThumbnailImageUrl || endingBookCoverThumbnailVideoUrl) {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(htmlContent, 'text/html');
          const menuSections = Array.from(doc.querySelectorAll('.menu-section'));
          
          // 기존 북커버/엔딩북커버가 이미 HTML에 있다면 중복 제거 (PDF에서는 1회만)
          doc.querySelectorAll('.book-cover-thumbnail-container').forEach(el => el.remove());
          doc.querySelectorAll('.ending-book-cover-thumbnail-container').forEach(el => el.remove());
          
          // 북커버 썸네일: PDF에서는 템플릿에서 "제목 아래"에만 1회 렌더링한다.
          // (여기서 menu-section 근처에 넣으면 목차/본문과 섞여 위치가 꼬일 수 있음)
          
          // 소제목 썸네일
          menuSections.forEach((section, menuIndex) => {
            const menuItem = menuItems[menuIndex];
            if (menuItem?.subtitles) {
              const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'));
              subtitleSections.forEach((subSection, subIndex) => {
                const subtitle = menuItem.subtitles[subIndex];
                const subtitleThumbnailImageUrl = subtitle?.thumbnail_image_url || subtitle?.thumbnail || ''
                const subtitleThumbnailVideoUrl = subtitle?.thumbnail_video_url || ''
                if (subtitleThumbnailImageUrl || subtitleThumbnailVideoUrl) {
                  const titleDiv = subSection.querySelector('.subtitle-title');
                  if (titleDiv) {
                    const thumbnailImg = doc.createElement('div');
                    thumbnailImg.className = 'subtitle-thumbnail-container';
                    // ✅ PDF 생성에서는 동영상 대신 "이미지 썸네일"을 명시적으로 사용한다.
                    // (html2canvas가 video 프레임을 안정적으로 캡처하지 못하는 경우가 많음)
                    thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 10px; margin-bottom: 10px; background: #f3f4f6; border-radius: 8px; overflow: hidden;';
                    if (subtitleThumbnailImageUrl) {
                      thumbnailImg.innerHTML = `<img src="${subtitleThumbnailImageUrl}" alt="소제목 썸네일" style="width: 100%; height: 100%; display: block; object-fit: contain;" crossorigin="anonymous" />`;
                    }
                    titleDiv.parentNode?.insertBefore(thumbnailImg, titleDiv.nextSibling);
                  }
                }
              });
            }
          });
          
          // 엔딩 북커버: PDF에서는 템플릿에서 "본문 맨 아래"에만 1회 렌더링한다.
          
          htmlContent = doc.body.innerHTML;
        } catch (e) {
        }
      }

      // 템플릿 리터럴 특수 문자 이스케이프
      const safeHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
      
      // "보기" 버튼과 동일한 HTML 생성 변수 (result 페이지와 완전히 동일)
      const savedMenuFontSize = saved.content?.menu_font_size || 16
      const savedMenuFontBold = saved.content?.menu_font_bold || false
      const savedSubtitleFontSize = saved.content?.subtitle_font_size || 14
      const savedSubtitleFontBold = saved.content?.subtitle_font_bold || false
      const savedDetailMenuFontSize = saved.content?.detail_menu_font_size || 12
      const savedDetailMenuFontBold = saved.content?.detail_menu_font_bold || false
      const savedBodyFontSize = saved.content?.body_font_size || 11
      const savedBodyFontBold = saved.content?.body_font_bold || false
      
      // 각 섹션별 웹폰트 적용 (관리자 폼 설정 우선, 없으면 font_face 하위호환성)
      const menuFontFace = saved.content?.menu_font_face || saved.content?.font_face || ''
      const subtitleFontFace = saved.content?.subtitle_font_face || saved.content?.font_face || ''
      const detailMenuFontFace = saved.content?.detail_menu_font_face || saved.content?.font_face || ''
      const bodyFontFace = saved.content?.body_font_face || saved.content?.font_face || ''

      // 하위 호환성을 위한 전체 폰트 (font_face)
      const fontFace = saved.content?.font_face || ''

      const extractFontFamily = (fontFaceCss: string): string | null => {
        if (!fontFaceCss) return null
        const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
        return match ? (match[1] || match[2]?.trim()) : null
      }
      const menuFontFamily = extractFontFamily(menuFontFace)
      const subtitleFontFamily = extractFontFamily(subtitleFontFace)
      const detailMenuFontFamily = extractFontFamily(detailMenuFontFace)
      const bodyFontFamily = extractFontFamily(bodyFontFace)
      const fontFamilyName = extractFontFamily(fontFace)

      // result 페이지와 완전히 동일한 동적 스타일
      // (주의) PDF 생성은 같은 창에서 스타일을 주입하므로, 반드시 containerId/tempContainerId로 스코핑해서 UI 폰트 오염을 막는다.
      const fontFaceCssForPdf = `
        ${menuFontFace ? menuFontFace : ''}
        ${subtitleFontFace ? subtitleFontFace : ''}
        ${detailMenuFontFace ? detailMenuFontFace : ''}
        ${bodyFontFace ? bodyFontFace : ''}
        ${!menuFontFace && !subtitleFontFace && !detailMenuFontFace && !bodyFontFace && fontFace ? fontFace : ''}
      `
      const hasSectionFonts = Boolean(menuFontFamily || subtitleFontFamily || detailMenuFontFamily || bodyFontFamily)
      
      const fontStylesFallbackAll = fontFamilyName && !hasSectionFonts ? `
        * {
          font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
        }
        body, body *, h1, h2, h3, h4, h5, h6, p, div, span {
          font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
        }
      ` : ''

      // "보기" 버튼과 완전히 동일한 HTML 구조 생성
      container = document.createElement('div');
      const containerId = `pdf-container-${saved.id}`;
      container.id = containerId;
      container.style.position = 'absolute';
      container.style.left = '-10000px';
      container.style.top = '0';
      container.style.width = '896px';
      container.style.maxWidth = '896px';
      container.style.zIndex = '-5000';
      
      // "보기" 버튼과 완전히 동일한 스타일 적용 (명확한 스코핑으로 UI 폰트 오염 방지)
      styleElement = document.createElement('style');
      styleElement.innerHTML = `
        ${fontFaceCssForPdf}
        /* 폰트 스타일을 containerId로 스코핑하여 UI 폰트 오염 방지 */
        ${fontStylesFallbackAll ? `#${containerId} ${fontStylesFallbackAll.replaceAll('\n', '\n        #'+containerId+' ')}` : ''}
        ${menuFontFamily ? `#${containerId} .menu-title { font-family: '${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${subtitleFontFamily ? `#${containerId} .subtitle-title { font-family: '${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${detailMenuFontFamily ? `#${containerId} .detail-menu-title { font-family: '${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${bodyFontFamily ? `#${containerId} .subtitle-content, #${containerId} .detail-menu-content { font-family: '${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${fontFamilyName && !hasSectionFonts ? `#${containerId} * { font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        #${containerId} {
          font-family: ${bodyFontFamily ? `'${bodyFontFamily}', ` : (fontFamilyName && !hasSectionFonts ? `'${fontFamilyName}', ` : '')}-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          max-width: 896px;
          margin: 0 auto;
          padding: 32px 16px;
          background: #ffffff;
        }
        #${containerId} .container {
          background: transparent;
          padding: 0;
        }
        #${containerId} .title-container {
          text-align: center;
          margin-bottom: 16px;
        }
        #${containerId} h1 {
          font-size: 30px;
          font-weight: bold;
          margin: 0 0 16px 0;
          color: #111;
        }
        #${containerId} .thumbnail-container {
          width: 100%;
          margin-bottom: 16px;
        }
        #${containerId} .thumbnail-container img {
          width: 100%;
          height: auto;
          object-fit: cover;
        }
        #${containerId} .tts-button-container {
          display: none;
        }
        #${containerId} .menu-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: none;
        }
        #${containerId} .menu-title {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 16px;
          color: #111;
        }
        #${containerId} .detail-menu-title {
          font-size: 16px;
          font-weight: 600;
          margin-top: 16px;
          margin-bottom: 8px;
          color: #111;
        }
        #${containerId} .menu-thumbnail {
          width: 100%;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 24px;
          display: block;
        }
        #${containerId} .subtitle-section {
          padding-top: 24px;
          padding-bottom: 24px;
          position: relative;
          background-color: #ffffff;
        }
        #${containerId} .subtitle-section:not(:last-child) {
          padding-bottom: 24px;
          margin-bottom: 24px;
        }
        #${containerId} .subtitle-section:not(:last-child)::after {
          content: '';
          display: block;
          width: 300px;
          height: 2px;
          background: linear-gradient(to right, transparent, #ffffff, transparent);
          margin: 24px auto 0;
        }
        #${containerId} .subtitle-section:last-child {
          padding-top: 24px;
          padding-bottom: 24px;
        }
        #${containerId} .subtitle-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #333;
        }
        #${containerId} .subtitle-content {
          color: #555;
          line-height: 1.8;
          white-space: pre-line;
        }
        #${containerId} .detail-menu-content {
          color: #555;
          line-height: 1.8;
          white-space: pre-line;
        }
        #${containerId} .subtitle-thumbnail-container {
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
        #${containerId} .subtitle-thumbnail-container img,
        #${containerId} .subtitle-thumbnail-container video {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 8px;
          object-fit: contain;
        }
        #${containerId} .detail-menu-thumbnail-container {
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
        #${containerId} .detail-menu-thumbnail-container img,
        #${containerId} .detail-menu-thumbnail-container video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
        }
        #${containerId} .menu-title { font-size: ${savedMenuFontSize}px !important; }
        #${containerId} .menu-title { font-weight: ${savedMenuFontBold ? 'bold' : 'normal'} !important; ${saved.content?.menu_color ? `color: ${saved.content.menu_color} !important;` : ''} }
        #${containerId} .subtitle-title { font-size: ${savedSubtitleFontSize}px !important; font-weight: ${savedSubtitleFontBold ? 'bold' : 'normal'} !important; ${saved.content?.subtitle_color ? `color: ${saved.content.subtitle_color} !important;` : ''} }
        #${containerId} .detail-menu-title { font-size: ${savedDetailMenuFontSize}px !important; font-weight: ${savedDetailMenuFontBold ? 'bold' : 'normal'} !important; ${saved.content?.detail_menu_color ? `color: ${saved.content.detail_menu_color} !important;` : ''} }
        #${containerId} .subtitle-content { font-size: ${savedBodyFontSize}px !important; font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important; ${saved.content?.body_color ? `color: ${saved.content.body_color} !important;` : ''} }
        #${containerId} .detail-menu-content { font-size: ${savedBodyFontSize}px !important; font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important; ${saved.content?.body_color ? `color: ${saved.content.body_color} !important;` : ''} }
      `;
      document.head.appendChild(styleElement);
      
      // "보기" 버튼과 완전히 동일한 HTML 구조
      const containerDiv = document.createElement('div');
      containerDiv.className = 'container';
      
      // ✅ PDF 템플릿에서 북커버/엔딩북커버를 "정해진 위치"에 1회만 렌더링한다.
      // ✅ 동영상이 있더라도 PDF에서는 "이미지 썸네일"만 사용한다.
      const bookCoverThumbnail = bookCoverThumbnailImageUrl || ''
      const endingBookCoverThumbnail = endingBookCoverThumbnailImageUrl || ''

      const bookCoverHtml = bookCoverThumbnail ? `
        <div class="book-cover-thumbnail-container" style="width: 100%; margin-bottom: 40px;">
          <img
            src="${bookCoverThumbnail}"
            alt="북커버"
            style="width: 100%; height: auto; object-fit: contain; display: block;"
            crossorigin="anonymous"
          />
        </div>
      ` : '';
      
      const endingBookCoverHtml = endingBookCoverThumbnail ? `
        <div class="ending-book-cover-thumbnail-container" style="width: 100%; margin-top: 24px;">
          <img
            src="${endingBookCoverThumbnail}"
            alt="엔딩북커버"
            style="width: 100%; height: auto; object-fit: contain; display: block;"
            crossorigin="anonymous"
          />
        </div>
      ` : '';
      
      containerDiv.innerHTML = `
        <div class="title-container">
          <h1>${saved.title}</h1>
        </div>
        ${bookCoverHtml}
        ${saved.content?.thumbnail_url ? `
        <div class="thumbnail-container">
          <img src="${saved.content.thumbnail_url}" alt="${saved.title}" />
        </div>
        ` : ''}
        <div class="tts-button-container" style="display: none;">
          <button id="ttsButton" class="tts-button">
            <span id="ttsIcon">🔊</span>
            <span id="ttsText">점사 듣기</span>
          </button>
        </div>
        <div id="contentHtml">${safeHtml}</div>
        ${endingBookCoverHtml}
      `;
      container.appendChild(containerDiv);
      document.body.appendChild(container);
      
      // 프로그래스 바 업데이트 함수
      const updateProgress = (progress: number) => {
        if (btn) {
          btn.style.background = `linear-gradient(to right, #1e40af ${progress}%, #60a5fa ${progress}%)`
        }
      }
      
      updateProgress(10);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 이미지 로딩 대기
      const images = Array.from(container.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 5000);
        });
      }));
      
      updateProgress(30);
      
      // 폰트 로딩 대기 (섹션별 폰트 포함)
      const fontFamiliesToWait = Array.from(new Set([menuFontFamily, subtitleFontFamily, detailMenuFontFamily, bodyFontFamily, fontFamilyName].filter(Boolean))) as string[]
      if (fontFamiliesToWait.length > 0) {
        try {
          await document.fonts.ready;
          let allLoaded = false;
          for (let i = 0; i < 60; i++) {
            allLoaded = fontFamiliesToWait.every((fam) => (
              document.fonts.check(`12px "${fam}"`) ||
              document.fonts.check(`16px "${fam}"`) ||
              document.fonts.check(`24px "${fam}"`)
            ))
            if (allLoaded) break
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (!allLoaded) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      updateProgress(50);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // PDF 생성 - 보기 화면의 스크롤 길이만큼 하나의 긴 페이지로 생성
      const margin = 5; // 최소 여백 5mm (상하좌우 동일)
      const pdfPageWidth = 210; // PDF 페이지 너비 210mm (A4 가로)
      const contentWidth = pdfPageWidth - (margin * 2); // 200mm (최대 너비 활용)
      
      // PDF는 나중에 캡처된 이미지 높이에 맞춰 동적으로 생성
      let pdf: jsPDF | null = null;
      
      // 제목 제거
      const titleEl = container.querySelector('h1');
      if (titleEl) {
        titleEl.remove();
      }
      
      // "보기" 버튼과 동일한 HTML을 그대로 캡처 (WYSIWYG)
      
      // TTS 버튼 제거
      const ttsButtonContainer = container.querySelector('.tts-button-container');
      if (ttsButtonContainer) {
        ttsButtonContainer.remove();
      }
      
      updateProgress(60);
      
      // "보기" 화면과 동일한 구조로 캡처
      // contentHtml을 직접 사용하거나, container 내부의 실제 컨텐츠 사용
      const contentHtml = container.querySelector('#contentHtml') || container.querySelector('.container');
      if (!contentHtml) {
        throw new Error('컨텐츠를 찾을 수 없습니다.');
      }
      
      // 전체 내용을 하나의 캔버스로 캡처
      const scale = 2; // 고품질 유지
      const jpegQuality = 0.92; // 고품질 유지
      
      // 보기 화면과 동일한 너비로 설정 (896px는 보기 화면의 실제 너비)
      const viewWidth = 896;
      
      // 임시 컨테이너 생성 (보기 화면과 동일한 구조)
      // 원래 스크롤 위치 저장 (PDF 생성 후 복원)
      originalScrollY = window.scrollY;
      originalScrollX = window.scrollX;
      
      // html2canvas가 제대로 캡처하려면 요소가 화면에 보여야 하지만, 사용자에게는 보이지 않게 처리
      const tempContainer = document.createElement('div');
      const tempContainerId = `temp-pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      tempContainer.id = tempContainerId;
      tempContainer.style.position = 'fixed'; // fixed로 변경하여 스크롤 영향 없음
      tempContainer.style.left = '-9999px'; // 화면 밖으로 완전히 이동
      tempContainer.style.top = '0';
      
      // A4 너비(210mm)에 해당하는 픽셀 너비 (96dpi 기준 약 794px, 2x 스케일이면 약 1588px)
      // 화면 너비에 상관없이 고정 너비를 사용하여 PDF 레이아웃을 일관되게 유지
      // 보기 화면과 동일한 레이아웃 유지 (뷰 기준 896px)
      const pdfTargetWidth = viewWidth;
      
      tempContainer.style.width = `${pdfTargetWidth}px`;
      tempContainer.style.maxWidth = `${pdfTargetWidth}px`;
      tempContainer.style.minWidth = `${pdfTargetWidth}px`;
      tempContainer.style.boxSizing = 'border-box';
      tempContainer.style.zIndex = '-99999';
      tempContainer.style.backgroundColor = '#f9fafb'; // 보기 화면과 동일한 배경색
      tempContainer.style.padding = '0';
      tempContainer.style.margin = '0';
      tempContainer.style.border = 'none';
      tempContainer.style.overflow = 'visible';
      tempContainer.style.opacity = '1'; // html2canvas가 캡처하려면 opacity 1이어야 함
      tempContainer.style.visibility = 'visible'; // html2canvas가 캡처하려면 visible이어야 함
      tempContainer.style.pointerEvents = 'none';
      
      // 폰트 스타일 적용
      {
        const baseFontFamily = bodyFontFamily || (fontFamilyName && !hasSectionFonts ? fontFamilyName : '') || ''
        if (baseFontFamily) {
          tempContainer.style.fontFamily = `'${baseFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`;
        }
        const scopedStyle = document.createElement('style');
        scopedStyle.innerHTML = `
          ${fontFaceCssForPdf}
          #${tempContainerId} * {
            ${baseFontFamily ? `font-family: '${baseFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          ${menuFontFamily ? `#${tempContainerId} .menu-title { font-family: '${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          ${subtitleFontFamily ? `#${tempContainerId} .subtitle-title { font-family: '${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          ${detailMenuFontFamily ? `#${tempContainerId} .detail-menu-title { font-family: '${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          ${bodyFontFamily ? `#${tempContainerId} .subtitle-content, #${tempContainerId} .detail-menu-content { font-family: '${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          #${tempContainerId} {
            background: #f9fafb !important; /* 보기 화면과 동일한 배경색 */
          }
          #${tempContainerId} body {
            background: #f9fafb !important;
          }
          #${tempContainerId} html {
            background: #f9fafb !important;
          }
          #${tempContainerId} .container {
            background: transparent !important;
            padding: 32px 16px;
          }
          #${tempContainerId} .menu-section {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: none;
          }
          #${tempContainerId} .menu-title {
            font-size: ${savedMenuFontSize}px !important;
            font-weight: ${savedMenuFontBold ? 'bold' : 'normal'} !important;
            margin-bottom: 16px;
            color: ${saved.content?.menu_color ? saved.content.menu_color : '#111'} !important;
            text-shadow: none !important;
            -webkit-text-stroke: 0 !important;
            -webkit-text-fill-color: ${saved.content?.menu_color ? saved.content.menu_color : '#111'} !important;
          }
          #${tempContainerId} .subtitle-section {
            padding-top: 24px;
            padding-bottom: 24px;
            position: relative;
            background-color: #ffffff;
          }
          #${tempContainerId} .subtitle-section:not(:last-child) {
            padding-bottom: 24px;
            margin-bottom: 24px;
          }
          #${tempContainerId} .subtitle-section:not(:last-child)::after {
            content: '';
            display: block;
            width: 300px;
            height: 2px;
            background: linear-gradient(to right, transparent, #ffffff, transparent);
            margin: 24px auto 0;
          }
          #${tempContainerId} .subtitle-title {
            font-size: ${savedSubtitleFontSize}px !important;
            font-weight: ${savedSubtitleFontBold ? 'bold' : 'normal'} !important;
            margin-bottom: 12px;
            color: ${saved.content?.subtitle_color ? saved.content.subtitle_color : '#333'} !important;
            text-shadow: none !important;
            -webkit-text-stroke: 0 !important;
            -webkit-text-fill-color: ${saved.content?.subtitle_color ? saved.content.subtitle_color : '#333'} !important;
          }
          #${tempContainerId} .detail-menu-title {
            font-size: ${savedDetailMenuFontSize}px !important;
            font-weight: ${savedDetailMenuFontBold ? 'bold' : 'normal'} !important;
            margin-top: 16px;
            margin-bottom: 8px;
            color: ${saved.content?.detail_menu_color ? saved.content.detail_menu_color : '#111'} !important;
            text-shadow: none !important;
            -webkit-text-stroke: 0 !important;
            -webkit-text-fill-color: ${saved.content?.detail_menu_color ? saved.content.detail_menu_color : '#111'} !important;
          }
          #${tempContainerId} .subtitle-content {
            font-size: ${savedBodyFontSize}px !important;
            font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important;
            color: ${saved.content?.body_color ? saved.content.body_color : '#555'} !important;
            line-height: 1.8;
            white-space: pre-line;
          }
          #${tempContainerId} .detail-menu-content {
            font-size: ${savedBodyFontSize}px !important;
            font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important;
            color: ${saved.content?.body_color ? saved.content.body_color : '#555'} !important;
            line-height: 1.8;
            white-space: pre-line;
          }
          #${tempContainerId} .menu-thumbnail,
          #${tempContainerId} img.menu-thumbnail {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
            display: block !important;
            margin-bottom: 16px !important;
          }
          #${tempContainerId} .subtitle-thumbnail-container {
            width: 300px !important;
            height: 300px !important;
            max-width: 300px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            margin-top: 0.5rem !important;
            margin-bottom: 0.5rem !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            background: #f3f4f6 !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }
          #${tempContainerId} .subtitle-thumbnail-container img,
          #${tempContainerId} .subtitle-thumbnail-container video {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            display: block !important;
            object-fit: contain !important;
          }
          #${tempContainerId} .detail-menu-thumbnail-container {
            width: 300px !important;
            height: 300px !important;
            max-width: 300px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            margin-top: 0.5rem !important;
            margin-bottom: 0.5rem !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            background: #f3f4f6 !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }
          #${tempContainerId} .detail-menu-thumbnail-container img,
          #${tempContainerId} .detail-menu-thumbnail-container video {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            display: block !important;
            object-fit: contain !important;
          }
        `;
        tempContainer.appendChild(scopedStyle);
      }
      
      // 보기 화면과 동일한 구조로 복사
      // container 전체를 복사 (북커버, 목차, 모든 내용 포함)
      const containerWrapper = container.querySelector('.container') || contentHtml.parentElement;
      if (!containerWrapper) {
        throw new Error('컨테이너 래퍼를 찾을 수 없습니다.');
      }
      
      // container 전체를 복사 (북커버, 목차, 모든 메뉴 섹션 포함)
      const tempContainerDiv = containerWrapper.cloneNode(true) as HTMLElement;
      tempContainer.appendChild(tempContainerDiv);
      document.body.appendChild(tempContainer);
      
      // tempContainer의 높이를 명시적으로 설정하여 전체 내용이 포함되도록
      tempContainer.style.height = 'auto';
      tempContainer.style.minHeight = '0';
      
      // 목차 생성 및 삽입 (View 화면과 동일하게)
      try {
        const menuSections = Array.from(tempContainer.querySelectorAll('.menu-section'));
        if (menuSections.length > 0) {
          // 목차 텍스트 시작 위치를 대메뉴(.menu-section) 제목 시작 위치와 맞추기 위해 좌우 패딩(24px) 추가
          let tocHtml = '<div id="table-of-contents" class="toc-container" style="margin-bottom: 24px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 24px 24px 24px 24px; box-sizing: border-box;">';
          tocHtml += '<h3 style="font-size: 18px; font-weight: bold; color: #111827 !important; margin-bottom: 16px;">목차</h3>';
          tocHtml += '<div style="display: flex; flex-direction: column; gap: 8px;">';
          
          menuSections.forEach((section, mIndex) => {
            const menuTitleEl = section.querySelector('.menu-title');
            const menuTitle = (menuTitleEl?.textContent || '').trim();
            
            if (!menuTitle) return;
            
            // HTML 이스케이프 처리
            const escapedMenuTitle = menuTitle
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            
            tocHtml += '<div style="display: flex; flex-direction: column; gap: 4px;">';
            tocHtml += `<div style="text-align: left; font-size: 16px; font-weight: 600; color: #1f2937 !important; padding: 4px 0;">${escapedMenuTitle}</div>`;
            
            const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'));
            if (subtitleSections.length > 0) {
              tocHtml += '<div style="margin-left: 16px; display: flex; flex-direction: column; gap: 2px;">';
              subtitleSections.forEach((subSection, sIndex) => {
                const subtitleTitleEl = subSection.querySelector('.subtitle-title');
                const subTitle = (subtitleTitleEl?.textContent || '').trim();
                
                if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) return;
                
                // HTML 이스케이프 처리
                const escapedSubTitle = subTitle
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
                
                tocHtml += `<div style="text-align: left; font-size: 14px; color: #4b5563 !important; padding: 2px 0;">${escapedSubTitle}</div>`;
              });
              tocHtml += '</div>';
            }
            tocHtml += '</div>';
          });
          
          tocHtml += '</div></div>';
          
          // 목차 삽입 위치: "상단 북커버" 뒤, 첫 번째 메뉴 섹션 앞
          const containerDiv = tempContainer.querySelector('.container') || tempContainer.firstElementChild;
          if (containerDiv) {
             const tocDiv = document.createElement('div');
             tocDiv.innerHTML = tocHtml;
             
             // 상단 북커버(=menu-section 밖에 있는 북커버)만 인정
             const bookCover = Array.from(containerDiv.querySelectorAll('.book-cover-thumbnail-container'))
               .find(el => !el.closest('.menu-section'));
             const firstMenu = containerDiv.querySelector('.menu-section');
             
             if (bookCover) {
               // 북커버 바로 뒤에 삽입
               containerDiv.insertBefore(tocDiv, bookCover.nextSibling);
             } else if (firstMenu) {
               // 첫 번째 메뉴 섹션 앞에 삽입
               containerDiv.insertBefore(tocDiv, firstMenu);
             } else {
               // 맨 앞에 삽입
               containerDiv.prepend(tocDiv);
             }
             
             // 북커버 중복은 htmlContent(DOMParser) 단계에서 제거한다.
             // 여기서 삭제 로직을 두면 목차/북커버 배치가 깨질 수 있어 제거한다.
          }
        }
      } catch (e) {
      }
      
      // 이미지 로드 대기 및 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 1000)); // 렌더링 대기
      
      // 이미지가 모두 로드될 때까지 대기
      const tempImages = tempContainer.querySelectorAll('img');
      if (tempImages.length > 0) {
        await Promise.all(
          Array.from(tempImages).map((img) => {
            if ((img as HTMLImageElement).complete) {
              return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                resolve(null); // 타임아웃되어도 계속 진행
              }, 5000);
              (img as HTMLImageElement).onload = () => {
                clearTimeout(timeout);
                resolve(null);
              };
              (img as HTMLImageElement).onerror = () => {
                clearTimeout(timeout);
                resolve(null); // 에러가 나도 계속 진행
              };
            });
          })
        );
      }
      
      // 추가 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // html2canvas 캡처 전에 모든 요소의 배경색을 명시적으로 설정 (검정색 방지)
      const allElements = tempContainer.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const computedBg = window.getComputedStyle(htmlEl).backgroundColor;
        // 검정색이거나 투명한 배경인 경우 배경색 설정
        if (computedBg === 'rgba(0, 0, 0, 0)' || computedBg === 'transparent' || computedBg === 'rgb(0, 0, 0)') {
          if (htmlEl.classList.contains('menu-section')) {
            htmlEl.style.backgroundColor = '#ffffff';
          } else if (htmlEl.classList.contains('subtitle-section') || htmlEl.classList.contains('container')) {
            htmlEl.style.backgroundColor = 'transparent';
          } else if (htmlEl.tagName === 'BODY' || htmlEl.tagName === 'HTML') {
            htmlEl.style.backgroundColor = '#f9fafb';
          }
        }
      });
      
      // tempContainer 자체도 배경색 확인
      const tempContainerBg = window.getComputedStyle(tempContainer).backgroundColor;
      if (tempContainerBg === 'rgba(0, 0, 0, 0)' || tempContainerBg === 'rgb(0, 0, 0)') {
        tempContainer.style.backgroundColor = '#f9fafb';
      }
      
      try {
        // 전체를 하나의 긴 캔버스로 캡처 (보기 화면의 전체 스크롤 높이만큼)
        const actualHeight = tempContainer.scrollHeight || tempContainer.offsetHeight;
        const estimatedPages = Math.ceil(actualHeight / (1123 * scale)); // A4 한 페이지 높이 기준
        
        // html2canvas로 전체 컨텐츠 캡처
        // height를 지정하지 않으면 전체 scrollHeight를 자동으로 캡처
        
        // ✅ 전체 y-offset 청크 방식은 html2canvas가 특정 구간을 통째로 누락시키는 케이스가 있어
        // "블록(북커버/목차/메뉴섹션/엔딩북커버) 단위"로 캡처해서 순서대로 PDF에 붙인다.
        pdf = null;
        
        const pdfPageWidth = 210; // mm
        // PDF 표준 최대 높이(14400pt)를 mm로 환산하면 약 5080mm(=200in) 정도입니다.
        // 14400mm로 넣으면 PDF 뷰어가 1장으로 뭉개거나 중간이 잘리는 문제가 생길 수 있어
        // 안전하게 5000mm로 제한합니다.
        const maxPdfPageHeight = 5000; // mm
        const pdfMargin = 5; // mm (상하 여백)
        const usablePageHeight = maxPdfPageHeight - (pdfMargin * 2); // 실제 사용 가능한 높이
        
        pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: [pdfPageWidth, maxPdfPageHeight],
          compress: true
        });
        
        let currentPdfY = pdfMargin; // 상단 여백부터 시작
        
        const root = (tempContainer.querySelector('.container') as HTMLElement) || (tempContainer.firstElementChild as HTMLElement);
        if (!root) throw new Error('PDF 캡처 루트(.container)를 찾을 수 없습니다.');
        
        const blocks: HTMLElement[] = [];
        const topCover = root.querySelector('.book-cover-thumbnail-container') as HTMLElement | null;
        const toc = root.querySelector('#table-of-contents') as HTMLElement | null;
        const menuSections = Array.from(root.querySelectorAll('.menu-section')) as HTMLElement[];
        const endingCover = root.querySelector('.ending-book-cover-thumbnail-container') as HTMLElement | null;
        
        if (topCover) blocks.push(topCover);
        if (toc) blocks.push(toc);
        blocks.push(...menuSections);
        if (endingCover) blocks.push(endingCover);
        
        if (blocks.length === 0) throw new Error('PDF로 변환할 블록을 찾을 수 없습니다.');
        
        // 블록 캡처 시 너무 큰 요소는 내부적으로 슬라이스로 나눔
        const maxSliceHeightPx = 8000;
        const sliceOverlapPx = 120;
        
        const addCanvasToPdf = (canvasToAdd: HTMLCanvasElement) => {
          if (!pdf) return;
          
          const imgW = canvasToAdd.width;
          const imgH = canvasToAdd.height;
          if (imgW <= 0 || imgH <= 0) return;
          
          const pdfImgWidth = pdfPageWidth - (pdfMargin * 2); // 좌우 여백 제외
          const pdfImgHeight = (imgH * pdfImgWidth) / imgW;
          
          // 이미지가 현재 페이지에 들어갈 공간이 부족하면 새 페이지로 넘김
          // 하단 여백(pdfMargin)을 고려하여 계산
          if (currentPdfY + pdfImgHeight > maxPdfPageHeight - pdfMargin) {
            pdf.addPage([pdfPageWidth, maxPdfPageHeight]);
            currentPdfY = pdfMargin; // 새 페이지의 상단 여백부터 시작
          }
          
          pdf.addImage(canvasToAdd.toDataURL('image/jpeg', 0.95), 'JPEG', pdfMargin, currentPdfY, pdfImgWidth, pdfImgHeight);
          currentPdfY += pdfImgHeight;
        };
        
        const captureElement = async (el: HTMLElement) => {
          // ✅ 요소 단위로 캡처. 긴 요소는 wrapper(overflow hidden) + translateY로 슬라이스.
          const elHeight = Math.max(el.scrollHeight || 0, el.offsetHeight || 0, el.clientHeight || 0);
          const elWidth = Math.max(el.scrollWidth || 0, el.offsetWidth || 0, el.clientWidth || 0);
          if (elHeight <= 0 || elWidth <= 0) return;
          
          // 짧으면 그대로 캡처
          if (elHeight <= maxSliceHeightPx) {
            const canvas = await html2canvas(el, {
              scale,
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#f9fafb',
              logging: false,
              imageTimeout: 20000,
              foreignObjectRendering: false
            });
            addCanvasToPdf(canvas);
            canvas.width = 1; canvas.height = 1;
            return;
          }
          
          // 슬라이스 캡처
          const step = maxSliceHeightPx - sliceOverlapPx;
          for (let y = 0; y < elHeight; y += step) {
            const sliceStartY = Math.max(0, y - (y === 0 ? 0 : sliceOverlapPx));
            const sliceHeight = Math.min(elHeight - sliceStartY, maxSliceHeightPx);
            
            // wrapper 생성 (레이아웃 영향 없이 슬라이스 캡처)
            const wrapper = document.createElement('div');
            // tempContainer 내부에 absolute로 붙여야 스코프 스타일(#tempContainerId ...)이 그대로 적용됨
            // (body에 붙이면 스타일이 빠져서 높이/레이아웃이 달라지고 내용 누락이 발생할 수 있음)
            wrapper.style.position = 'absolute';
            wrapper.style.left = '0';
            wrapper.style.top = '0';
            wrapper.style.width = `${elWidth}px`;
            wrapper.style.height = `${sliceHeight}px`;
            wrapper.style.overflow = 'hidden';
            wrapper.style.background = '#f9fafb';
            
            const cloned = el.cloneNode(true) as HTMLElement;
            cloned.style.transform = `translateY(-${sliceStartY}px)`;
            cloned.style.transformOrigin = 'top left';
            cloned.style.width = `${elWidth}px`;
            cloned.style.boxSizing = 'border-box';
            
            wrapper.appendChild(cloned);
            tempContainer.appendChild(wrapper);
            
            const sliceCanvas = await html2canvas(wrapper, {
              scale,
              useCORS: true,
              allowTaint: true,
              backgroundColor: '#f9fafb',
              logging: false,
              imageTimeout: 20000,
              foreignObjectRendering: false,
              width: elWidth,
              height: sliceHeight
            });
            
            tempContainer.removeChild(wrapper);
            
            // overlap crop
            let finalCanvas = sliceCanvas;
            if (y > 0) {
              const cropTopPx = sliceOverlapPx * scale;
              if (finalCanvas.height > cropTopPx + 10) {
                const cropped = document.createElement('canvas');
                cropped.width = finalCanvas.width;
                cropped.height = finalCanvas.height - cropTopPx;
                const cctx = cropped.getContext('2d');
                if (cctx) {
                  cctx.drawImage(finalCanvas, 0, cropTopPx, finalCanvas.width, cropped.height, 0, 0, cropped.width, cropped.height);
                  finalCanvas = cropped;
                }
              }
            }
            
            addCanvasToPdf(finalCanvas);
            
            sliceCanvas.width = 1; sliceCanvas.height = 1;
            if (finalCanvas !== sliceCanvas) { finalCanvas.width = 1; finalCanvas.height = 1; }
          }
        };
        
        for (let i = 0; i < blocks.length; i++) {
          await captureElement(blocks[i]);
          const progress = 60 + Math.floor(((i + 1) / blocks.length) * 30);
          updateProgress(progress);
        }
        
        // tempContainer 제거
        if (tempContainer.parentNode) {
          document.body.removeChild(tempContainer);
        }
        
        // 원래 스크롤 위치 복원 (사용자 화면이 움직이지 않도록)
        window.scrollTo(originalScrollX, originalScrollY);
        
      } catch (error) {
        // 에러 발생 시에도 tempContainer 제거 및 스크롤 복원
        if (tempContainer.parentNode) {
          document.body.removeChild(tempContainer);
        }
        window.scrollTo(originalScrollX, originalScrollY);
        throw error;
      }
      
      if (!pdf) {
        throw new Error('PDF 생성에 실패했습니다.');
      }
      
      updateProgress(95);
      pdf.save(`${saved.title || '재회 결과'}.pdf`);
      updateProgress(100);
      
      // PDF 생성 완료 후 Supabase에 저장
      try {
        const response = await fetch('/api/saved-results/mark-pdf-generated', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: saved.id }),
        })
        
        if (response.ok) {
          // 로컬 상태 업데이트
          setPdfGeneratedMap(prev => ({ ...prev, [saved.id]: true }))
        } else {
        }
      } catch (error) {
      }
      
      // 정리
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }

    } catch (error) {
      showAlertMessage(`PDF 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
      // 컨테이너 제거
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      // 스타일 제거
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
      // 스크롤 위치 복원 (에러 발생 시에도)
      if (typeof originalScrollY !== 'undefined' && typeof originalScrollX !== 'undefined') {
        window.scrollTo(originalScrollX, originalScrollY);
      }
    } finally {
      if (btnText) btnText.innerHTML = originalHtml
      if (btnIcon) btnIcon.style.display = 'block'
      if (btn) btn.style.background = ''
    }
  }

  const loadContent = async () => {
    if (!title) {
      setContent(null)
      setLoading(false)
      return
    }
    
    try {
      setLoading(true)
      // ✅ 폼 진입 속도 최적화:
      // home/메뉴에서 선택한 content_id가 있으면 전체 목록(getContents) 대신 단일 조회(getContentById) 사용
      let foundContent: any = null
      if (typeof window !== 'undefined') {
        const storedContentId = sessionStorage.getItem('form_content_id')
        if (storedContentId) {
          const id = parseInt(storedContentId, 10)
          if (!Number.isNaN(id)) {
            try {
              foundContent = await getContentById(id)
            } catch (e) {
              // 실패 시 기존 방식(getContents)으로 폴백
            }
          }
        }
      }

      let decodedTitle = title
      try {
        decodedTitle = decodeURIComponent(title)
      } catch (e) {
        // 이미 디코딩되었거나 잘못된 형식인 경우 원본 사용
        decodedTitle = title
      }

      if (!foundContent) {
        const data = await getContents()
        foundContent = data?.find((item: any) => item.content_name === decodedTitle) || null
      } else {
        // storedContentId로 가져온 컨텐츠가 title과 다르면(다른 카드 클릭 등) 폴백
        if (foundContent?.content_name && foundContent.content_name !== decodedTitle) {
          const data = await getContents()
          foundContent = data?.find((item: any) => item.content_name === decodedTitle) || null
        }
      }
      
      if (!foundContent) {
      }
      
      // tts_speaker가 없거나 'nara'이면 app_settings에서 선택된 화자 사용
      if (foundContent && (!foundContent.tts_speaker || foundContent.tts_speaker === 'nara')) {
        try {
          const selectedSpeaker = await getSelectedSpeaker()
          foundContent.tts_speaker = selectedSpeaker
        } catch (error) {
        }
      }

      // ✅ 비노출 컨텐츠는 프론트에서 직접 접근(세션스토리지/URL 등) 모두 차단
      // (기본값: 비노출, 운영자가 노출 체크 후 저장해야만 접근 가능)
      if (foundContent) {
        const exposed = foundContent?.is_exposed === true || foundContent?.is_exposed === 'true' || foundContent?.is_exposed === 1
        if (!exposed) {
          setContent(null)
          setLoading(false)
          try {
            alert('비노출 컨텐츠입니다. 관리자에서 노출로 저장된 상품만 이용할 수 있습니다.')
          } catch (e) {}
          router.replace('/')
          return
        }
      }
      
      setContent(foundContent || null)

      // ✅ UX 개선: 폼 본문을 빨리 보여주고(로딩 해제),
      // 클릭 수 증가/리뷰 로드는 백그라운드에서 진행
      setLoading(false)

      if (foundContent?.id) {
        // 클릭 수 조회 (증가 전 값)
        setClickCount(foundContent.click_count || 0)

        // 클릭 수 증가 (백그라운드)
        void (async () => {
          try {
            const clickRes = await fetch('/api/content/click', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content_id: foundContent.id }),
            })
            if (clickRes.ok) {
              const clickData = await clickRes.json()
              setClickCount(clickData.click_count || foundContent.click_count || 0)
            }
          } catch (e) {
            // 무시 (UX 우선)
          }
        })()

        // 리뷰 로드 (백그라운드)
        void loadReviews(foundContent.id)
      }
    } catch (error) {
      setContent(null)
    } finally {
      // 위에서 setLoading(false)로 빠르게 해제하므로, 여기서는 안전망만 유지
      setLoading(false)
    }
  }

  // 오픈창에서 결제 성공 메시지 수신 처리 및 sessionStorage 확인 (content가 로드된 후에만 실행)
  useEffect(() => {
    if (!content || !content.id) return // content가 로드되지 않았으면 대기
    
    let isProcessing = false // 중복 처리 방지 플래그
    
    // localStorage에서 결제 성공 정보 확인 (메시지가 놓쳤을 경우 대비)
    const checkLocalStorage = async () => {
      if (typeof window === 'undefined') return
      
      const storedOid = localStorage.getItem('payment_success_oid')
      const storedTimestamp = localStorage.getItem('payment_success_timestamp')
      
      // 로그 제거: sessionStorage에 값이 있을 때만 로그 출력
      if (storedOid && storedTimestamp) {
        const timestamp = parseInt(storedTimestamp)
        const now = Date.now()
        const timeDiff = now - timestamp
        
        // 1시간(3600000ms) 이내의 결제 성공 정보만 처리 (사용자가 오래 결제창을 열어놓은 경우 대비)
        if (timeDiff < 3600000) {
          console.log('[결제 성공] localStorage에서 결제 성공 정보 발견:', storedOid)
          await processPaymentSuccess(storedOid)
          // 처리 후 삭제
          localStorage.removeItem('payment_success_oid')
          localStorage.removeItem('payment_success_timestamp')
        } else {
          // 1시간 이상 지난 오래된 정보는 삭제 (로그 없이)
          localStorage.removeItem('payment_success_oid')
          localStorage.removeItem('payment_success_timestamp')
        }
      }
    }
    
    // 결제 성공 처리 함수 (opener에서 직접 호출)
    // 통화 내용: "함수에서 OID를 받아서 거기서 AGX로 쿼리해서 상태가 Y면 결제로 바로 넘기면 되거든요"
    const processPaymentSuccess = async (oid: string) => {
      console.log('[결제 성공] processPaymentSuccess 호출됨:', { oid, isProcessing, submitting })
      
      // 중복 처리 방지
      if (isProcessing) {
        console.log('[결제 성공] 이미 처리 중이므로 무시')
        return
      }
      
      isProcessing = true
      console.log('[결제 성공] 결제 성공 처리 시작:', oid)
      
      // ✅ 결제 창 닫기 (성공 시)
      try {
        if (paymentWindowRef.current && !paymentWindowRef.current.closed) {
          paymentWindowRef.current.close()
          console.log('[결제 성공] 결제 창 닫기 완료')
        }
      } catch (e) {
        console.warn('[결제 성공] 결제 창 닫기 실패:', e)
      }
      
      // 먼저 localStorage 확인 (서버 상태 확인보다 우선)
      const successOid = localStorage.getItem('payment_success_oid')
      const successTimestamp = localStorage.getItem('payment_success_timestamp')
      const timestampDiff = successTimestamp ? Date.now() - parseInt(successTimestamp) : null
      // localStorage에 성공 신호가 있고, oid가 정확히 일치해야만 처리
      const hasLocalStorageSignal = successOid === oid
      
      console.log('[결제 성공] localStorage 사전 확인:', {
        successOid,
        oid,
        exactMatch: successOid === oid,
        hasLocalStorageSignal,
        successTimestamp,
        timestampDiff
      })
      
      // OID로 서버 상태 확인 (한 번만 확인)
      // 성공 페이지가 DB를 업데이트했는지 확인
      let serverStatusConfirmed = false
      try {
        const statusRes = await fetch(`/api/payment/status?oid=${oid}`)
        if (statusRes.ok) {
          const statusData = await statusRes.json()
          console.log('[결제 성공] 서버 상태 확인 결과:', statusData)
          
          if (statusData.success && statusData.status === 'success') {
            serverStatusConfirmed = true
            console.log('[결제 성공] 서버 상태 확인 성공, 결제 처리 진행')
          } else {
            console.log('[결제 성공] 서버 상태가 success가 아님:', statusData)
            // pending 상태일 수도 있으므로 잠시 대기 후 재시도
            console.log('[결제 성공] 서버 상태가 success가 아님, 잠시 대기 후 재시도...')
            await new Promise(resolve => setTimeout(resolve, 1000))
            
            const retryRes = await fetch(`/api/payment/status?oid=${oid}`)
            if (retryRes.ok) {
              const retryData = await retryRes.json()
              console.log('[결제 성공] 서버 상태 재확인 결과:', retryData)
              
              if (retryData.success && retryData.status === 'success') {
                serverStatusConfirmed = true
                console.log('[결제 성공] 서버 상태 재확인 성공')
              } else {
                console.log('[결제 성공] 서버 상태 재확인 실패:', retryData)
              }
            } else {
              console.error('[결제 성공] 서버 상태 재확인 HTTP 오류:', retryRes.status)
            }
          }
        } else {
          console.error('[결제 성공] 서버 상태 확인 HTTP 오류:', statusRes.status)
        }
      } catch (error) {
        console.error('[결제 성공] 서버 상태 확인 오류:', error)
      }
      
      // 서버 상태 확인이 실패했지만, localStorage에 성공 신호가 있으면 처리 진행
      // localStorage 신호가 있으면 서버 상태 확인 실패해도 무조건 처리
      if (!serverStatusConfirmed && !hasLocalStorageSignal) {
        console.error('[결제 성공] 서버 상태 확인 실패하고 localStorage에도 성공 신호 없음:', {
          serverStatusConfirmed,
          hasLocalStorageSignal,
          successOid,
          oid
        })
        isProcessing = false
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        showAlertMessage('결제 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.')
        return
      }
      
      // localStorage에 성공 신호가 있으면 서버 상태 확인 실패해도 처리 진행
      if (!serverStatusConfirmed && hasLocalStorageSignal) {
        console.log('[결제 성공] 서버 상태 확인 실패했지만 localStorage에 성공 신호 있음, 처리 진행')
        // DB를 직접 업데이트 시도 (성공 페이지가 업데이트하지 않았을 경우)
        try {
          const updateRes = await fetch('/api/payment/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oid: successOid || oid })
          })
          const updateData = await updateRes.json()
          console.log('[결제 성공] DB 직접 업데이트 시도 완료:', updateData)
        } catch (e) {
          console.error('[결제 성공] DB 직접 업데이트 오류:', e)
        }
        console.log('[결제 성공] localStorage 성공 신호 기반으로 처리 계속 진행')
      }
      
      // sessionStorage에서 결제 정보 가져오기
      const paymentContentId = sessionStorage.getItem('payment_content_id')
      if (!paymentContentId) {
        console.error('[결제 성공] 결제 정보를 찾을 수 없습니다.')
        isProcessing = false
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        return
      }
      
      // sessionStorage에서 사용자 정보 가져오기
      const paymentUserName = sessionStorage.getItem('payment_user_name')
      const paymentUserGender = sessionStorage.getItem('payment_user_gender')
      const paymentUserCalendarType = sessionStorage.getItem('payment_user_calendar_type')
      const paymentUserYear = sessionStorage.getItem('payment_user_year')
      const paymentUserMonth = sessionStorage.getItem('payment_user_month')
      const paymentUserDay = sessionStorage.getItem('payment_user_day')
      const paymentUserBirthHour = sessionStorage.getItem('payment_user_birth_hour')
      const paymentPartnerName = sessionStorage.getItem('payment_partner_name')
      
      if (!paymentUserName || !paymentUserYear || !paymentUserMonth || !paymentUserDay) {
        console.error('[결제 성공] 사용자 정보를 찾을 수 없습니다.')
        isProcessing = false
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        return
      }
      
      // 결제정보 팝업 즉시 닫기 (최대한 빠른 리절트 화면 이동을 위해)
      setShowPaymentPopup(false)
      setSubmitting(false)
      setPaymentProcessingMethod(null)
      
      // content 정보 로드 후 바로 점사 시작
      try {
        const contentData = await getContentById(parseInt(paymentContentId))
        if (contentData) {
          // 결제 정보 저장 (status: 'success'로 명시적으로 저장)
          // 저장이 실패하면 재시도하고, 최종 실패 시 에러를 throw하여 사용자에게 알림
          let paymentSaveSuccess = false
          const maxRetries = 3
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              const saveResponse = await fetch('/api/payment/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  oid,
                  contentId: contentData.id,
                  paymentCode: contentData.payment_code,
                  name: contentData.content_name || '',
                  pay: parseInt(contentData.price || '0'),
                  paymentType: (sessionStorage.getItem('payment_method') as 'card' | 'mobile') || 'card',
                  userName: paymentUserName,
                  phoneNumber: sessionStorage.getItem('payment_phone') || '',
                  gender: (paymentUserGender as 'male' | 'female' | '') || null,
                  status: 'success' // 결제 성공 상태로 명시적으로 저장
                })
              })
              
              if (saveResponse.ok) {
                const saveData = await saveResponse.json()
                if (saveData.success) {
                  console.log('[결제 성공] 결제 정보 저장 성공:', saveData)
                  paymentSaveSuccess = true
                  break
                } else {
                  console.error(`[결제 성공] 결제 정보 저장 실패 (${attempt}/${maxRetries}):`, saveData)
                }
              } else {
                const errorText = await saveResponse.text()
                console.error(`[결제 성공] 결제 정보 저장 HTTP 오류 (${attempt}/${maxRetries}):`, saveResponse.status, errorText)
              }
              
              // 마지막 시도가 아니면 잠시 대기 후 재시도
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
              }
            } catch (error) {
              console.error(`[결제 성공] 결제 정보 저장 오류 (${attempt}/${maxRetries}):`, error)
              // 마지막 시도가 아니면 잠시 대기 후 재시도
              if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
              }
            }
          }
          
          // 모든 재시도 실패 시 최소한의 레코드라도 생성 시도
          if (!paymentSaveSuccess) {
            console.error('[결제 성공] 결제 정보 저장 최종 실패, 최소한의 레코드 생성 시도')
            // 최소한의 정보로라도 레코드 생성 시도 (결제는 이미 완료되었으므로)
            try {
              const minimalSaveResponse = await fetch('/api/payment/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oid })
              })
              if (minimalSaveResponse.ok) {
                const minimalSaveData = await minimalSaveResponse.json()
                if (minimalSaveData.success) {
                  console.log('[결제 성공] 최소한의 레코드 생성 성공:', minimalSaveData)
                } else {
                  console.error('[결제 성공] 최소한의 레코드 생성 실패:', minimalSaveData)
                }
              } else {
                console.error('[결제 성공] 최소한의 레코드 생성 HTTP 오류:', minimalSaveResponse.status)
              }
            } catch (e) {
              console.error('[결제 성공] 최소한의 레코드 생성 오류:', e)
            }
            // 저장 실패해도 점사는 계속 진행 (결제는 이미 완료되었으므로)
          }
          
          // 점사 시작 (state 업데이트 없이 파라미터로만 전달)
          console.log('[결제 성공] 점사 시작 준비 완료, startFortuneTellingWithContent 호출')
          const startTime = Date.now()
          try {
            await startFortuneTellingWithContent(
              startTime, 
              contentData,
              {
                name: paymentUserName,
                gender: paymentUserGender as 'male' | 'female' | '' || '',
                calendarType: (paymentUserCalendarType as 'solar' | 'lunar' | 'lunar-leap') || 'solar',
                year: paymentUserYear,
                month: paymentUserMonth,
                day: paymentUserDay,
                birthHour: paymentUserBirthHour || '',
                partnerName: paymentPartnerName || '',
                partnerGender: (sessionStorage.getItem('payment_partner_gender') as 'male' | 'female' | '') || '',
                partnerCalendarType: (sessionStorage.getItem('payment_partner_calendar_type') as 'solar' | 'lunar' | 'lunar-leap') || 'solar',
                partnerYear: sessionStorage.getItem('payment_partner_year') || '',
                partnerMonth: sessionStorage.getItem('payment_partner_month') || '',
                partnerDay: sessionStorage.getItem('payment_partner_day') || '',
                partnerBirthHour: sessionStorage.getItem('payment_partner_birth_hour') || ''
              },
              true // 결제 성공으로 인한 이동 플래그
            )
            console.log('[결제 성공] startFortuneTellingWithContent 완료')
          } catch (error) {
            console.error('[결제 성공] startFortuneTellingWithContent 오류:', error)
            isProcessing = false
            setSubmitting(false)
            setPaymentProcessingMethod(null)
            setShowPaymentPopup(false)
            // 에러 메시지 표시
            showAlertMessage(error instanceof Error ? error.message : '점사 시작 중 오류가 발생했습니다.')
          }
        } else {
          console.error('[결제 성공] 컨텐츠 정보를 찾을 수 없습니다.')
          showAlertMessage('컨텐츠 정보를 찾을 수 없습니다.')
          isProcessing = false
          setSubmitting(false)
          setPaymentProcessingMethod(null)
          setShowPaymentPopup(false)
        }
      } catch (error) {
        console.error('[결제 성공] 컨텐츠 로드 오류:', error)
        showAlertMessage('컨텐츠 정보를 불러올 수 없습니다.')
        isProcessing = false
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        setShowPaymentPopup(false)
      }
    }
    
    // 전역 함수로 결제 성공 처리기 등록 (opener에서 직접 호출용 - 주 방식)
    // 통화 내용: "본창에 함수 하나 만들어 놓고 오픈창에서 호출하면 된다"
    // "오픈창에서 이 오픈어의 함수를 호출하면 돼요"
    if (typeof window !== 'undefined') {
      (window as any).handlePaymentSuccess = async (oid: string) => {
        console.log('[결제 성공] window.handlePaymentSuccess 호출됨 (opener 직접 호출):', oid)
        await processPaymentSuccess(oid)
      }
      
      // 전역 함수로 결제 오류 처리기 등록 (opener에서 직접 호출용)
      (window as any).handlePaymentError = async (code: string, msg: string) => {
        console.log('[결제 오류] window.handlePaymentError 호출됨 (opener 직접 호출):', { code, msg })
        
        // ✅ 결제 창 닫기 (실패 시)
        try {
          if (paymentWindowRef.current && !paymentWindowRef.current.closed) {
            paymentWindowRef.current.close()
            console.log('[결제 오류] 결제 창 닫기 완료')
          }
        } catch (e) {
          console.warn('[결제 오류] 결제 창 닫기 실패:', e)
        }
        
        isProcessing = false
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        setShowPaymentPopup(false)
        showAlertMessage('결제 시스템에 일시적인 문제가 발생했습니다.\n잠시 후 다시 시도해 주세요.')
      }
    }

    // fallback: postMessage 리스너 (opener 호출 실패 시 대비)
    const handleMessage = async (event: MessageEvent) => {
      // 보안: 같은 origin에서 온 메시지만 처리
      if (event.origin !== window.location.origin) {
        return
      }
      
      // PAYMENT_SUCCESS 타입 메시지만 처리
      if (event.data?.type === 'PAYMENT_SUCCESS' && event.data?.oid) {
        console.log('[결제 성공] postMessage 수신 (fallback):', event.data.oid)
        await processPaymentSuccess(event.data.oid)
      }
    }
    
    // fallback: storage 이벤트 리스너 (opener 호출 실패 시 대비)
    const handleStorage = async (e: StorageEvent) => {
      if (!e.key) return
      if (e.key === 'payment_success_signal' || e.key === 'payment_success_oid') {
        console.log('[결제 성공] storage 이벤트 수신 (fallback)')
        await checkLocalStorage()
      }
    }

    // fallback: BroadcastChannel 리스너 (opener 호출 실패 시 대비)
    let bc: BroadcastChannel | null = null
    const handleBroadcast = async (event: MessageEvent) => {
      const data: any = (event as any).data
      if (data?.type === 'PAYMENT_SUCCESS' && data?.oid) {
        console.log('[결제 성공] BroadcastChannel 수신 (fallback):', data.oid)
        await processPaymentSuccess(data.oid)
      }
    }
    
    // fallback 리스너 등록
    window.addEventListener('message', handleMessage)
    window.addEventListener('storage', handleStorage)
    
    // ✅ 페이지 포커스 시에도 localStorage 체크 (사용자가 다른 탭으로 갔다가 돌아온 경우 대비)
    const handleFocus = async () => {
      if (typeof window !== 'undefined' && !isProcessing) {
        await checkLocalStorage()
      }
    }
    window.addEventListener('focus', handleFocus)
    
    try {
      bc = new BroadcastChannel('payment_success')
      bc.addEventListener('message', handleBroadcast)
    } catch {
      bc = null
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).handlePaymentSuccess
        delete (window as any).handlePaymentError
      }
      window.removeEventListener('message', handleMessage)
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('focus', handleFocus)
      try {
        bc?.removeEventListener('message', handleBroadcast)
        bc?.close()
      } catch {}
    }
  }, [content, name, phoneNumber1, phoneNumber2, phoneNumber3, submitting])

  // 리뷰 로드 함수
  const loadReviews = async (contentId: number) => {
    try {
      // 일반 리뷰
      const reviewsRes = await fetch(`/api/reviews/list`, { 
        method: 'POST',
        body: JSON.stringify({ content_id: contentId, only_best: false }),
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      })
      if (reviewsRes.ok) {
        const reviewsData = await reviewsRes.json()
        console.log('[리뷰 로드] 일반 리뷰:', reviewsData)
        setReviews(reviewsData.reviews || [])
      } else {
        const errorData = await reviewsRes.json().catch(() => ({}))
        console.error('[리뷰 로드 실패] 일반 리뷰:', reviewsRes.status, errorData)
      }
      
      // 베스트 리뷰
      const bestRes = await fetch(`/api/reviews/list`, { 
        method: 'POST',
        body: JSON.stringify({ content_id: contentId, only_best: true }),
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        }
      })
      if (bestRes.ok) {
        const bestData = await bestRes.json()
        console.log('[리뷰 로드] 베스트 리뷰:', bestData)
        setBestReviews(bestData.reviews || [])
      } else {
        const errorData = await bestRes.json().catch(() => ({}))
        console.error('[리뷰 로드 실패] 베스트 리뷰:', bestRes.status, errorData)
      }
    } catch (error) {
      console.error('[리뷰 로드 에러]', error)
    }
  }

  // 알림 표시 함수
  const showAlertMessage = (message: string) => {
    setAlertMessage(message)
    setShowAlert(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // 로딩 중 확인
    if (loading) {
      showAlertMessage('로딩 중입니다. 잠시만 기다려주세요.')
      return
    }
    
    // 처리 중 확인
    if (submitting) {
      showAlertMessage('처리 중입니다. 잠시만 기다려주세요.')
      return
    }
    
    // 서비스 선택 확인
    if (!content) {
      showAlertMessage('서비스를 선택해주세요.')
      return
    }
    
    // 약관 동의 확인
    if (!agreeTerms) {
      showAlertMessage('서비스 이용 약관에 동의해주세요.')
      return
    }
    
    if (!agreePrivacy) {
      showAlertMessage('개인정보 수집 및 이용에 동의해주세요.')
      return
    }
    
    // 결제 팝업 표시
    setShowPaymentPopup(true)
  }

  // 결제 처리 함수
  const handlePaymentSubmit = async (paymentMethod: 'card' | 'mobile') => {
    // 휴대폰 번호와 비밀번호 검증
    if (!phoneNumber1 || !phoneNumber2 || !phoneNumber3) {
      showAlertMessage('휴대폰 번호를 모두 입력해주세요.')
      return
    }
    
    if (!password || password.length < 4) {
      showAlertMessage('비밀번호를 4자리 이상 입력해주세요.')
      return
    }

    // 컨텐츠 정보 확인
    if (!content || !content.id) {
      showAlertMessage('컨텐츠 정보를 불러올 수 없습니다.')
      return
    }

    // payment_code 확인
    if (!content.payment_code) {
      showAlertMessage('결제 코드가 설정되지 않은 컨텐츠입니다. 관리자에게 문의해주세요.')
      return
    }

    setSubmitting(true)
    setPaymentProcessingMethod(paymentMethod)

    try {
      // 1. 주문번호 생성 (가장 먼저 수행)
      const { generateOrderId } = await import('@/lib/payment-utils')
      const oid = generateOrderId()
      
      // 전화번호 조합
      const phoneNumber = `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`

      // 0. DB에 pending 상태로 미리 저장 (서버 폴링을 위해)
      let pendingSaved = false
      try {
        const pendingSaveResponse = await fetch('/api/payment/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            oid,
            contentId: content.id,
            paymentCode: content.payment_code,
            name: content.content_name || '',
            pay: parseInt(content.price || '0'),
            paymentType: paymentMethod,
            userName: name,
            phoneNumber: phoneNumber,
            gender: (gender as 'male' | 'female' | '') || null,
            status: 'pending'
          })
        })
        
        if (pendingSaveResponse.ok) {
          const pendingSaveData = await pendingSaveResponse.json()
          if (pendingSaveData.success) {
            pendingSaved = true
            console.log('[결제 처리] pending 상태 저장 성공:', pendingSaveData)
          } else {
            console.error('[결제 처리] pending 상태 저장 실패:', pendingSaveData)
          }
        } else {
          const errorText = await pendingSaveResponse.text()
          console.error('[결제 처리] pending 상태 저장 HTTP 오류:', pendingSaveResponse.status, errorText)
        }
      } catch (error) {
        console.error('[결제 처리] pending 상태 저장 오류:', error)
      }

      // payments 테이블은 여러 컬럼이 NOT NULL이라 "먼저 pending 레코드 생성"이 필수.
      // pending 생성에 실패하면 결제를 진행해도 success 마킹/레코드 생성이 불가능해질 수 있으므로
      // 여기서 결제를 중단한다.
      if (!pendingSaved) {
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        showAlertMessage('결제 정보를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.')
        return
      }


        // 주문번호 및 사용자 정보를 sessionStorage에 저장 (result 페이지에서 점사 시작 시 사용)
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('payment_oid', oid)
          sessionStorage.setItem('payment_method', paymentMethod)
          sessionStorage.setItem('payment_content_id', String(content.id))
          sessionStorage.setItem('payment_user_name', name)
          sessionStorage.setItem('payment_phone', `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`)
          sessionStorage.setItem('payment_password', password) // 비밀번호도 저장
          // 점사 시작에 필요한 사용자 정보 저장
          sessionStorage.setItem('payment_user_gender', gender)
          sessionStorage.setItem('payment_user_calendar_type', calendarType)
          sessionStorage.setItem('payment_user_year', year)
          sessionStorage.setItem('payment_user_month', month)
          sessionStorage.setItem('payment_user_day', day)
          sessionStorage.setItem('payment_user_birth_hour', birthHour)
          // 이성 정보 (궁합형인 경우)
          if (partnerName) {
            sessionStorage.setItem('payment_partner_name', partnerName)
            sessionStorage.setItem('payment_partner_gender', partnerGender)
            sessionStorage.setItem('payment_partner_calendar_type', partnerCalendarType)
            sessionStorage.setItem('payment_partner_year', partnerYear)
            sessionStorage.setItem('payment_partner_month', partnerMonth)
            sessionStorage.setItem('payment_partner_day', partnerDay)
            sessionStorage.setItem('payment_partner_birth_hour', partnerBirthHour)
          }
        }

      // 결제 요청
      const paymentRequestResponse = await fetch('/api/payment/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentMethod,
          contentId: content.id,
          paymentCode: content.payment_code,
          name: content.content_name || '',
          pay: parseInt(content.price || '0'),
          userName: name,
          phoneNumber: `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`,
          oid
        })
      })

      if (!paymentRequestResponse.ok) {
        const errorData = await paymentRequestResponse.json().catch(() => ({}))
        throw new Error(errorData.error || '결제 요청에 실패했습니다.')
      }

      const paymentRequestData = await paymentRequestResponse.json()
      if (!paymentRequestData.success) {
        throw new Error(paymentRequestData.error || '결제 요청에 실패했습니다.')
      }

      const { paymentUrl, formData, successUrl, failUrl } = paymentRequestData.data

      console.log('[결제 처리] 결제 서버로 요청:', {
        paymentUrl,
        formData,
        paymentMethod,
        oid
      })

      // 카드 결제와 휴대폰 결제 모두 실제 결제 서버로 요청 (form submit)
      // 중요: window.open으로 연 "같은 창"에만 submit 해야 postMessage/close가 안정적으로 동작함
      const form = document.createElement('form')
      form.method = 'POST'
      form.action = paymentUrl
      form.style.display = 'none'

      // 결제사 리다이렉트 URL도 함께 전달 (결제 성공/실패 시 우리 페이지로 돌아오게)
      // 결제사 구현별 파라미터명이 다를 수 있어 호환 키를 모두 보낸다.
      const redirectFields: Record<string, string> = {
        successUrl,
        failUrl,
        success_url: successUrl,
        fail_url: failUrl,
        returnUrl: successUrl,
        return_url: successUrl,
        ret_url: successUrl,
        nextUrl: successUrl,
      }

      const fullFormData: Record<string, string> = {
        ...Object.fromEntries(Object.entries(formData).map(([k, v]) => [k, String(v)])),
        ...redirectFields,
      }

      // fullFormData를 input으로 추가
      Object.entries(fullFormData).forEach(([key, value]) => {
        const input = document.createElement('input')
        input.type = 'hidden'
        input.name = key
        input.value = String(value)
        form.appendChild(input)
        console.log(`[결제 처리] form input 추가: ${key} = ${value}`)
      })

      document.body.appendChild(form)
      console.log('[결제 처리] form 생성 완료, submit 준비')
      
      // 팝업 차단 방지: 사용자 클릭 이벤트 안에서 "이름 있는 창"을 먼저 연다
      // 이후 form.target을 이 창 이름으로 지정하여 같은 창으로 POST submit
      const paymentWindowName = `payment_${oid}`
      const paymentWindow = window.open('about:blank', paymentWindowName, 'width=800,height=600')
      // 결제 창 참조 저장 (닫기용)
      paymentWindowRef.current = paymentWindow
      if (!paymentWindow) {
        // 팝업이 차단된 경우
        alert('팝업이 차단되었습니다. 브라우저 설정에서 팝업을 허용해주세요.')
        setSubmitting(false)
        setPaymentProcessingMethod(null)
        return
      }

      console.log('[결제 처리] 결제 창 열림, form submit 시작')
      
      // form submit (결제 창이 열린 후) - 반드시 위에서 연 결제창으로 submit
      form.target = paymentWindowName
      paymentWindow.focus()
      
      // 약간의 딜레이를 주어 창이 완전히 열린 후 submit
      setTimeout(() => {
        try {
          form.submit()
          console.log('[결제 처리] form submit 완료, paymentUrl:', paymentUrl)
        } catch (error) {
          console.error('[결제 처리] form submit 오류:', error)
          // POST 데이터가 포함되어야 하므로 location.href로 대체 이동은 정확한 fallback이 아님
          // (결제창은 그대로 두고, 사용자에게 재시도를 유도)
          try {
            paymentWindow.focus()
          } catch {}
        }
      }, 100)
      
      // form이 submit된 후 DOM에서 제거
      setTimeout(() => {
        if (document.body.contains(form)) {
          document.body.removeChild(form)
        }
      }, 100)

      // 결제 창이 닫혔는지 확인 (opener 호출 실패 시 대비용)
      // 통화 내용: "오픈창에서 오픈어의 함수를 호출하면 돼요" - 주 방식은 opener 호출
      let checkCount = 0
      const checkWindowClosed = () => {
        const checkInterval = setInterval(async () => {
          try {
            checkCount++
            // 10번째마다 로그 출력 (너무 많은 로그 방지)
            if (checkCount % 10 === 0) {
              console.log(`[결제 처리] 결제 창 상태 확인 (${checkCount}회):`, {
                closed: paymentWindow.closed,
                location: paymentWindow.location?.href || 'cross-origin'
              })
            }
            
            // 서버 상태도 주기적으로 확인 (성공 페이지가 로드되었는지 확인)
            // 결제 서버가 successUrl로 리다이렉트하지 않았을 경우를 대비
            if (checkCount % 2 === 0) { // 2초마다 확인 (1초 간격이므로)
              try {
                const statusRes = await fetch(`/api/payment/status?oid=${oid}`)
                const statusData = await statusRes.json()
                
                // 5초마다 로그 출력 (너무 많은 로그 방지)
                if (checkCount % 5 === 0) {
                  console.log(`[결제 처리] 주기적 서버 상태 확인 (${checkCount}회, ${checkCount * 1}초 경과):`, statusData)
                }
                
                if (statusData.success && statusData.status === 'success') {
                  clearInterval(checkInterval)
                  console.log('[결제 처리] 서버 상태 success 확인 (주기적 체크), 처리 시작')
                  if (typeof window !== 'undefined' && (window as any).handlePaymentSuccess) {
                    await (window as any).handlePaymentSuccess(oid)
                  }
                  return
                }
              } catch (e) {
                if (checkCount % 5 === 0) {
                  console.error('[결제 처리] 서버 상태 확인 오류:', e)
                }
              }
            }
            
            // localStorage도 주기적으로 확인 (성공/실패 페이지가 opener 호출 실패했을 경우)
            if (checkCount % 3 === 0) { // 3초마다 확인
              try {
                // 먼저 오류 신호 확인
                const errorCode = localStorage.getItem('payment_error_code')
                if (errorCode) {
                  clearInterval(checkInterval)
                  const errorMsg = localStorage.getItem('payment_error_msg')
                  console.log(`[결제 처리] localStorage 오류 신호 확인 (${checkCount}회, ${checkCount * 1}초 경과), 처리 시작`)
                  if (typeof window !== 'undefined' && (window as any).handlePaymentError) {
                    await (window as any).handlePaymentError(errorCode, errorMsg || 'Payment failed')
                  }
                  // localStorage 오류 신호 제거
                  localStorage.removeItem('payment_error_code')
                  localStorage.removeItem('payment_error_msg')
                  localStorage.removeItem('payment_error_timestamp')
                  return
                }
                
                const successOid = localStorage.getItem('payment_success_oid')
                // oid가 정확히 일치할 때만 처리
                if (successOid === oid) {
                  clearInterval(checkInterval)
                  console.log(`[결제 처리] localStorage 성공 신호 확인 (${checkCount}회, ${checkCount * 1}초 경과), 처리 시작`)
                  if (typeof window !== 'undefined' && (window as any).handlePaymentSuccess) {
                    await (window as any).handlePaymentSuccess(oid)
                  }
                  return
                }
              } catch (e) {
                // 무시
              }
            }
            
            if (paymentWindow.closed) {
              clearInterval(checkInterval)
              console.log('[결제 처리] 결제 창이 닫힘 감지, 서버 상태 확인')
              
              // 창이 닫혔을 때 서버 상태를 확인 (성공 페이지가 DB를 업데이트했을 수 있음)
              try {
                const statusRes = await fetch(`/api/payment/status?oid=${oid}`)
                const statusData = await statusRes.json()
                
                if (statusData.success && statusData.status === 'success') {
                  console.log('[결제 처리] 창 닫힘 후 서버 상태 success 확인, 처리 시작')
                  if (typeof window !== 'undefined' && (window as any).handlePaymentSuccess) {
                    await (window as any).handlePaymentSuccess(oid)
                  }
                  return
                } else {
                  console.log('[결제 처리] 창 닫힘 후 서버 상태:', statusData)
                }
              } catch (e) {
                console.error('[결제 처리] 서버 상태 확인 오류:', e)
              }
              
              // opener 호출이 실패했을 경우를 대비해 localStorage 확인 (fallback)
              // 먼저 오류 신호 확인
              const errorCode = localStorage.getItem('payment_error_code')
              const errorMsg = localStorage.getItem('payment_error_msg')
              if (errorCode) {
                console.log('[결제 처리] 결제 창 닫힘, localStorage 오류 신호 발견 (fallback):', { errorCode, errorMsg })
                if (typeof window !== 'undefined' && (window as any).handlePaymentError) {
                  await (window as any).handlePaymentError(errorCode, errorMsg || 'Payment failed')
                }
                // localStorage 오류 신호 제거
                localStorage.removeItem('payment_error_code')
                localStorage.removeItem('payment_error_msg')
                localStorage.removeItem('payment_error_timestamp')
                return
              }
              
              const successOid = localStorage.getItem('payment_success_oid')
              if (!successOid) {
                // 사용자가 결제창을 닫았거나 실패/취소로 닫힌 경우: 팝업은 유지하고 버튼만 다시 활성화
                console.log('[결제 처리] 결제 창 닫힘, 성공 신호 없음 - 버튼만 활성화')
                setSubmitting(false)
                setPaymentProcessingMethod(null)
                // 결제 재시도를 위해 결제정보 팝업은 닫지 않음
              } else {
                // localStorage에 성공 신호가 있으면 처리 (opener 호출이 실패했을 경우)
                console.log('[결제 처리] 결제 창 닫힘, localStorage 성공 신호 발견 (fallback):', successOid)
                if (typeof window !== 'undefined' && (window as any).handlePaymentSuccess) {
                  await (window as any).handlePaymentSuccess(successOid)
                }
              }
            }
          } catch (e) {
            // cross-origin 오류는 무시 (결제 서버로 이동했을 수 있음)
          }
        }, 1000) // 1초마다 확인
        
        // ✅ 타임아웃 제거: 결제가 완료되거나 창이 닫히면 clearInterval이 자동 호출되므로 타임아웃 불필요
        // 결제 성공/실패 시 또는 결제 창이 닫힐 때 자동으로 clearInterval이 호출되어 중단됨
      }
      
      checkWindowClosed()
      
      // 결제정보 팝업은 무기한 대기 (결제 창이 성공/실패 URL로 리다이렉트되면 그대로 유지)
      // 성공 시: result 페이지에서 바로 점사 시작
      // 실패 시: 에러 페이지에서 창 닫으면 결제정보 팝업도 닫힘

    } catch (error: any) {
      console.error('[결제 처리] 오류:', error)
      setSubmitting(false)
      setPaymentProcessingMethod(null)
      showAlertMessage(error?.message || '결제 처리 중 오류가 발생했습니다.')
    }
  }

  // 점사 시작 함수 (결제 완료 후 호출)
  const startFortuneTelling = async (startTime: number) => {
    if (!content || !content.id) {
      console.error('[점사 시작] content가 로드되지 않았습니다.')
      return
    }
    await startFortuneTellingWithContent(startTime, content)
  }

  // 점사 시작 함수 (content와 사용자 정보를 파라미터로 받음)
  const startFortuneTellingWithContent = async (
    startTime: number, 
    contentData: any,
    userInfo?: {
      name?: string
      gender?: 'male' | 'female' | ''
      calendarType?: 'solar' | 'lunar' | 'lunar-leap'
      year?: string
      month?: string
      day?: string
      birthHour?: string
      partnerName?: string
      partnerGender?: 'male' | 'female' | ''
      partnerCalendarType?: 'solar' | 'lunar' | 'lunar-leap'
      partnerYear?: string
      partnerMonth?: string
      partnerDay?: string
      partnerBirthHour?: string
    },
    isPaymentSuccess?: boolean // 결제 성공으로 인한 이동 플래그
  ) => {
    try {
      // 사용자 정보: 파라미터가 있으면 사용, 없으면 state 사용
      const userName = userInfo?.name || name
      const userGender = userInfo?.gender !== undefined ? userInfo.gender : gender
      const userCalendarType = userInfo?.calendarType || calendarType
      const userYear = userInfo?.year || year
      const userMonth = userInfo?.month || month
      const userDay = userInfo?.day || day
      const userBirthHour = userInfo?.birthHour || birthHour
      const userPartnerName = userInfo?.partnerName || partnerName
      const userPartnerGender = userInfo?.partnerGender !== undefined ? userInfo.partnerGender : partnerGender
      const userPartnerCalendarType = userInfo?.partnerCalendarType || partnerCalendarType
      const userPartnerYear = userInfo?.partnerYear || partnerYear
      const userPartnerMonth = userInfo?.partnerMonth || partnerMonth
      const userPartnerDay = userInfo?.partnerDay || partnerDay
      const userPartnerBirthHour = userInfo?.partnerBirthHour || partnerBirthHour
      
      // 상품 메뉴 소제목 파싱
      const menuSubtitles = contentData.menu_subtitle ? contentData.menu_subtitle.split('\n').filter((s: string) => s.trim()) : []
      const interpretationTools = contentData.interpretation_tool ? contentData.interpretation_tool.split('\n').filter((s: string) => s.trim()) : []
      const subtitleCharCount = parseInt(contentData.subtitle_char_count) || 500
      const detailMenuCharCount = parseInt(contentData.detail_menu_char_count) || 500

      if (menuSubtitles.length === 0) {
        showAlertMessage('상품 메뉴 소제목이 설정되지 않았습니다.')
        setSubmitting(false)
        setShowLoadingPopup(false)
        // processPaymentSuccess에서 호출된 경우 isProcessing 해제를 위해 에러 throw
        if (isPaymentSuccess) {
          throw new Error('상품 메뉴 소제목이 설정되지 않았습니다.')
        }
        return
      }

      // menu_items에서 소메뉴와 상세메뉴를 모두 평탄화하여 배열 생성
      const menuItems = contentData.menu_items || []
      const menuSubtitlePairs: Array<{ subtitle: string; interpretation_tool: string; char_count: number }> = []
      
      // menuSubtitles 순서대로 처리하면서 상세메뉴도 함께 추가
      menuSubtitles.forEach((subtitle: string, index: number) => {
        const tool = interpretationTools[index] || interpretationTools[0] || ''
        const trimmedSubtitle = subtitle.trim()
        
        // 소메뉴 추가
        menuSubtitlePairs.push({
          subtitle: trimmedSubtitle,
          interpretation_tool: tool,
          char_count: subtitleCharCount
        })
        
        // 해당 소메뉴의 상세메뉴 찾기
        for (const item of menuItems) {
          if (item.subtitles && Array.isArray(item.subtitles)) {
            const sub = item.subtitles.find((s: any) => s.subtitle?.trim() === trimmedSubtitle)
            if (sub && sub.detailMenus && Array.isArray(sub.detailMenus)) {
              // 상세메뉴들을 배열에 직접 추가 (소메뉴 다음에 순서대로)
              sub.detailMenus.forEach((dm: any) => {
                if (dm.detailMenu && dm.detailMenu.trim()) {
                  menuSubtitlePairs.push({
                    subtitle: dm.detailMenu.trim(),
                    interpretation_tool: dm.interpretation_tool || '',
                    char_count: dm.char_count || detailMenuCharCount
                  })
                }
              })
              break // 해당 소메뉴를 찾았으므로 다음 소메뉴로
            }
          }
        }
      })

      // 현재 사용할 모델 확인 (최신 상태 - URL 파라미터 우선, 없으면 Supabase, 그것도 없으면 기본값)
      const urlModelParam = searchParams.get('model')
      let currentModel = urlModelParam
      
      if (!currentModel) {
        try {
          currentModel = await getSelectedModel()
        } catch (error) {
          currentModel = 'gemini-3-flash-preview'
        }
      }

      // 재미나이 API 호출
      const birthDate = `${userYear}-${userMonth.padStart(2, '0')}-${userDay.padStart(2, '0')}`
      const isGonghapType = !!userPartnerName
      const partnerBirthDate = isGonghapType 
        ? `${userPartnerYear}-${userPartnerMonth.padStart(2, '0')}-${userPartnerDay.padStart(2, '0')}`
        : undefined
      
      // 만세력 계산
      let manseRyeokTable = '' // HTML 테이블 (화면 표시용)
      let manseRyeokText = '' // 텍스트 형식 (제미나이 프롬프트용)
      let manseRyeokData: any = null // 구조화 만세력 데이터
      let dayGanInfo = null // 일간 정보 저장
      if (userYear && userMonth && userDay) {
        try {
          const birthYear = parseInt(userYear)
          const birthMonth = parseInt(userMonth)
          const birthDay = parseInt(userDay)
          // 태어난 시를 숫자로 변환 (예: "23-01" -> 23)
          let birthHourNum = 10 // 기본값 10시 (오전 10시)
          if (userBirthHour) {
            // 지지 문자인 경우 시간 매핑
            const hourMap: { [key: string]: number } = {
              '子': 0, '丑': 2, '寅': 4, '卯': 6, '辰': 8, '巳': 10,
              '午': 12, '未': 14, '申': 16, '酉': 18, '戌': 20, '亥': 22
            }
            if (hourMap[userBirthHour] !== undefined) {
              birthHourNum = hourMap[userBirthHour]
            } else {
              const hourMatch = userBirthHour.match(/(\d+)/)
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
            if (userCalendarType === 'solar') {
              // 양력인 경우 음력으로 변환
              convertedDate = convertSolarToLunarAccurate(birthYear, birthMonth, birthDay)
            } else if (userCalendarType === 'lunar' || userCalendarType === 'lunar-leap') {
              // 음력 또는 음력(윤달)인 경우 양력으로 변환
              convertedDate = convertLunarToSolarAccurate(birthYear, birthMonth, birthDay, userCalendarType === 'lunar-leap')
            }
          } catch (error) {
            convertedDate = null
          }
          
          const captionInfo: ManseRyeokCaptionInfo = {
            name: userName || '',
            year: birthYear,
            month: birthMonth,
            day: birthDay,
            hour: userBirthHour || null,
            calendarType: userCalendarType,
            convertedDate: convertedDate
          }
          
          manseRyeokTable = generateManseRyeokTable(manseRyeokData, userName, captionInfo) // HTML 테이블 (화면 표시용)
          manseRyeokText = generateManseRyeokText(manseRyeokData) // 텍스트 형식 (제미나이 프롬프트용)
        } catch (error) {
        }
      }
      
      // 만세력 생성 검증
      const manseRyeokJsonString = manseRyeokData ? JSON.stringify(manseRyeokData, null, 2) : ''
      if (!manseRyeokText || !manseRyeokText.trim() || !manseRyeokData) {
        showAlertMessage('만세력 데이터 생성에 실패했습니다. 생년월일/태어난 시를 다시 확인해주세요.')
        setSubmitting(false)
        setShowLoadingPopup(false)
        // processPaymentSuccess에서 호출된 경우 isProcessing 해제를 위해 에러 throw
        if (isPaymentSuccess) {
          throw new Error('만세력 데이터 생성에 실패했습니다.')
        }
        return
      }

      const requestData = {
        role_prompt: contentData.role_prompt || '',
        restrictions: contentData.restrictions || '',
        menu_subtitles: menuSubtitlePairs,
        menu_items: contentData.menu_items || [],
        user_info: {
          name: userName,
          gender: userGender === 'male' ? '남자' : '여자',
          birth_date: birthDate,
          birth_hour: userBirthHour || undefined
        },
        partner_info: isGonghapType ? {
          name: userPartnerName,
          gender: userPartnerGender === 'male' ? '남자' : '여자',
          birth_date: partnerBirthDate || '',
          birth_hour: userPartnerBirthHour || undefined
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
      } catch (error) {
        fortuneViewMode = 'batch'
      }

      // 병렬/직렬 점사 모드 확인
      let useSequentialFortune = true // 기본값: 직렬점사
      try {
        useSequentialFortune = await getUseSequentialFortune()
      } catch (error) {
        useSequentialFortune = true
      }

      // realtime 모드일 경우 즉시 result 페이지로 리다이렉트
      // 결제 성공으로 인한 이동인 경우에도 동일하게 처리
      if (fortuneViewMode === 'realtime' || isPaymentSuccess) {
        
        // 병렬점사 모드일 경우 대메뉴별로 분할된 데이터 준비
        let finalRequestData: any = requestData
        let menuGroups: Array<{
          menuIndex: number
          menuItem: any
          subtitles: Array<{ subtitle: string; interpretation_tool: string; char_count: number }>
        }> = []
        if (!useSequentialFortune) {
          // 대메뉴 단위로 분할
          const menuItems = contentData.menu_items || []
          menuGroups = []
          
          // 각 대메뉴별로 소제목 그룹화
          menuItems.forEach((menuItem: any, menuIndex: number) => {
            const menuSubtitlesForMenu: Array<{ subtitle: string; interpretation_tool: string; char_count: number }> = []
            
            if (menuItem.subtitles && Array.isArray(menuItem.subtitles)) {
              menuItem.subtitles.forEach((sub: any) => {
                const subtitleText = sub.subtitle?.trim()
                if (subtitleText) {
                  const subtitlePair = menuSubtitlePairs.find(p => p.subtitle.trim() === subtitleText)
                  if (subtitlePair) {
                    menuSubtitlesForMenu.push(subtitlePair)
                    
                    if (sub.detailMenus && Array.isArray(sub.detailMenus)) {
                      sub.detailMenus.forEach((dm: any) => {
                        if (dm.detailMenu && dm.detailMenu.trim()) {
                          const detailMenuPair = menuSubtitlePairs.find(p => p.subtitle.trim() === dm.detailMenu.trim())
                          if (detailMenuPair) {
                            menuSubtitlesForMenu.push(detailMenuPair)
                          }
                        }
                      })
                    }
                  }
                }
              })
            }
            
            if (menuSubtitlesForMenu.length > 0) {
              menuGroups.push({
                menuIndex,
                menuItem,
                subtitles: menuSubtitlesForMenu
              })
            }
          })
          
          // 첫 번째 대메뉴만 전달 (result 페이지에서 순차 처리)
          if (menuGroups.length > 0) {
            const firstGroup = menuGroups[0]
            finalRequestData = {
              ...requestData,
              menu_subtitles: firstGroup.subtitles,
              menu_items: [firstGroup.menuItem],
              isParallelMode: true,
              currentMenuIndex: 0,
              totalMenus: menuGroups.length,
              allMenuGroups: menuGroups // 전체 그룹 정보도 전달
            } as any
          }
        }
        
        // requestKey 생성 및 Supabase에 저장
        const requestKey = `request_${Date.now()}`
        const payload = {
          requestData: finalRequestData,
          content: contentData,
          startTime,
          model: currentModel,
          userName: userName,
          useSequentialFortune, // 병렬/직렬 모드 정보도 전달
          allMenuGroups: !useSequentialFortune ? (finalRequestData.allMenuGroups || menuGroups || []) : undefined // 병렬점사 모드일 때만 전달
        }
        
        // result 페이지로 즉시 리다이렉트 (realtime 모드)
        // 저장 작업 완료를 기다리지 않고 즉시 이동하여 지연 최소화
        // sessionStorage에 데이터 저장 (URL 파라미터 대신)
        try {
          if (typeof window !== 'undefined') {
            // ✅ 변경: 초안 생성 제거 - 점사 완료 후 저장 시점에 saved_id 생성
            // 초안을 미리 생성하면 빈 HTML로 저장되어 이후 업데이트가 제대로 안 될 수 있음
            sessionStorage.setItem('result_requestKey', requestKey)
            sessionStorage.setItem('result_stream', 'true')
          }
        } catch (e) {
          console.error('[결제 처리] sessionStorage 저장 실패:', e)
          // sessionStorage 실패해도 페이지 이동은 진행
        }
        
        // Supabase에 임시 요청 데이터 저장 (필수 - 리절트 페이지에서 필요)
        const saveTempRequestTask = fetch('/api/temp-request/save', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requestKey,
            payload
          })
        }).then(async (saveResponse) => {
          if (!saveResponse.ok) {
            const text = await saveResponse.text()
            let errorData: any = {}
            if (text) {
              try {
                errorData = JSON.parse(text)
              } catch (e) {
                errorData = { error: text || '임시 요청 데이터 저장 실패' }
              }
            }
            throw new Error(errorData.error || '임시 요청 데이터 저장 실패')
          }
          const text = await saveResponse.text()
          if (text) {
            try {
              return JSON.parse(text)
            } catch (e) {
              console.error('응답 파싱 실패:', e)
            }
          }
        }).catch((e: any) => {
          console.error('[결제 처리] 임시 요청 데이터 저장 실패:', e)
          // 저장 실패해도 페이지 이동은 진행
        })

        // 비동기 작업들은 Promise.allSettled로 병렬 처리하고, 실패해도 페이지 이동은 진행
        const asyncTasks = [saveTempRequestTask]
        
        // 휴대폰 번호와 비밀번호를 DB에 저장 (savedId 없이)
        // 결제 성공으로 인한 이동인 경우 sessionStorage에서 가져오기
        if (typeof window !== 'undefined') {
          const paymentPhone = sessionStorage.getItem('payment_phone') || ''
          const paymentPassword = sessionStorage.getItem('payment_password') || ''
          const fullPhoneNumber = paymentPhone || `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`
          const userPassword = paymentPassword || password
          
          console.log('[결제 처리] user_credentials 저장 시도 (savedId 없음):', { requestKey, phone: fullPhoneNumber })
          asyncTasks.push(
            fetch('/api/user-credentials/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requestKey: requestKey,
                // savedId는 점사 완료 후 저장 시점에 생성됨
                phone: fullPhoneNumber,
                password: userPassword
              })
            }).then(async (response) => {
              if (response.ok) {
                const text = await response.text()
                if (text) {
                  try {
                    const result = JSON.parse(text)
                    console.log('[결제 처리] user_credentials 저장 성공:', result)
                    return result
                  } catch (e) {
                    console.error('[결제 처리] 인증 정보 응답 파싱 실패:', e)
                  }
                }
              } else {
                const errorText = await response.text()
                throw new Error(errorText || 'user_credentials 저장 실패')
              }
            }).catch((e) => {
              // 저장 실패해도 페이지 이동은 진행
              console.error('[결제 처리] 인증 정보 저장 실패:', e)
            })
          )
        }
        
        // 결제 성공으로 인한 이동인 경우, temp-request 저장만 완료될 때까지 기다린 후 페이지 이동
        if (isPaymentSuccess) {
          console.log('[결제 처리] 결제 성공으로 인한 이동, temp-request 저장 완료 후 리절트 페이지로 이동')
          
          // temp-request 저장은 필수이므로 완료될 때까지 대기 (최대 3초)
          Promise.race([
            saveTempRequestTask,
            new Promise((resolve) => setTimeout(resolve, 3000)) // 최대 3초 대기
          ]).then(() => {
            console.log('[결제 처리] temp-request 저장 완료 (결제 성공)')
          }).catch((e) => {
            console.error('[결제 처리] temp-request 저장 오류 (결제 성공):', e)
          })
          
          // 나머지 비동기 작업들은 백그라운드에서 실행
          Promise.allSettled(asyncTasks.slice(1)).then(() => {
            console.log('[결제 처리] 백그라운드 비동기 작업 완료 (결제 성공)')
          }).catch((e) => {
            console.error('[결제 처리] 백그라운드 비동기 작업 오류 (결제 성공):', e)
          })
          
          // temp-request 저장 완료를 기다린 후 페이지 이동 (최대 3초)
          await Promise.race([
            saveTempRequestTask,
            new Promise((resolve) => setTimeout(resolve, 3000))
          ])
          
          setSubmitting(false)
          setShowPaymentPopup(false) // 팝업 닫기
          setPaymentProcessingMethod(null)
          router.push('/result')
          return
        }
        
        // realtime 모드 (결제 성공이 아닌 경우): 비동기 작업 완료를 기다림
        try {
          await Promise.race([
            Promise.allSettled(asyncTasks),
            new Promise((resolve) => setTimeout(resolve, 3000))
          ])
        } catch (e) {
          console.error('[결제 처리] 비동기 작업 오류:', e)
          // 오류가 발생해도 페이지 이동은 진행
        }
        
        // 페이지 이동은 항상 실행 (비동기 작업 성공/실패와 무관)
        // 결제 완료 후 최대한 빠르게 리절트 화면으로 이동
        setSubmitting(false)
        // 결제정보 팝업 닫기 (최대한 빠른 이동을 위해)
        setShowPaymentPopup(false)
        setPaymentProcessingMethod(null)
        router.push('/result')
        return
      }

      // batch 모드: 병렬/직렬 점사 모드에 따라 분기
      // 로딩 팝업 표시
      setShowLoadingPopup(true)
      setStreamingProgress(0)
      setCurrentSubtitle('내담자님의 사주명식을 자세히 분석중이에요')
      
      // 소제목 수 계산
      const totalSubtitles = menuSubtitlePairs.length
      
      // 병렬점사 모드 (useSequentialFortune === false)
      if (!useSequentialFortune) {
        // 대메뉴 단위로 분할
        const menuItems = contentData.menu_items || []
        const menuGroups: Array<{
          menuIndex: number
          menuItem: any
          subtitles: Array<{ subtitle: string; interpretation_tool: string; char_count: number }>
        }> = []
        
        // 각 대메뉴별로 소제목 그룹화
        menuItems.forEach((menuItem: any, menuIndex: number) => {
          const menuSubtitlesForMenu: Array<{ subtitle: string; interpretation_tool: string; char_count: number }> = []
          
          if (menuItem.subtitles && Array.isArray(menuItem.subtitles)) {
            menuItem.subtitles.forEach((sub: any) => {
              const subtitleText = sub.subtitle?.trim()
              if (subtitleText) {
                // 소제목 찾기
                const subtitlePair = menuSubtitlePairs.find(p => p.subtitle.trim() === subtitleText)
                if (subtitlePair) {
                  menuSubtitlesForMenu.push(subtitlePair)
                  
                  // 상세메뉴도 추가
                  if (sub.detailMenus && Array.isArray(sub.detailMenus)) {
                    sub.detailMenus.forEach((dm: any) => {
                      if (dm.detailMenu && dm.detailMenu.trim()) {
                        const detailMenuPair = menuSubtitlePairs.find(p => p.subtitle.trim() === dm.detailMenu.trim())
                        if (detailMenuPair) {
                          menuSubtitlesForMenu.push(detailMenuPair)
                        }
                      }
                    })
                  }
                }
              }
            })
          }
          
          if (menuSubtitlesForMenu.length > 0) {
            menuGroups.push({
              menuIndex,
              menuItem,
              subtitles: menuSubtitlesForMenu
            })
          }
        })
        
        
        if (menuGroups.length === 0) {
          showAlertMessage('대메뉴 정보를 찾을 수 없습니다.')
          setSubmitting(false)
          setShowLoadingPopup(false)
          return
        }
        
        // 병렬점사: 첫 번째 대메뉴부터 순차적으로 처리
        let accumulatedHtml = ''
        
        // 가짜 로딩바 (스트리밍 도착 전까지 계속 증가)
        let fakeProgressInterval: NodeJS.Timeout | null = null
        let fakeProgressStartTime = Date.now()
        let isStreamingStarted = false
        let streamingStartProgress = 0
        
        // 가짜 로딩바 시작
        fakeProgressInterval = setInterval(() => {
          if (isStreamingStarted) {
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            return
          }
          
          const elapsed = Date.now() - fakeProgressStartTime
          let fakeProgress = 0
          if (elapsed <= 30000) {
            fakeProgress = (elapsed / 30000) * 30
          } else {
            const additionalTime = elapsed - 30000
            const additionalProgress = Math.min(65, (additionalTime / 120000) * 65)
            fakeProgress = 30 + additionalProgress
          }
          
          fakeProgress = Math.min(95, fakeProgress)
          setStreamingProgress(fakeProgress)
          streamingStartProgress = fakeProgress
        }, 100)
        
        // 대메뉴별 점사 함수 (순차적으로 처리)
        const processMenuGroup = async (groupIndex: number, previousContext: string = ''): Promise<string> => {
          const group = menuGroups[groupIndex]
          if (!group) return previousContext
          
          const menuRequestData = {
            ...requestData,
            menu_subtitles: group.subtitles,
            menu_items: [group.menuItem], // 현재 대메뉴만 전달
            previousContext: previousContext || undefined, // 이전 대메뉴의 컨텍스트
            isParallelMode: true,
            currentMenuIndex: groupIndex,
            totalMenus: menuGroups.length
          }
          
          
          let menuHtml = ''
          let menuAccumulated = ''
          
          try {
            await callJeminaiAPIStream(menuRequestData, async (data) => {
              if (data.type === 'start') {
                menuAccumulated = ''
                if (groupIndex === 0) {
                  isStreamingStarted = true
                  if (fakeProgressInterval) {
                    clearInterval(fakeProgressInterval)
                    fakeProgressInterval = null
                  }
                  setStreamingProgress(Math.max(streamingStartProgress, 5))
                }
              } else if (data.type === 'chunk') {
                menuAccumulated += data.text || ''
                
                // HTML 정리
                menuAccumulated = menuAccumulated
                  .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                  .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                  .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                  .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                  .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                  .replace(/\*\*/g, '')
                
                // 만세력 테이블 삽입 (첫 번째 대메뉴만)
                if (groupIndex === 0 && manseRyeokTable && !menuAccumulated.includes('manse-ryeok-table')) {
                  const firstMenuSectionMatch = menuAccumulated.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
                  if (firstMenuSectionMatch) {
                    const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)
                    if (thumbnailMatch) {
                      menuAccumulated = menuAccumulated.replace(
                        /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                        `$1\n${manseRyeokTable}`
                      )
                    } else {
                      const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                      if (menuTitleMatch) {
                        menuAccumulated = menuAccumulated.replace(
                          /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                          `$1\n${manseRyeokTable}`
                        )
                      } else {
                        menuAccumulated = menuAccumulated.replace(
                          /(<div class="menu-section">)\s*/,
                          `$1\n${manseRyeokTable}`
                        )
                      }
                    }
                  }
                }
                
                // 진행도 업데이트
                const baseProgress = streamingStartProgress || 30
                const remainingProgress = 95 - baseProgress
                const menuProgress = baseProgress + ((groupIndex + 0.5) / menuGroups.length) * remainingProgress
                setStreamingProgress(Math.min(95, menuProgress))
                
                // 현재 소제목 표시
                const subtitleMatch = menuAccumulated.match(/<h3[^>]*class="subtitle-title"[^>]*>([^<]+)<\/h3>/g)
                if (subtitleMatch && subtitleMatch.length > 0) {
                  const lastMatch = subtitleMatch[subtitleMatch.length - 1]
                  const subtitleText = lastMatch.replace(/<[^>]+>/g, '').trim()
                  const cleanSubtitle = subtitleText.replace(/^\d+-\d+[\.\s]\s*/, '').trim()
                  if (cleanSubtitle) {
                    setCurrentSubtitle(cleanSubtitle)
                  }
                }
              } else if (data.type === 'done') {
                menuHtml = data.html || menuAccumulated
                
                // HTML 정리
                menuHtml = menuHtml
                  .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                  .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                  .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                  .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                  .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                  .replace(/\*\*/g, '')
                
                // 만세력 테이블 삽입 (첫 번째 대메뉴만)
                if (groupIndex === 0 && manseRyeokTable && !menuHtml.includes('manse-ryeok-table')) {
                  const firstMenuSectionMatch = menuHtml.match(/<div class="menu-section">([\s\S]*?)(<div class="subtitle-section">|<\/div>\s*<\/div>)/)
                  if (firstMenuSectionMatch) {
                    const thumbnailMatch = firstMenuSectionMatch[0].match(/<img[^>]*class="menu-thumbnail"[^>]*\/>/)
                    if (thumbnailMatch) {
                      menuHtml = menuHtml.replace(
                        /(<img[^>]*class="menu-thumbnail"[^>]*\/>)\s*/,
                        `$1\n${manseRyeokTable}`
                      )
                    } else {
                      const menuTitleMatch = firstMenuSectionMatch[0].match(/<h2 class="menu-title">[^<]*<\/h2>/)
                      if (menuTitleMatch) {
                        menuHtml = menuHtml.replace(
                          /(<h2 class="menu-title">[^<]*<\/h2>)\s*/,
                          `$1\n${manseRyeokTable}`
                        )
                      } else {
                        menuHtml = menuHtml.replace(
                          /(<div class="menu-section">)\s*/,
                          `$1\n${manseRyeokTable}`
                        )
                      }
                    }
                  }
                }
                
                // 진행도 업데이트
                const baseProgress = streamingStartProgress || 30
                const remainingProgress = 95 - baseProgress
                const menuProgress = baseProgress + ((groupIndex + 1) / menuGroups.length) * remainingProgress
                setStreamingProgress(Math.min(95, menuProgress))
              } else if (data.type === 'error') {
                throw new Error(data.error || '점사 처리 중 오류가 발생했습니다.')
              }
            })
          } catch (error) {
            throw error
          }
          
          return menuHtml
        }
        
        // 모든 대메뉴를 순차적으로 처리
        try {
          let previousContext = ''
          for (let i = 0; i < menuGroups.length; i++) {
            const menuHtml = await processMenuGroup(i, previousContext)
            accumulatedHtml += menuHtml
            
            // 다음 대메뉴를 위한 컨텍스트 준비 (이전 대메뉴의 텍스트)
            previousContext = menuHtml
              .replace(/<[^>]+>/g, ' ') // HTML 태그 제거
              .replace(/\s+/g, ' ') // 공백 정리
              .trim()
            
            // 마지막 대메뉴가 아니면 진행도만 업데이트 (다음 대메뉴 자동 시작)
            if (i < menuGroups.length - 1) {
              const baseProgress = streamingStartProgress || 30
              const remainingProgress = 95 - baseProgress
              const menuProgress = baseProgress + ((i + 1) / menuGroups.length) * remainingProgress
              setStreamingProgress(Math.min(95, menuProgress))
            }
          }
          
          // 모든 대메뉴 완료
          setStreamingProgress(100)
          setCurrentSubtitle('완료!')
          
          // 최종 HTML 정리
          let finalHtml = accumulatedHtml
          
          // 모든 이미지에 onerror 핸들러 추가
          finalHtml = addImageErrorHandlers(finalHtml)
          
          // 결과 데이터 준비
          const resultData = {
            content,
            html: finalHtml,
            startTime: startTime,
            model: currentModel,
            userName: name
          }
          
          // 결과 저장
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
                  content: resultData,
                  model: currentModel,
                  processing_time: `${((Date.now() - startTime) / 1000).toFixed(1)}초`,
                  user_name: name
                }),
              })
              
              if (saveResponse.ok) {
                const text = await saveResponse.text()
                if (text) {
                  try {
                    const saved = JSON.parse(text)
                    if (saved.data?.id) {
                      setSavedResults(prev => [saved.data, ...prev])
                      
                      // 휴대폰 번호와 비밀번호를 DB에 저장 (savedId 포함)
                      const fullPhoneNumber = `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`
                      try {
                        const credResponse = await fetch('/api/user-credentials/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            savedId: saved.data.id,
                            phone: fullPhoneNumber,
                            password: password
                          })
                        })
                        if (!credResponse.ok) {
                          const errorText = await credResponse.text()
                          console.error('인증 정보 저장 실패:', errorText)
                        } else {
                          console.log('인증 정보 저장 성공:', saved.data.id)
                        }
                      } catch (e) {
                        console.error('인증 정보 저장 실패:', e)
                      }
                    } else {
                      console.error('결과 저장 응답에 id가 없습니다:', saved)
                    }
                  } catch (e) {
                    console.error('결과 저장 응답 파싱 실패:', e)
                  }
                } else {
                  console.error('결과 저장 응답이 비어있습니다')
                }
              } else {
                const errorText = await saveResponse.text()
                console.error('결과 저장 실패:', errorText)
              }
            } catch (error) {
            }
          })()
          
          // 로딩 팝업 닫기
          setShowLoadingPopup(false)
          setSubmitting(false)
          
          // result 페이지로 이동
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('result_data', JSON.stringify(resultData))
          }
          router.push('/result')
        } catch (error: any) {
          showAlertMessage('점사 처리 중 오류가 발생했습니다: ' + (error.message || '알 수 없는 오류'))
          setSubmitting(false)
          setShowLoadingPopup(false)
        }
        
        return
      }
      
      // 직렬점사 모드 (useSequentialFortune === true): 기존 로직 유지
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
      
      try {
        await callJeminaiAPIStream(requestData, async (data) => {
          
          if (data.type === 'start') {
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
            
            // 모든 이미지에 onerror 핸들러 추가
            finalHtml = addImageErrorHandlers(finalHtml)
            
            // 결과 데이터 준비
            const resultData = {
              content, // content 객체 전체 저장 (tts_speaker 포함)
              html: finalHtml,
              startTime: startTime,
              model: currentModel,
              userName: name // 사용자 이름 저장
            }
            
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
                  const text = await saveResponse.text()
                  let errorData: any = {}
                  if (text) {
                    try {
                      errorData = JSON.parse(text)
                    } catch (e) {
                      errorData = { error: text || '결과 저장 실패' }
                    }
                  }
                  throw new Error(errorData.error || '결과 저장 실패')
                }

                const text = await saveResponse.text()
                let saveResult: any = {}
                if (text) {
                  try {
                    saveResult = JSON.parse(text)
                  } catch (e) {
                    console.error('결과 저장 응답 파싱 실패:', e)
                    throw new Error('결과 저장 응답 파싱 실패')
                  }
                }
                const savedId = saveResult.data?.id
                
                if (!savedId) {
                  console.error('결과 저장 응답에 id가 없습니다:', saveResult)
                  throw new Error('결과 저장 응답에 id가 없습니다')
                }
                
                // 결과 페이지로 이동 (저장된 ID 사용)
                // sessionStorage에 데이터 저장 (URL 파라미터 대신)
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('result_savedId', String(savedId))
                  // 휴대폰 번호와 비밀번호를 DB에 저장
                  const fullPhoneNumber = `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`
                  try {
                    const response = await fetch('/api/user-credentials/save', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        savedId: savedId,
                        phone: fullPhoneNumber,
                        password: password
                      })
                    })
                    if (response.ok) {
                      const text = await response.text()
                      if (text) {
                        try {
                          const result = JSON.parse(text)
                          console.log('인증 정보 저장 성공:', savedId)
                        } catch (e) {
                          console.error('인증 정보 응답 파싱 실패:', e)
                        }
                      }
                    } else {
                      const errorText = await response.text()
                      console.error('인증 정보 저장 실패:', errorText)
                    }
                  } catch (e) {
                    console.error('인증 정보 저장 실패:', e)
                  }
                }
                setShowLoadingPopup(false)
                setSubmitting(false)
                router.push('/result')
              } catch (e: any) {
                showAlertMessage('결과 저장에 실패했습니다. 다시 시도해주세요.')
                setShowLoadingPopup(false)
                setSubmitting(false)
              }
            })()
          } else if (data.type === 'error') {
            
            // 가짜 로딩바 중지
            if (fakeProgressInterval) {
              clearInterval(fakeProgressInterval)
              fakeProgressInterval = null
            }
            
            setShowLoadingPopup(false)
            setSubmitting(false)
            showAlertMessage(data.error || '스트리밍 중 오류가 발생했습니다.')
          }
        })
        
      } catch (streamError: any) {
        
        // 가짜 로딩바 중지
        if (fakeProgressInterval) {
          clearInterval(fakeProgressInterval)
          fakeProgressInterval = null
        }
        
        setShowLoadingPopup(false)
        setSubmitting(false)
        showAlertMessage(streamError?.message || '결제 처리 중 오류가 발생했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
      }
    } catch (error: any) {
      const errorMessage = error?.message || '결제 처리 중 오류가 발생했습니다.'
      showAlertMessage(`${errorMessage}\n\n개발자 도구 콘솔을 확인해주세요.`)
      setSubmitting(false)
      setShowLoadingPopup(false)
      // processPaymentSuccess에서 호출된 경우 isProcessing 해제를 위해 에러를 다시 throw
      // (processPaymentSuccess의 catch 블록에서 처리)
      if (isPaymentSuccess) {
        throw error // 에러를 다시 throw하여 processPaymentSuccess에서 처리하도록
      }
    }
  }

  // 년도, 월, 일 옵션 생성
  // 현재 년도 기준 19세 미만 년도 제외 (현재 년도 - 19년 이하만 표시)
  const currentYear = new Date().getFullYear()
  const minAgeYear = currentYear - 19 // 19세 이상만 가능
  const years = Array.from({ length: 76 }, (_, i) => 2025 - i).filter(y => y <= minAgeYear)
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      {/* 헤더 */}
      <header className="w-full bg-white border-b-2 border-pink-500 relative z-[1]">
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

      {/* ✅ 전체 화면 스피너 대신, 상단에 작은 로딩 안내만 표시 (체감 속도 개선) */}
      {loading && (
        <div className="w-full bg-white/80 backdrop-blur border-b border-pink-100">
          <div className="container mx-auto px-4 py-2 flex items-center justify-center gap-2 text-sm text-gray-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-pink-500"></div>
            <span>로딩 중...</span>
          </div>
        </div>
      )}

      {/* 슬라이드 메뉴바 */}
      <SlideMenuBar isOpen={showSlideMenu} onClose={() => setShowSlideMenu(false)} />

      {/* 이용약관 팝업 */}
      <TermsPopup isOpen={showTermsPopup} onClose={() => setShowTermsPopup(false)} />
      
      {/* 개인정보 수집 및 이용 팝업 */}
      <PrivacyPopup isOpen={showPrivacyPopup} onClose={() => setShowPrivacyPopup(false)} />
      
      {/* 나의 이용내역 팝업 */}
      <MyHistoryPopup isOpen={showMyHistoryPopup} onClose={() => setShowMyHistoryPopup(false)} contentId={content?.id} />

      {/* 알림 팝업 */}
      <AlertPopup 
        isOpen={showAlert} 
        message={alertMessage}
        onClose={() => setShowAlert(false)} 
      />

      {/* 결제 팝업 - 최상위 레벨로 이동하여 헤더 포함 전체 화면 덮기 */}
      {showPaymentPopup && (
        <div 
          className="fixed top-0 left-0 right-0 bottom-0 z-[9999] flex items-center justify-center px-4"
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }}
          onClick={(e) => {
            // 오버레이 클릭 시 팝업 닫기 (팝업 내용 클릭 시에는 닫지 않음)
            if (e.target === e.currentTarget) {
              setShowPaymentPopup(false)
              setPaymentProcessingMethod(null)
              setPhoneNumber1('010')
              setPhoneNumber2('')
              setPhoneNumber3('')
              setPassword('')
            }
          }}
        >
          {/* 전체 화면 오버레이 - 헤더 포함 */}
          <div 
            className="absolute top-0 left-0 right-0 bottom-0 bg-black/60"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
          ></div>
          {/* 팝업 컨테이너 */}
          <div 
            className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="relative bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4">
              <h2 className="text-xl font-bold text-white">결제 정보</h2>
              <button
                type="button"
                onClick={() => {
                  setShowPaymentPopup(false)
                  setPaymentProcessingMethod(null)
                  setPhoneNumber1('010')
                  setPhoneNumber2('')
                  setPhoneNumber3('')
                  setPassword('')
                }}
                className="absolute top-4 right-4 text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* 결제 정보 섹션 */}
              <div className="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-200 rounded-xl p-4 mb-6">
                <div className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="text-sm font-medium text-gray-700 flex-shrink-0 pt-0.5">서비스명</span>
                    <span className="text-base font-bold text-pink-600 flex-1 text-right break-words">{content?.content_name || title || '서비스'}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-pink-300">
                    <span className="text-sm font-medium text-gray-700">이용금액</span>
                    <span className="text-xl font-bold text-pink-500 text-right">
                      {content?.price ? `${parseInt(content.price).toLocaleString()}원` : '금액 정보 없음'}
                    </span>
                  </div>
                </div>
              </div>


              {/* 휴대폰 번호 입력 */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">휴대폰 번호</label>
                <input
                  type="text"
                  value={
                    !phoneNumber2 
                      ? `${phoneNumber1}-` 
                      : `${phoneNumber1}-${phoneNumber2}${phoneNumber3 ? '-' + phoneNumber3 : ''}`
                  }
                  onChange={(e) => {
                    let value = e.target.value.replace(/[^0-9]/g, '')
                    
                    // 010 접두사가 없으면 강제로 추가 (삭제 방지)
                    if (!value.startsWith('010')) {
                      // 010이 아닌 다른 숫자로 시작하면 010을 앞에 붙임
                      if (value.length < 3) {
                        value = '010'
                      } else {
                        value = '010' + value
                      }
                    }

                    // 길이 제한 (010 + 8자리 = 11자리)
                    if (value.length > 11) {
                      value = value.slice(0, 11)
                    }

                    setPhoneNumber1('010')
                    if (value.length <= 3) {
                      setPhoneNumber2('')
                      setPhoneNumber3('')
                    } else if (value.length <= 7) {
                      setPhoneNumber2(value.slice(3))
                      setPhoneNumber3('')
                    } else {
                      setPhoneNumber2(value.slice(3, 7))
                      setPhoneNumber3(value.slice(7))
                    }
                  }}
                  className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all"
                  placeholder="010-0000-0000"
                  maxLength={13}
                />
              </div>

              {/* 비밀번호 입력 */}
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-2">비밀번호</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all"
                  placeholder="비밀번호를 입력하세요 (4자리 이상)"
                />
              </div>

              {/* 안내 메시지 */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6">
                <p className="text-xs text-red-600 flex items-start">
                  <span className="font-bold mr-1">*</span>
                  <span>다시보기 시, 입력한 휴대폰/비밀번호가 필요합니다.</span>
                </p>
              </div>

              {/* 결제 버튼 */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handlePaymentSubmit('card')}
                  disabled={submitting || paymentProcessingMethod !== null}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {paymentProcessingMethod === 'card' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>처리 중...</span>
                    </>
                  ) : (
                    '카드결제'
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentSubmit('mobile')}
                  disabled={submitting || paymentProcessingMethod !== null}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-4 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {paymentProcessingMethod === 'mobile' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>처리 중...</span>
                    </>
                  ) : (
                    '휴대폰 결제'
                  )}
                </button>
              </div>

              {/* 임시 결과 화면 이동 버튼 (개발용) */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={async () => {
                    if (!content || !content.id) {
                      showAlertMessage('컨텐츠 정보를 불러올 수 없습니다.')
                      return
                    }
                    
                    // 결제 완료와 동일한 방식으로 startFortuneTellingWithContent 호출
                    const startTime = Date.now()
                    try {
                      await startFortuneTellingWithContent(
                        startTime,
                        content,
                        {
                          name: name,
                          gender: gender,
                          calendarType: calendarType,
                          year: year,
                          month: month,
                          day: day,
                          birthHour: birthHour || '',
                          partnerName: isGonghapType ? partnerName : '',
                          partnerGender: isGonghapType ? partnerGender : '',
                          partnerCalendarType: isGonghapType ? partnerCalendarType : 'solar',
                          partnerYear: isGonghapType ? partnerYear : '',
                          partnerMonth: isGonghapType ? partnerMonth : '',
                          partnerDay: isGonghapType ? partnerDay : '',
                          partnerBirthHour: isGonghapType ? partnerBirthHour : ''
                        },
                        true // 결제 성공으로 인한 이동 플래그
                      )
                    } catch (error) {
                      console.error('[임시 리절트 이동] 오류:', error)
                      showAlertMessage(error instanceof Error ? error.message : '리절트 화면 이동 중 오류가 발생했습니다.')
                    }
                  }}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  리절트로 이동 (임시)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
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

      {/* PDF 생성 확인 팝업 */}
      {showPdfConfirmPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl p-6">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">PDF 생성</h2>
              <button
                onClick={() => {
                  setShowPdfConfirmPopup(false)
                  setSelectedPdfResult(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>
            
            {/* 내용 */}
            <div className="mb-6">
              <p className="text-gray-700 text-center">
                소장용으로 <span className="font-bold text-red-600">1회만</span> 생성이 가능합니다. 생성하시겠어요?
              </p>
              <p className="text-gray-500 text-center text-sm mt-2">
                PDF 생성은 약 1분정도 소요될 수 있어요.
              </p>
            </div>
            
            {/* 푸터 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowPdfConfirmPopup(false)
                  setSelectedPdfResult(null)
                }}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConfirmPdfGeneration}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                생성하기
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
        {(thumbnailImageUrl || hasVideo) && !thumbnailError && (
          <div
            // ✅ 상단 썸네일: 컨테이너 폭(빨간 박스) 안에 표시 + 라운드 없음
            // ✅ 썸네일 폭을 '소개 컨테이너(회색 라운드박스)'와 동일하게 맞춤
            // NOTE: `w-full`을 주면 width가 고정(100%)되어 음수 margin이 폭 확장에 반영되지 않아 오른쪽이 짧아짐.
            className="relative mb-8 overflow-hidden shadow-sm mx-[-12px] sm:mx-[-18px]"
          >
            <div className="relative h-96">
              {hasVideo && thumbnailImageUrl ? (
                <SupabaseVideo
                  thumbnailImageUrl={thumbnailImageUrl}
                  videoBaseName={thumbnailVideoUrl || ''}
                  className="w-full h-full"
                />
              ) : thumbnailImageUrl ? (
                <img 
                  src={thumbnailImageUrl} 
                  alt={content?.content_name || '썸네일'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const img = e.currentTarget
                    if (!thumbnailRetried) {
                      setThumbnailRetried(true)
                      // src를 강제로 다시 설정하여 재시도
                      img.src = thumbnailImageUrl + '?retry=' + Date.now()
                    } else {
                      setThumbnailError(true)
                    }
                  }}
                />
              ) : null}
              {/* 19금 로고 */}
              <div className="absolute top-2 right-2 z-10">
                <img 
                  src="/19logo.png" 
                  alt="19금"
                  className="w-14 h-14"
                />
              </div>
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
        <div className="bg-gray-100 rounded-xl p-6 md:p-8 mb-8 mx-[-12px] sm:mx-[-18px]">
          {/* 소개 섹션 */}
          {content?.introduction && (
            <div className="mb-[18px] pb-[18px] border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
              <h2 className="text-2xl font-extrabold text-pink-500 mb-[18px] relative pl-4 border-l-4 border-pink-500">
                소개
              </h2>
              <div className="w-full p-0 m-0 border-0 overflow-hidden" style={{ height: 'auto', minHeight: '1px' }}>
                <iframe
                  ref={introductionIframeRef}
                  srcDoc={content.introduction}
                  className="w-full border-0"
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: '200px',
                    border: 'none',
                    margin: 0,
                    padding: 0,
                    overflow: 'hidden',
                  }}
                  title="소개 HTML 뷰"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  onLoad={() => {
                    setTimeout(() => {
                      try {
                        const iframe = introductionIframeRef.current
                        if (iframe?.contentWindow?.document?.body) {
                          // iframe 내부 body와 html의 패딩/마진을 0으로 설정
                          const body = iframe.contentWindow.document.body
                          const html = iframe.contentWindow.document.documentElement
                          body.style.margin = '0'
                          body.style.padding = '0'
                          html.style.margin = '0'
                          html.style.padding = '0'
                          
                          const height = Math.max(
                            body.scrollHeight,
                            html.scrollHeight,
                            200
                          )
                          iframe.style.height = `${height}px`
                          iframe.style.overflow = 'hidden'
                          // iframe 내부 body의 스크롤도 숨김
                          body.style.overflow = 'hidden'
                          html.style.overflow = 'hidden'
                        }
                      } catch (err) {
                        // cross-origin 등으로 접근 불가 시 무시
                      }
                    }, 100)
                  }}
                />
              </div>
            </div>
          )}

          {/* 추천 섹션 */}
          {content?.recommendation && (
            <div className="mb-[18px] pb-[18px] border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
              <h2 className="text-2xl font-extrabold text-pink-500 mb-[18px] relative pl-4 border-l-4 border-pink-500">
                이런 분께 추천해요
              </h2>
              <div className="w-full p-0 m-0 border-0 overflow-hidden" style={{ height: 'auto', minHeight: '1px' }}>
                <iframe
                  ref={recommendationIframeRef}
                  srcDoc={content.recommendation}
                  className="w-full border-0"
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: '200px',
                    border: 'none',
                    margin: 0,
                    padding: 0,
                    overflow: 'hidden',
                  }}
                  title="추천 HTML 뷰"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  onLoad={() => {
                    setTimeout(() => {
                      try {
                        const iframe = recommendationIframeRef.current
                        if (iframe?.contentWindow?.document?.body) {
                          // iframe 내부 body와 html의 패딩/마진을 0으로 설정
                          const body = iframe.contentWindow.document.body
                          const html = iframe.contentWindow.document.documentElement
                          body.style.margin = '0'
                          body.style.padding = '0'
                          html.style.margin = '0'
                          html.style.padding = '0'
                          
                          const height = Math.max(
                            body.scrollHeight,
                            html.scrollHeight,
                            200
                          )
                          iframe.style.height = `${height}px`
                          iframe.style.overflow = 'hidden'
                          // iframe 내부 body의 스크롤도 숨김
                          body.style.overflow = 'hidden'
                          html.style.overflow = 'hidden'
                        }
                      } catch (err) {
                        // cross-origin 등으로 접근 불가 시 무시
                      }
                    }, 100)
                  }}
                />
              </div>
            </div>
          )}

          {/* 상품 메뉴 구성 */}
          {content?.menu_composition && content.menu_composition.trim() !== '' ? (
            <div className="mb-[18px] pb-[18px] border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
              <h2 className="text-2xl font-extrabold text-pink-500 mb-[18px] relative pl-4 border-l-4 border-pink-500">상품 메뉴 구성</h2>
              <div className="w-full p-0 m-0 border-0 overflow-hidden" style={{ height: 'auto', minHeight: '1px' }}>
                <iframe
                  ref={menuItemsIframeRef}
                  srcDoc={content.menu_composition}
                  className="w-full border-0"
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: '200px',
                    border: 'none',
                    margin: 0,
                    padding: 0,
                    overflow: 'hidden',
                  }}
                  title="상품 메뉴 구성 HTML 뷰"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  onLoad={() => {
                    setTimeout(() => {
                      try {
                        const iframe = menuItemsIframeRef.current
                        if (iframe?.contentWindow?.document?.body) {
                          // iframe 내부 body와 html의 패딩/마진을 0으로 설정
                          const body = iframe.contentWindow.document.body
                          const html = iframe.contentWindow.document.documentElement
                          body.style.margin = '0'
                          body.style.padding = '0'
                          html.style.margin = '0'
                          html.style.padding = '0'
                          
                          const height = Math.max(
                            body.scrollHeight,
                            html.scrollHeight,
                            200
                          )
                          iframe.style.height = `${height}px`
                          iframe.style.overflow = 'hidden'
                          // iframe 내부 body의 스크롤도 숨김
                          body.style.overflow = 'hidden'
                          html.style.overflow = 'hidden'
                        }
                      } catch (err) {
                        // cross-origin 등으로 접근 불가 시 무시
                      }
                    }, 100)
                  }}
                />
              </div>
            </div>
          ) : (
            // 하위 호환성: menu_composition이 없으면 기존 menu_items 방식 사용
            content?.menu_items && content.menu_items.length > 0 && (
              <div className="mb-[18px] pb-[18px] border-b border-gray-300 last:border-b-0 last:pb-0 last:mb-0">
                <h2 className="text-2xl font-extrabold text-pink-500 mb-[18px] relative pl-4 border-l-4 border-pink-500">상품 메뉴 구성</h2>
                <div className="w-full p-0 m-0 border-0 overflow-hidden" style={{ height: 'auto', minHeight: '1px' }}>
                  <iframe
                    ref={menuItemsIframeRef}
                    srcDoc={content.menu_items.map((item: any) => {
                      const itemValue = typeof item === 'string' ? item : (item.value || item)
                      return itemValue
                    }).join('')}
                    className="w-full border-0"
                    style={{
                      display: 'block',
                      width: '100%',
                      minHeight: '200px',
                      border: 'none',
                      margin: 0,
                      padding: 0,
                      overflow: 'hidden',
                    }}
                    title="상품 메뉴 구성 HTML 뷰"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                    onLoad={() => {
                      setTimeout(() => {
                        try {
                          const iframe = menuItemsIframeRef.current
                          if (iframe?.contentWindow?.document?.body) {
                            // iframe 내부 body와 html의 패딩/마진을 0으로 설정
                            const body = iframe.contentWindow.document.body
                            const html = iframe.contentWindow.document.documentElement
                            body.style.margin = '0'
                            body.style.padding = '0'
                            html.style.margin = '0'
                            html.style.padding = '0'
                            
                            const height = Math.max(
                              body.scrollHeight,
                              html.scrollHeight,
                              200
                            )
                            iframe.style.height = `${height}px`
                            iframe.style.overflow = 'hidden'
                            // iframe 내부 body의 스크롤도 숨김
                            body.style.overflow = 'hidden'
                            html.style.overflow = 'hidden'
                          }
                        } catch (err) {
                          // cross-origin 등으로 접근 불가 시 무시
                        }
                      }, 100)
                    }}
                  />
                </div>
              </div>
            )
          )}

          {/* 재회상품 미리보기 섹션 */}
          {(() => {
            const previewThumbnails = content?.preview_thumbnails
            const previewThumbnailsVideo = content?.preview_thumbnails_video || []
            
            // preview_thumbnails가 배열이고, 하나 이상의 유효한 썸네일이 있는지 확인
            let validThumbnails: string[] = []
            let validThumbnailsVideo: string[] = []
            if (previewThumbnails) {
              if (Array.isArray(previewThumbnails)) {
                validThumbnails = previewThumbnails.filter((thumb: any) => {
                  const thumbStr = String(thumb || '').trim()
                  return thumbStr && thumbStr.length > 0
                })
              } else if (typeof previewThumbnails === 'string') {
                try {
                  const parsed = JSON.parse(previewThumbnails)
                  if (Array.isArray(parsed)) {
                    validThumbnails = parsed.filter((thumb: any) => {
                      const thumbStr = String(thumb || '').trim()
                      return thumbStr && thumbStr.length > 0
                    })
                  }
                } catch (e) {
                }
              }
            }
            
            if (Array.isArray(previewThumbnailsVideo)) {
              validThumbnailsVideo = previewThumbnailsVideo.filter((thumb: any) => {
                const thumbStr = String(thumb || '').trim()
                return thumbStr && thumbStr.length > 0
              })
            }
            
            if (validThumbnails.length === 0 && validThumbnailsVideo.length === 0) {
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
              const maxIndex = Math.max(validThumbnails.length, validThumbnailsVideo.length) - 1
              setModalCurrentIndex((prev) => (prev < maxIndex ? prev + 1 : prev))
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
              } else if (modalCurrentIndex === Math.max(validThumbnails.length, validThumbnailsVideo.length) - 1 && distance > 0) {
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
                  <h2 className="text-2xl font-extrabold text-pink-500 mb-6 relative pl-4 border-l-4 border-pink-500">재회상품 미리보기</h2>
                  <div className="flex gap-4 flex-wrap">
                    {[0, 1, 2].map((index: number) => {
                      const thumbnailImageUrl = validThumbnails[index] || ''
                      const thumbnailVideoUrl = validThumbnailsVideo[index] || ''
                      if (!thumbnailImageUrl && !thumbnailVideoUrl) return null
                      
                      return (
                        <div key={index} className="cursor-pointer rounded-lg shadow-md hover:shadow-lg transition-shadow max-h-48" onClick={() => openPreviewModal(index)}>
                          {thumbnailVideoUrl && thumbnailImageUrl ? (
                            <SupabaseVideo
                              thumbnailImageUrl={thumbnailImageUrl}
                              videoBaseName={thumbnailVideoUrl}
                              className="w-full h-full rounded-lg"
                            />
                          ) : thumbnailImageUrl ? (
                            !previewThumbnailErrors[index] ? (
                              <img
                                src={thumbnailImageUrl}
                                alt={`재회상품 미리보기 ${index + 1}`}
                                className="rounded-lg max-h-48 object-contain"
                                onError={(e) => {
                                  const img = e.currentTarget
                                  if (!previewThumbnailRetried[index]) {
                                    setPreviewThumbnailRetried(prev => ({ ...prev, [index]: true }))
                                    img.src = thumbnailImageUrl + '?retry=' + Date.now()
                                  } else {
                                    setPreviewThumbnailErrors(prev => ({ ...prev, [index]: true }))
                                  }
                                }}
                              />
                            ) : (
                              <div className="rounded-lg max-h-48 w-32 h-32 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
                                <span className="text-white text-xs">이미지 로드 실패</span>
                              </div>
                            )
                          ) : null}
                        </div>
                      )
                    })}
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
                                {!previewThumbnailErrors[index] ? (
                                <img
                                  src={thumbnail}
                                  alt={`재회상품 미리보기 ${index + 1}`}
                                  className="max-w-full max-h-[90vh] object-contain"
                                    onError={(e) => {
                                      const img = e.currentTarget
                                      if (!previewThumbnailRetried[index]) {
                                        setPreviewThumbnailRetried(prev => ({ ...prev, [index]: true }))
                                        // src를 강제로 다시 설정하여 재시도
                                        img.src = thumbnail + '?retry=' + Date.now()
                                      } else {
                                        setPreviewThumbnailErrors(prev => ({ ...prev, [index]: true }))
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="max-w-full max-h-[90vh] w-full h-96 bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center">
                                    <span className="text-white text-lg">이미지 로드 실패</span>
                                  </div>
                                )}
                              </div>
                              {/* 인디케이터 (2개 이상일 때만 표시, 썸네일 바로 아래) */}
                              {Math.max(validThumbnails.length, validThumbnailsVideo.length) > 1 && (
                                <div className="flex justify-center gap-2 mt-4">
                                  {[0, 1, 2].filter(idx => validThumbnails[idx] || validThumbnailsVideo[idx]).map((idx: number) => (
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
          {/* 금액 섹션 */}
          {content?.price && (
            <div className="mb-6 pb-6 border-b border-gray-200">
              <h2 className="text-2xl font-extrabold text-pink-500 mb-6 relative pl-4 border-l-4 border-pink-500">금액</h2>
              <div className="text-2xl font-bold text-pink-500 mb-3 text-right">
                {(() => {
                  // 숫자만 추출하여 세자리마다 콤마 추가
                  const priceStr = String(content.price).replace(/[^0-9]/g, '')
                  const formattedPrice = priceStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                  return formattedPrice ? `${formattedPrice}원` : content.price
                })()}
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                포춘82 코인 결제 불가, 만약 재회사주 솔루션이 만족스럽지 않으신 경우 연락주시면 100% 환불해 드립니다.
              </p>
            </div>
          )}
          
          <h2 className="text-2xl font-extrabold text-pink-500 mb-6 relative pl-4 border-l-4 border-pink-500">본인 정보</h2>
          
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

            {/* 연령 제한 안내 */}
            <div className="text-transparent bg-clip-text bg-gradient-to-r from-pink-600 to-pink-500 font-bold text-sm mb-4 text-left">
              ※ 19세 이하는 이용하실 수 없습니다.
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
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || loading}
                className="flex-1 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-4 px-8 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? '처리 중...' : '결제하기'}
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

        {/* 클릭 수 표시 */}
        {content?.id && (
          <div className="mb-4 text-center">
            <p className="text-sm text-gray-600">
              <span className="font-semibold text-pink-600">{clickCount.toLocaleString()}</span>명이 이용하셨습니다.
            </p>
          </div>
        )}

        {/* 리뷰 섹션 */}
        {content?.id && (
          <div className="bg-gradient-to-br from-white to-pink-50/30 rounded-2xl p-0 mb-8 border border-pink-100 overflow-hidden" style={{ boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)' }}>
            {/* 세련된 탭 디자인 */}
            <div className="flex items-center justify-between bg-white/60 backdrop-blur-sm border-b border-pink-200 px-1">
              <div className="flex items-center">
              <button
                type="button"
                onClick={() => setActiveReviewTab('reviews')}
                className={`relative px-6 py-3.5 font-semibold text-sm transition-all duration-300 rounded-t-xl ${
                  activeReviewTab === 'reviews'
                    ? 'text-pink-600 bg-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={activeReviewTab === 'reviews' ? { boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' } : {}}
              >
                리뷰
                {activeReviewTab === 'reviews' && (
                  <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-pink-500 to-pink-600 rounded-full"></span>
                )}
              </button>
              <div className="w-px h-6 bg-pink-200"></div>
              <button
                type="button"
                onClick={() => setActiveReviewTab('best')}
                className={`relative px-6 py-3.5 font-semibold text-sm transition-all duration-300 rounded-t-xl ${
                  activeReviewTab === 'best'
                    ? 'text-pink-600 bg-white'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
                style={activeReviewTab === 'best' ? { boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' } : {}}
              >
                Best 리뷰
                {activeReviewTab === 'best' && (
                  <span className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-8 h-0.5 bg-gradient-to-r from-pink-500 to-pink-600 rounded-full"></span>
                )}
              </button>
              </div>
              {/* 새로고침 버튼 */}
              <button
                type="button"
                onClick={() => {
                  if (content?.id) {
                    loadReviews(content.id)
                  }
                }}
                className="px-3 py-2 text-xs text-gray-600 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition-colors duration-200 mr-2"
                title="리뷰 새로고침"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>

            {/* 리뷰 목록 */}
            <div className="p-6 min-h-[200px] bg-white/40">
              {activeReviewTab === 'reviews' ? (
                <div className="space-y-4">
                  {reviews.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 mb-4">
                        <svg className="w-8 h-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm">등록된 리뷰가 없습니다.</p>
                    </div>
                  ) : (
                    reviews.map((review: any) => {
                      const isExpanded = expandedReviews.has(review.id)
                      const reviewLines = review.review_text.split('\n')
                      const shouldShowMore = reviewLines.length > 5 || review.review_text.length > 300
                      
                      return (
                        <div key={review.id} className="bg-white border border-pink-200 rounded-xl p-5 transition-all duration-200" style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.04)' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 4px 0 rgba(0, 0, 0, 0.06)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.04)'}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {(() => {
                                const date = new Date(review.created_at)
                                return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                              })()}
                            </div>
                            {review.is_best && (
                              <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-full" style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}>
                                ⭐ 베스트
                              </span>
                            )}
                          </div>
                          <div className="relative">
                            <p 
                              className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${
                                !isExpanded && shouldShowMore ? 'line-clamp-5' : ''
                              }`}
                              style={{
                                maxHeight: !isExpanded && shouldShowMore ? '7.5rem' : 'none',
                                overflow: !isExpanded && shouldShowMore ? 'hidden' : 'visible',
                              }}
                            >
                              {review.review_text}
                            </p>
                            {review.image_url && (() => {
                              // image_url이 JSON 배열 문자열인지 확인
                              let imageUrls: string[] = []
                              try {
                                const parsed = JSON.parse(review.image_url)
                                if (Array.isArray(parsed)) {
                                  imageUrls = parsed
                                } else {
                                  imageUrls = [review.image_url]
                                }
                              } catch {
                                // JSON 파싱 실패 시 단일 URL로 처리
                                imageUrls = [review.image_url]
                              }
                              
                              return (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {imageUrls.map((url, idx) => (
                                    <img
                                      key={idx}
                                      src={url}
                                      alt={`리뷰 사진 ${idx + 1}`}
                                      className="rounded-lg border border-pink-200 cursor-pointer hover:opacity-90 transition-opacity"
                                      loading="lazy"
                                      style={{ 
                                        display: 'block', 
                                        width: '100px', 
                                        height: 'auto',
                                        objectFit: 'contain'
                                      }}
                                      onClick={() => {
                                        setExpandedReviewImage(url)
                                      }}
                                      onError={(e) => {
                                        const img = e.target as HTMLImageElement
                                        // 이미지 로드 실패 시 숨기지 않고 대체 이미지 표시
                                        img.style.display = 'none'
                                        const parent = img.parentElement
                                        if (parent && !parent.querySelector('.image-error')) {
                                          const errorDiv = document.createElement('div')
                                          errorDiv.className = 'image-error text-xs text-gray-400 text-center py-2'
                                          errorDiv.textContent = '이미지를 불러올 수 없습니다'
                                          parent.appendChild(errorDiv)
                                        }
                                      }}
                                    />
                                  ))}
                                </div>
                              )
                            })()}
                            {shouldShowMore && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newExpanded = new Set(expandedReviews)
                                  if (isExpanded) {
                                    newExpanded.delete(review.id)
                                  } else {
                                    newExpanded.add(review.id)
                                  }
                                  setExpandedReviews(newExpanded)
                                }}
                                className="mt-3 text-xs text-pink-600 hover:text-pink-700 font-semibold transition-colors flex items-center gap-1"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>접기</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                  </>
                                ) : (
                                  <>
                                    <span>더보기</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {bestReviews.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-pink-100 mb-4">
                        <svg className="w-8 h-8 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </div>
                      <p className="text-gray-500 text-sm">베스트 리뷰가 없습니다.</p>
                    </div>
                  ) : (
                    bestReviews.map((review: any) => {
                      const isExpanded = expandedReviews.has(review.id)
                      const reviewLines = review.review_text.split('\n')
                      const shouldShowMore = reviewLines.length > 5 || review.review_text.length > 300
                      
                      return (
                        <div key={review.id} className="bg-gradient-to-br from-yellow-50 to-white border-2 border-yellow-200 rounded-xl p-5 transition-all duration-200" style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.04)' }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 2px 4px 0 rgba(0, 0, 0, 0.06)'} onMouseLeave={(e) => e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.04)'}>
                          <div className="flex items-start justify-between mb-3">
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                              <svg className="w-4 h-4 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {(() => {
                                const date = new Date(review.created_at)
                                return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                              })()}
                            </div>
                            <span className="bg-gradient-to-r from-yellow-400 to-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1" style={{ boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)' }}>
                              <span>⭐</span>
                              <span>베스트</span>
                            </span>
                          </div>
                          <div className="relative">
                            <p 
                              className={`text-sm text-gray-700 leading-relaxed whitespace-pre-wrap ${
                                !isExpanded && shouldShowMore ? 'line-clamp-5' : ''
                              }`}
                              style={{
                                maxHeight: !isExpanded && shouldShowMore ? '7.5rem' : 'none',
                                overflow: !isExpanded && shouldShowMore ? 'hidden' : 'visible',
                              }}
                            >
                              {review.review_text}
                            </p>
                            {review.image_url && (() => {
                              // image_url이 JSON 배열 문자열인지 확인
                              let imageUrls: string[] = []
                              try {
                                const parsed = JSON.parse(review.image_url)
                                if (Array.isArray(parsed)) {
                                  imageUrls = parsed
                                } else {
                                  imageUrls = [review.image_url]
                                }
                              } catch {
                                // JSON 파싱 실패 시 단일 URL로 처리
                                imageUrls = [review.image_url]
                              }
                              
                              return (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {imageUrls.map((url, idx) => (
                                    <img
                                      key={idx}
                                      src={url}
                                      alt={`리뷰 사진 ${idx + 1}`}
                                      className="rounded-lg border border-yellow-200 cursor-pointer hover:opacity-90 transition-opacity"
                                      loading="lazy"
                                      style={{ 
                                        display: 'block', 
                                        width: '100px', 
                                        height: 'auto',
                                        objectFit: 'contain'
                                      }}
                                      onClick={() => {
                                        setExpandedReviewImage(url)
                                      }}
                                      onError={(e) => {
                                        const img = e.target as HTMLImageElement
                                        // 이미지 로드 실패 시 숨기지 않고 대체 이미지 표시
                                        img.style.display = 'none'
                                        const parent = img.parentElement
                                        if (parent && !parent.querySelector('.image-error')) {
                                          const errorDiv = document.createElement('div')
                                          errorDiv.className = 'image-error text-xs text-gray-400 text-center py-2'
                                          errorDiv.textContent = '이미지를 불러올 수 없습니다'
                                          parent.appendChild(errorDiv)
                                        }
                                      }}
                                    />
                                  ))}
                                </div>
                              )
                            })()}
                            {shouldShowMore && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newExpanded = new Set(expandedReviews)
                                  if (isExpanded) {
                                    newExpanded.delete(review.id)
                                  } else {
                                    newExpanded.add(review.id)
                                  }
                                  setExpandedReviews(newExpanded)
                                }}
                                className="mt-3 text-xs text-pink-600 hover:text-pink-700 font-semibold transition-colors flex items-center gap-1"
                              >
                                {isExpanded ? (
                                  <>
                                    <span>접기</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                  </>
                                ) : (
                                  <>
                                    <span>더보기</span>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}

            </div>
          </div>
        )}

        {/* 리뷰 이미지 확대 모달 */}
        {expandedReviewImage && (
          <div 
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] p-4"
            onClick={() => setExpandedReviewImage(null)}
          >
            <div className="relative max-w-[90vw] max-h-[90vh]">
              <button
                onClick={() => setExpandedReviewImage(null)}
                className="absolute -top-10 right-0 text-white hover:text-gray-300 transition-colors"
                aria-label="닫기"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <img
                src={expandedReviewImage}
                alt="리뷰 사진 확대"
                className="max-w-full max-h-[90vh] object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  const img = e.target as HTMLImageElement
                  img.style.display = 'none'
                }}
              />
            </div>
          </div>
        )}

        {/* 이용안내 */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">이용안내</h3>
          <div className="space-y-2 text-sm text-gray-700">
            <p>※ 본 상품은 포춘82에 재유니온이 샵인샵 형태로 별도로 운영되는 콘텐츠 입니다.</p>
            <p>※ 재유니온 상품은 포춘82 코인 결제가 불가능하며 별도로 운영됩니다.</p>
            <p>※ 다시보기는 재유니온 → 나의 이용내역에서 결제일로부터 60일간 확인이 가능합니다.</p>
            <p>※ 회원님의 실수로 인하여 결제된 서비스에 대해서는 교환 및 환불이 안됩니다.</p>
          </div>
        </div>

        {/* 푸터 */}
        <footer className="bg-white border-t border-gray-200 py-6 mt-8">
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

        {/* 서버에 저장된 결과 목록 (요청에 따라 비노출 처리) */}
        {false && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">서버에 저장된 결과</h3>
          <div className="space-y-3">
            {!savedResults || !Array.isArray(savedResults) || savedResults.length === 0 ? (
              <p className="text-sm text-gray-600">저장된 결과가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {savedResults.map((saved: any) => {
                  if (!saved || !saved.id) {
                    return null
                  }
                  
                  // 디버깅: saved 객체 전체 확인
                  
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
                    
                    return expired
                  })() : false
                  
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
                                showAlertMessage('PDF 파일을 찾을 수 없습니다.')
                              }
                            } catch (error) {
                              showAlertMessage('PDF 다운로드에 실패했습니다.')
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
                        {/* 클라이언트 사이드 PDF 생성 버튼 */}
                        {!pdfGeneratedMap[saved.id] && (
                          <button
                            data-id={saved.id}
                            onClick={() => handlePdfButtonClick(saved)}
                            className="bg-blue-400 hover:bg-blue-500 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center gap-1 min-w-[100px] justify-center relative overflow-hidden"
                            title="PDF 생성 및 다운로드"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" id={`pdf-btn-icon-${saved.id}`}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            <span id={`pdf-btn-text-${saved.id}`}>PDF 생성</span>
                          </button>
                        )}
                        {/* 보기 버튼 */}
                        <button
                          onClick={() => {
                            if (typeof window === 'undefined') return
                            // result 페이지는 SupabaseVideo 기반으로 동영상 썸네일을 안정적으로 재생한다.
                            // 보기(새창)도 result 라우트를 그대로 열어 동일 로직을 사용한다.
                            try {
                              sessionStorage.setItem('result_savedId', String(saved.id))
                            } catch (e) {}
                            window.open(`/result?savedId=${encodeURIComponent(String(saved.id))}`, '_blank', 'noopener,noreferrer')
                            return
                            try {
                              // userName을 안전하게 처리 (템플릿 리터럴 중첩 방지)
                              const userNameForScript = saved.userName ? JSON.stringify(saved.userName) : "''"
                              
                              // HTML 처리 (result 페이지 batch 모드와 완전히 동일한 로직)
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
                              
                              // 폰트 크기 및 볼드 설정 (result 페이지와 동일)
                              const menuFontSize = contentObj?.menu_font_size || 16;
                              const menuFontBold = contentObj?.menu_font_bold || false;
                              const subtitleFontSize = contentObj?.subtitle_font_size || 14;
                              const subtitleFontBold = contentObj?.subtitle_font_bold || false;
                              const detailMenuFontSize = contentObj?.detail_menu_font_size || 12;
                              const detailMenuFontBold = contentObj?.detail_menu_font_bold || false;
                              const bodyFontSize = contentObj?.body_font_size || 11;
                              const bodyFontBold = contentObj?.body_font_bold || false;
                              
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
                                    bookCoverDiv.innerHTML = '<img src="' + bookCoverThumbnail + '" alt="북커버 썸네일" style="width: calc(100% - 48px); max-width: calc(100% - 48px); height: auto; object-fit: contain; display: block;" />';
                                    // 첫 번째 자식 요소(menu-title) 앞에 삽입
                                    if (firstSection.firstChild) {
                                      firstSection.insertBefore(bookCoverDiv, firstSection.firstChild);
                                    } else {
                                      firstSection.appendChild(bookCoverDiv);
                                    }
                                  }
                                  
                                  // 상세메뉴 추가 (숫자 접두사 유지)
                                  menuSections.forEach((section, menuIndex) => {
                                    const menuItem = menuItems[menuIndex];
                                    
                                    // menu-section에 id 추가 (목차에서 스크롤하기 위해)
                                    (section as HTMLElement).id = `menu-${menuIndex}`;
                                    
                                    // 대메뉴 제목에서 볼드 속성 적용 (숫자 접두사 유지)
                                    const menuTitle = section.querySelector('.menu-title');
                                    if (menuTitle) {
                                      // 숫자 접두사 제거하지 않음
                                      (menuTitle as HTMLElement).style.fontWeight = menuFontBold ? 'bold' : 'normal';
                                    }
                                    
                                    if (menuItem?.subtitles) {
                                      const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'));
                                      subtitleSections.forEach((subSection, subIndex) => {
                                        const subtitle = menuItem.subtitles[subIndex];
                                        
                                        // subtitle-section에 id 추가 (목차에서 스크롤하기 위해)
                                        (subSection as HTMLElement).id = `subtitle-${menuIndex}-${subIndex}`;
                                        
                                        // 소메뉴 제목에서 볼드 속성 적용 (숫자 접두사 유지)
                                        const subtitleTitle = subSection.querySelector('.subtitle-title');
                                        if (subtitleTitle) {
                                          // 숫자 접두사 제거하지 않음
                                          (subtitleTitle as HTMLElement).style.fontWeight = subtitleFontBold ? 'bold' : 'normal';
                                        }
                                        
                                        // 소제목 썸네일 추가 (PDF용: 300x300 안에 비율 유지)
                                        const thumbnailImageUrl = subtitle?.thumbnail_image_url || subtitle?.thumbnail || ''
                                        const thumbnailVideoUrl = subtitle?.thumbnail_video_url || ''
                                        if (thumbnailImageUrl || thumbnailVideoUrl) {
                                          if (subtitleTitle) {
                                            const thumbnailImg = doc.createElement('div');
                                            thumbnailImg.className = 'subtitle-thumbnail-container';
                                            thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;';
                                            if (thumbnailImageUrl) {
                                              thumbnailImg.innerHTML = '<img src="' + thumbnailImageUrl + '" alt="소제목 썸네일" style="width: 100%; height: 100%; display: block; object-fit: contain;" />';
                                            }
                                            subtitleTitle.parentNode?.insertBefore(thumbnailImg, subtitleTitle.nextSibling);
                                          }
                                        }
                                        
                                        // 상세메뉴 추가 (HTML에서 파싱한 내용 사용) - result 페이지와 동일
                                        const existingDetailMenuSection = subSection.querySelector('.detail-menu-section');
                                        
                                        if (existingDetailMenuSection) {
                                          // HTML에 이미 상세메뉴가 있으면 그대로 사용 (제미나이가 생성한 것)
                                          // 스타일 적용 (숫자 접두사 유지)
                                          const detailMenuTitles = existingDetailMenuSection.querySelectorAll('.detail-menu-title');
                                          detailMenuTitles.forEach((titleEl) => {
                                            // 숫자 접두사 제거하지 않음
                                            (titleEl as HTMLElement).style.fontSize = detailMenuFontSize + 'px';
                                            (titleEl as HTMLElement).style.fontWeight = detailMenuFontBold ? 'bold' : 'normal';
                                          });
                                          
                                          const detailMenuContents = existingDetailMenuSection.querySelectorAll('.detail-menu-content');
                                          detailMenuContents.forEach((contentEl) => {
                                            (contentEl as HTMLElement).style.fontSize = bodyFontSize + 'px';
                                            (contentEl as HTMLElement).style.fontWeight = bodyFontBold ? 'bold' : 'normal';
                                          });
                                          
                                          // 상세메뉴가 subtitle-content 앞에 있으면 subtitle-content 다음으로 이동
                                          const subtitleContent = subSection.querySelector('.subtitle-content');
                                          if (subtitleContent && existingDetailMenuSection) {
                                            const detailMenuParent = existingDetailMenuSection.parentNode;
                                            const subtitleContentParent = subtitleContent.parentNode;
                                            
                                            // subtitle-content가 detail-menu-section보다 뒤에 있는지 확인 (DOM 순서)
                                            let isDetailMenuBeforeContent = false;
                                            if (detailMenuParent === subtitleContentParent) {
                                              let currentNode = subtitleContentParent?.firstChild;
                                              while (currentNode) {
                                                if (currentNode === existingDetailMenuSection) {
                                                  isDetailMenuBeforeContent = true;
                                                  break;
                                                }
                                                if (currentNode === subtitleContent) {
                                                  break;
                                                }
                                                currentNode = currentNode.nextSibling;
                                              }
                                            }
                                            
                                            // detail-menu-section이 subtitle-content 앞에 있으면 이동
                                            if (isDetailMenuBeforeContent) {
                                              subtitleContentParent?.insertBefore(existingDetailMenuSection, subtitleContent.nextSibling);
                                            }
                                          }
                                          
                                          // 상세메뉴 썸네일 추가 (result 페이지 batch 모드와 동일하게 처리)
                                          // HTML에서 detail-menu-title을 찾아서 썸네일 추가
                                          if (subtitle?.detailMenus) {
                                            const detailMenuTitles = existingDetailMenuSection.querySelectorAll('.detail-menu-title');
                                            detailMenuTitles.forEach((detailMenuTitle, detailIndex: number) => {
                                              const detailMenu = subtitle.detailMenus[detailIndex];
                                              const detailThumbnailImageUrl = detailMenu?.thumbnail_image_url || detailMenu?.thumbnail || ''
                                              const detailThumbnailVideoUrl = detailMenu?.thumbnail_video_url || ''
                                              if (detailThumbnailImageUrl || detailThumbnailVideoUrl) {
                                                const existingThumbnail = detailMenuTitle.nextElementSibling;
                                                if (!existingThumbnail || !existingThumbnail.classList.contains('detail-menu-thumbnail-container')) {
                                                  const thumbnailImg = doc.createElement('div');
                                                  thumbnailImg.className = 'detail-menu-thumbnail-container';
                                                  // ✅ PDF는 이미지로만 렌더(캡처 안정성) + 300x300 contain
                                                  thumbnailImg.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;';
                                                  if (detailThumbnailImageUrl) {
                                                    thumbnailImg.innerHTML = '<img src="' + detailThumbnailImageUrl + '" alt="상세메뉴 썸네일" style="width: 100%; height: 100%; display: block; object-fit: contain;" />';
                                                  }
                                                  detailMenuTitle.parentNode?.insertBefore(thumbnailImg, detailMenuTitle.nextSibling);
                                                }
                                              }
                                            });
                                          }
                                        }
                                      });
                                    }
                                  });
                                  
                                  // 엔딩북커버 썸네일 추가 (마지막 menu-section 안, 소제목들 아래)
                                  const endingBookCoverThumbnailImageUrl = contentObj?.ending_book_cover_thumbnail || ''
                                  const endingBookCoverThumbnailVideoUrl = contentObj?.ending_book_cover_thumbnail_video || ''
                                  if ((endingBookCoverThumbnailImageUrl || endingBookCoverThumbnailVideoUrl) && menuSections.length > 0) {
                                    const lastSection = menuSections[menuSections.length - 1];
                                    const endingBookCoverDiv = doc.createElement('div');
                                    endingBookCoverDiv.className = 'ending-book-cover-thumbnail-container';
                                    endingBookCoverDiv.style.cssText = 'width: 100%; margin-top: 1rem; aspect-ratio: 9/16;';
                                    if (endingBookCoverThumbnailVideoUrl && endingBookCoverThumbnailImageUrl) {
                                      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                                      const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                                      endingBookCoverDiv.innerHTML = `
                                        <div style="position: relative; width: 100%; height: 100%;">
                                          <img src="${endingBookCoverThumbnailImageUrl}" alt="엔딩북커버 썸네일" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" id="ending-thumbnail-img-pdf" />
                                          <video style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px; display: none;" id="ending-thumbnail-video-pdf" poster="${endingBookCoverThumbnailImageUrl}" autoPlay muted loop playsInline preload="auto">
                                            <source src="${bucketUrl}/${endingBookCoverThumbnailVideoUrl}.webm" type="video/webm" />
                                          </video>
                                        </div>
                                        <script>
                                          (function() {
                                            const video = document.getElementById('ending-thumbnail-video-pdf');
                                            const img = document.getElementById('ending-thumbnail-img-pdf');
                                            if (video) {
                                              video.addEventListener('canplay', function() {
                                                if (img) img.style.display = 'none';
                                                if (video) video.style.display = 'block';
                                              });
                                              video.load();
                                            }
                                          })();
                                        </script>
                                      `
                                    } else if (endingBookCoverThumbnailImageUrl) {
                                      endingBookCoverDiv.innerHTML = '<img src="' + endingBookCoverThumbnailImageUrl + '" alt="엔딩북커버 썸네일" style="width: 100%; height: 100%; object-fit: contain; display: block; border-radius: 8px;" />';
                                    }
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
                                }
                              }
                              
                              // contentObj를 JSON 문자열로 변환 (템플릿 리터럴에서 사용)
                              const contentObjJson = JSON.stringify(contentObj || {});
                              
                              // 목차 HTML 생성 (HTML에서 실제 제목 추출)
                              let tocHtml = '';
                              try {
                                if (menuItems.length > 0 && htmlContent) {
                                  // HTML에서 실제 제목 추출
                                  const parser = new DOMParser();
                                  const doc = parser.parseFromString(htmlContent, 'text/html');
                                  const menuSections = Array.from(doc.querySelectorAll('.menu-section'));
                                  
                                  if (menuSections.length > 0) {
                                    tocHtml = '<div id="table-of-contents" style="margin-bottom: 24px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding-top: 24px; padding-bottom: 24px;">';
                                    tocHtml += '<h3 style="font-size: 18px; font-weight: bold; color: #111827; margin-bottom: 16px;">목차</h3>';
                                    tocHtml += '<div style="display: flex; flex-direction: column; gap: 8px;">';
                                    
                                    menuSections.forEach((section, mIndex) => {
                                      const menuTitleEl = section.querySelector('.menu-title');
                                      const menuTitle = (menuTitleEl?.textContent || '').trim();
                                      
                                      if (!menuTitle) {
                                        return;
                                      }
                                      
                                      const escapedMenuTitle = menuTitle.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;').replace(/\$/g, '&#36;');
                                      
                                      tocHtml += '<div style="display: flex; flex-direction: column; gap: 4px;">';
                                      const menuId = 'menu-' + mIndex;
                                      const buttonHtml = '<button onclick="document.getElementById(\'' + menuId + '\').scrollIntoView({ behavior: \'smooth\', block: \'start\' })" style="text-align: left; font-size: 16px; font-weight: 600; color: #1f2937; background: none; border: none; cursor: pointer; padding: 4px 0; transition: color 0.2s;" onmouseover="this.style.color=\'#ec4899\'" onmouseout="this.style.color=\'#1f2937\'">' + escapedMenuTitle + '</button>';
                                      tocHtml += buttonHtml;
                                      
                                      const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'));
                                      if (subtitleSections.length > 0) {
                                        tocHtml += '<div style="margin-left: 16px; display: flex; flex-direction: column; gap: 2px;">';
                                        subtitleSections.forEach((subSection, sIndex) => {
                                          const subtitleTitleEl = subSection.querySelector('.subtitle-title');
                                          const subTitle = (subtitleTitleEl?.textContent || '').trim();
                                          
                                          if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) {
                                            return;
                                          }
                                          
                                          const escapedSubTitle = subTitle.replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/`/g, '&#96;').replace(/\$/g, '&#36;');
                                          const subtitleId = 'subtitle-' + mIndex + '-' + sIndex;
                                          tocHtml += '<button onclick="document.getElementById(\'' + subtitleId + '\').scrollIntoView({ behavior: \'smooth\', block: \'start\' })" style="text-align: left; font-size: 14px; color: #4b5563; background: none; border: none; cursor: pointer; padding: 2px 0; transition: color 0.2s;" onmouseover="this.style.color=\'#ec4899\'" onmouseout="this.style.color=\'#4b5563\'">' + escapedSubTitle + '</button>';
                                        });
                                        tocHtml += '</div>';
                                      }
                                      
                                      tocHtml += '</div>';
                                    });
                                    
                                    tocHtml += '</div>';
                                    tocHtml += '</div>';
                                  }
                                }
                              } catch (e) {
                              }
                              
                              // 플로팅 배너 HTML 생성
                              let bannerHtml = '';
                              try {
                                if (menuItems.length > 0) {
                                  bannerHtml = '<div style="position: fixed; bottom: 24px; right: 24px; z-index: 40;">';
                                  const bannerButtonHtml = '<button onclick="document.getElementById(\'table-of-contents\').scrollIntoView({ behavior: \'smooth\', block: \'start\' })" style="background: linear-gradient(to right, #ec4899, #db2777); color: white; font-weight: 600; padding: 12px 24px; border-radius: 9999px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05); transition: all 0.3s; display: flex; align-items: center; gap: 8px; border: none; cursor: pointer; opacity: 0.8;" onmouseover="this.style.opacity=\'1\'; this.style.boxShadow=\'0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)\';" onmouseout="this.style.opacity=\'0.8\'; this.style.boxShadow=\'0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)\';">';
                                  bannerHtml += bannerButtonHtml;
                                  bannerHtml += '<svg xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">';
                                  bannerHtml += '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />';
                                  bannerHtml += '</svg>';
                                  bannerHtml += '<span>목차로 이동</span>';
                                  bannerHtml += '</button>';
                                  bannerHtml += '</div>';
                                }
                              } catch (e) {
                              }
                              
                              // 북커버 추출 (HTML에서 북커버를 찾아서 추출하고 제거)
                              let bookCoverHtml = '';
                              const bookCoverThumbnailImageUrl = contentObj?.book_cover_thumbnail || '';
                              const bookCoverThumbnailVideoUrl = contentObj?.book_cover_thumbnail_video || '';
                              if (bookCoverThumbnailImageUrl || bookCoverThumbnailVideoUrl) {
                                try {
                                  const parser = new DOMParser();
                                  const doc = parser.parseFromString(htmlContent, 'text/html');
                                  const bookCoverEl = doc.querySelector('.book-cover-thumbnail-container');
                                  if (bookCoverEl) {
                                    const el = bookCoverEl as Element
                                    bookCoverHtml = el.outerHTML;
                                    el.remove();
                                    const bodyMatch = doc.documentElement.outerHTML.match(/<body[^>]*>([\s\S]*)<\/body>/i);
                                    const bodyHtml = bodyMatch?.[1]
                                    if (bodyHtml) {
                                      htmlContent = bodyHtml;
                                    } else {
                                      htmlContent = doc.body.innerHTML;
                                    }
                                  } else {
                                    // 북커버가 HTML에 없으면 새로 생성
                                    if (bookCoverThumbnailImageUrl || bookCoverThumbnailVideoUrl) {
                                      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
                                      const bucketUrl = supabaseUrl ? `${supabaseUrl}/storage/v1/object/public/thumbnails` : ''
                                      if (bookCoverThumbnailVideoUrl && bookCoverThumbnailImageUrl) {
                                        bookCoverHtml = `
                                          <div class="book-cover-thumbnail-container" style="width: 100%; margin-bottom: 2.5rem; aspect-ratio: 9/16;">
                                            <div style="position: relative; width: 100%; height: 100%;">
                                              <img src="${bookCoverThumbnailImageUrl}" alt="북커버 썸네일" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px;" id="book-cover-thumbnail-img-form" />
                                              <video style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px; display: none;" id="book-cover-thumbnail-video-form" poster="${bookCoverThumbnailImageUrl}" autoPlay muted loop playsInline preload="auto">
                                                <source src="${bucketUrl}/${bookCoverThumbnailVideoUrl}.webm" type="video/webm" />
                                              </video>
                                            </div>
                                          </div>
                                        `
                                      } else if (bookCoverThumbnailImageUrl) {
                                        bookCoverHtml = `
                                          <div class="book-cover-thumbnail-container" style="width: 100%; margin-bottom: 2.5rem; aspect-ratio: 9/16;">
                                            <img src="${bookCoverThumbnailImageUrl}" alt="북커버 썸네일" style="width: 100%; height: 100%; object-fit: contain; display: block; border-radius: 8px;" />
                                          </div>
                                        `
                                      }
                                    }
                                  }
                                } catch (e) {
                                }
                              }
                              
                              // 템플릿 리터럴 특수 문자 이스케이프
                              const safeHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                              const safeTocHtml = tocHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                              const safeBannerHtml = bannerHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                              const safeBookCoverHtml = bookCoverHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                              
                              // menu_items를 JSON 문자열로 변환 (스크립트 내부에서 사용)
                              const menuItemsJson = JSON.stringify(saved.content?.menu_items || []).replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
                              
                              const newWindow = window.open('', '_blank')
                              if (newWindow) {
                                const savedMenuFontSize = saved.content?.menu_font_size || 16
                                const savedMenuFontBold = saved.content?.menu_font_bold || false
                                const savedSubtitleFontSize = saved.content?.subtitle_font_size || 14
                                const savedSubtitleFontBold = saved.content?.subtitle_font_bold || false
                                const savedDetailMenuFontSize = saved.content?.detail_menu_font_size || 12
                                const savedDetailMenuFontBold = saved.content?.detail_menu_font_bold || false
                                const savedBodyFontSize = saved.content?.body_font_size || 11
                                const savedBodyFontBold = saved.content?.body_font_bold || false
                                
                                // 컬러 값 추출
                                const savedMenuColor = saved.content?.menu_color || ''
                                const savedSubtitleColor = saved.content?.subtitle_color || ''
                                const savedDetailMenuColor = saved.content?.detail_menu_color || ''
                                const savedBodyColor = saved.content?.body_color || ''
                                
                                // 각 섹션별 웹폰트 적용 (result 페이지와 동일)
                                const menuFontFace = saved.content?.menu_font_face || saved.content?.font_face || '' // 하위 호환성
                                const subtitleFontFace = saved.content?.subtitle_font_face || saved.content?.font_face || '' // 하위 호환성
                                const detailMenuFontFace = saved.content?.detail_menu_font_face || saved.content?.font_face || '' // 하위 호환성
                                const bodyFontFace = saved.content?.body_font_face || saved.content?.font_face || '' // 하위 호환성
                                
                                // @font-face에서 font-family 추출
                                const extractFontFamily = (fontFaceCss: string): string | null => {
                                  if (!fontFaceCss) return null
                                  const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
                                  return match ? (match[1] || match[2]?.trim()) : null
                                }
                                
                                const menuFontFamily = extractFontFamily(menuFontFace)
                                const subtitleFontFamily = extractFontFamily(subtitleFontFace)
                                const detailMenuFontFamily = extractFontFamily(detailMenuFontFace)
                                const bodyFontFamily = extractFontFamily(bodyFontFace)
                                
                                // 하위 호환성을 위한 전체 폰트 (font_face)
                                const fontFace = saved.content?.font_face || ''
                                const fontFamilyName = extractFontFamily(fontFace)

                                // result 페이지와 완전히 동일한 동적 스타일 (각 섹션별 웹폰트 적용)
                                const savedDynamicStyles = `
                                  ${menuFontFace ? menuFontFace : ''}
                                  ${subtitleFontFace ? subtitleFontFace : ''}
                                  ${detailMenuFontFace ? detailMenuFontFace : ''}
                                  ${bodyFontFace ? bodyFontFace : ''}
                                  ${!menuFontFace && !subtitleFontFace && !detailMenuFontFace && !bodyFontFace && fontFace ? fontFace : ''}
                                  ${menuFontFamily ? `
                                  .jeminai-results .menu-title {
                                    font-family: '${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  ` : ''}
                                  ${subtitleFontFamily ? `
                                  .jeminai-results .subtitle-title {
                                    font-family: '${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  ` : ''}
                                  ${detailMenuFontFamily ? `
                                  .jeminai-results .detail-menu-title {
                                    font-family: '${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  ` : ''}
                                  ${bodyFontFamily ? `
                                  .jeminai-results .subtitle-content,
                                  .jeminai-results .detail-menu-content {
                                    font-family: '${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
                                  }
                                  ` : ''}
                                  ${fontFamilyName && !menuFontFamily && !subtitleFontFamily && !detailMenuFontFamily && !bodyFontFamily ? `
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
                                    font-size: ${savedMenuFontSize}px !important;
                                    font-weight: ${savedMenuFontBold ? 'bold' : 'normal'} !important;
                                    ${savedMenuColor ? `color: ${savedMenuColor} !important;` : ''}
                                  }
                                  .jeminai-results .subtitle-title {
                                    font-size: ${savedSubtitleFontSize}px !important;
                                    font-weight: ${savedSubtitleFontBold ? 'bold' : 'normal'} !important;
                                    ${savedSubtitleColor ? `color: ${savedSubtitleColor} !important;` : ''}
                                  }
                                  .jeminai-results .detail-menu-title {
                                    font-size: ${savedDetailMenuFontSize}px !important;
                                    font-weight: ${savedDetailMenuFontBold ? 'bold' : 'normal'} !important;
                                    ${savedDetailMenuColor ? `color: ${savedDetailMenuColor} !important;` : ''}
                                  }
                                  .jeminai-results .subtitle-content {
                                    font-size: ${savedBodyFontSize}px !important;
                                    font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important;
                                    margin-bottom: 2em !important;
                                    line-height: 1.8 !important;
                                    ${savedBodyColor ? `color: ${savedBodyColor} !important;` : ''}
                                  }
                                  .jeminai-results .detail-menu-content {
                                    font-size: ${savedBodyFontSize}px !important;
                                    font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important;
                                    line-height: 1.8 !important;
                                    margin-bottom: 0 !important;
                                    ${savedBodyColor ? `color: ${savedBodyColor} !important;` : ''}
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
                                `
                                
                                // 하위 호환성을 위한 전체 폰트 스타일 (각 섹션별 폰트가 없을 때만 적용)
                                const fontStyles = fontFamilyName && !menuFontFamily && !subtitleFontFamily && !detailMenuFontFamily && !bodyFontFamily ? `
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

                                newWindow!.document.write(`
                                  <!DOCTYPE html>
                                  <html>
                                  <head>
                                    <meta charset="UTF-8">
                                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                                    <title>${saved.title}</title>
                                    <style>
                                      ${savedDynamicStyles}
                                      ${fontStyles}
                                      body {
                                        font-family: ${(fontFamilyName && !menuFontFamily && !subtitleFontFamily && !detailMenuFontFamily && !bodyFontFamily) ? `'${fontFamilyName}', ` : ''}-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                                        max-width: 896px;
                                        margin: 0 auto;
                                        padding: 32px 16px;
                                        background: #f9fafb;
                                      }
                                      .jeminai-results {
                                        font-family: ${(fontFamilyName && !menuFontFamily && !subtitleFontFamily && !detailMenuFontFamily && !bodyFontFamily) ? `'${fontFamilyName}', ` : ''}-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                                      }
                                      .container {
                                        background: transparent;
                                        padding: 0;
                                      }
                                      .title-container {
                                        text-align: center;
                                        margin-bottom: 16px;
                                      }
                                      .result-title {
                                        font-size: 1.875rem;
                                        font-weight: bold;
                                        margin: 0 0 1rem 0;
                                        color: #111827;
                                        text-align: center;
                                      }
                                      @media (min-width: 768px) {
                                        .result-title {
                                          font-size: 2.25rem;
                                        }
                                      }
                                      .tts-button-container {
                                        text-align: center;
                                        margin-bottom: 1rem;
                                        display: flex;
                                        justify-content: center;
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
                                      .jeminai-results .menu-section {
                                        background: white;
                                        border-radius: 12px;
                                        padding: 24px;
                                        margin-bottom: 24px;
                                        box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                                      }
                                      .jeminai-results .menu-title {
                                        font-size: 20px;
                                        font-weight: bold;
                                        margin-bottom: 16px;
                                        color: #111;
                                      }
                                      .jeminai-results .menu-thumbnail {
                                        width: 100%;
                                        height: auto;
                                        object-fit: contain;
                                        border-radius: 8px;
                                        margin-bottom: 24px;
                                        display: block;
                                      }
                                      .jeminai-results .subtitle-section {
                                        padding-top: 24px;
                                        padding-bottom: 24px;
                                        position: relative;
                                      }
                                      .jeminai-results .subtitle-section:not(:last-child) {
                                        padding-bottom: 24px;
                                        margin-bottom: 24px;
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
                                      .jeminai-results .subtitle-title {
                                        font-size: 18px;
                                        font-weight: 600;
                                        margin-bottom: 12px;
                                        color: #333;
                                      }
                                      .jeminai-results .subtitle-content {
                                        color: #555;
                                        line-height: 1.8;
                                        white-space: pre-line;
                                      }
                                      .jeminai-results .subtitle-thumbnail-container {
                                        display: flex;
                                        justify-content: center;
                                        width: 50%;
                                        margin-left: auto;
                                        margin-right: auto;
                                        margin-top: 8px;
                                        margin-bottom: 8px;
                                      }
                                      .jeminai-results .subtitle-thumbnail-container img {
                                        width: 100%;
                                        height: auto;
                                        display: block;
                                        border-radius: 8px;
                                        object-fit: contain;
                                      }
                                      .jeminai-results .detail-menu-thumbnail-container {
                                        display: flex;
                                        justify-content: center;
                                        width: 50%;
                                        margin-left: auto;
                                        margin-right: auto;
                                        margin-top: 8px;
                                        margin-bottom: 8px;
                                      }
                                      .jeminai-results .detail-menu-thumbnail-container img {
                                        width: 100%;
                                        height: auto;
                                        display: block;
                                        border-radius: 8px;
                                        object-fit: contain;
                                      }
                                      .jeminai-results .book-cover-thumbnail-container {
                                        width: 100%;
                                        margin-bottom: 2.5rem;
                                        display: flex;
                                        justify-content: center;
                                      }
                                      .jeminai-results .book-cover-thumbnail-container img {
                                        width: calc(100% - 48px);
                                        max-width: calc(100% - 48px);
                                        height: auto;
                                        object-fit: contain;
                                        display: block;
                                      }
                                      .jeminai-results .ending-book-cover-thumbnail-container {
                                        width: 100%;
                                        margin-top: 1rem;
                                        display: flex;
                                        justify-content: center;
                                      }
                                      .jeminai-results .ending-book-cover-thumbnail-container img {
                                        width: 100%;
                                        height: auto;
                                        object-fit: contain;
                                        display: block;
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
                                        <h1 class="result-title">${saved.title}</h1>
                                      </div>
                                      ${safeBookCoverHtml}
                                      <div class="tts-button-container">
                                        <button id="ttsButton" class="tts-button">
                                          <span id="ttsIcon">🔊</span>
                                          <span id="ttsText">점사 듣기</span>
                                        </button>
                                      </div>
                                      ${safeTocHtml}
                                      <div id="contentHtml" class="jeminai-results">${safeHtml}</div>
                                    </div>
                                    ${safeBannerHtml}
                                    
                                    <script>
                                      // 동영상 썸네일 추가 (result 페이지와 동일한 로직)
                                      (function() {
                                        try {
                                          const menuItems = ${menuItemsJson}
                                          const contentHtmlEl = document.getElementById('contentHtml')
                                          function getBucketUrlFromImage(imageUrl) {
                                            const envSupabaseUrl = '${process.env.NEXT_PUBLIC_SUPABASE_URL || ''}'
                                            if (envSupabaseUrl) return envSupabaseUrl + '/storage/v1/object/public/thumbnails'
                                            if (imageUrl && imageUrl.indexOf('/storage/v1/object/public/thumbnails/') !== -1) {
                                              return imageUrl.split('/storage/v1/object/public/thumbnails/')[0] + '/storage/v1/object/public/thumbnails'
                                            }
                                            return ''
                                          }

                                          function bindInlineVideo(videoEl, imgEl, clickEl) {
                                            if (!videoEl) return
                                            try {
                                              videoEl.style.display = 'block'
                                              videoEl.style.visibility = 'hidden'
                                              videoEl.style.opacity = '0'
                                              videoEl.muted = true
                                              videoEl.loop = true
                                              videoEl.autoplay = true
                                              videoEl.playsInline = true
                                            } catch (e) {}

                                            function showVideo() {
                                              try {
                                                if (imgEl) imgEl.style.display = 'none'
                                                videoEl.style.visibility = 'visible'
                                                videoEl.style.opacity = '1'
                                              } catch (e) {}
                                            }
                                            function tryPlay() {
                                              try {
                                                showVideo()
                                                const p = videoEl.play()
                                                if (p && p.catch) p.catch(function() {})
                                              } catch (e) {}
                                            }

                                            try {
                                              videoEl.addEventListener('playing', showVideo)
                                              videoEl.addEventListener('canplay', tryPlay)
                                              videoEl.addEventListener('loadeddata', tryPlay)
                                            } catch (e) {}

                                            try {
                                              if (clickEl) {
                                                clickEl.style.cursor = 'pointer'
                                                clickEl.addEventListener('click', tryPlay)
                                              }
                                            } catch (e) {}

                                            try { videoEl.load() } catch (e) {}
                                            setTimeout(function() { tryPlay() }, 150)
                                          }

                                          function ensureThumb(containerEl, imgId, videoId, imageUrl, videoBaseName, isDetail) {
                                            if (!containerEl) return
                                            if (!imageUrl) return

                                            // 300x300 + contain (result 화면과 동일한 UX)
                                            containerEl.className = isDetail ? 'detail-menu-thumbnail-container' : 'subtitle-thumbnail-container'
                                            containerEl.style.cssText = 'display: flex; justify-content: center; align-items: center; width: 300px; height: 300px; margin-left: auto; margin-right: auto; margin-top: 8px; margin-bottom: 8px; background: #f3f4f6; border-radius: 8px; overflow: hidden;'

                                            const wrapper = document.createElement('div')
                                            wrapper.style.cssText = 'position: relative; width: 100%; height: 100%;'

                                            const imgEl = document.createElement('img')
                                            imgEl.id = imgId
                                            imgEl.src = imageUrl
                                            imgEl.alt = isDetail ? '상세메뉴 썸네일' : '소제목 썸네일'
                                            imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; display: block;'
                                            wrapper.appendChild(imgEl)

                                            if (videoBaseName) {
                                              const videoEl = document.createElement('video')
                                              videoEl.id = videoId
                                              videoEl.poster = imageUrl
                                              videoEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain;'
                                              videoEl.setAttribute('muted', '')
                                              videoEl.setAttribute('loop', '')
                                              videoEl.setAttribute('playsInline', '')
                                              videoEl.setAttribute('preload', 'auto')
                                              videoEl.setAttribute('autoPlay', '')

                                              const sourceEl = document.createElement('source')
                                              sourceEl.type = 'video/webm'
                                              sourceEl.src = getBucketUrlFromImage(imageUrl) + '/' + videoBaseName + '.webm'
                                              videoEl.appendChild(sourceEl)
                                              wrapper.appendChild(videoEl)

                                              bindInlineVideo(videoEl, imgEl, containerEl)
                                            }

                                            containerEl.appendChild(wrapper)
                                          }

                                          if (contentHtmlEl && menuItems && menuItems.length > 0) {
                                            const menuSections = Array.from(contentHtmlEl.querySelectorAll('.menu-section'))
                                            menuSections.forEach(function(section, menuIndex) {
                                              section.id = 'menu-' + menuIndex
                                              const menuItem = menuItems[menuIndex]
                                              if (!menuItem || !menuItem.subtitles) return

                                              const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'))
                                              subtitleSections.forEach(function(subSection, subIndex) {
                                                subSection.id = 'subtitle-' + menuIndex + '-' + subIndex
                                                const subtitle = menuItem.subtitles[subIndex]
                                                if (!subtitle) return

                                                // 소메뉴 썸네일
                                                const thumbImg = subtitle.thumbnail_image_url || subtitle.thumbnail || ''
                                                const thumbVideo = subtitle.thumbnail_video_url || ''
                                                if (thumbImg) {
                                                  const titleDiv = subSection.querySelector('.subtitle-title')
                                                  if (titleDiv) {
                                                    const nextEl = titleDiv.nextElementSibling
                                                    if (!nextEl || !nextEl.classList.contains('subtitle-thumbnail-container')) {
                                                      const containerEl = document.createElement('div')
                                                      ensureThumb(
                                                        containerEl,
                                                        'subtitle-thumbnail-img-form-' + menuIndex + '-' + subIndex,
                                                        'subtitle-thumbnail-video-form-' + menuIndex + '-' + subIndex,
                                                        thumbImg,
                                                        thumbVideo,
                                                        false
                                                      )
                                                      titleDiv.parentNode.insertBefore(containerEl, titleDiv.nextSibling)
                                                    }
                                                  }
                                                }

                                                // 상세메뉴 썸네일
                                                if (subtitle.detailMenus && Array.isArray(subtitle.detailMenus)) {
                                                  const detailTitles = Array.from(subSection.querySelectorAll('.detail-menu-title'))
                                                  detailTitles.forEach(function(titleEl, detailIndex) {
                                                    const detailMenu = subtitle.detailMenus[detailIndex]
                                                    if (!detailMenu) return
                                                    const dImg = detailMenu.thumbnail_image_url || detailMenu.thumbnail || ''
                                                    const dVideo = detailMenu.thumbnail_video_url || ''
                                                    if (!dImg) return
                                                    const nextEl = titleEl.nextElementSibling
                                                    if (nextEl && nextEl.classList.contains('detail-menu-thumbnail-container')) return

                                                    const containerEl = document.createElement('div')
                                                    ensureThumb(
                                                      containerEl,
                                                      'detail-menu-thumbnail-img-form-' + menuIndex + '-' + subIndex + '-' + detailIndex,
                                                      'detail-menu-thumbnail-video-form-' + menuIndex + '-' + subIndex + '-' + detailIndex,
                                                      dImg,
                                                      dVideo,
                                                      true
                                                    )
                                                    titleEl.parentNode.insertBefore(containerEl, titleEl.nextSibling)
                                                  })
                                                }
                                              })
                                            })
                                          }
                                          
                                          // 북커버/엔딩북커버 동영상 처리: 두 커버를 "완전히 같은 방식"으로 초기화한다.
                                          const bookCoverThumbnailImageUrl = ${JSON.stringify(saved.content?.book_cover_thumbnail || '')}
                                          const bookCoverThumbnailVideoUrl = ${JSON.stringify(saved.content?.book_cover_thumbnail_video || '')}
                                          const endingBookCoverThumbnailImageUrl = ${JSON.stringify(saved.content?.ending_book_cover_thumbnail || '')}
                                          const endingBookCoverThumbnailVideoUrl = ${JSON.stringify(saved.content?.ending_book_cover_thumbnail_video || '')}

                                          function ensureCoverVideo(containerSelector, imgId, videoId, imageUrl, videoBaseName) {
                                            const container = document.querySelector(containerSelector)
                                            if (!container) return
                                            if (!imageUrl || !videoBaseName) return

                                            // 높이/비율 보장 (둘 다 동일)
                                            try {
                                              container.style.width = '100%'
                                              if (!container.style.aspectRatio) container.style.aspectRatio = '9 / 16'
                                              container.style.overflow = 'hidden'
                                              if (!container.style.borderRadius) container.style.borderRadius = '8px'
                                              container.style.cursor = 'pointer'
                                            } catch (e) {}

                                            // wrapper 보장
                                            let wrapper = container.querySelector('.cover-media-wrapper')
                                            if (!wrapper) {
                                              wrapper = document.createElement('div')
                                              wrapper.className = 'cover-media-wrapper'
                                              wrapper.style.cssText = 'position: relative; width: 100%; height: 100%;'
                                              while (container.firstChild) wrapper.appendChild(container.firstChild)
                                              container.appendChild(wrapper)
                                            }

                                            // img 보장
                                            let imgEl = wrapper.querySelector('#' + imgId)
                                            if (!imgEl) {
                                              const anyImg = wrapper.querySelector('img')
                                              if (anyImg) {
                                                anyImg.id = imgId
                                                imgEl = anyImg
                                              } else {
                                                const img = document.createElement('img')
                                                img.id = imgId
                                                img.src = imageUrl
                                                img.alt = '커버 썸네일'
                                                img.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px; display: block;'
                                                wrapper.appendChild(img)
                                                imgEl = img
                                              }
                                            }
                                            try {
                                              imgEl.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px; display: block;'
                                            } catch (e) {}

                                            // video 보장
                                            let videoEl = wrapper.querySelector('#' + videoId)
                                            if (!videoEl) {
                                              const v = document.createElement('video')
                                              v.id = videoId
                                              v.poster = imageUrl
                                              v.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; border-radius: 8px;'
                                              v.setAttribute('muted', '')
                                              v.setAttribute('loop', '')
                                              v.setAttribute('playsInline', '')
                                              v.setAttribute('preload', 'auto')
                                              v.setAttribute('autoPlay', '')

                                              const sourceEl = document.createElement('source')
                                              sourceEl.type = 'video/webm'
                                              sourceEl.src = getBucketUrlFromImage(imageUrl) + '/' + videoBaseName + '.webm'
                                              v.appendChild(sourceEl)

                                              wrapper.appendChild(v)
                                              videoEl = v
                                            } else {
                                              // source 강제 동기화
                                              try {
                                                const expectedSrc = getBucketUrlFromImage(imageUrl) + '/' + videoBaseName + '.webm'
                                                let sourceEl = videoEl.querySelector('source')
                                                if (!sourceEl) {
                                                  sourceEl = document.createElement('source')
                                                  sourceEl.type = 'video/webm'
                                                  videoEl.appendChild(sourceEl)
                                                }
                                                sourceEl.src = expectedSrc
                                              } catch (e) {}
                                            }

                                            // 로딩 최적화: display:none 금지 (둘 다 동일)
                                            try {
                                              videoEl.style.display = 'block'
                                              videoEl.style.visibility = 'hidden'
                                              videoEl.style.opacity = '0'
                                              videoEl.muted = true
                                              videoEl.loop = true
                                              videoEl.autoplay = true
                                              videoEl.playsInline = true
                                            } catch (e) {}

                                            function showVideo() {
                                              try {
                                                if (imgEl) imgEl.style.display = 'none'
                                                videoEl.style.visibility = 'visible'
                                                videoEl.style.opacity = '1'
                                              } catch (e) {}
                                            }
                                            function tryPlay() {
                                              try {
                                                showVideo()
                                                const p = videoEl.play()
                                                if (p && p.catch) p.catch(function() {})
                                              } catch (e) {}
                                            }

                                            videoEl.addEventListener('playing', showVideo)
                                            videoEl.addEventListener('canplay', tryPlay)
                                            videoEl.addEventListener('loadeddata', tryPlay)
                                            container.addEventListener('click', tryPlay)

                                            try { videoEl.load() } catch (e) {}
                                            setTimeout(function() {
                                              tryPlay()
                                            }, 150)
                                          }

                                          function initCovers() {
                                            // book cover
                                            ensureCoverVideo(
                                              '.book-cover-thumbnail-container',
                                              'book-cover-thumbnail-img-form',
                                              'book-cover-thumbnail-video-form',
                                              bookCoverThumbnailImageUrl,
                                              bookCoverThumbnailVideoUrl
                                            )
                                            // ending cover
                                            ensureCoverVideo(
                                              '.ending-book-cover-thumbnail-container',
                                              'ending-book-cover-thumbnail-img-form',
                                              'ending-book-cover-thumbnail-video-form',
                                              endingBookCoverThumbnailImageUrl,
                                              endingBookCoverThumbnailVideoUrl
                                            )
                                          }

                                          if (document.readyState === 'loading') {
                                            document.addEventListener('DOMContentLoaded', function() { setTimeout(initCovers, 0) })
                                          } else {
                                            setTimeout(initCovers, 0)
                                          }
                                          window.addEventListener('load', function() { setTimeout(initCovers, 200) })
                                        } catch (e) {
                                          console.error('동영상 썸네일 추가 실패:', e)
                                        }
                                      })()
                                    </script>
                                    
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
                                        shouldStop = true;
                                        
                                        // 모든 오디오 즉시 중지
                                        if (currentAudio) {
                                          try {
                                            currentAudio.pause();
                                            currentAudio.currentTime = 0;
                                            const url = currentAudio.src;
                                            if (url && url.startsWith('blob:')) {
                                              URL.revokeObjectURL(url);
                                            }
                                            currentAudio = null;
                                          } catch (e) {
                                            currentAudio = null;
                                          }
                                        }
                                        
                                        // 모든 오디오 요소 찾아서 중지 (안전장치)
                                        try {
                                          const allAudios = document.querySelectorAll('audio');
                                          allAudios.forEach(audio => {
                                            if (!audio.paused) {
                                              audio.pause();
                                              audio.currentTime = 0;
                                            }
                                          });
                                        } catch (e) {
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
                                          if (typeof window !== 'undefined' && (window as any).showAlertMessage) {
                                            (window as any).showAlertMessage('버튼을 찾을 수 없습니다.');
                                          }
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
                                            if (typeof window !== 'undefined' && (window as any).showAlertMessage) {
                                              (window as any).showAlertMessage('내용을 찾을 수 없습니다.');
                                            }
                                            return;
                                          }
                                          
                                          const textContent = extractTextFromHtml(contentHtml.innerHTML);

                                          if (!textContent.trim()) {
                                            isPlaying = false;
                                            button.disabled = false;
                                            icon.textContent = '🔊';
                                            text.textContent = '점사 듣기';
                                            if (typeof window !== 'undefined' && (window as any).showAlertMessage) {
                                              (window as any).showAlertMessage('읽을 내용이 없습니다.');
                                            }
                                            return;
                                          }
                                          
                                          // TTS 설정 가져오기 (result 페이지와 동일한 로직)
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
                                                typecastVoiceId = String(ttsJson.typecast_voice_id || '').trim() || typecastVoiceId;
                                              }
                                            }
                                          } catch (e) {}
                                          
                                          // content.id가 있으면 Supabase에서 최신 화자 정보 조회
                                          if (window.savedContentId) {
                                            try {
                                              const response = await fetch('/api/content/' + window.savedContentId);
                                              
                                              if (response.ok) {
                                                const data = await response.json();
                                                if (data.tts_speaker) {
                                                  speaker = data.tts_speaker;
                                                  window.savedContentSpeaker = speaker; // 전역 변수 업데이트
                                                }
                                                // 컨텐츠는 타입캐스트를 "명시한 경우에만" 전역 설정을 override
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
                                              }
                                            } catch (error) {
                                              // 조회 실패 시 기존 값 사용
                                              speaker = window.savedContentSpeaker || 'nara';
                                            }
                                          }

                                          // 텍스트를 2000자 단위로 분할
                                          const maxLength = 2000;
                                          const chunks = splitTextIntoChunks(textContent, maxLength);

                                          // 다음 청크를 미리 로드하는 함수 (result 페이지와 동일)
                                          const preloadNextChunk = async (chunkIndex) => {
                                            if (chunkIndex >= chunks.length || shouldStop) {
                                              return null;
                                            }

                                            try {
                                              const chunk = chunks[chunkIndex];
                                              
                                              // 로드 전에 shouldStop 재확인
                                              if (shouldStop) {
                                                return null;
                                              }

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

                                              // 응답 받은 후에도 shouldStop 재확인
                                              if (shouldStop) {
                                                return null;
                                              }

                                              if (!response.ok) {
                                                const error = await response.json();
                                                throw new Error(error.error || '청크 ' + (chunkIndex + 1) + ' 음성 변환에 실패했습니다.');
                                              }

                                              const audioBlob = await response.blob();
                                              
                                              // Blob 생성 후에도 shouldStop 재확인
                                              if (shouldStop) {
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
                                                  reject(new Error('청크 ' + (chunkIndex + 1) + ' 로드 실패'));
                                                };
                                                audio.load();
                                              });

                                              // 로드 완료 후에도 shouldStop 재확인
                                              if (shouldStop) {
                                                URL.revokeObjectURL(url);
                                                return null;
                                              }

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
                                              const timeout = setTimeout(() => {
                                                currentAudioElement.pause();
                                                URL.revokeObjectURL(currentUrl);
                                                currentAudio = null;
                                                reject(new Error('청크 ' + (i + 1) + ' 재생 타임아웃'));
                                              }, 300000); // 5분
                                              
                                              // shouldStop 체크를 위한 인터벌 (재생 중 주기적으로 체크)
                                              const stopCheckInterval = setInterval(() => {
                                                if (shouldStop) {
                                                  clearInterval(stopCheckInterval);
                                                  clearTimeout(timeout);
                                                  try {
                                                    currentAudioElement.pause();
                                                    currentAudioElement.currentTime = 0;
                                                  } catch (e) {
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
                                                cleanup();
                                                resolve();
                                              };
                                              
                                              currentAudioElement.onerror = (e) => {
                                                cleanup();
                                                // 에러가 발생해도 다음 청크로 계속 진행
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
                                          
                                          if (typeof window !== 'undefined' && (window as any).showAlertMessage) {
                                            (window as any).showAlertMessage(error?.message || '음성 변환에 실패했습니다.');
                                          }
                                          
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
                                      
                                      // 버튼에 이벤트 리스너 연결
                                      function connectTTSButton() {
                                        const ttsButton = document.getElementById('ttsButton');
                                        if (ttsButton) {
                                          
                                          // 기존 onclick 핸들러 제거 (있다면)
                                          ttsButton.onclick = null;
                                          
                                          // 새 핸들러 설정
                                          ttsButton.onclick = function(e) {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            
                                            // 재생 중이면 중지
                                            if (isPlaying) {
                                              if (typeof stopTextToSpeech === 'function') {
                                                stopTextToSpeech();
                                              } else if (typeof window.stopTextToSpeech === 'function') {
                                                window.stopTextToSpeech();
                                              } else {
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
                                              if (typeof window !== 'undefined' && (window as any).showAlertMessage) {
                                                (window as any).showAlertMessage('음성 재생 기능을 초기화하는 중 오류가 발생했습니다.');
                                              }
                                            }
                                          };
                                          
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
                                        usedQuestionCounts = {};
                                      }
                                      
                                      // 질문하기 버튼 추가 함수
                                      function addQuestionButtons() {
                                        const contentHtml = document.getElementById('contentHtml');
                                        if (!contentHtml) {
                                          return false;
                                        }
                                        
                                        // 실제 DOM에서 menu-section 찾기
                                        const menuSections = contentHtml.querySelectorAll('.menu-section');
                                        
                                        if (menuSections.length === 0) {
                                          return false;
                                        }
                                        
                                        let buttonsAdded = 0;
                                        menuSections.forEach((menuSection, index) => {
                                          // 이미 버튼이 있으면 건너뛰기
                                          if (menuSection.querySelector('.question-button-container')) {
                                            return;
                                          }
                                          
                                          const menuTitleEl = menuSection.querySelector('.menu-title');
                                          const menuTitle = menuTitleEl?.textContent?.trim() || '';
                                          
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
                                            
                                            // 재미나이 응답 디버그 정보 표시
                                            if (error.debug) {
                                            }
                                            
                                            throw new Error(error.error || '답변 생성에 실패했습니다.');
                                          }
                                          
                                          const data = await response.json();
                                          
                                          if (!data.answer) {
                                            throw new Error('답변을 받지 못했습니다.');
                                          }
                                          
                                          // 질문 횟수 증가 및 저장 (메뉴별)
                                          const newCount = currentCount + 1;
                                          usedQuestionCounts[currentMenuTitle] = newCount;
                                          
                                          try {
                                            localStorage.setItem('question_counts_' + ${JSON.stringify(saved.id)}, JSON.stringify(usedQuestionCounts));
                                          } catch (e) {
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
                                        
                                        // 여러 번 재시도하는 함수
                                        let retryCount = 0;
                                        const maxRetries = 10;
                                        
                                        const tryAddButtons = () => {
                                          const success = addQuestionButtons();
                                          
                                          if (!success && retryCount < maxRetries) {
                                            retryCount++;
                                            // 점진적으로 지연 시간 증가 (200ms, 400ms, 600ms, ...)
                                            setTimeout(tryAddButtons, 200 * retryCount);
                                          } else if (success) {
                                          } else {
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
                                          setTimeout(initQuestionButtons, 100);
                                        });
                                      }
                                      
                                      // 2. window.onload
                                      window.addEventListener('load', function() {
                                        setTimeout(initQuestionButtons, 100);
                                      });
                                      
                                      // 3. 즉시 실행 시도 (이미 로드된 경우)
                                      if (document.readyState !== 'loading') {
                                        setTimeout(initQuestionButtons, 300);
                                      }
                                      
                                      // 4. 추가 안전장치: 일정 시간 후에도 재시도
                                      setTimeout(function() {
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
                                            initQuestionButtons();
                                          }
                                        }
                                      }, 2000); // 2초 후 확인
                                      
                                      // 전역 함수 할당 (onclick 핸들러가 작동하도록)
                                      window.closeQuestionPopup = closeQuestionPopup;
                                      window.handleQuestionSubmit = handleQuestionSubmit;
                                      window.initQuestionButtons = initQuestionButtons;
                                      
                                      // document.write() 후 DOM이 완전히 로드되도록 보장
                                      if (document.readyState === 'complete') {
                                        setTimeout(initQuestionButtons, 100);
                                      } else {
                                        window.addEventListener('load', function() {
                                          setTimeout(initQuestionButtons, 100);
                                        });
                                      }
                                    </script>
                                  </body>
                                  </html>
                                `)
                                newWindow!.document.close()
                                
                                // document.close() 후에도 버튼 추가 및 TTS 버튼 연결 시도 (안전장치)
                                // 주의: initTTSButton은 내부에서 이미 한 번만 실행되도록 보장되므로
                                // 외부에서 다시 호출해도 중복 등록되지 않습니다.
                                setTimeout(() => {
                                  try {
                                    if (newWindow?.document.readyState === 'complete') {
                                      const windowWithCustomProps = newWindow as Window & {
                                        initQuestionButtons?: () => void
                                      }
                                      if (windowWithCustomProps.initQuestionButtons) {
                                        windowWithCustomProps.initQuestionButtons();
                                      }
                                      // TTS 버튼은 내부에서 이미 초기화되므로 외부 호출 불필요
                                      // 필요시에만 호출 (중복 방지 로직이 내부에 있음)
                                    }
                                  } catch (e) {
                                  }
                                }, 500)
                              }
                            } catch (e) {
                              showAlertMessage('저장된 결과를 불러오는데 실패했습니다.')
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
