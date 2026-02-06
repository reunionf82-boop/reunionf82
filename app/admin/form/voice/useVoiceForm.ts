import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildProtectedHtml, extractImageUrlsFromHtml } from './voice-form-html'

export type ContentImageModalType = 'introduction' | 'recommendation' | 'menu_composition' | null
export type HtmlPreviewModeType = 'pc' | 'mobile'

export interface VoiceTimeOption {
  minutes: number
  price: number
  label: string
}

export interface VoiceFormData {
  content_type: 'voice'
  content_name: string
  book_cover_thumbnail: string
  book_cover_thumbnail_video: string
  price: string
  payment_code: string
  is_new: boolean
  show_exposed: boolean
  summary: string
  introduction: string
  recommendation: string
  menu_composition: string
  voice_model: string
  voice_advisor_video_url: string
  voice_gender: 'female' | 'male'
  voice_style: string
  voice_name: string
  voice_counselor_name: string
  voice_persona_prompt: string
  voice_start_sound_url: string
  voice_bubble_sound_url: string
  voice_bubble_sound_probability_pct: number
  voice_time_options: VoiceTimeOption[]
}

/** 이미지 → WebP 변환 (화질 열화 없이 lossless) */
async function convertImageToWebp(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Canvas context 생성 실패')); return }
      ctx.drawImage(img, 0, 0)
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url)
          if (!blob) { reject(new Error('WebP 변환 실패')); return }
          const baseName = file.name.replace(/\.[^.]+$/, '')
          resolve(new File([blob], baseName + '.webp', { type: 'image/webp' }))
        },
        'image/webp',
        1, // quality 1 = 무손실에 가까운 최고 화질
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('이미지 로드 실패')) }
    img.src = url
  })
}

const INITIAL_FORM: VoiceFormData = {
  content_type: 'voice',
  content_name: '',
  book_cover_thumbnail: '',
  book_cover_thumbnail_video: '',
  price: '',
  payment_code: '',
  is_new: false,
  show_exposed: false,
  summary: '',
  introduction: '',
  recommendation: '',
  menu_composition: '',
  voice_model: 'gemini-2.5-flash-native-audio-preview-12-2025',
  voice_advisor_video_url: '',
  voice_gender: 'female',
  voice_style: 'warm',
  voice_name: 'Aoede',
  voice_counselor_name: '',
  voice_persona_prompt: '',
  voice_start_sound_url: '',
  voice_bubble_sound_url: '',
  voice_bubble_sound_probability_pct: 5,
  voice_time_options: [{ minutes: 5, price: 3000, label: '5분' }],
}

export function useVoiceForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams?.get('id')
  const duplicateId = searchParams?.get('duplicate')
  const loadId = id || duplicateId

  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!loadId)
  const [nextPaymentCode, setNextPaymentCode] = useState<string | null>(null)
  const [showContentImagesModal, setShowContentImagesModal] = useState(false)
  const [currentImageType, setCurrentImageType] = useState<ContentImageModalType>(null)
  const [contentImages, setContentImages] = useState<string[]>([])
  const [uploadingContentImageIndex, setUploadingContentImageIndex] = useState<number | null>(null)
  const [showHtmlPreview, setShowHtmlPreview] = useState(false)
  const [htmlPreviewContent, setHtmlPreviewContent] = useState('')
  const [htmlPreviewTitle, setHtmlPreviewTitle] = useState('')
  const [htmlPreviewMode, setHtmlPreviewMode] = useState<HtmlPreviewModeType>('pc')
  const htmlPreviewIframeRef = useRef<HTMLIFrameElement>(null)
  const [form, setForm] = useState<VoiceFormData>(INITIAL_FORM)

  // 인증 체크
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/auth/check', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d?.authenticated) setAuthenticated(true)
        else { setAuthenticated(false); router.push('/admin/login') }
      })
      .catch(() => { if (!cancelled) { setAuthenticated(false); router.push('/admin/login') } })
    return () => { cancelled = true }
  }, [router])

  // 다음 결제코드
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/admin/content/next-payment-code?type=voice', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.nextPaymentCode) {
          setNextPaymentCode(d.nextPaymentCode)
          setForm((f) => ({ ...f, payment_code: d.nextPaymentCode }))
        }
      })
      .catch(() => {})
  }, [authenticated])

  // 기존 데이터 로드
  useEffect(() => {
    if (!authenticated || !loadId) { if (loadId) setLoading(false); return }
    fetch('/api/admin/content/get', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(loadId, 10) }),
      cache: 'no-store',
    })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        const c = data?.data ?? data
        if (!c) return
        const timeOpts = c.voice_time_options
        let parsedTimeOpts: VoiceTimeOption[] = [{ minutes: 5, price: 3000, label: '5분' }]
        if (timeOpts) {
          const arr = typeof timeOpts === 'string' ? JSON.parse(timeOpts) : timeOpts
          if (Array.isArray(arr) && arr.length > 0) parsedTimeOpts = arr
        }
        setForm({
          content_type: 'voice',
          content_name: (c.content_name ?? '') + (duplicateId ? ' (복사)' : ''),
          book_cover_thumbnail: c.book_cover_thumbnail ?? '',
          book_cover_thumbnail_video: c.book_cover_thumbnail_video ?? '',
          price: c.price != null ? String(c.price) : '',
          payment_code: duplicateId ? (nextPaymentCode ?? '') : (c.payment_code ?? ''),
          is_new: !!c.is_new,
          show_exposed: !!c.is_exposed,
          summary: c.summary ?? '',
          introduction: c.introduction ?? '',
          recommendation: c.recommendation ?? '',
          menu_composition: c.menu_composition ?? '',
          voice_model: c.voice_model ?? 'gemini-2.5-flash-native-audio-preview-12-2025',
          voice_advisor_video_url: c.voice_advisor_video_url ?? '',
          voice_gender: c.voice_gender === 'male' ? 'male' : 'female',
          voice_style: c.voice_style ?? c.voice_tendency ?? 'warm',
          voice_name: c.voice_name ?? 'Aoede',
          voice_counselor_name: c.voice_counselor_name ?? '',
          voice_persona_prompt: c.voice_persona_prompt ?? '',
          voice_start_sound_url: c.voice_start_sound_url ?? '',
          voice_bubble_sound_url: c.voice_bubble_sound_url ?? '',
          voice_bubble_sound_probability_pct: typeof c.voice_bubble_sound_probability_pct === 'number' ? c.voice_bubble_sound_probability_pct : 5,
          voice_time_options: parsedTimeOpts,
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [authenticated, loadId, duplicateId, nextPaymentCode])

  // 파일 업로드 (이미지는 WebP 변환)
  const handleFileUpload = async (file: File, field: string) => {
    let uploadFile = file
    // 이미지 파일이고 썸네일 필드면 WebP로 변환
    if (file.type.startsWith('image/') && file.type !== 'image/webp') {
      try { uploadFile = await convertImageToWebp(file) } catch { /* 변환 실패 시 원본 사용 */ }
    }
    const fd = new FormData()
    fd.append('file', uploadFile)
    if (field !== 'book_cover_thumbnail') fd.append('folder', 'voice')
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '업로드 실패')
    const data = await res.json()
    setForm((f) => ({ ...f, [field]: data?.url ?? '' }))
  }

  // 파일 삭제 확인 팝업
  const [deleteConfirm, setDeleteConfirm] = useState<{ field: string; label: string } | null>(null)
  const [deleting, setDeleting] = useState(false)

  const requestFileDelete = (field: string, label: string) => {
    setDeleteConfirm({ field, label })
  }

  const confirmFileDelete = async () => {
    if (!deleteConfirm) return
    const url = (form as any)[deleteConfirm.field]
    if (!url) { setDeleteConfirm(null); return }
    setDeleting(true)
    try {
      await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', url }),
      })
    } catch { /* 삭제 실패해도 폼 필드는 비움 */ }
    setForm((f) => ({ ...f, [deleteConfirm.field]: '' }))
    setDeleting(false)
    setDeleteConfirm(null)
  }

  const cancelFileDelete = () => { setDeleteConfirm(null) }

  // 드래그&드롭 핸들러 (파일을 추출하여 handleFileUpload 호출)
  const handleFileDrop = async (e: React.DragEvent, field: string, acceptPrefix?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (acceptPrefix) {
      const typeOk = file.type.startsWith(acceptPrefix)
      // MIME 타입이 없을 때 확장자로 폴백 체크
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const extOk = acceptPrefix === 'video/' ? ['mp4', 'webm', 'mov'].includes(ext)
        : acceptPrefix === 'image/' ? ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext)
        : acceptPrefix === 'audio/' ? ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)
        : false
      if (!typeOk && !extOk) {
        alert(acceptPrefix === 'image/' ? '이미지 파일만 가능합니다.' : acceptPrefix === 'video/' ? '동영상 파일만 가능합니다.' : acceptPrefix === 'audio/' ? '오디오 파일만 가능합니다.' : '지원하지 않는 파일입니다.')
        return
      }
    }
    try { await handleFileUpload(file, field) } catch (err: unknown) { alert((err as Error)?.message || '업로드 실패') }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation() }

  // 이미지 모달
  const handleOpenContentImagesModal = (type: 'introduction' | 'recommendation' | 'menu_composition') => {
    const html = type === 'introduction' ? form.introduction : type === 'recommendation' ? form.recommendation : form.menu_composition
    setContentImages(extractImageUrlsFromHtml(html))
    setCurrentImageType(type)
    setShowContentImagesModal(true)
  }

  const handleContentImageUpload = async (file: File, index: number) => {
    if (!file?.type.startsWith('image/')) { alert('이미지 파일만 업로드 가능합니다.'); return }
    setUploadingContentImageIndex(index)
    try {
      const fd = new FormData(); fd.append('file', file); fd.append('folder', 'content')
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '업로드 실패')
      const data = await res.json()
      setContentImages((prev) => {
        const next = [...prev]; if (index >= next.length) next.length = index + 1; next[index] = data?.url || ''; return next
      })
    } catch (e: unknown) { alert((e as Error)?.message || '이미지 업로드 실패') }
    finally { setUploadingContentImageIndex(null) }
  }

  const handleRemoveContentImage = async (index: number) => {
    const url = contentImages[index]; if (!url) return
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', url }) })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '삭제 실패')
      setContentImages((prev) => prev.filter((_, i) => i !== index))
    } catch (e: unknown) { alert((e as Error)?.message || '이미지 삭제 실패') }
  }

  const handleCloseContentImagesModal = () => { setShowContentImagesModal(false); setCurrentImageType(null) }

  // HTML 미리보기
  const handleOpenHtmlPreview = (field: 'introduction' | 'recommendation' | 'menu_composition', title: string) => {
    const html = field === 'introduction' ? form.introduction : field === 'recommendation' ? form.recommendation : form.menu_composition
    setHtmlPreviewContent(buildProtectedHtml(html))
    setHtmlPreviewTitle(title)
    setShowHtmlPreview(true)
  }

  // 시간 상품 관리
  const addTimeOption = () => {
    setForm((f) => ({ ...f, voice_time_options: [...f.voice_time_options, { minutes: 5, price: 3000, label: '5분' }] }))
  }
  const removeTimeOption = (index: number) => {
    setForm((f) => ({ ...f, voice_time_options: f.voice_time_options.filter((_, i) => i !== index) }))
  }
  const updateTimeOption = (index: number, key: keyof VoiceTimeOption, value: string | number) => {
    setForm((f) => {
      const opts = [...f.voice_time_options]
      opts[index] = { ...opts[index], [key]: value }
      return { ...f, voice_time_options: opts }
    })
  }

  // 저장
  const handleSave = async () => {
    if (!form.content_name?.trim()) { alert('컨텐츠명을 입력하세요.'); return }
    if (form.voice_time_options.length === 0) { alert('시간 상품을 1개 이상 추가하세요.'); return }
    setSaving(true)
    try {
      const { show_exposed, ...rest } = form
      const body: Record<string, unknown> = {
        ...rest,
        voice_tendency: rest.voice_style, // voice_style과 동일 값 유지 (DB 호환)
        is_exposed: show_exposed,
        id: id && !duplicateId ? parseInt(id, 10) : undefined,
        payment_code: id && !duplicateId ? form.payment_code : '', // 새 생성/복제 시 서버에서 자동 부여
        price: form.price ? parseInt(form.price, 10) : 0,
        menu_items: [],
        preview_thumbnails: [],
        voice_time_options: JSON.stringify(form.voice_time_options),
      }
      if (!id) delete body.id
      const res = await fetch('/api/admin/content/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '저장 실패')
      alert('저장되었습니다.')
      if (!id && data?.data?.id) router.replace('/admin/form/voice?id=' + data.data.id)
    } catch (e: unknown) { alert((e as Error)?.message || '저장 실패') }
    finally { setSaving(false) }
  }

  return {
    // state
    id, duplicateId, authenticated, saving, loading, form, setForm,
    nextPaymentCode,
    showContentImagesModal, currentImageType, contentImages, uploadingContentImageIndex,
    showHtmlPreview, htmlPreviewContent, htmlPreviewTitle, htmlPreviewMode, setHtmlPreviewMode,
    htmlPreviewIframeRef,
    // handlers
    handleFileUpload, requestFileDelete, deleteConfirm, deleting, confirmFileDelete, cancelFileDelete,
    handleFileDrop, handleDragOver,
    handleOpenContentImagesModal, handleContentImageUpload,
    handleRemoveContentImage, handleCloseContentImagesModal,
    handleOpenHtmlPreview, setShowHtmlPreview,
    addTimeOption, removeTimeOption, updateTimeOption,
    handleSave,
  }
}
