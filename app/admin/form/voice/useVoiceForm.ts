import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { buildProtectedHtml, extractImageUrlsFromHtml } from './voice-form-html'

export type ContentImageModalType = 'introduction' | 'recommendation' | 'menu_composition' | null
export type HtmlPreviewModeType = 'pc' | 'mobile'

/** 기본시간: 무료시작 시 폼에서 주어지는 시간 (가격 0원 또는 유료 전환 시 설정) */
export interface VoiceTimeOptionDefault {
  type: 'default'
  minutes: number
  seconds?: number
  price: number
  label: string
}
/** 시간연장: 보이스 화면에서 상담시간 연장 시 선택하는 유료 옵션 */
export interface VoiceTimeOptionExtension {
  type: 'extension'
  minutes: number
  seconds?: number
  price: number
  label: string
}
/** 충전시간: 분:초 + 충전 1회 가격 + 차감 단위(N초당 M원) */
export interface VoiceTimeOptionCharge {
  type: 'charge'
  minutes: number
  seconds?: number
  /** 충전 1회 가격(원). 예: 1000 */
  price: number
  label?: string
  rate_seconds: number
  rate_won: number
}
export type VoiceTimeOption = VoiceTimeOptionDefault | VoiceTimeOptionExtension | VoiceTimeOptionCharge

/** 레거시: type 없이 저장된 항목은 extension으로 간주 */
export function isExtensionOption(o: any): o is VoiceTimeOptionExtension {
  return o?.type === 'extension' || (o && o.type != 'default' && o.type != 'charge' && typeof o?.price === 'number')
}
export function isDefaultOption(o: any): o is VoiceTimeOptionDefault {
  return o?.type === 'default'
}
export function isChargeOption(o: any): o is VoiceTimeOptionCharge {
  return o?.type === 'charge'
}

export interface VoiceConversationSound {
  label: string
  url: string
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
  /** 무료속성(8006 동일): 본인정보 숨김, 만세력 비표시, 음성모델 유저정보 미전달 등 */
  apply_ppoing_attributes: boolean
  summary: string
  introduction: string
  recommendation: string
  menu_composition: string
  voice_model: string
  /** 음성 프로바이더: gemini | gpt | grok | hume-evi-3 등 */
  voice_provider: string
  /** GPT Realtime 전용 음성 (alloy, echo, fable, onyx, nova, shimmer, cedar, marin 등) */
  voice_gpt_name: string
  /** GPT Realtime 전용 Temperature (0.6~1.2) */
  voice_temperature: number
  /** Hume EVI 전용 Config ID */
  voice_hume_config_id: string
  voice_advisor_video_url: string
  voice_gender: 'female' | 'male'
  voice_style: string
  voice_name: string
  voice_counselor_name: string
  voice_persona_prompt: string
  /** 음성 상담 최초 인사 (접속 시 AI 주입). {{userName}} 치환 */
  voice_initial_greet_prompt: string
  voice_resumed_greet_prompt: string
  voice_start_sound_url: string
  /** 대화중 소리 목록 (라벨 + URL). 여러 개 추가 가능 */
  voice_conversation_sounds: VoiceConversationSound[]
  /** 대화중 소리 발현 확률 % */
  voice_conversation_sound_probability_pct: number
  voice_time_options: VoiceTimeOption[]
  /** 음높이 (semitones) -20~20. 차분:-0.5~-1.5, 밝음:+2 이상 */
  voice_pitch: number | ''
  /** 발화 속도 0.25~4.0. 별님아씨 추천 0.8~0.9 */
  voice_speaking_rate: number | ''
  /** 음량 증폭(dB) -96~16 */
  voice_volume_gain: number | ''
  /** 침묵깨기 타이머(초) "재촉,관찰,환기" 순. 예: "3,5,5" */
  voice_silence_break_config: string
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
  apply_ppoing_attributes: false,
  summary: '',
  introduction: '',
  recommendation: '',
  menu_composition: '',
  voice_model: 'gemini-live-2.5-flash-native-audio',
  voice_provider: 'gemini',
  voice_gpt_name: 'alloy',
  voice_temperature: 0.8,
  voice_hume_config_id: '',
  voice_advisor_video_url: '',
  voice_gender: 'female',
  voice_style: 'warm',
  voice_name: 'Aoede',
  voice_counselor_name: '',
  voice_persona_prompt: '',
  voice_initial_greet_prompt: '',
  voice_resumed_greet_prompt: '',
  voice_start_sound_url: '',
  voice_conversation_sounds: [],
  voice_conversation_sound_probability_pct: 5,
  voice_time_options: [
    { type: 'default', minutes: 5, seconds: 0, price: 0, label: '5분(무료)' },
    { type: 'extension', minutes: 5, seconds: 0, price: 3000, label: '5분 연장' },
    { type: 'charge', minutes: 11, seconds: 0, price: 1000, label: '1000원 충전', rate_seconds: 12, rate_won: 19 },
  ],
  voice_pitch: '',
  voice_speaking_rate: '',
  voice_volume_gain: '',
  voice_silence_break_config: '3,5,5',
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
  const initialFormSnapshotRef = useRef<string | null>(null)
  /** 저장 직후 기준 스냅샷. 저장 후 수정 없이 취소하면 팝업 안 띄우기 위해 사용 */
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingContent, setDeletingContent] = useState(false)

  const toFormSnapshot = (f: VoiceFormData) => JSON.stringify({ ...f, voice_time_options: f.voice_time_options })
  const baselineSnapshot = lastSavedSnapshot ?? initialFormSnapshotRef.current
  const isDirty = useMemo(() => {
    if (baselineSnapshot === null) return false
    return toFormSnapshot(form) !== baselineSnapshot
  }, [form, baselineSnapshot])

  const goBack = () => { window.location.href = '/admin' }

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

  // 다음 결제코드 (신규 추가 시 초기 스냅샷도 이 시점에 설정)
  useEffect(() => {
    if (!authenticated) return
    fetch('/api/admin/content/next-payment-code?type=voice', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.nextPaymentCode) {
          setNextPaymentCode(d.nextPaymentCode)
          setForm((f) => {
            const next = { ...f, payment_code: d.nextPaymentCode }
            if (!loadId) initialFormSnapshotRef.current = toFormSnapshot(next)
            return next
          })
        } else if (!loadId) {
          initialFormSnapshotRef.current = toFormSnapshot(INITIAL_FORM)
        }
      })
      .catch(() => { if (!loadId) initialFormSnapshotRef.current = toFormSnapshot(INITIAL_FORM) })
  }, [authenticated, loadId])

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
        let parsedTimeOpts: VoiceTimeOption[] = [
          { type: 'default', minutes: 5, seconds: 0, price: 0, label: '5분(무료)' },
          { type: 'extension', minutes: 5, seconds: 0, price: 3000, label: '5분 연장' },
          { type: 'charge', minutes: 11, seconds: 0, price: 1000, label: '1000원 충전', rate_seconds: 12, rate_won: 19 },
        ]
        if (timeOpts) {
          try {
            const arr = typeof timeOpts === 'string' ? JSON.parse(timeOpts) : timeOpts
            if (Array.isArray(arr) && arr.length > 0) {
              const normalized: VoiceTimeOption[] = []
              let hasDefault = false
              let hasCharge = false
              for (const o of arr) {
                if (o?.type === 'default' || (o && (o.price === 0 || o.price === '0') && !hasDefault)) {
                  normalized.push({
                    type: 'default',
                    minutes: Math.max(0, parseInt(o?.minutes, 10) || 0),
                    seconds: Math.min(59, Math.max(0, parseInt(o?.seconds, 10) || 0)),
                    price: parseInt(o?.price, 10) || 0,
                    label: String(o?.label ?? '').trim() || '0분(무료)',
                  })
                  hasDefault = true
                } else if (o?.type === 'charge' || (o?.rate_seconds != null && o?.rate_won != null)) {
                  normalized.push({
                    type: 'charge',
                    minutes: Math.max(0, parseInt(o?.minutes, 10) || 11),
                    seconds: Math.min(59, Math.max(0, parseInt(o?.seconds, 10) || 0)),
                    price: Math.max(0, parseInt(o?.price, 10) || 1000),
                    label: String(o?.label ?? '').trim() || undefined,
                    rate_seconds: Math.max(1, parseInt(o?.rate_seconds, 10) || 12),
                    rate_won: Math.max(1, parseInt(o?.rate_won, 10) || 19),
                  })
                  hasCharge = true
                } else {
                  normalized.push({
                    type: 'extension',
                    minutes: Math.max(0, parseInt(o?.minutes, 10) || 0),
                    seconds: Math.min(59, Math.max(0, parseInt(o?.seconds, 10) || 0)),
                    price: parseInt(o?.price, 10) || 0,
                    label: String(o?.label ?? '').trim() || '0분',
                  })
                }
              }
              if (!hasDefault) {
                normalized.unshift({ type: 'default', minutes: 5, seconds: 0, price: 0, label: '5분(무료)' })
              }
              if (!hasCharge) {
                normalized.push({ type: 'charge', minutes: 11, seconds: 0, price: 1000, label: '1000원 충전', rate_seconds: 12, rate_won: 19 })
              }
              parsedTimeOpts = normalized
            }
          } catch {
            /* keep default parsedTimeOpts */
          }
        }
        const loadedForm: VoiceFormData = {
          content_type: 'voice',
          content_name: (c.content_name ?? '') + (duplicateId ? ' (복사)' : ''),
          book_cover_thumbnail: c.book_cover_thumbnail ?? '',
          book_cover_thumbnail_video: c.book_cover_thumbnail_video ?? '',
          price: c.price != null ? String(c.price) : '',
          payment_code: duplicateId ? (nextPaymentCode ?? '') : (c.payment_code ?? ''),
          is_new: !!c.is_new,
          show_exposed: !!c.is_exposed,
          apply_ppoing_attributes: !!c.apply_ppoing_attributes,
          summary: c.summary ?? '',
          introduction: c.introduction ?? '',
          recommendation: c.recommendation ?? '',
          menu_composition: c.menu_composition ?? '',
          voice_model: c.voice_model ?? 'gemini-live-2.5-flash-native-audio',
          voice_provider: c.voice_provider ?? 'gemini',
          voice_gpt_name: c.voice_gpt_name ?? 'alloy',
          voice_temperature: c.voice_temperature ?? 0.8,
          voice_hume_config_id: c.voice_hume_config_id ?? '',
          voice_advisor_video_url: c.voice_advisor_video_url ?? '',
          voice_gender: c.voice_gender === 'male' ? 'male' : 'female',
          voice_style: c.voice_style ?? c.voice_tendency ?? 'warm',
          voice_name: c.voice_name ?? 'Aoede',
          voice_counselor_name: c.voice_counselor_name ?? '',
          voice_persona_prompt: c.voice_persona_prompt ?? '',
          voice_initial_greet_prompt: c.voice_initial_greet_prompt ?? '',
          voice_resumed_greet_prompt: c.voice_resumed_greet_prompt ?? '',
          voice_start_sound_url: c.voice_start_sound_url ?? '',
          voice_conversation_sounds: (() => {
            const raw = c.voice_conversation_sounds
            if (Array.isArray(raw) && raw.length > 0) {
              return raw.map((s: any) => ({ label: s?.label ?? '', url: s?.url ?? '' }))
            }
            if (c.voice_bubble_sound_url) {
              return [{ label: '방울 소리', url: c.voice_bubble_sound_url }]
            }
            return []
          })(),
          voice_conversation_sound_probability_pct: typeof c.voice_conversation_sound_probability_pct === 'number'
            ? c.voice_conversation_sound_probability_pct
            : (typeof c.voice_bubble_sound_probability_pct === 'number' ? c.voice_bubble_sound_probability_pct : 5),
          voice_time_options: parsedTimeOpts,
          voice_pitch: c.voice_pitch != null && c.voice_pitch !== '' ? Number(c.voice_pitch) : '',
          voice_speaking_rate: c.voice_speaking_rate != null && c.voice_speaking_rate !== '' ? Number(c.voice_speaking_rate) : '',
          voice_volume_gain: c.voice_volume_gain != null && c.voice_volume_gain !== '' ? Number(c.voice_volume_gain) : '',
          voice_silence_break_config: typeof c.voice_silence_break_config === 'string' && c.voice_silence_break_config.trim()
            ? c.voice_silence_break_config.trim()
            : '3,5,5',
        }
        setForm(loadedForm)
        initialFormSnapshotRef.current = JSON.stringify({ ...loadedForm, voice_time_options: loadedForm.voice_time_options })
        setLastSavedSnapshot(null)
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

  // 시간 상품 관리: 기본시간(1개) / 시간연장(N개) / 충전시간(1개)
  const addTimeOption = () => {
    setForm((f) => ({
      ...f,
      voice_time_options: [...f.voice_time_options, { type: 'extension', minutes: 5, seconds: 0, price: 3000, label: '5분 연장' }],
    }))
  }
  const removeTimeOption = (index: number) => {
    setForm((f) => {
      const opt = f.voice_time_options[index]
      if (opt && (opt as any).type !== 'extension') return f // 기본시간·충전시간은 삭제 불가
      return { ...f, voice_time_options: f.voice_time_options.filter((_, i) => i !== index) }
    })
  }
  const updateTimeOption = (index: number, key: string, value: string | number) => {
    setForm((f) => {
      const opts = [...f.voice_time_options]
      const o = opts[index] as any
      if (!o) return f
      if (o.type === 'default') {
        opts[index] = { ...o, [key]: key === 'minutes' || key === 'seconds' || key === 'price' ? Number(value) : value }
      } else if (o.type === 'extension') {
        opts[index] = { ...o, [key]: key === 'minutes' || key === 'seconds' || key === 'price' ? Number(value) : value }
      } else if (o.type === 'charge') {
        if (key === 'rate_seconds' || key === 'rate_won' || key === 'price' || key === 'minutes' || key === 'seconds') opts[index] = { ...o, [key]: Number(value) }
        else opts[index] = { ...o, [key]: value }
      }
      return { ...f, voice_time_options: opts }
    })
  }

  const addConversationSound = () => {
    setForm((f) => ({ ...f, voice_conversation_sounds: [...f.voice_conversation_sounds, { label: '', url: '' }] }))
  }
  const removeConversationSound = (index: number) => {
    setForm((f) => ({
      ...f,
      voice_conversation_sounds: f.voice_conversation_sounds.filter((_, i) => i !== index),
    }))
  }
  const updateConversationSound = (index: number, key: keyof VoiceConversationSound, value: string) => {
    setForm((f) => {
      const list = [...f.voice_conversation_sounds]
      if (!list[index]) list[index] = { label: '', url: '' }
      list[index] = { ...list[index], [key]: value }
      return { ...f, voice_conversation_sounds: list }
    })
  }
  const handleConversationSoundFileUpload = async (index: number, file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', 'voice')
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '업로드 실패')
    const data = await res.json()
    const url = data?.url ?? ''
    setForm((f) => {
      const list = [...f.voice_conversation_sounds]
      if (!list[index]) list[index] = { label: '', url: '' }
      list[index] = { ...list[index], url }
      return { ...f, voice_conversation_sounds: list }
    })
  }

  // 저장
  const handleSave = async () => {
    if (!form.content_name?.trim()) { alert('컨텐츠명을 입력하세요.'); return }
    const hasDefault = form.voice_time_options.some((o: any) => o?.type === 'default')
    const hasExtension = form.voice_time_options.some((o: any) => o?.type === 'extension')
    const hasCharge = form.voice_time_options.some((o: any) => o?.type === 'charge')
    if (!hasDefault || !hasCharge) { alert('기본시간과 충전시간 설정이 필요합니다.'); return }
    if (!hasExtension) { alert('시간연장 옵션을 1개 이상 추가하세요.'); return }
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
        voice_conversation_sounds: form.voice_conversation_sounds,
        voice_conversation_sound_probability_pct: form.voice_conversation_sound_probability_pct,
        voice_provider: rest.voice_provider,
        voice_hume_config_id: rest.voice_hume_config_id,
        voice_gpt_name: rest.voice_gpt_name,
        voice_temperature: rest.voice_temperature,
        voice_pitch: rest.voice_pitch === '' || rest.voice_pitch == null ? null : Number(rest.voice_pitch),
        voice_speaking_rate: rest.voice_speaking_rate === '' || rest.voice_speaking_rate == null ? null : Number(rest.voice_speaking_rate),
        voice_volume_gain: rest.voice_volume_gain === '' || rest.voice_volume_gain == null ? null : Number(rest.voice_volume_gain),
      }
      if (!id) delete body.id
      const res = await fetch('/api/admin/content/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || '저장 실패')
      const savedSnapshot = toFormSnapshot(form)
      initialFormSnapshotRef.current = savedSnapshot
      setLastSavedSnapshot(savedSnapshot)
      setShowSaveSuccess(true)
      setTimeout(() => setShowSaveSuccess(false), 2500)
      if (!id && data?.data?.id) router.replace('/admin/form/voice?id=' + data.data.id)
    } catch (e: unknown) { alert((e as Error)?.message || '저장 실패') }
    finally { setSaving(false) }
  }

  const handleDelete = useCallback(async () => {
    if (!id || duplicateId) return
    setDeletingContent(true)
    try {
      const res = await fetch(`/api/admin/content/delete?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error || '삭제에 실패했습니다.')
      }
      router.push('/admin')
    } catch (e: unknown) {
      alert((e as Error)?.message || '삭제에 실패했습니다.')
    } finally {
      setDeletingContent(false)
      setShowDeleteConfirm(false)
    }
  }, [id, duplicateId, router])

  return {
    // state
    id, duplicateId, authenticated, saving, loading, form, setForm,
    nextPaymentCode,
    showContentImagesModal, currentImageType, contentImages, uploadingContentImageIndex,
    showHtmlPreview, htmlPreviewContent, htmlPreviewTitle, htmlPreviewMode, setHtmlPreviewMode,
    htmlPreviewIframeRef,
    isDirty,
    showCancelConfirm, setShowCancelConfirm,
    showSaveSuccess, setShowSaveSuccess,
    showDeleteConfirm, setShowDeleteConfirm,
    deletingContent,
    goBack,
    // handlers
    handleFileUpload, requestFileDelete, deleteConfirm, deleting, confirmFileDelete, cancelFileDelete,
    handleFileDrop, handleDragOver,
    handleOpenContentImagesModal, handleContentImageUpload,
    handleRemoveContentImage, handleCloseContentImagesModal,
    handleOpenHtmlPreview, setShowHtmlPreview,
    addTimeOption, removeTimeOption, updateTimeOption,
    addConversationSound, removeConversationSound, updateConversationSound, handleConversationSoundFileUpload,
    handleSave,
    handleDelete,
  }
}
