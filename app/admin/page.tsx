'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getContents, deleteContent } from '@/lib/supabase-admin'
import AdminReviewEventModal from '@/components/AdminReviewEventModal'
import PaymentStatsDashboard from '@/components/PaymentStatsDashboard'
import TrafficStatsDashboard from '@/components/TrafficStatsDashboard'

export default function AdminPage() {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [selectedModel, setSelectedModel] = useState<string | null>(null) // null로 초기화하여 로딩 상태 구분
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null)
  const [selectedTtsProvider, setSelectedTtsProvider] = useState<'naver' | 'typecast' | null>(null)
  const [selectedTypecastVoiceId, setSelectedTypecastVoiceId] = useState<string | null>(null)
  const [devUnlockPassword, setDevUnlockPassword] = useState('')
  const [devUnlockPasswordConfirm, setDevUnlockPasswordConfirm] = useState('')
  const [devUnlockPasswordSet, setDevUnlockPasswordSet] = useState(false)
  const [devUnlockSaving, setDevUnlockSaving] = useState(false)
  const [devUnlockDurationMinutes, setDevUnlockDurationMinutes] = useState<string>('60')
  const [devUnlockHideEnabled, setDevUnlockHideEnabled] = useState(false)
  const [devUnlockHideSaving, setDevUnlockHideSaving] = useState(false)
  const [homeHtml, setHomeHtml] = useState<string>('')
  const [showHomeHtmlModal, setShowHomeHtmlModal] = useState(false)
  const [showHomeHtmlPreview, setShowHomeHtmlPreview] = useState(false)
  const [homeHtmlPreviewMode, setHomeHtmlPreviewMode] = useState<'pc' | 'mobile'>('pc')
  const homeHtmlPreviewIframeRef = useRef<HTMLIFrameElement>(null)
  const [homeHtmlDraft, setHomeHtmlDraft] = useState<string>('')
  const [homeBgColor, setHomeBgColor] = useState<string>('')
  const [homeBgColorDraft, setHomeBgColorDraft] = useState<string>('')
  const [homeHtmlImages, setHomeHtmlImages] = useState<string[]>(['']) // 최소 1개
  const [uploadingImageIndex, setUploadingImageIndex] = useState<number | null>(null)
  const showHomeHtmlModalRef = useRef(false)

  // HTML에서 추출한 img src는 &amp; 같은 엔티티가 포함될 수 있음.
  // iframe(srcDoc)에서는 브라우저가 엔티티를 디코딩하지만,
  // React <img src={...}>에서는 문자열이 그대로 들어가 URL이 깨질 수 있어 디코딩한다.
  const decodeHtmlEntities = (value: string) => {
    return String(value || '')
      .replace(/&amp;/g, '&')
      .replace(/&#38;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
  }

  const extractImageUrlsFromHtml = (html: string): string[] => {
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
    const extracted: string[] = []
    let match
    while ((match = imgRegex.exec(html)) !== null) {
      const url = decodeHtmlEntities(match[1]).trim()
      if (url) extracted.push(url)
    }
    return extracted
  }

  const syncHomeHtmlImagesFromDraft = (draft: string) => {
    const extracted = extractImageUrlsFromHtml(draft)
    if (extracted.length === 0) return

    // 동일하면 불필요한 setState 방지
    const current = homeHtmlImages.map((x) => String(x || '').trim()).filter(Boolean)
    const next = extracted
    const isSame =
      current.length === next.length && current.every((v, i) => v === next[i])

    if (!isSame) {
      setHomeHtmlImages(next.length > 0 ? next : [''])
    }
  }

  // ✅ 다른 탭에서 URL 복사 후 돌아오면 focus 이벤트가 발생하는데,
  // 이때 DB값으로 draft를 덮어쓰면 "기존 코딩이 사라짐"처럼 보임.
  // 모달이 열려있는 동안엔 draft를 절대 덮어쓰지 않도록 ref로 보호한다.
  useEffect(() => {
    showHomeHtmlModalRef.current = showHomeHtmlModal
  }, [showHomeHtmlModal])

  // 리뷰 관리 상태
  const [showReviewModal, setShowReviewModal] = useState(false)
  
  // 리뷰 이벤트 관리 상태
  const [showReviewEventModal, setShowReviewEventModal] = useState(false)
  const [selectedEventContent, setSelectedEventContent] = useState<{ id: number; content_name: string } | null>(null)
  const [selectedContentId, setSelectedContentId] = useState<number | null>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [loadingReviews, setLoadingReviews] = useState(false)
  const [expandedReviewImage, setExpandedReviewImage] = useState<string | null>(null)

  // 문의 관리 상태
  const [showInquiryModal, setShowInquiryModal] = useState(false)
  const [inquiries, setInquiries] = useState<any[]>([])
  const [loadingInquiries, setLoadingInquiries] = useState(false)
  const [showResumeAdminModal, setShowResumeAdminModal] = useState(false)
  const [resumeAdminPhone, setResumeAdminPhone] = useState('')
  const [resumeAdminPassword, setResumeAdminPassword] = useState('')
  const [resumeAdminLoading, setResumeAdminLoading] = useState(false)
  const [resumeAdminResult, setResumeAdminResult] = useState<{
    savedId?: string | null
    requestKey?: string | null
    createdAt?: string | null
    expiresAt?: string | null
  } | null>(null)

  // 결제 통계 대시보드 상태
  const [showPaymentStats, setShowPaymentStats] = useState(false)
  const [showTrafficStats, setShowTrafficStats] = useState(false)
  // 결제 재시도 예외 (24시간 경과 후 허용)
  const [showAllowRetryModal, setShowAllowRetryModal] = useState(false)
  const [allowRetryOid, setAllowRetryOid] = useState('')
  const [allowRetryHours, setAllowRetryHours] = useState(24)
  const [allowRetryLoading, setAllowRetryLoading] = useState(false)
  const [allowRetryMessage, setAllowRetryMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // 홈html 조회 (리뷰이벤트와 동일한 방식 - POST로 캐시 우회)
  const loadHomeHtml = async () => {
    try {
      const response = await fetch('/api/admin/home-html', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({})
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any))
        const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
        alert(`홈 HTML 불러오기 실패: ${msg}\n\n(프로덕션에서 저장/조회 환경변수 또는 DB 상태를 확인해야 합니다.)`)
        return
      }

      const data = await response.json()
      const loadedHomeHtml = typeof data.home_html === 'string' ? data.home_html : ''
      const loadedHomeBgColor = typeof data.home_bg_color === 'string' ? data.home_bg_color : ''
      setHomeHtml(loadedHomeHtml)
      setHomeBgColor(loadedHomeBgColor)
        
      // HTML에서 이미지 URL 추출 (기존 이미지가 있으면)
      const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
      const extractedImages: string[] = []
      let match
      while ((match = imgRegex.exec(loadedHomeHtml)) !== null) {
          extractedImages.push(decodeHtmlEntities(match[1]).trim())
      }

      // ✅ 편집 중(모달 오픈)에는 draft/image 입력을 덮어쓰지 않는다.
      if (!showHomeHtmlModalRef.current) {
        setHomeHtmlDraft(loadedHomeHtml)
        setHomeBgColorDraft(loadedHomeBgColor)
        setHomeHtmlImages(extractedImages.length > 0 ? extractedImages : [''])
      }
    } catch (error) {
    }
  }

  // 이미지 업로드 핸들러 (공통 함수)
  const handleImageUpload = async (file: File, index: number) => {
    setUploadingImageIndex(index)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '업로드 실패' }))
        throw new Error(errorData.error || '이미지 업로드 실패')
      }

      const result = await response.json()
      if (result.fileType !== 'image') {
        throw new Error('이미지 파일만 업로드할 수 있습니다.')
      }

      const newImages = [...homeHtmlImages]
      newImages[index] = result.url
      setHomeHtmlImages(newImages)
    } catch (error: any) {
      alert(`이미지 업로드 실패: ${error?.message || '알 수 없는 오류'}`)
    } finally {
      setUploadingImageIndex(null)
    }
  }
  const [fortuneViewMode, setFortuneViewMode] = useState<'batch' | 'realtime' | null>(null) // null로 초기화하여 로딩 상태 구분
  const [useSequentialFortune, setUseSequentialFortune] = useState<boolean | null>(null) // null로 초기화하여 로딩 상태 구분

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (authenticated === true) {
      loadContents()
      // 페이지 로드 시 항상 최신 설정을 DB에서 가져오도록 강제 로드
      loadSettings()
      // 홈html은 별도 API로 조회 (리뷰이벤트와 동일한 방식)
      loadHomeHtml()
    }
  }, [authenticated])

  // 페이지 포커스 시 설정 다시 로드 (다른 탭에서 Supabase 설정 변경 시 반영)
  useEffect(() => {
    const handleFocus = () => {
      if (authenticated === true) {
        loadSettings()
        loadHomeHtml()
      }
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [authenticated])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/auth/check')
      const data = await response.json()
      if (data.authenticated) {
        setAuthenticated(true)
      } else {
        setAuthenticated(false)
        router.push('/admin/login')
      }
    } catch (error) {
      setAuthenticated(false)
      router.push('/admin/login')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/login', { method: 'DELETE' })
      router.push('/admin/login')
    } catch (error) {
    }
  }

  const loadSettings = async () => {
    try {
      // 캐시 방지를 위해 타임스탬프와 랜덤 값 추가
      const response = await fetch(`/api/admin/settings/get?t=${Date.now()}&r=${Math.random()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      if (!response.ok) {
        throw new Error(`설정 조회 실패: ${response.status}`)
      }
      const data = await response.json()
      
      // 디버깅: API 응답 확인
      // 모델 설정 (DB에서 가져온 값으로 무조건 업데이트)
      if (data.model !== undefined && data.model !== null) {
        const loadedModel = String(data.model).trim()
        setSelectedModel(loadedModel)
      }
      
      // 화자 설정 (DB에서 가져온 값으로 무조건 업데이트)
      if (data.speaker !== undefined && data.speaker !== null) {
        const loadedSpeaker = String(data.speaker).trim()
        setSelectedSpeaker(loadedSpeaker)
      }

      // TTS 제공자/Typecast voice id
      if (data.tts_provider !== undefined) {
        const loadedProvider = data.tts_provider === 'typecast' ? 'typecast' : 'naver'
        setSelectedTtsProvider(loadedProvider)
      }
      
      if (data.typecast_voice_id !== undefined) {
        const loadedVoiceId = (data.typecast_voice_id && String(data.typecast_voice_id).trim() !== '')
          ? String(data.typecast_voice_id).trim()
          : 'tc_5ecbbc6099979700087711d8'
        setSelectedTypecastVoiceId(loadedVoiceId)
      }

      if (data.dev_unlock_password_set !== undefined) {
        setDevUnlockPasswordSet(Boolean(data.dev_unlock_password_set))
      }
      if (data.dev_unlock_duration_minutes !== undefined && data.dev_unlock_duration_minutes !== null) {
        setDevUnlockDurationMinutes(String(data.dev_unlock_duration_minutes))
      }
      if (data.dev_unlock_hide_enabled !== undefined) {
        setDevUnlockHideEnabled(Boolean(data.dev_unlock_hide_enabled))
      }

      // 홈html은 별도 API로 조회 (리뷰이벤트와 동일한 방식)
      // loadHomeHtml() 함수에서 처리

      // 점사 모드 로드 (DB에서 가져온 값으로 무조건 업데이트)
      if (data.fortune_view_mode !== undefined && data.fortune_view_mode !== null) {
        const loadedFortuneMode = String(data.fortune_view_mode).trim() === 'realtime' ? 'realtime' : 'batch'
        setFortuneViewMode(loadedFortuneMode)
      }

      // use_sequential_fortune 로드 (DB에서 가져온 값으로 무조건 업데이트)
      if (data.use_sequential_fortune !== undefined && data.use_sequential_fortune !== null) {
        // DB 값이 문자열 'true'/'false'일 수도 있으므로 명시적으로 처리
        let loadedUseSequentialFortune: boolean
        if (typeof data.use_sequential_fortune === 'boolean') {
          loadedUseSequentialFortune = data.use_sequential_fortune
        } else if (typeof data.use_sequential_fortune === 'string') {
          loadedUseSequentialFortune = data.use_sequential_fortune.toLowerCase() === 'true'
        } else if (data.use_sequential_fortune === 1 || data.use_sequential_fortune === '1') {
          loadedUseSequentialFortune = true
        } else {
          loadedUseSequentialFortune = false
        }
        setUseSequentialFortune(loadedUseSequentialFortune)
      }
    } catch (error) {
      // 에러 발생 시에도 기본값으로 변경하지 않고 현재 값 유지하되, 사용자에게 알림
      alert('설정을 불러오는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.')
    }
  }

  const loadContents = async () => {
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
      if (result.success && result.data) {
        // id 내림차순으로 정렬 (최신순)
        const sortedData = (result.data || []).sort((a: any, b: any) => (b.id || 0) - (a.id || 0))
        setContents(sortedData)
      } else {
        setContents([])
      }
    } catch (error) {
      setContents([])
    } finally {
      setLoading(false)
    }
  }

  const handleResumeAdminSearch = async () => {
    if (resumeAdminLoading) return
    const normalizedPhone = resumeAdminPhone.replace(/[^0-9]/g, '')
    if (!normalizedPhone || normalizedPhone.length < 8) {
      alert('휴대폰 번호를 정확히 입력해주세요.')
      return
    }
    if (!resumeAdminPassword || resumeAdminPassword.length < 4) {
      alert('비밀번호를 4자리 이상 입력해주세요.')
      return
    }
    setResumeAdminLoading(true)
    try {
      const response = await fetch('/api/admin/user-credentials/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: resumeAdminPhone,
          password: resumeAdminPassword
        })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any))
        const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
        alert(msg)
        return
      }
      const data = await response.json()
      setResumeAdminResult({
        savedId: data?.savedId || null,
        requestKey: data?.requestKey || null,
        createdAt: data?.createdAt || null,
        expiresAt: data?.expiresAt || null
      })
    } catch (error) {
      alert('조회 중 오류가 발생했습니다.')
    } finally {
      setResumeAdminLoading(false)
    }
  }

  const handleAllowRetrySubmit = async () => {
    if (allowRetryLoading) return
    const oid = allowRetryOid.trim()
    if (!oid) {
      setAllowRetryMessage({ type: 'err', text: '주문번호(oid)를 입력해 주세요.' })
      return
    }
    const hours = Number(allowRetryHours)
    if (!Number.isFinite(hours) || hours < 1) {
      setAllowRetryMessage({ type: 'err', text: '허용 시간(시간)을 1 이상 입력해 주세요.' })
      return
    }
    setAllowRetryLoading(true)
    setAllowRetryMessage(null)
    try {
      const res = await fetch('/api/admin/payment/allow-retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oid, hours })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) {
        setAllowRetryMessage({ type: 'ok', text: `허용 완료: ${oid} (${hours}시간)` })
        setAllowRetryOid('')
      } else {
        setAllowRetryMessage({ type: 'err', text: data?.error || '저장에 실패했습니다.' })
      }
    } catch {
      setAllowRetryMessage({ type: 'err', text: '서버 오류가 발생했습니다.' })
    } finally {
      setAllowRetryLoading(false)
    }
  }

  const handleSaveDevUnlockPassword = async () => {
    if (devUnlockSaving) return
    if (devUnlockPassword.trim().length < 4) {
      alert('비밀번호는 4자리 이상이어야 합니다.')
      return
    }
    if (devUnlockPassword !== devUnlockPasswordConfirm) {
      alert('비밀번호가 일치하지 않습니다.')
      return
    }
    const durationNumber = parseInt(devUnlockDurationMinutes, 10)
    if (!Number.isFinite(durationNumber) || durationNumber <= 0) {
      alert('노출 시간(분)을 올바르게 입력해주세요.')
      return
    }
    setDevUnlockSaving(true)
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dev_unlock_password: devUnlockPassword,
          dev_unlock_duration_minutes: durationNumber,
          dev_unlock_hide_enabled: devUnlockHideEnabled
        })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any))
        const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
        throw new Error(msg)
      }
      setDevUnlockPassword('')
      setDevUnlockPasswordConfirm('')
      setDevUnlockPasswordSet(true)
      alert('비밀번호가 저장되었습니다.')
    } catch (error: any) {
      alert(error?.message || '비밀번호 저장에 실패했습니다.')
    } finally {
      setDevUnlockSaving(false)
    }
  }

  const handleSaveDevUnlockHide = async () => {
    if (devUnlockHideSaving) return
    setDevUnlockHideSaving(true)
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dev_unlock_hide_enabled: devUnlockHideEnabled })
      })
      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any))
        const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
        throw new Error(msg)
      }
      alert('감추기 설정이 저장되었습니다.')
    } catch (error: any) {
      alert(error?.message || '감추기 설정 저장에 실패했습니다.')
    } finally {
      setDevUnlockHideSaving(false)
    }
  }

  const copyResumeLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      alert('링크가 복사되었습니다.')
    } catch (e) {
      const textArea = document.createElement('textarea')
      textArea.value = link
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        alert('링크가 복사되었습니다.')
      } catch (err) {
        alert('복사에 실패했습니다. 수동으로 복사해주세요:\n' + link)
      }
      document.body.removeChild(textArea)
    }
  }

  const createResumeCodeLink = async (payload: { savedId?: string; requestKey?: string }) => {
    const response = await fetch('/api/admin/resume-code/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({} as any))
      const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
      throw new Error(msg)
    }
    const data = await response.json()
    const code = data?.code
    if (!code) {
      throw new Error('숏코드 생성에 실패했습니다.')
    }
    return `${getBaseUrl()}/result?resume=${encodeURIComponent(String(code))}`
  }

  const formatPhoneWithPrefix = (input: string) => {
    let value = String(input || '').replace(/[^0-9]/g, '')
    if (!value.startsWith('010')) {
      if (value.length < 3) {
        value = '010'
      } else {
        value = `010${value}`
      }
    }
    if (value.length > 11) {
      value = value.slice(0, 11)
    }
    if (value.length <= 3) return '010-'
    if (value.length <= 7) return `010-${value.slice(3)}`
    return `010-${value.slice(3, 7)}-${value.slice(7)}`
  }

  const getBaseUrl = () => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin
    }
    return ''
  }

  const handleModelChange = async (model: string) => {
    const modelDisplayName = 
      model === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' :
      model === 'gemini-3-pro-preview' ? 'Gemini 3.0 Pro' :
      model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' :
      model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model
    
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model }),
      })
      
      if (!response.ok) {
        throw new Error('모델 저장 실패')
      }
      
      const result = await response.json()
      
      // 저장 응답에서 실제 저장된 값으로 상태 업데이트
      if (result.model) {
        setSelectedModel(result.model)
      }
    } catch (error) {
      alert('모델 저장에 실패했습니다. 콘솔을 확인해주세요.')
    }
  }

  const handleAdd = () => {
    // 선택된 화자 정보를 URL 파라미터로 전달 (null이면 기본값 사용)
    const speaker = selectedSpeaker || 'nara'
    const ttsProvider = selectedTtsProvider || 'naver'
    const typecastVoiceId = selectedTypecastVoiceId || 'tc_5ecbbc6099979700087711d8'
    router.push(`/admin/form?speaker=${speaker}&ttsProvider=${ttsProvider}&typecastVoiceId=${encodeURIComponent(typecastVoiceId)}`)
  }

  const handleFortuneModeChange = async (mode: 'batch' | 'realtime') => {
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fortune_view_mode: mode }),
      })

      if (!response.ok) {
        throw new Error('점사 모드 저장 실패')
      }

      const result = await response.json()
      const savedMode = result.fortune_view_mode === 'realtime' ? 'realtime' : 'batch'
      setFortuneViewMode(savedMode)
    } catch (error) {
      alert('점사 모드 저장에 실패했습니다. 콘솔을 확인해주세요.')
    }
  }

  const handleToggleSequentialFortune = async () => {
    const newValue = !useSequentialFortune
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ use_sequential_fortune: newValue }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({} as any))
        const msg = typeof err?.error === 'string' ? err.error : `HTTP ${response.status}`
        const details = typeof err?.details === 'string' ? err.details : ''
        const hint = typeof err?.hint === 'string' ? err.hint : ''
        throw new Error([msg, details, hint].filter(Boolean).join('\n'))
      }

      const result = await response.json()
      if (result.use_sequential_fortune !== undefined) {
        setUseSequentialFortune(result.use_sequential_fortune)
      }
    } catch (error) {
      const msg = (error as any)?.message ? String((error as any).message) : '점사 방식 저장에 실패했습니다.'
      alert(msg)
    }
  }

  const handleContentClick = (content: any) => {
    router.push(`/admin/form?id=${content.id}`)
  }

  const handleDuplicate = async (e: React.MouseEvent, content: any) => {
    e.stopPropagation() // 클릭 이벤트 전파 방지 (부모 div의 handleContentClick 실행 방지)
    router.push(`/admin/form?duplicate=${content.id}`)
  }

  // 리뷰 이벤트 관리 모달 열기
  const handleOpenReviewEventModal = (e: React.MouseEvent, content: any) => {
    e.stopPropagation()
    setSelectedEventContent({ id: content.id, content_name: content.content_name || '이름 없음' })
    setShowReviewEventModal(true)
  }

  // 리뷰 관리 모달 열기
  const handleOpenReviewModal = async (e: React.MouseEvent, contentId: number) => {
    e.stopPropagation()
    setSelectedContentId(contentId)
    setShowReviewModal(true)
    await loadReviewsForContent(contentId)
  }

  // 리뷰 로드
  const loadReviewsForContent = async (contentId: number) => {
    setLoadingReviews(true)
    try {
      const response = await fetch(`/api/admin/reviews/list?content_id=${contentId}`)
      if (!response.ok) throw new Error('리뷰 조회 실패')
      const data = await response.json()
      setReviews(data.reviews || [])
    } catch (error) {
      alert('리뷰를 불러오는데 실패했습니다.')
      setReviews([])
    } finally {
      setLoadingReviews(false)
    }
  }

  // 리뷰 노출/베스트 지정
  // 문의 관리 모달 열기
  const handleOpenInquiryModal = async () => {
    setShowInquiryModal(true)
    await loadInquiries()
  }

  const loadInquiries = async () => {
    setLoadingInquiries(true)
    try {
      const response = await fetch('/api/admin/inquiries/list')
      const data = await response.json()
      if (data.success) {
        setInquiries(data.inquiries || [])
      } else {
        setInquiries([])
      }
    } catch (error) {
      setInquiries([])
    } finally {
      setLoadingInquiries(false)
    }
  }

  const handleReviewAction = async (reviewId: number, action: 'visible' | 'best', value: boolean) => {
    try {
      const response = await fetch('/api/admin/reviews/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          review_id: reviewId,
          [action === 'visible' ? 'is_visible' : 'is_best']: value
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '업데이트 실패' }))
        throw new Error(errorData.error || '리뷰 업데이트 실패')
      }
      
      // 리뷰 목록 새로고침
      if (selectedContentId) {
        await loadReviewsForContent(selectedContentId)
      }
    } catch (error: any) {
      alert(`리뷰 업데이트 실패: ${error?.message || '알 수 없는 오류'}`)
    }
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">인증 확인 중...</div>
      </div>
    )
  }

  if (authenticated === false) {
    return null // 리다이렉트 중
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 관리 화면을 더 넓게 사용하기 위해 max-w 제한 제거 및 좌우 여백 약간만 유지 */}
      <div className="w-full mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">관리자 컨텐츠 리스트</h1>
            <p className="text-gray-400">컨텐츠를 관리하세요</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors duration-200"
          >
            로그아웃
          </button>
        </div>

        {/* 버튼들 */}
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handleAdd}
              className="bg-pink-500 hover:bg-pink-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-200"
            >
              추가
            </button>
          </div>
          
          {/* 모델/화자/점사모드/모델 선택 토글 */}
          <div className="flex flex-col items-end gap-2 ml-auto">
            {/* 결제 통계 및 문의 관리 버튼 (한 줄) */}
            <div className="flex gap-2 mb-2">
              <button
                onClick={() => setShowPaymentStats(true)}
                className="bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200 shadow-lg"
                title="결제 통계 대시보드"
              >
                💰 결제 통계
              </button>
              <button
                onClick={() => setShowTrafficStats(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200 shadow-lg"
                title="유입 통계 대시보드"
              >
                유입 통계
              </button>
              <button
                onClick={handleOpenInquiryModal}
                className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200"
                title="문의 관리"
              >
                문의 관리
              </button>
              <button
                onClick={() => {
                  setResumeAdminResult(null)
                  setResumeAdminPhone('010-')
                  setResumeAdminPassword('')
                  setShowResumeAdminModal(true)
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200"
                title="점사 재시도 조회"
              >
                재시도 조회
              </button>
              <button
                onClick={() => {
                  setAllowRetryOid('')
                  setAllowRetryHours(24)
                  setAllowRetryMessage(null)
                  setShowAllowRetryModal(true)
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200"
                title="결제 재시도 예외 (24시간 경과 후 허용)"
              >
                재시도 예외 허용
              </button>
            </div>
            
            {/* 병렬점사/직렬점사 토글 */}
            {useSequentialFortune !== null && (
              <div className="flex items-center gap-3 bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-white mb-1">점사 방식</h3>
                  <p className="text-xs text-gray-400">
                    {useSequentialFortune 
                      ? '직렬점사: 상품메뉴 구성 전체를 한 번에 점사 요청' 
                      : '병렬점사: 대메뉴 단위로 순차적 점사 요청 (컨텍스트 유지)'}
                  </p>
                  <p className="text-xs text-yellow-400 font-medium mt-2">
                    ⚠️ 주의: 재회상담은 직렬점사가 최적이니 변경하지 마세요!
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${!useSequentialFortune ? 'text-pink-400' : 'text-gray-400'}`}>
                    병렬
                  </span>
                  <button
                    onClick={handleToggleSequentialFortune}
                    className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-200 ${
                      useSequentialFortune ? 'bg-pink-500' : 'bg-gray-600'
                    } cursor-pointer hover:opacity-90`}
                  >
                    <span
                      className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                        useSequentialFortune ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className={`text-xs font-medium ${useSequentialFortune ? 'text-pink-400' : 'text-gray-400'}`}>
                    직렬
                  </span>
                </div>
              </div>
            )}
            {/* 모델 선택 */}
            {selectedModel !== null && (
              <div className="flex items-center gap-2 mt-2 bg-gray-800 rounded-lg p-2 border border-gray-700">
                <button
                  onClick={() => handleModelChange('gemini-3-flash-preview')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    selectedModel === 'gemini-3-flash-preview'
                      ? 'bg-pink-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Gemini 3.0 Flash
                </button>
                <button
                  onClick={() => handleModelChange('gemini-3-pro-preview')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    selectedModel === 'gemini-3-pro-preview'
                      ? 'bg-pink-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Gemini 3.0 Pro
                </button>
                <button
                  onClick={() => handleModelChange('gemini-2.5-flash')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    selectedModel === 'gemini-2.5-flash'
                      ? 'bg-pink-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Gemini 2.5 Flash
                </button>
                <button
                  onClick={() => handleModelChange('gemini-2.5-pro')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    selectedModel === 'gemini-2.5-pro'
                      ? 'bg-pink-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Gemini 2.5 Pro
                </button>
              </div>
            )}
            <div className="mt-2 bg-gray-800 rounded-lg p-3 border border-gray-700 w-full max-w-xl">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white">폼 임시 결과 버튼 비밀번호</h3>
                <span className={`text-xs ${devUnlockPasswordSet ? 'text-green-400' : 'text-yellow-400'}`}>
                  {devUnlockPasswordSet ? '설정됨' : '미설정'}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={devUnlockPassword}
                  onChange={(e) => setDevUnlockPassword(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  placeholder="비밀번호 (4자리 이상)"
                />
                <input
                  type="text"
                  value={devUnlockPasswordConfirm}
                  onChange={(e) => setDevUnlockPasswordConfirm(e.target.value)}
                  className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  placeholder="비밀번호 확인"
                />
                <input
                  type="number"
                  min="1"
                  value={devUnlockDurationMinutes}
                  onChange={(e) => setDevUnlockDurationMinutes(e.target.value)}
                  className="w-28 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                  placeholder="분"
                />
                <button
                  type="button"
                  onClick={handleSaveDevUnlockPassword}
                  disabled={devUnlockSaving}
                  className="bg-pink-600 hover:bg-pink-700 text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  {devUnlockSaving ? '저장 중...' : '저장'}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-400 space-y-1">
                <div>• 노출 시간은 분 단위로 설정하며, 해당 시간동안 재입력 없이 표시됨</div>
                <div>• 프론트 홈 하단의 “(주)테크앤조이”를 5회 클릭 후 비밀번호를 입력하면 미배포 컨텐츠가 노출됨</div>
                <div>• 미배포 컨텐츠 노출 상태에서 폼 페이지/점사 확인까지 테스트 가능</div>
                <div>• 폼페이지 결제정보 팝업에서 “결제 정보” 타이틀을 5회 클릭 후 비밀번호를 입력하면 “리절트로 이동 (임시)” 버튼이 노출됨</div>
              </div>
              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-gray-300">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={devUnlockHideEnabled}
                    onChange={(e) => setDevUnlockHideEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-700 bg-gray-900 text-pink-500 focus:ring-pink-500"
                  />
                  감추기 (ON이면 노출시간 내에도 임시버튼과 미배포 컨텐츠 노출 숨김)
                </label>
                <button
                  type="button"
                  onClick={handleSaveDevUnlockHide}
                  disabled={devUnlockHideSaving}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-2 rounded-lg disabled:opacity-50"
                >
                  {devUnlockHideSaving ? '저장 중...' : '감추기 저장'}
                </button>
              </div>
            </div>
          </div>

          {/* (이전 위치) 점사 모드 + TTS 설정: 모델 선택 토글 아래로 이동 */}
          {fortuneViewMode !== null && (
            <div className="inline-flex w-fit items-center gap-3 bg-gray-800 rounded-lg p-2 border border-gray-700 mt-2 self-end">
              {/* 점사 모드 토글 */}
              <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">
                <button
                  onClick={() => handleFortuneModeChange('batch')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                    fortuneViewMode === 'batch' ? 'bg-pink-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  한번에 점사
                </button>
                <button
                  onClick={() => handleFortuneModeChange('realtime')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                    fortuneViewMode === 'realtime' ? 'bg-pink-500 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  점진적 점사
                </button>
              </div>

              {/* TTS 화자 선택 드롭다운 */}
              {selectedSpeaker !== null && (
                <select
                  value={selectedSpeaker}
                  onChange={async (e) => {
                    const speaker = e.target.value
                    const speakerNames: { [key: string]: string } = {
                      'nara': '나라 (여성)',
                      'mijin': '미진 (여성)',
                      'nhajun': '나준 (여성)',
                      'ndain': '다인 (여성)',
                      'jinho': '진호 (남성)'
                    }
                    const speakerDisplayName = speakerNames[speaker] || speaker

                    try {
                      const response = await fetch('/api/admin/settings/save', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ speaker }),
                      })
                      
                      if (!response.ok) {
                        throw new Error('화자 저장 실패')
                      }
                      
                      const result = await response.json()
                      
                      // 저장 응답에서 실제 저장된 값으로 상태 업데이트
                      if (result.speaker) {
                        setSelectedSpeaker(result.speaker)
                      }
                    } catch (error) {
                      alert('화자 저장에 실패했습니다. 콘솔을 확인해주세요.')
                    }
                  }}
                  className="bg-gray-800 border border-gray-700 rounded-md px-4 py-2 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 h-[36px] mr-2"
                >
                  <option value="nara">나라 (여성)</option>
                  <option value="mijin">미진 (여성)</option>
                  <option value="nhajun">나준 (여성)</option>
                  <option value="ndain">다인 (여성)</option>
                  <option value="jinho">진호 (남성)</option>
                </select>
              )}

              {/* TTS 제공자 선택 (토글) */}
              {selectedTtsProvider !== null && (
                <div
                  className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg p-1 h-[36px] mr-2"
                  title="TTS 제공자"
                >
                  <button
                    type="button"
                    onClick={async () => {
                      const tts_provider: 'naver' | 'typecast' = 'naver'
                      setSelectedTtsProvider(tts_provider)
                      try {
                        const response = await fetch('/api/admin/settings/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tts_provider }),
                        })
                        if (!response.ok) throw new Error('TTS 제공자 저장 실패')
                        const result = await response.json()
                        const savedProvider = result.tts_provider === 'typecast' ? 'typecast' : 'naver'
                        setSelectedTtsProvider(savedProvider)
                      } catch (error) {
                        alert('TTS 제공자 저장에 실패했습니다. 콘솔을 확인해주세요.')
                      }
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                      selectedTtsProvider === 'naver'
                        ? 'bg-pink-500 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    네이버
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const tts_provider: 'naver' | 'typecast' = 'typecast'
                      setSelectedTtsProvider(tts_provider)
                      try {
                        const response = await fetch('/api/admin/settings/save', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ tts_provider }),
                        })
                        if (!response.ok) throw new Error('TTS 제공자 저장 실패')
                        const result = await response.json()
                        const savedProvider = result.tts_provider === 'typecast' ? 'typecast' : 'naver'
                        setSelectedTtsProvider(savedProvider)
                      } catch (error) {
                        alert('TTS 제공자 저장에 실패했습니다. 콘솔을 확인해주세요.')
                      }
                    }}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors duration-200 ${
                      selectedTtsProvider === 'typecast'
                        ? 'bg-pink-500 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    타입캐스트
                  </button>
                </div>
              )}

              {/* Typecast Voice ID 입력 */}
              {selectedTypecastVoiceId !== null && (
                <input
                  type="text"
                  value={selectedTypecastVoiceId}
                  onChange={(e) => setSelectedTypecastVoiceId(e.target.value)}
                  onBlur={async () => {
                    try {
                      const response = await fetch('/api/admin/settings/save', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ typecast_voice_id: selectedTypecastVoiceId }),
                      })
                      if (!response.ok) throw new Error('Typecast voice id 저장 실패')
                      const result = await response.json()
                      const savedVoiceId = (result.typecast_voice_id && String(result.typecast_voice_id).trim() !== '')
                        ? String(result.typecast_voice_id).trim()
                        : ''
                      setSelectedTypecastVoiceId(savedVoiceId || 'tc_5ecbbc6099979700087711d8')
                    } catch (error) {
                      alert('Typecast voice id 저장에 실패했습니다. 콘솔을 확인해주세요.')
                    }
                  }}
                  placeholder="tc_5ecbbc6099979700087711d8"
                  size={27}
                  className="bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-white text-sm font-medium font-mono focus:outline-none focus:ring-2 focus:ring-pink-500 h-[36px]"
                  title="Typecast Voice ID"
                />
              )}

              <button
                type="button"
                onClick={() => setShowHomeHtmlModal(true)}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-2 rounded-md h-[36px] transition-colors duration-200"
                title="프론트 메뉴 상단 HTML 편집"
              >
                홈 HTML
              </button>
            </div>
          )}

        </div>

        {/* 홈 HTML 편집 모달 */}
        {showHomeHtmlModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div>
                  <h2 className="text-sm font-bold text-white">프론트 메뉴 상단 HTML</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    홈 화면 헤더 아래에 그대로 렌더링됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setHomeHtmlDraft(homeHtml)
                    setHomeBgColorDraft(homeBgColor)
                    // 이미지 배열도 초기화 (최소 1개 유지)
                    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
                    const extractedImages: string[] = []
                    let match
                    while ((match = imgRegex.exec(homeHtml)) !== null) {
                      extractedImages.push(decodeHtmlEntities(match[1]).trim())
                    }
                    setHomeHtmlImages(extractedImages.length > 0 ? extractedImages : [''])
                    setShowHomeHtmlModal(false)
                  }}
                  className="text-gray-300 hover:text-white text-sm font-semibold px-3 py-1 rounded-md"
                >
                  닫기
                </button>
              </div>

              <div className="p-4 space-y-4">
                {/* 홈 배경색 설정 */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    홈화면 배경색 지정
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={homeBgColorDraft}
                      onChange={(e) => setHomeBgColorDraft(e.target.value)}
                      placeholder="#000000"
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-pink-500"
                    />
                    <button
                      type="button"
                      onClick={() => setHomeBgColorDraft('')}
                      className="bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-2 rounded-lg"
                      title="배경색 초기화(기본값 사용)"
                    >
                      초기화
                    </button>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    예: #000000 (비우면 기본 배경색을 사용합니다)
                  </p>
                </div>

                {/* HTML 편집 섹션 */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    HTML 코드
                  </label>
                  <textarea
                    value={homeHtmlDraft}
                    onChange={(e) => {
                      const next = e.target.value
                      setHomeHtmlDraft(next)
                      // ✅ 입력/붙여넣기 즉시 HTML에서 이미지 URL 추출 → 이미지 섹션 미리보기 갱신
                      syncHomeHtmlImagesFromDraft(next)
                    }}
                    onPaste={() => {
                      // paste 직후 textarea 값이 반영된 다음 프레임에서 파싱
                      requestAnimationFrame(() => {
                        syncHomeHtmlImagesFromDraft(homeHtmlDraft)
                      })
                    }}
                    placeholder="<div>여기에 HTML을 입력하세요</div>"
                    className="w-full h-80 bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    이미지 파일명을 복사하여 HTML 코드 내 원하는 위치에 &lt;img src="이미지URL"&gt; 형태로 넣어주세요. {homeHtmlImages.filter(url => url).length}개 이미지 업로드됨
                  </p>
                </div>

                {/* 이미지 업로드 섹션 */}
                <div>
                  <label className="block text-sm font-semibold text-white mb-2">
                    이미지 (최소 1개 필수)
                  </label>
                  <div className="flex items-start gap-2 overflow-x-auto pb-2">
                    {homeHtmlImages.map((imageUrl, index) => (
                      <div key={index} className="flex-shrink-0 w-24">
                        {imageUrl ? (
                          <div className="space-y-2">
                            <div className="relative w-24 h-24 group">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0]
                                  if (!file) return
                                  if (!file.type.startsWith('image/')) {
                                    alert('이미지 파일만 업로드할 수 있습니다.')
                                    return
                                  }
                                  await handleImageUpload(file, index)
                                  e.target.value = ''
                                }}
                                className="hidden"
                                id={`home-html-image-replace-${index}`}
                                disabled={uploadingImageIndex === index}
                              />
                              <label
                                htmlFor={`home-html-image-replace-${index}`}
                                onDrop={async (e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const file = e.dataTransfer.files?.[0]
                                  if (!file) return
                                  if (!file.type.startsWith('image/')) {
                                    alert('이미지 파일만 업로드할 수 있습니다.')
                                    return
                                  }
                                  await handleImageUpload(file, index)
                                }}
                                onDragOver={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  e.currentTarget.classList.add('opacity-50')
                                }}
                                onDragLeave={(e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  e.currentTarget.classList.remove('opacity-50')
                                }}
                                className="block w-full h-full cursor-pointer"
                              >
                                <img
                                  src={imageUrl}
                                  alt={`이미지 ${index + 1}`}
                                  className="w-full h-full object-cover bg-gray-800 border border-gray-700 rounded-lg"
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23333" width="200" height="200"/%3E%3Ctext fill="%23999" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%25" y="50%25" text-anchor="middle"%3E이미지 로드 실패%3C/text%3E%3C/svg%3E'
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  // 리뷰이벤트와 동일: 클라이언트에서만 제거, 저장 시 반영
                                  const newImages = homeHtmlImages.filter((_, i) => i !== index)
                                  // 최소 1개 유지
                                  if (newImages.length === 0) {
                                    setHomeHtmlImages([''])
                                  } else {
                                    setHomeHtmlImages(newImages)
                                  }
                                }}
                                className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center z-10"
                                title="이미지 삭제"
                              >
                                ×
                              </button>
                              {/* 드래그 오버 시 힌트 */}
                              <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <span className="text-white text-xs text-center px-1">드래그하여 교체</span>
                              </div>
                            </div>
                            {/* 이미지 URL 복사 버튼 */}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(imageUrl)
                                  alert('이미지 URL이 클립보드에 복사되었습니다.\n\nHTML 코드 섹션에서 원하는 위치에 커서를 두고 Ctrl+V로 붙여넣으세요.')
                                } catch (err) {
                                  // 클립보드 API가 지원되지 않는 경우 fallback
                                  const textArea = document.createElement('textarea')
                                  textArea.value = imageUrl
                                  textArea.style.position = 'fixed'
                                  textArea.style.opacity = '0'
                                  document.body.appendChild(textArea)
                                  textArea.select()
                                  try {
                                    document.execCommand('copy')
                                    alert('이미지 URL이 클립보드에 복사되었습니다.\n\nHTML 코드 섹션에서 원하는 위치에 커서를 두고 Ctrl+V로 붙여넣으세요.')
                                  } catch (e) {
                                    alert('클립보드 복사에 실패했습니다. 수동으로 복사해주세요:\n\n' + imageUrl)
                                  }
                                  document.body.removeChild(textArea)
                                }
                              }}
                              className="w-full py-1 px-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded flex items-center justify-center gap-1 transition-colors"
                              title="이미지 URL 복사"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                              <span className="text-[10px]">복사</span>
                            </button>
                          </div>
                        ) : (
                          <div className="w-full h-24 relative">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0]
                                if (!file) return

                                // 이미지 파일인지 확인
                                if (!file.type.startsWith('image/')) {
                                  alert('이미지 파일만 업로드할 수 있습니다.')
                                  return
                                }

                                await handleImageUpload(file, index)
                                // input 초기화
                                e.target.value = ''
                              }}
                              className="hidden"
                              id={`home-html-image-${index}`}
                              disabled={uploadingImageIndex === index}
                            />
                            <label
                              htmlFor={`home-html-image-${index}`}
                              onDrop={async (e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                const file = e.dataTransfer.files?.[0]
                                if (!file) return

                                // 이미지 파일인지 확인
                                if (!file.type.startsWith('image/')) {
                                  alert('이미지 파일만 업로드할 수 있습니다.')
                                  return
                                }

                                await handleImageUpload(file, index)
                              }}
                              onDragOver={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                e.currentTarget.classList.add('border-pink-500', 'bg-gray-700')
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                e.currentTarget.classList.remove('border-pink-500', 'bg-gray-700')
                              }}
                              className="block w-full h-full bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-pink-500 transition-colors"
                            >
                              {uploadingImageIndex === index ? (
                                <span className="text-gray-400 text-xs">업로드 중...</span>
                              ) : (
                                <span className="text-gray-400 text-xs text-center px-1">드래그 또는 클릭</span>
                              )}
                            </label>
                          </div>
                        )}
                      </div>
                    ))}
                    
                    {/* + 버튼으로 이미지 추가 (항상 표시, 드래그&드롭 가능) */}
                    <div className="flex-shrink-0 w-24 h-24">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (!file.type.startsWith('image/')) {
                            alert('이미지 파일만 업로드할 수 있습니다.')
                            return
                          }
                          const newIndex = homeHtmlImages.length
                          setHomeHtmlImages([...homeHtmlImages, ''])
                          await handleImageUpload(file, newIndex)
                          e.target.value = ''
                        }}
                        className="hidden"
                        id="home-html-image-add"
                        disabled={uploadingImageIndex !== null}
                      />
                      <label
                        htmlFor="home-html-image-add"
                        onDrop={async (e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const file = e.dataTransfer.files?.[0]
                          if (!file) return
                          if (!file.type.startsWith('image/')) {
                            alert('이미지 파일만 업로드할 수 있습니다.')
                            return
                          }
                          const newIndex = homeHtmlImages.length
                          setHomeHtmlImages([...homeHtmlImages, ''])
                          await handleImageUpload(file, newIndex)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          e.currentTarget.classList.add('border-pink-500', 'bg-gray-600')
                        }}
                        onDragLeave={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          e.currentTarget.classList.remove('border-pink-500', 'bg-gray-600')
                        }}
                        className="flex w-full h-full bg-gray-700 hover:bg-gray-600 border-2 border-dashed border-gray-500 rounded-lg items-center justify-center cursor-pointer transition-colors"
                        title="클릭하거나 드래그하여 이미지 추가"
                      >
                        {uploadingImageIndex !== null ? (
                          <span className="text-gray-300 text-xs">업로드 중...</span>
                        ) : (
                          <span className="text-white text-2xl font-bold">+</span>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowHomeHtmlPreview(true)
                    }}
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-md hover:shadow-lg transition-all duration-200"
                  >
                    미리보기
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHomeHtmlDraft('')
                      // 이미지도 초기화 (최소 1개 유지)
                      setHomeHtmlImages([''])
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                  >
                    비우기
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        // 리뷰이벤트와 동일한 방식: POST로 저장 (캐시 우회)
                        const response = await fetch('/api/admin/home-html', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'save', home_html: homeHtmlDraft, home_bg_color: homeBgColorDraft }),
                        })
                        if (!response.ok) {
                          const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
                          const details = typeof errorData?.details === 'string' ? errorData.details : ''
                          const hint = typeof errorData?.hint === 'string' ? errorData.hint : ''
                          const msg = String(errorData?.error || `홈 HTML 저장 실패 (${response.status})`)
                          throw new Error([msg, details, hint].filter(Boolean).join('\n'))
                        }
                        const result = await response.json()
                        const saved = typeof result.home_html === 'string' ? result.home_html : ''
                        const savedBgColor = typeof result.home_bg_color === 'string' ? result.home_bg_color : ''
                        setHomeHtml(saved)
                        setHomeHtmlDraft(saved)
                        setHomeBgColor(savedBgColor)
                        setHomeBgColorDraft(savedBgColor)
                        
                        // 저장된 HTML에서 이미지 추출하여 이미지 배열 업데이트 (참고용)
                        const imgRegex2 = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi
                        const savedImages: string[] = []
                        let match
                        while ((match = imgRegex2.exec(saved)) !== null) {
                          savedImages.push(decodeHtmlEntities(match[1]).trim())
                        }
                        // 저장된 이미지가 없거나 현재 업로드된 이미지와 다를 수 있으므로, 업로드된 이미지는 유지
                        const uploadedImages = homeHtmlImages.filter(url => url.trim() !== '')
                        if (uploadedImages.length > 0) {
                          setHomeHtmlImages(uploadedImages.length > 0 ? uploadedImages : [''])
                        } else {
                          setHomeHtmlImages(savedImages.length > 0 ? savedImages : [''])
                        }
                        
                        setShowHomeHtmlModal(false)
                      } catch (e: any) {
                        const errorMsg = e?.message || '홈 HTML 저장에 실패했습니다.'
                        alert(`홈 HTML 저장 실패: ${errorMsg}\n\nDB에 home_html/home_bg_color 컬럼이 없을 수 있습니다. supabase-add-home-html.sql 및 supabase-add-home-bg-color.sql을 실행해주세요.`)
                      }
                    }}
                    className="bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-4 py-2 rounded-lg"
                  >
                    저장
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 컨텐츠 목록 */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center text-gray-400 py-12">로딩 중...</div>
          ) : contents.length === 0 ? (
            <div className="text-center text-gray-400 py-12">컨텐츠가 없습니다.</div>
          ) : (
            contents.map((content, index) => (
              <div
                key={content.id}
                onClick={() => handleContentClick(content)}
                className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {(content?.is_exposed === true || content?.is_exposed === 'true' || content?.is_exposed === 1) ? (
                      <span className="shrink-0 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">
                        배포됨
                      </span>
                    ) : (
                      <span className="shrink-0 bg-gray-600 text-white text-xs font-bold px-2 py-1 rounded">
                        미배포
                      </span>
                    )}
                    <span className="text-white truncate">{content.content_name || '이름 없음'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleOpenReviewModal(e, content.id)}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200"
                      title="리뷰 관리"
                    >
                      리뷰 관리
                    </button>
                    <button
                      onClick={(e) => handleOpenReviewEventModal(e, content)}
                      className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200"
                      title="리뷰 이벤트"
                    >
                      리뷰 이벤트
                    </button>
                    <button
                      onClick={(e) => handleDuplicate(e, content)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200"
                      title="복제"
                    >
                      복제
                    </button>
                    <span className="text-gray-400 text-sm">#{index + 1}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 리뷰 이벤트 관리 모달 */}
      {showReviewEventModal && selectedEventContent && (
        <AdminReviewEventModal
          isOpen={true}
          onClose={() => setShowReviewEventModal(false)}
          contentId={selectedEventContent.id}
          contentName={selectedEventContent.content_name}
        />
      )}

      {/* 결제 통계 대시보드 */}
      <PaymentStatsDashboard
        isOpen={showPaymentStats}
        onClose={() => setShowPaymentStats(false)}
      />

      {/* 유입 통계 대시보드 */}
      <TrafficStatsDashboard
        isOpen={showTrafficStats}
        onClose={() => setShowTrafficStats(false)}
      />

      {/* 점사 재시도 조회 모달 */}
      {showResumeAdminModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md flex flex-col">
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold text-white">점사 재시도 조회</h2>
              <button
                onClick={() => {
                  if (resumeAdminLoading) return
                  setShowResumeAdminModal(false)
                }}
                className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-blue-800 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">휴대폰 번호</label>
                <input
                  type="text"
                  value={resumeAdminPhone}
                  onChange={(e) => setResumeAdminPhone(formatPhoneWithPrefix(e.target.value))}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">비밀번호</label>
                <input
                  type="password"
                  value={resumeAdminPassword}
                  onChange={(e) => setResumeAdminPassword(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="비밀번호"
                />
              </div>
              <button
                type="button"
                onClick={handleResumeAdminSearch}
                disabled={resumeAdminLoading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {resumeAdminLoading ? '조회 중...' : '조회'}
              </button>
              <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-gray-300 space-y-2">
                <div className="text-gray-200 font-semibold">처리 매뉴얼</div>
                <div>1) 휴대폰/비밀번호로 조회</div>
                <div>2) saved_id가 있으면 결과 링크 복사/열기</div>
                <div>3) request_key만 있으면 재시도 링크 복사/열기</div>
                <div>4) 사용자에게 링크 전달 (60일 조회 가능)</div>
              </div>
              {resumeAdminResult && (
                <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-sm text-gray-200 space-y-3">
                  <div>
                    <span className="text-gray-400">생성일:</span>{' '}
                    <span>{resumeAdminResult.createdAt || '알 수 없음'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">만료:</span>{' '}
                    <span>{resumeAdminResult.expiresAt || '알 수 없음'}</span>
                  </div>
                  {resumeAdminResult.savedId && (
                    <div className="space-y-2">
                      <div>
                        <span className="text-gray-400">saved_id:</span>{' '}
                        <span>{resumeAdminResult.savedId}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              const link = await createResumeCodeLink({ savedId: String(resumeAdminResult.savedId) })
                              await copyResumeLink(link)
                            } catch (e: any) {
                              alert(e?.message || '링크 생성에 실패했습니다.')
                            }
                          })()
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 rounded"
                      >
                        결과 링크 복사
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              const link = await createResumeCodeLink({ savedId: String(resumeAdminResult.savedId) })
                              window.open(link, '_blank')
                            } catch (e: any) {
                              alert(e?.message || '링크 생성에 실패했습니다.')
                            }
                          })()
                        }}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-2 rounded"
                      >
                        결과 열기
                      </button>
                    </div>
                  )}
                  {!resumeAdminResult.savedId && resumeAdminResult.requestKey && (
                    <div className="space-y-2">
                      <div>
                        <span className="text-gray-400">request_key:</span>{' '}
                        <span>{resumeAdminResult.requestKey}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              const link = await createResumeCodeLink({ requestKey: String(resumeAdminResult.requestKey) })
                              await copyResumeLink(link)
                            } catch (e: any) {
                              alert(e?.message || '링크 생성에 실패했습니다.')
                            }
                          })()
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-2 rounded"
                      >
                        재시도 링크 복사
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void (async () => {
                            try {
                              const link = await createResumeCodeLink({ requestKey: String(resumeAdminResult.requestKey) })
                              window.open(link, '_blank')
                            } catch (e: any) {
                              alert(e?.message || '링크 생성에 실패했습니다.')
                            }
                          })()
                        }}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold px-3 py-2 rounded"
                      >
                        재시도 열기
                      </button>
                    </div>
                  )}
                  {!resumeAdminResult.savedId && !resumeAdminResult.requestKey && (
                    <div className="text-yellow-300">복구 가능한 데이터가 없습니다.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 결제 재시도 예외 (24시간 경과 후 허용) 모달 */}
      {showAllowRetryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md flex flex-col">
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold text-white">재시도 예외 허용</h2>
              <button
                onClick={() => {
                  if (allowRetryLoading) return
                  setShowAllowRetryModal(false)
                  setAllowRetryMessage(null)
                }}
                className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-amber-800 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-300">
                결제 확인 후 24시간이 지나 만료된 고객에게 예외적으로 점사보기를 허용합니다. 주문번호(oid)와 허용 시간을 입력하세요.
              </p>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">주문번호 (oid)</label>
                <input
                  type="text"
                  value={allowRetryOid}
                  onChange={(e) => setAllowRetryOid(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="payments 테이블의 oid"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">허용 시간 (시간)</label>
                <input
                  type="number"
                  min={1}
                  max={720}
                  value={allowRetryHours}
                  onChange={(e) => setAllowRetryHours(Number(e.target.value) || 24)}
                  className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-gray-400 mt-1">1~720 (최대 30일). 기본 24시간.</p>
              </div>
              {allowRetryMessage && (
                <div className={`p-3 rounded-lg text-sm ${allowRetryMessage.type === 'ok' ? 'bg-green-900/50 text-green-200' : 'bg-red-900/50 text-red-200'}`}>
                  {allowRetryMessage.text}
                </div>
              )}
              <button
                type="button"
                onClick={handleAllowRetrySubmit}
                disabled={allowRetryLoading}
                className="w-full bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {allowRetryLoading ? '처리 중...' : '허용'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 문의 관리 모달 */}
      {showInquiryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="bg-gradient-to-r from-orange-600 to-orange-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold text-white">문의 관리</h2>
              <button
                onClick={() => {
                  setShowInquiryModal(false)
                  setInquiries([])
                }}
                className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-orange-800 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {loadingInquiries ? (
                <div className="text-center text-gray-400 py-12">로딩 중...</div>
              ) : inquiries.length === 0 ? (
                <div className="text-center text-gray-400 py-12">문의가 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {inquiries.map((inquiry: any) => {
                    const date = new Date(inquiry.created_at)
                    const formattedDate = `${date.getFullYear()}. ${String(date.getMonth() + 1).padStart(2, '0')}. ${String(date.getDate()).padStart(2, '0')}. ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
                    
                    return (
                      <div
                        key={inquiry.id}
                        className="bg-gray-700 rounded-lg p-4 border border-gray-600"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="text-white font-semibold">{inquiry.name}</span>
                              <span className="text-gray-400 text-sm">{inquiry.phone}</span>
                              <span className="text-gray-400 text-sm">{inquiry.email}</span>
                            </div>
                            <span className="text-xs text-gray-400">{formattedDate}</span>
                          </div>
                        </div>
                        <div className="bg-gray-800 rounded p-3 mt-3">
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{inquiry.content}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 관리 모달 */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-4xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-xl font-bold text-white">리뷰 관리</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (selectedContentId) {
                      await loadReviewsForContent(selectedContentId)
                    }
                  }}
                  disabled={!selectedContentId || loadingReviews}
                  className="text-gray-300 hover:text-white disabled:text-gray-600 disabled:hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 transition-colors"
                  title="리뷰 새로고침"
                  aria-label="리뷰 새로고침"
                >
                  <svg
                    className={`w-5 h-5 ${loadingReviews ? 'animate-spin' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v6h6M20 20v-6h-6M20 9a8 8 0 00-14.9-3M4 15a8 8 0 0014.9 3"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowReviewModal(false)
                    setSelectedContentId(null)
                    setReviews([])
                  }}
                  className="text-gray-300 hover:text-white text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700 transition-colors"
                  title="닫기"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingReviews ? (
                <div className="text-center text-gray-400 py-12">로딩 중...</div>
              ) : reviews.length === 0 ? (
                <div className="text-center text-gray-400 py-12">등록된 리뷰가 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {reviews.map((review: any) => (
                    <div
                      key={review.id}
                      className="bg-gray-800 border border-gray-700 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {review.is_best && (
                              <span className="bg-yellow-400 text-yellow-900 text-xs font-bold px-2 py-1 rounded">
                                베스트
                              </span>
                            )}
                            {review.is_visible && (
                              <span className="bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
                                노출 중
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              작성일: {(() => {
                                const date = new Date(review.created_at)
                                return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`
                              })()}
                            </span>
                            {review.user_name && (
                              <span className="text-xs text-gray-400">작성자: {review.user_name}</span>
                            )}
                          </div>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap mb-3">{review.review_text}</p>
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
                                    className="rounded-lg border border-gray-600 cursor-pointer hover:opacity-90 transition-opacity"
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
                                      ;(e.target as HTMLImageElement).style.display = 'none'
                                    }}
                                  />
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-700">
                        <button
                          type="button"
                          onClick={() => handleReviewAction(review.id, 'visible', !review.is_visible)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                            review.is_visible
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          }`}
                        >
                          {review.is_visible ? '노출 중' : '리뷰 노출'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReviewAction(review.id, 'best', !review.is_best)}
                          className={`text-xs font-semibold px-3 py-1.5 rounded transition-colors ${
                            review.is_best
                              ? 'bg-yellow-500 hover:bg-yellow-600 text-yellow-900'
                              : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                          }`}
                        >
                          {review.is_best ? '베스트 지정됨' : '베스트리뷰 지정'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 이미지 확대 모달 */}
      {expandedReviewImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10001] p-4"
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

      {/* 홈HTML 미리보기 팝업 */}
      {showHomeHtmlPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className={`bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col ${
            homeHtmlPreviewMode === 'mobile' ? 'w-full max-w-sm' : 'w-full max-w-4xl'
          }`}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h2 className="text-lg font-bold text-white">홈HTML 미리보기</h2>
              <div className="flex items-center gap-2">
                {/* PC/모바일 모드 전환 버튼 */}
                <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setHomeHtmlPreviewMode('pc')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                      homeHtmlPreviewMode === 'pc'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    PC
                  </button>
                  <button
                    type="button"
                    onClick={() => setHomeHtmlPreviewMode('mobile')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                      homeHtmlPreviewMode === 'mobile'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    모바일
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowHomeHtmlPreview(false)}
                  className="text-gray-300 hover:text-white text-sm font-semibold px-3 py-1 rounded-md"
                >
                  닫기
                </button>
              </div>
            </div>
            <div className={`flex-1 p-4 bg-white flex justify-center ${homeHtmlPreviewMode === 'mobile' ? 'overflow-y-auto' : 'overflow-auto'}`}>
              <div className={`${homeHtmlPreviewMode === 'mobile' ? 'w-full max-w-[375px]' : 'w-full'}`}>
                <iframe
                  ref={homeHtmlPreviewIframeRef}
                  srcDoc={homeHtmlDraft}
                  className="w-full border-0"
                  style={{
                    border: 'none',
                    overflow: 'hidden',
                  }}
                  title="홈HTML 미리보기"
                  sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                  onLoad={() => {
                    setTimeout(() => {
                      try {
                        const iframe = homeHtmlPreviewIframeRef.current
                        if (iframe?.contentWindow?.document?.body) {
                          const height = Math.max(
                            iframe.contentWindow.document.body.scrollHeight,
                            iframe.contentWindow.document.documentElement.scrollHeight,
                            200
                          )
                          iframe.style.height = `${height}px`
                          iframe.style.overflow = 'hidden'
                          // iframe 내부 body의 스크롤도 숨김
                          iframe.contentWindow.document.body.style.overflow = 'hidden'
                          iframe.contentWindow.document.documentElement.style.overflow = 'hidden'
                        }
                      } catch (err) {
                        // cross-origin 등으로 접근 불가 시 무시
                      }
                    }, 100)
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

