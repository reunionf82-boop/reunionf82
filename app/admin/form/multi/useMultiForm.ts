'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

/** 시간 상품: 기본시간 / 시간연장 / 충전시간 (음성형과 동일 구조) */
export interface MultiTimeOptionDefault {
  type: 'default'
  minutes: number
  seconds?: number
  price: number
  label: string
}
export interface MultiTimeOptionExtension {
  type: 'extension'
  minutes: number
  seconds?: number
  price: number
  label: string
}
export interface MultiTimeOptionCharge {
  type: 'charge'
  minutes: number
  seconds?: number
  price: number
  label?: string
  rate_seconds: number
  rate_won: number
}
export type MultiTimeOption = MultiTimeOptionDefault | MultiTimeOptionExtension | MultiTimeOptionCharge

export function isMultiDefaultOption(o: MultiTimeOption | unknown): o is MultiTimeOptionDefault {
  return (o as any)?.type === 'default'
}
export function isMultiExtensionOption(o: MultiTimeOption | unknown): o is MultiTimeOptionExtension {
  return (o as any)?.type === 'extension'
}
export function isMultiChargeOption(o: MultiTimeOption | unknown): o is MultiTimeOptionCharge {
  return (o as any)?.type === 'charge'
}

export interface MultiFormData {
  content_type: 'multi'
  content_name: string
  book_cover_thumbnail: string
  book_cover_thumbnail_video: string
  price: string
  payment_code: string
  show_exposed: boolean
  is_new: boolean
  /** 무료속성(8006 동일): 본인정보 숨김, 만세력 비표시 등 */
  apply_ppoing_attributes: boolean
  /** 전체 시나리오: 3인이 신점/타로/사주/역술가 관점으로 경쟁 상담하도록 하는 시스템 프롬프트 */
  multi_system_prompt: string
  multi_persona_1_prompt: string
  multi_persona_2_prompt: string
  multi_persona_3_prompt: string
  multi_persona_1_name: string
  multi_persona_2_name: string
  multi_persona_3_name: string
  multi_persona_1_gender: 'female' | 'male'
  multi_persona_2_gender: 'female' | 'male'
  multi_persona_3_gender: 'female' | 'male'
  multi_cartesia_voice_id_1: string
  multi_cartesia_voice_id_2: string
  multi_cartesia_voice_id_3: string
  multi_cartesia_speed: number
  multi_cartesia_volume: number
  multi_cartesia_emotion: string
  multi_cartesia_emotions: string[]
  multi_start_sound_url: string
  multi_end_sound_url: string
  multi_time_options: MultiTimeOption[]
  multi_advisor_video_urls_1: string[]
  multi_advisor_video_urls_2: string[]
  multi_advisor_video_urls_3: string[]
  summary: string
  introduction: string
  recommendation: string
  menu_composition: string
}

const DEFAULT_TIME_OPTIONS: MultiTimeOption[] = [
  { type: 'default', minutes: 5, seconds: 0, price: 0, label: '5분(무료)' },
  { type: 'extension', minutes: 5, seconds: 0, price: 3000, label: '5분 연장' },
  { type: 'charge', minutes: 11, seconds: 0, price: 1000, label: '1000원 충전', rate_seconds: 12, rate_won: 19 },
]

const INITIAL_FORM: MultiFormData = {
  content_type: 'multi',
  content_name: '',
  book_cover_thumbnail: '',
  book_cover_thumbnail_video: '',
  price: '0',
  payment_code: '',
  show_exposed: false,
  is_new: false,
  apply_ppoing_attributes: false,
  multi_system_prompt: `당신은 한 명의 AI이지만, 이 상담에서는 서로 다른 관점의 세 역술가(신점·타로·사주/역술가)로 빙의해 행동합니다.
- 매 턴마다 세 역술가 중 한 명만 대표로 말합니다. 누가 말할지는 맥락상 가장 적절한 한 명을 선택하세요.
- 세 역술가는 같은 사용자에 대해 각자의 방식(신점, 타로, 사주·역술)으로 해석하며, 서로 다른 관점을 제시할 수 있지만 대화는 자연스럽게 이어지게 하세요.
- 답변 맨 앞에 반드시 [1], [2], [3] 중 하나만 한 줄로 쓴 뒤 줄바꿈하고, 그 다음에 선택한 역술가의 대사를 씁니다. 예: "[1]\\n네, 제가 보기엔요..."
- [1]=첫 번째 페르소나, [2]=두 번째, [3]=세 번째 페르소나입니다. 이 태그는 음성 합성과 영상 전환에 사용되므로 반드시 지키세요.`,
  multi_persona_1_prompt: '',
  multi_persona_2_prompt: '',
  multi_persona_3_prompt: '',
  multi_persona_1_name: '',
  multi_persona_2_name: '',
  multi_persona_3_name: '',
  multi_persona_1_gender: 'female',
  multi_persona_2_gender: 'female',
  multi_persona_3_gender: 'female',
  multi_cartesia_voice_id_1: '304fdbd8-65e6-40d6-ab78-f9d18b9efdf9',
  multi_cartesia_voice_id_2: '15628352-2ede-4f1b-89e6-ceda0c983fbc',
  multi_cartesia_voice_id_3: '29e5f8b4-b953-4160-848f-40fae182235b',
  multi_cartesia_speed: 1.0,
  multi_cartesia_volume: 1.0,
  multi_cartesia_emotion: 'calm',
  multi_cartesia_emotions: ['[laughter]', '[sigh]', '[gasp]', '[um]', '[uh]', '[hmm]', '[clears throat]', '[cough]'],
  multi_start_sound_url: '',
  multi_end_sound_url: '',
  multi_time_options: [...DEFAULT_TIME_OPTIONS],
  multi_advisor_video_urls_1: [],
  multi_advisor_video_urls_2: [],
  multi_advisor_video_urls_3: [],
  summary: '',
  introduction: '',
  recommendation: '',
  menu_composition: '',
}

/** 카테시아 보이스 (다자형): 여성/남성 구분용 gender 포함 */
export const CARTESIA_VOICES: { id: string; label: string; gender: 'female' | 'male' }[] = [
  { id: '304fdbd8-65e6-40d6-ab78-f9d18b9efdf9', label: '지현 - 앵커우먼', gender: 'female' },
  { id: '15628352-2ede-4f1b-89e6-ceda0c983fbc', label: '지우 - 서비스 전문가', gender: 'female' },
  { id: '29e5f8b4-b953-4160-848f-40fae182235b', label: '미미 - 쇼 스토퍼', gender: 'female' },
  { id: '663afeec-d082-4ab5-827e-2e41bf73a25b', label: '재철 - 단호한 여성', gender: 'female' },
  { id: 'cd6c48a9-774b-4397-98b4-9948c0a790f0', label: '수진 - 도움되는 말투', gender: 'female' },
  { id: 'cac92886-4b7c-4bc1-a524-e0f79c0381be', label: '유나 - 다정한 언니', gender: 'female' },
  { id: 'af6beeea-d732-40b6-8292-73af0035b740', label: '병태 - 집행자', gender: 'male' },
  { id: '537a82ae-4926-4bfb-9aec-aff0b80a12a5', label: '민호 - 친근한 영혼', gender: 'male' },
  { id: 'f7755efb-1848-4321-aa22-5e5be5d32486', label: '려욱 - 느긋한 친구', gender: 'male' },
]

/** Cartesia 감정 드롭다운 (단일 선택) */
export const CARTESIA_EMOTION_OPTIONS: { value: string; label: string; emoji: string }[] = [
  { value: 'neutral', label: 'Neutral (뉴트럴)', emoji: '😐' },
  { value: 'calm', label: 'Calm (차분함)', emoji: '😌' },
  { value: 'content', label: 'Content (만족함)', emoji: '😊' },
  { value: 'excited', label: 'Excited (신남)', emoji: '🤩' },
  { value: 'sad', label: 'Sad (슬픔)', emoji: '😔' },
  { value: 'angry', label: 'Angry (화남)', emoji: '😠' },
  { value: 'scared', label: 'Scared (두려움)', emoji: '😱' },
]

/** Cartesia 특수 태그 (TTS 연출) */
export const CARTESIA_SPECIAL_TAGS = [
  { value: '[laughter]', label: '웃음 [laughter]' },
  { value: '[sigh]', label: '한숨 [sigh]' },
  { value: '[gasp]', label: '놀람/헐떡임 [gasp]' },
  { value: '[um]', label: '말 막힘 [um]' },
  { value: '[uh]', label: '말 막힘 [uh]' },
  { value: '[hmm]', label: '흠 [hmm]' },
  { value: '[clears throat]', label: '목청 [clears throat]' },
  { value: '[cough]', label: '기침 [cough]' },
]

function parseMultiTimeOptions(raw: unknown): MultiTimeOption[] {
  if (!raw) return [...DEFAULT_TIME_OPTIONS]
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr) || arr.length === 0) return [...DEFAULT_TIME_OPTIONS]
    const result: MultiTimeOption[] = []
    let hasDefault = false
    let hasCharge = false
    for (const o of arr) {
      if ((o as any)?.type === 'default' || (!hasDefault && (o as any)?.price === 0)) {
        result.push({
          type: 'default',
          minutes: Math.max(0, parseInt((o as any)?.minutes, 10) || 0),
          seconds: Math.min(59, Math.max(0, parseInt((o as any)?.seconds, 10) || 0)),
          price: parseInt((o as any)?.price, 10) || 0,
          label: String((o as any)?.label ?? '').trim() || '0분(무료)',
        })
        hasDefault = true
      } else if ((o as any)?.type === 'charge' || ((o as any)?.rate_seconds != null && (o as any)?.rate_won != null)) {
        result.push({
          type: 'charge',
          minutes: Math.max(0, parseInt((o as any)?.minutes, 10) || 11),
          seconds: Math.min(59, Math.max(0, parseInt((o as any)?.seconds, 10) || 0)),
          price: Math.max(0, parseInt((o as any)?.price, 10) || 1000),
          label: String((o as any)?.label ?? '').trim() || undefined,
          rate_seconds: Math.max(1, parseInt((o as any)?.rate_seconds, 10) || 12),
          rate_won: Math.max(1, parseInt((o as any)?.rate_won, 10) || 19),
        })
        hasCharge = true
      } else {
        result.push({
          type: 'extension',
          minutes: Math.max(0, parseInt((o as any)?.minutes, 10) || 0),
          seconds: Math.min(59, Math.max(0, parseInt((o as any)?.seconds, 10) || 0)),
          price: parseInt((o as any)?.price, 10) || 0,
          label: String((o as any)?.label ?? '').trim() || '0분',
        })
      }
    }
    if (!hasDefault) result.unshift(DEFAULT_TIME_OPTIONS[0])
    if (!hasCharge) result.push(DEFAULT_TIME_OPTIONS[2] as MultiTimeOptionCharge)
    return result
  } catch {
    return [...DEFAULT_TIME_OPTIONS]
  }
}

export function useMultiForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const id = searchParams?.get('id')
  const duplicateId = searchParams?.get('duplicate')
  const loadId = id || duplicateId

  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!loadId)
  const [nextPaymentCode, setNextPaymentCode] = useState<string | null>(null)
  const [form, setForm] = useState<MultiFormData>(INITIAL_FORM)
  const initialFormSnapshotRef = useRef<string | null>(null)
  /** 저장 직후 기준 스냅샷. 저장 후 수정 없이 취소하면 팝업 안 띄우기 위해 사용 */
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deletingContent, setDeletingContent] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ field: string; label: string } | null>(null)
  const [uploadingAdvisorVideo, setUploadingAdvisorVideo] = useState(false)

  const toFormSnapshot = (f: MultiFormData) =>
    JSON.stringify({ ...f, multi_time_options: f.multi_time_options })
  const baselineSnapshot = lastSavedSnapshot ?? initialFormSnapshotRef.current
  const isDirty = useMemo(() => {
    if (baselineSnapshot === null) return false
    return toFormSnapshot(form) !== baselineSnapshot
  }, [form, baselineSnapshot])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/auth/check', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return
        if (d.authenticated) setAuthenticated(true)
        else {
          setAuthenticated(false)
          router.push('/admin/login')
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAuthenticated(false)
          router.push('/admin/login')
        }
      })
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!authenticated) return
    fetch('/api/admin/content/next-payment-code?type=multi', { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.nextPaymentCode) {
          setNextPaymentCode(d.nextPaymentCode)
          if (!loadId) {
            setForm((f) => {
              const next = { ...f, payment_code: d.nextPaymentCode }
              initialFormSnapshotRef.current = toFormSnapshot(next)
              return next
            })
          }
        } else if (!loadId) {
          initialFormSnapshotRef.current = toFormSnapshot(INITIAL_FORM)
        }
      })
      .catch(() => { if (!loadId) initialFormSnapshotRef.current = toFormSnapshot(INITIAL_FORM) })
  }, [authenticated, loadId])

  useEffect(() => {
    if (!authenticated || !loadId) {
      if (loadId) setLoading(false)
      return
    }
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
        const loaded: MultiFormData = {
          ...INITIAL_FORM,
          content_type: 'multi',
          content_name: (c.content_name ?? '') + (duplicateId ? ' (복사)' : ''),
          book_cover_thumbnail: c.book_cover_thumbnail ?? '',
          book_cover_thumbnail_video: c.book_cover_thumbnail_video ?? '',
          price: c.price != null ? String(c.price) : '0',
          payment_code: duplicateId ? (nextPaymentCode ?? '') : (c.payment_code ?? ''),
          show_exposed: !!c.is_exposed,
          is_new: !!c.is_new,
          apply_ppoing_attributes: !!c.apply_ppoing_attributes,
          multi_persona_1_prompt: c.multi_persona_1_prompt ?? '',
          multi_persona_2_prompt: c.multi_persona_2_prompt ?? '',
          multi_persona_3_prompt: c.multi_persona_3_prompt ?? '',
          multi_system_prompt: c.multi_system_prompt ?? INITIAL_FORM.multi_system_prompt,
          multi_persona_1_name: c.multi_persona_1_name ?? '',
          multi_persona_2_name: c.multi_persona_2_name ?? '',
          multi_persona_3_name: c.multi_persona_3_name ?? '',
          multi_persona_1_gender: (c.multi_persona_1_gender === 'male' ? 'male' : 'female') as 'female' | 'male',
          multi_persona_2_gender: (c.multi_persona_2_gender === 'male' ? 'male' : 'female') as 'female' | 'male',
          multi_persona_3_gender: (c.multi_persona_3_gender === 'male' ? 'male' : 'female') as 'female' | 'male',
          multi_cartesia_voice_id_1: (() => { const g = c.multi_persona_1_gender === 'male' ? 'male' : 'female'; const id = c.multi_cartesia_voice_id_1 ?? INITIAL_FORM.multi_cartesia_voice_id_1; const inList = CARTESIA_VOICES.some((v) => v.gender === g && v.id === id); return inList ? id : (CARTESIA_VOICES.find((v) => v.gender === g)?.id ?? id); })(),
          multi_cartesia_voice_id_2: (() => { const g = c.multi_persona_2_gender === 'male' ? 'male' : 'female'; const id = c.multi_cartesia_voice_id_2 ?? INITIAL_FORM.multi_cartesia_voice_id_2; const inList = CARTESIA_VOICES.some((v) => v.gender === g && v.id === id); return inList ? id : (CARTESIA_VOICES.find((v) => v.gender === g)?.id ?? id); })(),
          multi_cartesia_voice_id_3: (() => { const g = c.multi_persona_3_gender === 'male' ? 'male' : 'female'; const id = c.multi_cartesia_voice_id_3 ?? INITIAL_FORM.multi_cartesia_voice_id_3; const inList = CARTESIA_VOICES.some((v) => v.gender === g && v.id === id); return inList ? id : (CARTESIA_VOICES.find((v) => v.gender === g)?.id ?? id); })(),
          multi_cartesia_speed: typeof c.multi_cartesia_speed === 'number' ? c.multi_cartesia_speed : 1.0,
          multi_cartesia_volume: typeof c.multi_cartesia_volume === 'number' ? c.multi_cartesia_volume : 1.0,
          multi_cartesia_emotion: c.multi_cartesia_emotion ?? 'calm',
          multi_cartesia_emotions: Array.isArray(c.multi_cartesia_emotions) ? c.multi_cartesia_emotions : INITIAL_FORM.multi_cartesia_emotions,
          multi_start_sound_url: c.multi_start_sound_url ?? '',
          multi_end_sound_url: c.multi_end_sound_url ?? '',
          multi_time_options: parseMultiTimeOptions(c.multi_time_options),
          multi_advisor_video_urls_1: (() => {
            const a = Array.isArray(c.multi_advisor_video_urls_1) ? c.multi_advisor_video_urls_1 : []
            if (a.length > 0) return a
            return Array.isArray(c.multi_advisor_video_urls) ? c.multi_advisor_video_urls : []
          })(),
          multi_advisor_video_urls_2: Array.isArray(c.multi_advisor_video_urls_2) ? c.multi_advisor_video_urls_2 : [],
          multi_advisor_video_urls_3: Array.isArray(c.multi_advisor_video_urls_3) ? c.multi_advisor_video_urls_3 : [],
          summary: c.summary ?? '',
          introduction: c.introduction ?? '',
          recommendation: c.recommendation ?? '',
          menu_composition: c.menu_composition ?? '',
        }
        setForm(loaded)
        initialFormSnapshotRef.current = toFormSnapshot(loaded)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [authenticated, loadId, duplicateId, nextPaymentCode])

  const handleFileUpload = async (file: File, field: string) => {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', 'multi')
    const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || '업로드 실패')
    const data = await res.json()
    setForm((f) => ({ ...f, [field]: data?.url ?? '' }))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleFileDrop = async (e: React.DragEvent, field: string, acceptPrefix: 'image/' | 'video/' | 'audio/') => {
    e.preventDefault()
    e.stopPropagation()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (acceptPrefix === 'image/' && !file.type.startsWith('image/')) {
      alert('이미지 파일만 가능합니다.')
      return
    }
    if (acceptPrefix === 'video/' && !['video/', 'application/'].some((p) => file.type.startsWith(p)) && !['mp4', 'webm', 'mov'].includes((file.name.split('.').pop() || '').toLowerCase())) {
      alert('동영상 파일만 가능합니다.')
      return
    }
    if (acceptPrefix === 'audio/' && !file.type.startsWith('audio/') && !['mp3', 'wav', 'ogg', 'm4a'].includes((file.name.split('.').pop() || '').toLowerCase())) {
      alert('오디오 파일만 가능합니다.')
      return
    }
    try {
      await handleFileUpload(file, field)
    } catch (err) {
      alert((err as Error)?.message || '업로드 실패')
    }
  }

  const requestFileDelete = (field: string, label: string) => setDeleteConfirm({ field, label })
  const cancelFileDelete = () => setDeleteConfirm(null)
  const confirmFileDelete = () => {
    if (!deleteConfirm) return
    setForm((f) => ({ ...f, [deleteConfirm.field]: '' }))
    setDeleteConfirm(null)
  }

  const appendVideoUrl = (personaIndex: 1 | 2 | 3, url: string) => {
    const u = url?.trim()
    if (!u) return
    const key = personaIndex === 1 ? 'multi_advisor_video_urls_1' : personaIndex === 2 ? 'multi_advisor_video_urls_2' : 'multi_advisor_video_urls_3'
    setForm((f) => ({ ...f, [key]: [...(personaIndex === 1 ? f.multi_advisor_video_urls_1 : personaIndex === 2 ? f.multi_advisor_video_urls_2 : f.multi_advisor_video_urls_3), u] }))
  }
  const removeVideoUrl = (personaIndex: 1 | 2 | 3, index: number) => {
    const key = personaIndex === 1 ? 'multi_advisor_video_urls_1' : personaIndex === 2 ? 'multi_advisor_video_urls_2' : 'multi_advisor_video_urls_3'
    setForm((f) => ({
      ...f,
      [key]: (personaIndex === 1 ? f.multi_advisor_video_urls_1 : personaIndex === 2 ? f.multi_advisor_video_urls_2 : f.multi_advisor_video_urls_3).filter((_, i) => i !== index),
    }))
  }
  const appendVideoByFile = async (personaIndex: 1 | 2 | 3, file: File) => {
    setUploadingAdvisorVideo(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'multi')
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({})) as { url?: string; error?: string }
      if (!res.ok) throw new Error(data?.error || '업로드 실패')
      const u = data?.url ?? ''
      if (!u) throw new Error('업로드 응답에 URL이 없습니다.')
      const key = personaIndex === 1 ? 'multi_advisor_video_urls_1' : personaIndex === 2 ? 'multi_advisor_video_urls_2' : 'multi_advisor_video_urls_3'
      setForm((f) => ({ ...f, [key]: [...(personaIndex === 1 ? f.multi_advisor_video_urls_1 : personaIndex === 2 ? f.multi_advisor_video_urls_2 : f.multi_advisor_video_urls_3), u] }))
    } finally {
      setUploadingAdvisorVideo(false)
    }
  }

  const addTimeOption = () => {
    setForm((f) => ({
      ...f,
      multi_time_options: [...f.multi_time_options, { type: 'extension', minutes: 5, seconds: 0, price: 3000, label: '5분 연장' }],
    }))
  }
  const removeTimeOption = (index: number) => {
    setForm((f) => {
      const o = f.multi_time_options[index] as MultiTimeOption & { type?: string }
      if (o?.type !== 'extension') return f
      return { ...f, multi_time_options: f.multi_time_options.filter((_, i) => i !== index) }
    })
  }
  const updateTimeOption = (index: number, key: string, value: string | number) => {
    setForm((f) => {
      const opts = [...f.multi_time_options]
      const o = opts[index] as unknown as Record<string, unknown>
      if (!o) return f
      if (o.type === 'default') {
        opts[index] = { ...o, [key]: key === 'minutes' || key === 'seconds' || key === 'price' ? Number(value) : value } as unknown as MultiTimeOption
      } else if (o.type === 'extension') {
        opts[index] = { ...o, [key]: key === 'minutes' || key === 'seconds' || key === 'price' ? Number(value) : value } as unknown as MultiTimeOption
      } else if (o.type === 'charge') {
        if (key === 'rate_seconds' || key === 'rate_won' || key === 'price' || key === 'minutes' || key === 'seconds') {
          (opts[index] as unknown as Record<string, unknown>)[key] = Number(value)
        } else {
          (opts[index] as unknown as Record<string, unknown>)[key] = value
        }
      }
      return { ...f, multi_time_options: opts }
    })
  }

  const updateCartesiaEmotions = (emotions: string[]) => {
    setForm((f) => ({ ...f, multi_cartesia_emotions: emotions }))
  }

  const goBack = () => router.push('/admin')

  const save = async () => {
    setSaving(true)
    try {
      const { show_exposed, ...formRest } = form
      const payload = {
        ...formRest,
        id: id ? parseInt(id, 10) : undefined,
        is_exposed: show_exposed,
        multi_time_options: form.multi_time_options,
        multi_advisor_video_urls_1: form.multi_advisor_video_urls_1,
        multi_advisor_video_urls_2: form.multi_advisor_video_urls_2,
        multi_advisor_video_urls_3: form.multi_advisor_video_urls_3,
        multi_cartesia_emotions: form.multi_cartesia_emotions,
      }
      const res = await fetch('/api/admin/content/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || '저장에 실패했습니다.')
      const savedSnapshot = toFormSnapshot(form)
      initialFormSnapshotRef.current = savedSnapshot
      setLastSavedSnapshot(savedSnapshot)
      setShowSaveSuccess(true)
      setTimeout(() => setShowSaveSuccess(false), 2500)
      if (data?.data?.id && !id) router.replace(`/admin/form/multi?id=${data.data.id}`)
    } catch (e: unknown) {
      alert((e as Error)?.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const deleteContent = async () => {
    if (!id) return
    setDeletingContent(true)
    try {
      const res = await fetch('/api/admin/content/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(id, 10) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || '삭제에 실패했습니다.')
      router.push('/admin')
    } catch (e: unknown) {
      alert((e as Error)?.message || '삭제에 실패했습니다.')
    } finally {
      setDeletingContent(false)
      setShowDeleteConfirm(false)
    }
  }

  return {
    id: id ?? null,
    loadId,
    authenticated,
    loading,
    saving,
    form,
    setForm,
    isDirty,
    nextPaymentCode,
    showCancelConfirm,
    setShowCancelConfirm,
    showSaveSuccess,
    setShowSaveSuccess,
    showDeleteConfirm,
    setShowDeleteConfirm,
    deletingContent,
    deleteConfirm,
    requestFileDelete,
    cancelFileDelete,
    confirmFileDelete,
    handleFileUpload,
    handleDragOver,
    handleFileDrop,
    appendVideoUrl,
    removeVideoUrl,
    appendVideoByFile,
    uploadingAdvisorVideo,
    addTimeOption,
    removeTimeOption,
    updateTimeOption,
    updateCartesiaEmotions,
    router,
    goBack,
    save,
    deleteContent,
  }
}
