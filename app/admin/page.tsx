'use client'

import { useState, useEffect, useRef, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { getContents, deleteContent } from '@/lib/supabase-admin'
import AdminReviewEventModal from '@/components/AdminReviewEventModal'
import PaymentStatsDashboard from '@/components/PaymentStatsDashboard'
import PaymentListDashboard from '@/components/PaymentListDashboard'
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
  // 결제 통계 대시보드 상태
  const [showPaymentStats, setShowPaymentStats] = useState(false)
  const [showPaymentList, setShowPaymentList] = useState(false)
  const [showTrafficStats, setShowTrafficStats] = useState(false)
  // VOC 보상(캐시 충전) 모달 상태
  const [showVocGrantModal, setShowVocGrantModal] = useState(false)
  const [vocGrantContentId, setVocGrantContentId] = useState<string>('')
  const [vocGrantPhone, setVocGrantPhone] = useState('')
  const [vocGrantCache, setVocGrantCache] = useState('')
  const [vocGrantSubmitting, setVocGrantSubmitting] = useState(false)
  const [vocGrantError, setVocGrantError] = useState<string | null>(null)
  // 음성형 DB 초기화 모달 상태
  const [showVoiceResetModal, setShowVoiceResetModal] = useState(false)
  const [voiceResetConfirm, setVoiceResetConfirm] = useState('')
  const [voiceResetSubmitting, setVoiceResetSubmitting] = useState(false)
  const [voiceResetError, setVoiceResetError] = useState<string | null>(null)

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
        // 서버에서 sort_order 기준으로 이미 정렬된 순서 유지
        setContents(result.data || [])
      } else {
        setContents([])
      }
    } catch (error) {
      setContents([])
    } finally {
      setLoading(false)
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

  const handleAddVoice = () => {
    router.push('/admin/form/voice')
  }

  const handleAddMulti = () => {
    router.push('/admin/form/multi')
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

  const isVoiceContent = (content: any) => {
    // content_type이 명시적으로 voice이거나, voice 전용 필드가 존재하면 음성형으로 판단
    return content.content_type === 'voice' || !!content.voice_model || !!content.voice_persona_prompt
  }

  const isMultiContent = (content: any) => {
    return content.content_type === 'multi'
  }

  const handleContentClick = (content: any) => {
    if (isMultiContent(content)) {
      router.push(`/admin/form/multi?id=${content.id}`)
      return
    }
    const basePath = isVoiceContent(content) ? '/admin/form/voice' : '/admin/form'
    router.push(`${basePath}?id=${content.id}`)
  }

  const handleDuplicate = async (e: React.MouseEvent, content: any) => {
    e.stopPropagation() // 클릭 이벤트 전파 방지 (부모 div의 handleContentClick 실행 방지)
    if (isMultiContent(content)) {
      router.push(`/admin/form/multi?duplicate=${content.id}`)
      return
    }
    const basePath = isVoiceContent(content) ? '/admin/form/voice' : '/admin/form'
    router.push(`${basePath}?duplicate=${content.id}`)
  }

  // 드래그로 컨텐츠 순서 변경 (같은 섹션 내에서만). 삽입 위치를 슬롯으로 표시
  const [dragContentId, setDragContentId] = useState<number | null>(null)
  const [dragSectionVoice, setDragSectionVoice] = useState<boolean | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const justDraggedRef = useRef(false)
  const reorderSavingRef = useRef(false)

  const saveReorder = async (orderedIds: number[]) => {
    if (orderedIds.length === 0 || reorderSavingRef.current) return
    reorderSavingRef.current = true
    try {
      const res = await fetch('/api/admin/content/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: orderedIds })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.success) {
        throw new Error(data?.error || '순서 저장에 실패했습니다.')
      }
      const idToContent = new Map(contents.map((c: any) => [c.id, c]))
      const newContents = orderedIds.map((id) => idToContent.get(id)).filter(Boolean)
      setContents(newContents)
    } catch (e: any) {
      alert(e?.message || '순서 저장에 실패했습니다.')
    } finally {
      reorderSavingRef.current = false
    }
  }

  const handleDragStart = (e: React.DragEvent, content: any) => {
    setDragContentId(content.id)
    setDragSectionVoice(isVoiceContent(content))
    setDropIndex(null)
    justDraggedRef.current = false
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(content.id))
  }
  const handleDragOverSlot = (e: React.DragEvent, slotIndex: number, sectionIsVoice: boolean) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragSectionVoice !== sectionIsVoice) return
    setDropIndex(slotIndex)
  }
  const handleDropAtSlot = (e: React.DragEvent, slotIndex: number, sectionIsVoice: boolean) => {
    e.preventDefault()
    const draggedId = dragContentId ?? (e.dataTransfer.getData('text/plain') ? Number(e.dataTransfer.getData('text/plain')) : null)
    setDragContentId(null)
    setDragSectionVoice(null)
    setDropIndex(null)
    if (draggedId == null || !Number.isFinite(draggedId)) return
    justDraggedRef.current = true
    const sectionContents = contents.filter((c: any) => isVoiceContent(c) === sectionIsVoice)
    const otherSectionContents = contents.filter((c: any) => isVoiceContent(c) !== sectionIsVoice)
    const dragIndex = sectionContents.findIndex((c: any) => c.id === draggedId)
    if (dragIndex === -1) return
    let insertIndex = slotIndex
    if (insertIndex > dragIndex) insertIndex -= 1
    const newSection = [...sectionContents]
    const [removed] = newSection.splice(dragIndex, 1)
    newSection.splice(insertIndex, 0, removed)
    const orderedIds = sectionIsVoice
      ? [...otherSectionContents.map((c: any) => c.id), ...newSection.map((c: any) => c.id)]
      : [...newSection.map((c: any) => c.id), ...otherSectionContents.map((c: any) => c.id)]
    saveReorder(orderedIds)
  }
  const handleDragEnd = () => {
    setDragContentId(null)
    setDragSectionVoice(null)
    setDropIndex(null)
  }
  const handleContentClickWithDrag = (content: any) => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false
      return
    }
    handleContentClick(content)
  }

  // 카드 위에서 드래그 시 삽입 위치 계산 (카드 상반/하반)
  const handleCardDragOver = (e: React.DragEvent, content: any, cardIndex: number, sectionIsVoice: boolean) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragSectionVoice !== sectionIsVoice || dragContentId === content.id) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mid = rect.top + rect.height / 2
    const insertBefore = e.clientY < mid ? cardIndex : cardIndex + 1
    setDropIndex(insertBefore)
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

  /** 휴대폰 번호에 하이픈 자동 포맷 (한국 번호) */
  const formatPhoneWithHyphen = (value: string): string => {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    if (digits.length <= 2) return digits
    if (digits.startsWith('02')) {
      if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`
      if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    }
    if (digits.startsWith('010') || digits.startsWith('011') || digits.startsWith('016') || digits.startsWith('019')) {
      if (digits.length <= 3) return digits
      if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    }
    if (digits.length <= 3) return digits
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
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
              점사형 추가
            </button>
            <button
              onClick={handleAddVoice}
              className="bg-violet-500 hover:bg-violet-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-200"
            >
              음성형 추가
            </button>
            <button
              onClick={handleAddMulti}
              className="bg-amber-500 hover:bg-amber-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-200"
            >
              다자형 추가
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
                onClick={() => setShowPaymentList(true)}
                className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200 shadow-lg"
                title="결제 현황 · 고객 정보 (일/주/월/기간/전체)"
              >
                결제 현황
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
                  setShowVocGrantModal(true)
                  setVocGrantError(null)
                  setVocGrantContentId('')
                  setVocGrantPhone('')
                  setVocGrantCache('')
                }}
                className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200"
                title="VOC 보상: 음성형·다자형 고객에게 캐시 충전"
              >
                VOC 보상 (캐시 충전)
              </button>
              {/* 음성형 DB 초기화 버튼 (필요 시 주석 해제)
              <button
                type="button"
                onClick={() => {
                  setShowVoiceResetModal(true)
                  setVoiceResetConfirm('')
                  setVoiceResetError(null)
                }}
                className="bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium px-4 py-2 rounded transition-colors duration-200"
                title="음성형 잔액·충전 테이블 전체 초기화 (정식 런칭용)"
              >
                음성형 DB 초기화
              </button>
              */}
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
        <div className="space-y-6">
          {loading ? (
            <div className="text-center text-gray-400 py-12">로딩 중...</div>
          ) : contents.length === 0 ? (
            <div className="text-center text-gray-400 py-12">컨텐츠가 없습니다.</div>
          ) : (
            <>
              {/* 점사형 컨텐츠 */}
              {contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-pink-500 text-white text-xs font-bold px-2.5 py-1 rounded">점사형</span>
                    <span className="text-gray-400 text-sm">{contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length}개</span>
                    <div className="flex-1 border-t border-pink-500/30" />
                  </div>
                  <div className="space-y-0">
                    {contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).map((content, index) => (
                      <Fragment key={`fortune-${content.id}`}>
                        {/* 삽입 슬롯: 드래그 중 이 위치에 놓으면 여기로 삽입됨 */}
                        <div
                          onDragOver={(e) => handleDragOverSlot(e, index, false)}
                          onDrop={(e) => handleDropAtSlot(e, index, false)}
                          className={`transition-all duration-200 ease-out rounded-md flex items-center justify-center ${
                            dragContentId != null && dragSectionVoice === false && dropIndex === index
                              ? 'min-h-[56px] my-1 border-2 border-dashed border-pink-400 bg-pink-500/10'
                              : 'min-h-[6px] my-0.5 border-2 border-transparent'
                          }`}
                        >
                          {dragContentId != null && dragSectionVoice === false && dropIndex === index && (
                            <span className="text-pink-400 text-xs font-medium">여기에 놓기</span>
                          )}
                        </div>
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, content)}
                          onDragOver={(e) => handleCardDragOver(e, content, index, false)}
                          onDrop={(e) => { e.preventDefault(); if (dragSectionVoice === false) handleDropAtSlot(e, dropIndex ?? index + 1, false); }}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleContentClickWithDrag(content)}
                          className={`bg-gray-800 rounded-lg p-4 cursor-grab active:cursor-grabbing hover:bg-gray-700 transition-colors border border-gray-700 border-l-4 border-l-pink-500 select-none ${dragContentId === content.id ? 'opacity-50 scale-[0.98]' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-gray-500 shrink-0 cursor-grab active:cursor-grabbing" title="드래그하여 순서 변경">⋮⋮</span>
                              {(content?.is_exposed === true || content?.is_exposed === 'true' || content?.is_exposed === 1) ? (
                                <span className="shrink-0 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">배포됨</span>
                              ) : (
                                <span className="shrink-0 bg-gray-600 text-white text-xs font-bold px-2 py-1 rounded">미배포</span>
                              )}
                              <span className="text-white truncate">{content.content_name || '이름 없음'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={(e) => handleOpenReviewModal(e, content.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="리뷰 관리">리뷰 관리</button>
                              <button onClick={(e) => handleOpenReviewEventModal(e, content)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="리뷰 이벤트">리뷰 이벤트</button>
                              <button onClick={(e) => handleDuplicate(e, content)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="복제">복제</button>
                              <span className="text-gray-400 text-sm">#{index + 1}</span>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    ))}
                    {/* 맨 아래 삽입 슬롯 */}
                    {contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length > 0 && (
                      <div
                        onDragOver={(e) => handleDragOverSlot(e, contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length, false)}
                        onDrop={(e) => handleDropAtSlot(e, contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length, false)}
                        className={`transition-all duration-200 ease-out rounded-md flex items-center justify-center ${
                          dragContentId != null && dragSectionVoice === false && dropIndex === contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length
                            ? 'min-h-[56px] my-1 border-2 border-dashed border-pink-400 bg-pink-500/10'
                            : 'min-h-[6px] my-0.5 border-2 border-transparent'
                        }`}
                      >
                        {dragContentId != null && dragSectionVoice === false && dropIndex === contents.filter((c) => !isVoiceContent(c) && !isMultiContent(c)).length && (
                          <span className="text-pink-400 text-xs font-medium">여기에 놓기</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 음성형 컨텐츠 */}
              {contents.filter((c) => isVoiceContent(c)).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-violet-500 text-white text-xs font-bold px-2.5 py-1 rounded">음성형</span>
                    <span className="text-gray-400 text-sm">{contents.filter((c) => isVoiceContent(c)).length}개</span>
                    <div className="flex-1 border-t border-violet-500/30" />
                  </div>
                  <div className="space-y-0">
                    {contents.filter((c) => isVoiceContent(c)).map((content, index) => (
                      <Fragment key={`voice-${content.id}`}>
                        <div
                          onDragOver={(e) => handleDragOverSlot(e, index, true)}
                          onDrop={(e) => handleDropAtSlot(e, index, true)}
                          className={`transition-all duration-200 ease-out rounded-md flex items-center justify-center ${
                            dragContentId != null && dragSectionVoice === true && dropIndex === index
                              ? 'min-h-[56px] my-1 border-2 border-dashed border-violet-400 bg-violet-500/10'
                              : 'min-h-[6px] my-0.5 border-2 border-transparent'
                          }`}
                        >
                          {dragContentId != null && dragSectionVoice === true && dropIndex === index && (
                            <span className="text-violet-400 text-xs font-medium">여기에 놓기</span>
                          )}
                        </div>
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, content)}
                          onDragOver={(e) => handleCardDragOver(e, content, index, true)}
                          onDrop={(e) => { e.preventDefault(); if (dragSectionVoice === true) handleDropAtSlot(e, dropIndex ?? index + 1, true); }}
                          onDragEnd={handleDragEnd}
                          onClick={() => handleContentClickWithDrag(content)}
                          className={`bg-gray-800 rounded-lg p-4 cursor-grab active:cursor-grabbing hover:bg-gray-700 transition-colors border border-gray-700 border-l-4 border-l-violet-500 select-none ${dragContentId === content.id ? 'opacity-50 scale-[0.98]' : ''}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-gray-500 shrink-0 cursor-grab active:cursor-grabbing" title="드래그하여 순서 변경">⋮⋮</span>
                              {(content?.is_exposed === true || content?.is_exposed === 'true' || content?.is_exposed === 1) ? (
                                <span className="shrink-0 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">배포됨</span>
                              ) : (
                                <span className="shrink-0 bg-gray-600 text-white text-xs font-bold px-2 py-1 rounded">미배포</span>
                              )}
                              <span className="text-white truncate">{content.content_name || '이름 없음'}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button onClick={(e) => handleOpenReviewModal(e, content.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="리뷰 관리">리뷰 관리</button>
                              <button onClick={(e) => handleOpenReviewEventModal(e, content)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="리뷰 이벤트">리뷰 이벤트</button>
                              <button onClick={(e) => handleDuplicate(e, content)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="복제">복제</button>
                              <span className="text-gray-400 text-sm">#{index + 1}</span>
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    ))}
                    {contents.filter((c) => isVoiceContent(c)).length > 0 && (
                      <div
                        onDragOver={(e) => handleDragOverSlot(e, contents.filter((c) => isVoiceContent(c)).length, true)}
                        onDrop={(e) => handleDropAtSlot(e, contents.filter((c) => isVoiceContent(c)).length, true)}
                        className={`transition-all duration-200 ease-out rounded-md flex items-center justify-center ${
                          dragContentId != null && dragSectionVoice === true && dropIndex === contents.filter((c) => isVoiceContent(c)).length
                            ? 'min-h-[56px] my-1 border-2 border-dashed border-violet-400 bg-violet-500/10'
                            : 'min-h-[6px] my-0.5 border-2 border-transparent'
                        }`}
                      >
                        {dragContentId != null && dragSectionVoice === true && dropIndex === contents.filter((c) => isVoiceContent(c)).length && (
                          <span className="text-violet-400 text-xs font-medium">여기에 놓기</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 다자형 컨텐츠 */}
              {contents.filter((c) => isMultiContent(c)).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="bg-amber-500 text-white text-xs font-bold px-2.5 py-1 rounded">다자형</span>
                    <span className="text-gray-400 text-sm">{contents.filter((c) => isMultiContent(c)).length}개</span>
                    <div className="flex-1 border-t border-amber-500/30" />
                  </div>
                  <div className="space-y-2">
                    {contents.filter((c) => isMultiContent(c)).map((content, index) => (
                      <div
                        key={`multi-${content.id}`}
                        onClick={() => handleContentClickWithDrag(content)}
                        className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700 border-l-4 border-l-amber-500 select-none"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {(content?.is_exposed === true || content?.is_exposed === 'true' || content?.is_exposed === 1) ? (
                              <span className="shrink-0 bg-green-600 text-white text-xs font-bold px-2 py-1 rounded">배포됨</span>
                            ) : (
                              <span className="shrink-0 bg-gray-600 text-white text-xs font-bold px-2 py-1 rounded">미배포</span>
                            )}
                            <span className="text-white truncate">{content.content_name || '이름 없음'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => handleOpenReviewModal(e, content.id)} className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="리뷰 관리">리뷰 관리</button>
                            <button onClick={(e) => handleOpenReviewEventModal(e, content)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="리뷰 이벤트">리뷰 이벤트</button>
                            <button onClick={(e) => handleDuplicate(e, content)} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors duration-200" title="복제">복제</button>
                            <span className="text-gray-400 text-sm">#{index + 1}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
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

      {/* 결제 현황 · 고객 정보 (일/주/월/기간/전체, 점사 상태, 다시보기, 실패 원인) */}
      <PaymentListDashboard
        isOpen={showPaymentList}
        onClose={() => setShowPaymentList(false)}
      />

      {/* 유입 통계 대시보드 */}
      <TrafficStatsDashboard
        isOpen={showTrafficStats}
        onClose={() => setShowTrafficStats(false)}
      />

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

      {/* VOC 보상 (음성형·다자형 캐시 충전) 모달 */}
      {showVocGrantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-teal-600 to-teal-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold text-white">VOC 보상 (캐시 충전)</h2>
              <button
                type="button"
                onClick={() => {
                  setShowVocGrantModal(false)
                  setVocGrantError(null)
                }}
                className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-teal-800 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              {vocGrantError && (
                <p className="text-sm text-red-400 bg-red-900/30 border border-red-600 rounded p-2">{vocGrantError}</p>
              )}
              <p className="text-xs text-gray-400">음성형·다자형 콘텐츠에 대해 고객에게 캐시를 충전할 수 있습니다.</p>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">콘텐츠</label>
                <select
                  value={vocGrantContentId}
                  onChange={(e) => setVocGrantContentId(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                  required
                >
                  <option value="">선택</option>
                  {contents.filter((c: any) => isVoiceContent(c) || isMultiContent(c)).map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.content_name || `콘텐츠 ${c.id}`} ({isMultiContent(c) ? '다자형' : '음성형'})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">휴대폰 번호</label>
                <input
                  type="text"
                  value={vocGrantPhone}
                  onChange={(e) => setVocGrantPhone(formatPhoneWithHyphen(e.target.value))}
                  placeholder="010-1234-5678"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">충전할 캐시 (원)</label>
                <input
                  type="number"
                  min={1}
                  value={vocGrantCache}
                  onChange={(e) => setVocGrantCache(e.target.value)}
                  placeholder="예: 500"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    const cid = vocGrantContentId ? parseInt(vocGrantContentId, 10) : NaN
                    const phone = vocGrantPhone.trim()
                    const cacheWon = parseInt(vocGrantCache, 10)
                    if (!Number.isFinite(cid) || !phone) {
                      setVocGrantError('콘텐츠와 휴대폰 번호를 입력해주세요.')
                      return
                    }
                    if (!Number.isFinite(cacheWon) || cacheWon < 1) {
                      setVocGrantError('충전할 캐시(원)를 1 이상 입력해주세요.')
                      return
                    }
                    setVocGrantSubmitting(true)
                    setVocGrantError(null)
                    try {
                      const res = await fetch('/api/admin/voice/grant-time', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          contentId: cid,
                          phone,
                          cache_won: cacheWon,
                        }),
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        setVocGrantError(data?.error || `요청 실패 (${res.status})`)
                        return
                      }
                      if (data.success) {
                        alert(data.message || `${cacheWon}캐시 충전 완료`)
                        setShowVocGrantModal(false)
                        setVocGrantContentId('')
                        setVocGrantPhone('')
                        setVocGrantCache('')
                      } else {
                        setVocGrantError(data?.error || '처리 실패')
                      }
                    } catch (e: any) {
                      setVocGrantError(e?.message || '네트워크 오류')
                    } finally {
                      setVocGrantSubmitting(false)
                    }
                  }}
                  disabled={vocGrantSubmitting}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded transition-colors"
                >
                  {vocGrantSubmitting ? '처리 중...' : '충전하기'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVocGrantModal(false)
                    setVocGrantError(null)
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 음성형 DB 초기화 모달 */}
      {/* 음성형 DB 초기화 모달 (버튼 주석 해제 시 함께 사용)
      {showVoiceResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg shadow-2xl w-full max-w-md">
            <div className="bg-gradient-to-r from-rose-600 to-rose-700 px-6 py-4 flex items-center justify-between rounded-t-lg">
              <h2 className="text-xl font-bold text-white">음성형 DB 초기화</h2>
              <button
                type="button"
                onClick={() => { setShowVoiceResetModal(false); setVoiceResetError(null) }}
                className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-rose-800 transition-colors"
              >
                ×
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-300">
                정식 런칭 전 음성형 관련 데이터를 모두 삭제합니다. voice_balance, voice_balance_charge_log, voice_balance_grant_log, voice_summary_asked, voice_conversation_summaries 테이블이 비워집니다. <strong className="text-rose-400">복구할 수 없습니다.</strong>
              </p>
              {voiceResetError && (
                <p className="text-sm text-red-400 bg-red-900/30 border border-red-600 rounded p-2">{voiceResetError}</p>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">확인 문구 입력</label>
                <input
                  type="text"
                  value={voiceResetConfirm}
                  onChange={(e) => setVoiceResetConfirm(e.target.value)}
                  placeholder="음성형 초기화"
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-500"
                />
                <p className="text-xs text-gray-400 mt-1">위 placeholder와 똑같이 입력해야 실행됩니다.</p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (voiceResetConfirm.trim() !== '음성형 초기화') {
                      setVoiceResetError('확인 문구가 일치하지 않습니다.')
                      return
                    }
                    setVoiceResetSubmitting(true)
                    setVoiceResetError(null)
                    try {
                      const res = await fetch('/api/admin/voice/reset-db', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ confirm: voiceResetConfirm.trim() }),
                      })
                      const data = await res.json().catch(() => ({}))
                      if (!res.ok) {
                        setVoiceResetError(data?.error || `요청 실패 (${res.status})`)
                        return
                      }
                      if (data.success) {
                        alert(data.message || '초기화 완료')
                        setShowVoiceResetModal(false)
                        setVoiceResetConfirm('')
                      } else {
                        setVoiceResetError(data?.error || '처리 실패')
                      }
                    } catch (e: any) {
                      setVoiceResetError(e?.message || '네트워크 오류')
                    } finally {
                      setVoiceResetSubmitting(false)
                    }
                  }}
                  disabled={voiceResetSubmitting}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-2 rounded transition-colors"
                >
                  {voiceResetSubmitting ? '초기화 중...' : '초기화 실행'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowVoiceResetModal(false); setVoiceResetError(null) }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      */}

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

