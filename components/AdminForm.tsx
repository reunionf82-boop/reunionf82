'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getContentById, type ContentData } from '@/lib/supabase-admin'
import ThumbnailModal from '@/components/ThumbnailModal'

interface AdminFormProps {
  onAdd?: (service: any) => void
}

export default function AdminForm({ onAdd }: AdminFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const contentId = searchParams.get('id')
  const duplicateId = searchParams.get('duplicate') // 복제??컨텐�?ID
  const speakerParam = searchParams.get('speaker') // URL?�서 ?�자 ?�라미터 가?�오�?  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    isNew: false,
    isFree: false,
    showNew: false,
    contentName: '',
    thumbnailUrl: '',
    summary: '',
    introduction: '',
    recommendation: '',
    subtitleCharCount: '500',
    detailMenuCharCount: '500',
    menuFontSize: '16',
    menuFontBold: false,
    subtitleFontSize: '14',
    subtitleFontBold: false,
    detailMenuFontSize: '12',
    detailMenuFontBold: false,
    bodyFontSize: '11',
    bodyFontBold: false,
    fontFace: '', // ?�위 ?�환?�을 ?�해 ?��? (?�용 ????
    menuFontFace: '', // ?�메뉴 ?�폰??    subtitleFontFace: '', // ?�메???�폰??    detailMenuFontFace: '', // ?�세메뉴 ?�폰??    bodyFontFace: '', // 본문 ?�폰??    menuColor: '', // ?�메뉴 컬러
    subtitleColor: '', // ?�메??컬러
    detailMenuColor: '', // ?�세메뉴 컬러
    bodyColor: '', // 본문 컬러
    ttsSpeaker: speakerParam || 'nara', // URL ?�라미터 ?�는 기본�? nara
    previewThumbnails: ['', '', ''], // ?�회?�품 미리보기 ?�네??3�?    bookCoverThumbnail: '', // 북커�??�네??(�?번째 ?�?�목 ??
    endingBookCoverThumbnail: '', // ?�딩북커�??�네??(마�?�??�?�목 �?
  })
  const [menuFields, setMenuFields] = useState<Array<{ 
    id: number; 
    value: string; 
    thumbnail?: string;
    subtitles: Array<{ 
      id: number; 
      subtitle: string; 
      interpretation_tool: string; 
      thumbnail?: string;
      detailMenus: Array<{ id: number; detailMenu: string; interpretation_tool: string; thumbnail?: string }>;
    }>;
  }>>([])
  const [firstMenuField, setFirstMenuField] = useState<{ 
    value: string; 
    thumbnail: string;
    subtitles: Array<{ 
      id: number; 
      subtitle: string; 
      interpretation_tool: string; 
      thumbnail?: string;
      detailMenus: Array<{ id: number; detailMenu: string; interpretation_tool: string; thumbnail?: string }>;
    }>;
  }>({ value: '', thumbnail: '', subtitles: [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }] })
  const [initialData, setInitialData] = useState<any>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [currentThumbnailField, setCurrentThumbnailField] = useState<'main' | 'firstMenu' | 'preview-0' | 'preview-1' | 'preview-2' | 'bookCover' | 'endingBookCover' | number | `menu-${number}` | `subtitle-first-${number}` | `subtitle-menu-${number}-${number}` | `detail-menu-first-${number}-${number}` | `detail-menu-menu-${number}-${number}-${number}`>('main')
  const [showDeleteSubtitleConfirm, setShowDeleteSubtitleConfirm] = useState(false)
  const [subtitleToDelete, setSubtitleToDelete] = useState<{ menuId: number | 'first'; subtitleId: number } | null>(null)
  const [showCancelWarning, setShowCancelWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeleteMenuConfirm, setShowDeleteMenuConfirm] = useState(false)
  const [menuFieldToDelete, setMenuFieldToDelete] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEasyUploadModal, setShowEasyUploadModal] = useState(false)
  const [easyUploadData, setEasyUploadData] = useState({
    menus: '',
    subtitles: '',
    subtitleTools: '',
    detailMenus: '',
    tools: ''
  })
  const [showIntegrityCheckResult, setShowIntegrityCheckResult] = useState(false) // 무결??체크 결과 ?�업
  const [integrityCheckResult, setIntegrityCheckResult] = useState<{
    isValid: boolean
    errors: string[]
    message: string
  } | null>(null) // 무결??체크 결과
  const [showPreview, setShowPreview] = useState(false) // 미리보기 ?�업
  
  // ?�폰???�업 ?�태
  const [showMenuFontPopup, setShowMenuFontPopup] = useState(false)
  const [showSubtitleFontPopup, setShowSubtitleFontPopup] = useState(false)
  const [showDetailMenuFontPopup, setShowDetailMenuFontPopup] = useState(false)
  const [showBodyFontPopup, setShowBodyFontPopup] = useState(false)
  
  // ?�폰???�시 ?�력�?(?�업?�서 ?�집)
  const [tempMenuFontFace, setTempMenuFontFace] = useState('')
  const [tempSubtitleFontFace, setTempSubtitleFontFace] = useState('')
  const [tempDetailMenuFontFace, setTempDetailMenuFontFace] = useState('')
  const [tempBodyFontFace, setTempBodyFontFace] = useState('')
  
  // 컬러 ?�업 ?�태
  const [showMenuColorPopup, setShowMenuColorPopup] = useState(false)
  const [showSubtitleColorPopup, setShowSubtitleColorPopup] = useState(false)
  const [showDetailMenuColorPopup, setShowDetailMenuColorPopup] = useState(false)
  const [showBodyColorPopup, setShowBodyColorPopup] = useState(false)

  // 초기 ?�이??로드 (?�정 모드 ?�는 복제 모드)
  useEffect(() => {
    if (contentId) {
      loadContent(parseInt(contentId))
    } else if (duplicateId) {
      loadContentForDuplicate(parseInt(duplicateId))
    }
  }, [contentId, duplicateId])

  // 변�?감�?
  useEffect(() => {
    if (initialData) {
      // ?�재 ?�태�?initialData?� 같�? ?�식?�로 변??      const allMenuItems = [
        ...(firstMenuField.value || firstMenuField.thumbnail ? [firstMenuField] : []),
        ...menuFields
      ]
      
      const allSubtitles: string[] = []
      const allInterpretationTools: string[] = []
      
      allMenuItems.forEach(menuItem => {
        menuItem.subtitles.forEach(subtitle => {
          if (subtitle.subtitle.trim()) {
            allSubtitles.push(subtitle.subtitle.trim())
            allInterpretationTools.push(subtitle.interpretation_tool.trim() || '')
          }
        })
      })
      
      const currentData = {
        role_prompt: formData.title || '',
        restrictions: formData.description || '',
        content_type: formData.isNew ? 'saju' : 'gonghap',
        content_name: formData.contentName || '',
        thumbnail_url: formData.thumbnailUrl || '',
        price: formData.price || '',
        summary: formData.summary || '',
        introduction: formData.introduction || '',
        recommendation: formData.recommendation || '',
        menu_subtitle: allSubtitles.join('\n'),
        interpretation_tool: allInterpretationTools.join('\n'),
        subtitle_char_count: parseInt(formData.subtitleCharCount) || 500,
        detail_menu_char_count: parseInt(formData.detailMenuCharCount) || 500,
        menu_font_size: parseInt(formData.menuFontSize) || 16,
        menu_font_bold: formData.menuFontBold || false,
        subtitle_font_size: parseInt(formData.subtitleFontSize) || 14,
        subtitle_font_bold: formData.subtitleFontBold || false,
        detail_menu_font_size: parseInt(formData.detailMenuFontSize) || 12,
        detail_menu_font_bold: formData.detailMenuFontBold || false,
        body_font_size: parseInt(formData.bodyFontSize) || 11,
        body_font_bold: formData.bodyFontBold || false,
        font_face: formData.fontFace || '', // ?�위 ?�환??        menu_font_face: formData.menuFontFace || '',
        subtitle_font_face: formData.subtitleFontFace || '',
        detail_menu_font_face: formData.detailMenuFontFace || '',
        body_font_face: formData.bodyFontFace || '',
        menu_color: formData.menuColor || '',
        subtitle_color: formData.subtitleColor || '',
        detail_menu_color: formData.detailMenuColor || '',
        body_color: formData.bodyColor || '',
        menu_items: allMenuItems.map((item, index) => ({
          id: index,
          value: item.value,
          thumbnail: item.thumbnail,
          subtitles: item.subtitles || []
        })),
        is_new: formData.showNew,
        tts_speaker: formData.ttsSpeaker || 'nara',
        preview_thumbnails: formData.previewThumbnails || ['', '', ''],
        book_cover_thumbnail: formData.bookCoverThumbnail || '',
        ending_book_cover_thumbnail: formData.endingBookCoverThumbnail || '',
      }
      
      // initialData???�규??(menu_items 배열 처리)
      const normalizedInitial = {
        role_prompt: initialData.role_prompt || '',
        restrictions: initialData.restrictions || '',
        content_type: initialData.content_type || '',
        content_name: initialData.content_name || '',
        thumbnail_url: initialData.thumbnail_url || '',
        price: initialData.price || '',
        summary: initialData.summary || '',
        introduction: initialData.introduction || '',
        recommendation: initialData.recommendation || '',
        menu_subtitle: initialData.menu_subtitle || '',
        interpretation_tool: initialData.interpretation_tool || '',
        subtitle_char_count: initialData.subtitle_char_count || 500,
        detail_menu_char_count: initialData.detail_menu_char_count || 500,
        menu_font_size: initialData.menu_font_size || 16,
        menu_font_bold: initialData.menu_font_bold || false,
        subtitle_font_size: initialData.subtitle_font_size || 14,
        subtitle_font_bold: initialData.subtitle_font_bold || false,
        detail_menu_font_size: initialData.detail_menu_font_size || 12,
        detail_menu_font_bold: initialData.detail_menu_font_bold || false,
        body_font_size: initialData.body_font_size || 11,
        body_font_bold: initialData.body_font_bold || false,
        font_face: initialData.font_face || '',
        menu_font_face: initialData.menu_font_face || '',
        subtitle_font_face: initialData.subtitle_font_face || '',
        detail_menu_font_face: initialData.detail_menu_font_face || '',
        body_font_face: initialData.body_font_face || '',
        menu_color: initialData.menu_color || '',
        subtitle_color: initialData.subtitle_color || '',
        detail_menu_color: initialData.detail_menu_color || '',
        body_color: initialData.body_color || '',
        menu_items: initialData.menu_items || [],
        is_new: initialData.is_new || false,
        tts_speaker: initialData.tts_speaker || 'nara',
        preview_thumbnails: initialData.preview_thumbnails || ['', '', ''],
        book_cover_thumbnail: initialData.book_cover_thumbnail || '',
        ending_book_cover_thumbnail: initialData.ending_book_cover_thumbnail || '',
      }
      
      // menu_items 배열 ?�규??(id ?�거?�고 value, thumbnail, subtitles 비교)
      const normalizeMenuItems = (items: any[]) => {
        return items.map((item: any) => ({
          value: item.value || '',
          thumbnail: item.thumbnail || '',
          subtitles: item.subtitles || []
        })).sort((a, b) => {
          // value?� thumbnail??조합?�서 ?�렬 (?��???비교�??�해)
          const aKey = `${a.value}|${a.thumbnail}`
          const bKey = `${b.value}|${b.thumbnail}`
          return aKey.localeCompare(bKey)
        })
      }
      
      const currentMenuNormalized = normalizeMenuItems(currentData.menu_items)
      const initialMenuNormalized = normalizeMenuItems(normalizedInitial.menu_items)
      
      const current = JSON.stringify({
        ...currentData,
        menu_items: currentMenuNormalized,
      })
      const initial = JSON.stringify({
        ...normalizedInitial,
        menu_items: initialMenuNormalized,
      })
      
      setHasChanges(current !== initial)
    } else {
      // ?�로 ?�성?�는 경우: ?�드??값이 ?�으�?변경사???�음
      const hasAnyValue = Boolean(
        formData.title || 
        formData.description || 
        formData.contentName || 
        formData.thumbnailUrl ||
        formData.price ||
        formData.summary ||
        formData.introduction ||
        formData.recommendation ||
        formData.fontFace ||
        firstMenuField.value ||
        firstMenuField.thumbnail ||
        firstMenuField.subtitles.some(s => s.subtitle || s.interpretation_tool) ||
        menuFields.length > 0 ||
        menuFields.some(f => f.value || f.thumbnail || f.subtitles.some(s => s.subtitle || s.interpretation_tool)) ||
        formData.previewThumbnails.some(thumb => thumb && thumb.trim()) ||
        formData.bookCoverThumbnail ||
        formData.endingBookCoverThumbnail
      )
      
      setHasChanges(hasAnyValue)
    }
  }, [formData, menuFields, firstMenuField, initialData])

  const loadContent = async (id: number) => {
    try {
      const data = await getContentById(id)

      setInitialData(data)
      setFormData({
        title: data.role_prompt || '',
        description: data.restrictions || '',
        price: data.price || '',
        isNew: data.content_type === 'saju',
        isFree: data.content_type === 'gonghap',
        showNew: data.is_new || false,
        contentName: data.content_name || '',
        thumbnailUrl: data.thumbnail_url || '',
        summary: data.summary || '',
        introduction: data.introduction || '',
        recommendation: data.recommendation || '',
        subtitleCharCount: String(data.subtitle_char_count || '500'),
        detailMenuCharCount: String(data.detail_menu_char_count || '500'),
        menuFontSize: String(data.menu_font_size || '16'),
        menuFontBold: data.menu_font_bold || false,
        subtitleFontSize: String(data.subtitle_font_size || '14'),
        subtitleFontBold: data.subtitle_font_bold || false,
        detailMenuFontSize: String(data.detail_menu_font_size || '12'),
        detailMenuFontBold: data.detail_menu_font_bold || false,
        bodyFontSize: String(data.body_font_size || '11'),
        bodyFontBold: data.body_font_bold || false,
        fontFace: data.font_face || '', // ?�위 ?�환??        menuFontFace: data.menu_font_face || data.font_face || '', // ?�위 ?�환??        subtitleFontFace: data.subtitle_font_face || data.font_face || '', // ?�위 ?�환??        detailMenuFontFace: data.detail_menu_font_face || data.font_face || '', // ?�위 ?�환??        bodyFontFace: data.body_font_face || data.font_face || '', // ?�위 ?�환??        menuColor: data.menu_color || '',
        subtitleColor: data.subtitle_color || '',
        detailMenuColor: data.detail_menu_color || '',
        bodyColor: data.body_color || '',
        ttsSpeaker: data.tts_speaker || 'nara',
        previewThumbnails: (() => {
          let thumbnails = data.preview_thumbnails
          // 문자?�인 경우 ?�싱
          if (typeof thumbnails === 'string') {
            try {
              thumbnails = JSON.parse(thumbnails)
            } catch (e) {

              thumbnails = []
            }
          }
          // 배열???�니거나 길이가 3???�니�?기본�??�용
          if (!Array.isArray(thumbnails) || thumbnails.length !== 3) {
            // 배열?��?�?길이가 ?�르�?3개로 맞춤
            if (Array.isArray(thumbnails)) {
              while (thumbnails.length < 3) {
                thumbnails.push('')
              }
              thumbnails = thumbnails.slice(0, 3)
            } else {
              thumbnails = ['', '', '']
            }
          }

          return thumbnails
        })(),
        bookCoverThumbnail: data.book_cover_thumbnail || '',
        endingBookCoverThumbnail: data.ending_book_cover_thumbnail || '',
      })

      // 기존 ?�이?��? ??구조�?변??      if (data.menu_items && data.menu_items.length > 0) {
        // menu_items??subtitles가 ?�는지 ?�인 (??구조)
        const hasSubtitlesInMenuItems = data.menu_items.some((item: any) => item.subtitles && Array.isArray(item.subtitles))
        
        if (hasSubtitlesInMenuItems) {
          // ??구조: menu_items??subtitles가 ?�함?�어 ?�음
          const firstItem = data.menu_items[0]
          const firstMenuSubtitles = firstItem.subtitles && firstItem.subtitles.length > 0 
            ? firstItem.subtitles.map((s: any, idx: number) => {
                return {
                  id: s.id || Date.now() + idx,
                  subtitle: s.subtitle || '',
                  interpretation_tool: s.interpretation_tool || '',
                  thumbnail: s.thumbnail || '',
                  detailMenus: (s.detailMenus || []).map((dm: any) => ({
                    id: dm.id || Date.now() + Math.random(),
                    detailMenu: dm.detailMenu || '',
                    interpretation_tool: dm.interpretation_tool || '',
                    thumbnail: dm.thumbnail || undefined
                  }))
                }
              })
            : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
          
          const firstMenuValue = firstItem.value || ''
          setFirstMenuField({
            value: firstMenuValue,
            thumbnail: firstItem.thumbnail || '',
            // ?�메뉴??값이 ?�는???�메?��? ?�으�??�폴???�메??1�?추�?
            subtitles: firstMenuValue.trim().length > 0 && firstMenuSubtitles.length === 0
              ? [{ id: Date.now(), subtitle: '', interpretation_tool: '' }]
              : firstMenuSubtitles
          })
          
          // ?�머지 메뉴 ??��??          setMenuFields(data.menu_items.slice(1).map((item: any, idx: number) => {
            const menuSubtitles = item.subtitles && item.subtitles.length > 0
              ? item.subtitles.map((s: any, subIdx: number) => {
                  return {
                  id: s.id || Date.now() + idx * 1000 + subIdx,
                  subtitle: s.subtitle || '',
                  interpretation_tool: s.interpretation_tool || '',
                    thumbnail: s.thumbnail || '',
                    detailMenus: (s.detailMenus || []).map((dm: any) => ({
                    id: dm.id || Date.now() + Math.random(),
                    detailMenu: dm.detailMenu || '',
                    interpretation_tool: dm.interpretation_tool || ''
                  }))
                  }
                })
              : [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '', detailMenus: [] }]
            
            const menuValue = item.value || ''
            return {
              id: item.id || Date.now() + idx + 1000,
              value: menuValue,
              thumbnail: item.thumbnail || '',
              // ?�메뉴??값이 ?�는???�메?��? ?�으�??�폴???�메??1�?추�?
              subtitles: menuValue.trim().length > 0 && menuSubtitles.length === 0
                ? [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '' }]
                : menuSubtitles
            }
          }))
        } else {
          // 기존 구조: menu_subtitle�?interpretation_tool???�싱 (?�위 ?�환??
          const menuSubtitles = data.menu_subtitle ? data.menu_subtitle.split('\n').filter((s: string) => s.trim()) : []
          const interpretationTools = data.interpretation_tool ? data.interpretation_tool.split('\n').filter((s: string) => s.trim()) : []
          
          // �?메뉴 ??��???�제�??�당 (기본?�으�?�?번째 메뉴??모든 ?�제�??�당)
          const firstMenuSubtitles = menuSubtitles.map((subtitle: string, index: number) => ({
            id: Date.now() + index,
            subtitle: subtitle.trim(),
            interpretation_tool: interpretationTools[index] || interpretationTools[0] || '',
            thumbnail: '', // 기존 ?�이?�에???�제�??�네?�이 ?�음
            detailMenus: [] // 기존 ?�이?�에???�세메뉴가 ?�음
          }))
          
          const firstMenuValue = data.menu_items[0].value || ''
        setFirstMenuField({
            value: firstMenuValue,
          thumbnail: data.menu_items[0].thumbnail || '',
            // ?�메뉴??값이 ?�는???�메?��? ?�으�??�폴???�메??1�?추�?
            subtitles: firstMenuValue.trim().length > 0 && firstMenuSubtitles.length === 0
              ? [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
              : (firstMenuSubtitles.length > 0 ? firstMenuSubtitles : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }])
          })
          
          // ?�머지 메뉴 ??��??          setMenuFields(data.menu_items.slice(1).map((item: any, idx: number) => {
            const menuValue = item.value || ''
            return {
            id: item.id || Date.now() + idx + 1000,
              value: menuValue,
            thumbnail: item.thumbnail || '',
              // ?�메뉴??값이 ?�으�??�폴???�메??1�?추�?
              subtitles: menuValue.trim().length > 0
                ? [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '', detailMenus: [] }]
                : []
            }
          }))
        }
      } else {
        // 메뉴 ??��???�으�?기본�?        setFirstMenuField({ value: '', thumbnail: '', subtitles: [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }] })
        setMenuFields([])
      }
    } catch (error) {

    }
  }

  // 복제�??�한 컨텐�?로드 (ID ?�거?�고 content_name??"복사�? 추�?)
  const loadContentForDuplicate = async (id: number) => {
    try {
      const data = await getContentById(id)
      setInitialData(null) // 복제 모드?��?�?initialData�?null�??�정 (??컨텐츠로 ?�식)
      
      // content_name??"복사�? 추�?
      const duplicatedContentName = data.content_name ? `${data.content_name} (복사�?` : '??컨텐�?(복사�?'
      
      setFormData({
        title: data.role_prompt || '',
        description: data.restrictions || '',
        price: data.price || '',
        isNew: data.content_type === 'saju',
        isFree: data.content_type === 'gonghap',
        showNew: data.is_new || false,
        contentName: duplicatedContentName,
        thumbnailUrl: data.thumbnail_url || '',
        summary: data.summary || '',
        introduction: data.introduction || '',
        recommendation: data.recommendation || '',
        subtitleCharCount: String(data.subtitle_char_count || '500'),
        detailMenuCharCount: String(data.detail_menu_char_count || '500'),
        menuFontSize: String(data.menu_font_size || '16'),
        menuFontBold: data.menu_font_bold || false,
        subtitleFontSize: String(data.subtitle_font_size || '14'),
        subtitleFontBold: data.subtitle_font_bold || false,
        detailMenuFontSize: String(data.detail_menu_font_size || '12'),
        detailMenuFontBold: data.detail_menu_font_bold || false,
        bodyFontSize: String(data.body_font_size || '11'),
        bodyFontBold: data.body_font_bold || false,
        fontFace: data.font_face || '', // ?�위 ?�환??        menuFontFace: data.menu_font_face || data.font_face || '', // ?�위 ?�환??        subtitleFontFace: data.subtitle_font_face || data.font_face || '', // ?�위 ?�환??        detailMenuFontFace: data.detail_menu_font_face || data.font_face || '', // ?�위 ?�환??        bodyFontFace: data.body_font_face || data.font_face || '', // ?�위 ?�환??        menuColor: data.menu_color || '',
        subtitleColor: data.subtitle_color || '',
        detailMenuColor: data.detail_menu_color || '',
        bodyColor: data.body_color || '',
        ttsSpeaker: data.tts_speaker || 'nara',
        previewThumbnails: (() => {
          let thumbnails = data.preview_thumbnails
          if (typeof thumbnails === 'string') {
            try {
              thumbnails = JSON.parse(thumbnails)
            } catch (e) {

              thumbnails = []
            }
          }
          if (!Array.isArray(thumbnails) || thumbnails.length !== 3) {
            if (Array.isArray(thumbnails)) {
              while (thumbnails.length < 3) {
                thumbnails.push('')
              }
              thumbnails = thumbnails.slice(0, 3)
            } else {
              thumbnails = ['', '', '']
            }
          }
          return thumbnails
        })(),
        bookCoverThumbnail: data.book_cover_thumbnail || '',
        endingBookCoverThumbnail: data.ending_book_cover_thumbnail || '',
      })
      
      // 기존 ?�이?��? ??구조�?변??(loadContent?� ?�일??로직)
      if (data.menu_items && data.menu_items.length > 0) {
        const hasSubtitlesInMenuItems = data.menu_items.some((item: any) => item.subtitles && Array.isArray(item.subtitles))
        
        if (hasSubtitlesInMenuItems) {
          // ??구조
          const firstItem = data.menu_items[0]
          const firstMenuSubtitles = firstItem.subtitles && firstItem.subtitles.length > 0 
            ? firstItem.subtitles.map((s: any, idx: number) => ({
                id: Date.now() + idx,
                subtitle: s.subtitle || '',
                interpretation_tool: s.interpretation_tool || '',
                thumbnail: s.thumbnail || '',
                detailMenus: (s.detailMenus || []).map((dm: any) => ({
                  id: Date.now() + Math.random(),
                  detailMenu: dm.detailMenu || '',
                  interpretation_tool: dm.interpretation_tool || '',
                  thumbnail: dm.thumbnail || undefined
                }))
              }))
            : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
          
          const firstMenuValue = firstItem.value || ''
          setFirstMenuField({
            value: firstMenuValue,
            thumbnail: firstItem.thumbnail || '',
            subtitles: firstMenuValue.trim().length > 0 && firstMenuSubtitles.length === 0
              ? [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
              : firstMenuSubtitles
          })
          
          setMenuFields(data.menu_items.slice(1).map((item: any, idx: number) => {
            const menuSubtitles = item.subtitles && item.subtitles.length > 0
              ? item.subtitles.map((s: any, subIdx: number) => ({
                  id: Date.now() + idx * 1000 + subIdx,
                  subtitle: s.subtitle || '',
                  interpretation_tool: s.interpretation_tool || '',
                  thumbnail: s.thumbnail || '',
                  detailMenus: (s.detailMenus || []).map((dm: any) => ({
                    id: Date.now() + Math.random(),
                    detailMenu: dm.detailMenu || '',
                    interpretation_tool: dm.interpretation_tool || '',
                    thumbnail: dm.thumbnail || undefined
                  }))
                }))
              : [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '', detailMenus: [] }]
            
            const menuValue = item.value || ''
            return {
              id: Date.now() + idx + 1000,
              value: menuValue,
              thumbnail: item.thumbnail || '',
              subtitles: menuValue.trim().length > 0 && menuSubtitles.length === 0
                ? [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '', detailMenus: [] }]
                : menuSubtitles
            }
          }))
        } else {
          // 기존 구조
          const menuSubtitles = data.menu_subtitle ? data.menu_subtitle.split('\n').filter((s: string) => s.trim()) : []
          const interpretationTools = data.interpretation_tool ? data.interpretation_tool.split('\n').filter((s: string) => s.trim()) : []
          
          const firstMenuSubtitles = menuSubtitles.map((subtitle: string, index: number) => ({
            id: Date.now() + index,
            subtitle: subtitle.trim(),
            interpretation_tool: interpretationTools[index] || interpretationTools[0] || '',
            thumbnail: '',
            detailMenus: []
          }))
          
          const firstMenuValue = data.menu_items[0].value || ''
          setFirstMenuField({
            value: firstMenuValue,
            thumbnail: data.menu_items[0].thumbnail || '',
            subtitles: firstMenuValue.trim().length > 0 && firstMenuSubtitles.length === 0
              ? [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
              : (firstMenuSubtitles.length > 0 ? firstMenuSubtitles : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }])
          })
          
          setMenuFields(data.menu_items.slice(1).map((item: any, idx: number) => {
            const menuValue = item.value || ''
            return {
              id: Date.now() + idx + 1000,
              value: menuValue,
              thumbnail: item.thumbnail || '',
              subtitles: menuValue.trim().length > 0
                ? [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '', detailMenus: [] }]
                : []
            }
          }))
        }
      } else {
        setFirstMenuField({ value: '', thumbnail: '', subtitles: [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }] })
        setMenuFields([])
      }
    } catch (error) {

      alert('컨텐�?복제 로드???�패?�습?�다.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {

      // 모든 메뉴 ??��?�서 ?�제목과 ?�석?�구 추출
      const allMenuItems = [
        ...(firstMenuField.value || firstMenuField.thumbnail ? [firstMenuField] : []),
        ...menuFields
      ]
      // API ?�우?��? ?�해 ?�??(?�버 ?�이?�에???�비??�????�용)
      const response = await fetch('/api/admin/content/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contentData),
      })

      // Content-Type ?�인
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        return match ? match[1] : null
      }
      
      // 그룹별로 ?�이???�리
      interface MenuGroup {
        menuNumber: number
        menuTitle: string
        subtitles: Array<{ 
          subtitle: string; 
          tool: string;
          detailMenus: Array<{ detailMenu: string; interpretation_tool: string }>;
        }>
      }
      
      const groups: { [key: number]: MenuGroup } = {}
      
      // ?�?�목 ?�싱 (?�자 ?�함?�여 그�?�??�용)
      menuLines.forEach(line => {
        const menuNumber = extractFirstNumber(line)
        if (menuNumber) {
          const menuTitle = line.trim()
          if (!groups[menuNumber]) {
            groups[menuNumber] = {
              menuNumber,
              menuTitle,
              subtitles: []
            }
          } else {
            groups[menuNumber].menuTitle = menuTitle
          }
        }
      })
      
      // ?�제�??�싱 (?�자 ?�함?�여 그�?�??�용)
      subtitleLines.forEach(line => {
        const menuNumber = extractFirstNumber(line)
        if (menuNumber) {
          const subtitleText = line.trim()
          if (!groups[menuNumber]) {
            groups[menuNumber] = {
              menuNumber,
              menuTitle: '',
              subtitles: []
            }
          }
          groups[menuNumber].subtitles.push({ subtitle: subtitleText, tool: '', detailMenus: [] })
        }
      })
      
      // ?�세메뉴 ?�싱 (?�두??"1-1"??같으�?같�? 그룹)
      detailMenuLines.forEach(line => {
        const detailMenuPrefix = extractDetailMenuPrefix(line)
        if (detailMenuPrefix) {
          // ?�두?�로 ?�메뉴 번호 추출 (?? "1-1" ??1)
          const menuNumber = parseInt(detailMenuPrefix.split('-')[0])
          if (groups[menuNumber]) {
            // ?�당 ?�두?��? 가�??�제�?찾기
            const subtitle = groups[menuNumber].subtitles.find(s => {
              const subPrefix = extractSubtitlePrefix(s.subtitle)
              return subPrefix === detailMenuPrefix
            })
            
            if (subtitle) {
              // ?�당 ?�제목에 ?�세메뉴 추�?
              subtitle.detailMenus.push({ detailMenu: line.trim(), interpretation_tool: '' })
            } else {
              // ?�두?��? ?�치?�는 ?�제목이 ?�으�?마�?�??�제목에 추�?
              if (groups[menuNumber].subtitles.length > 0) {
                groups[menuNumber].subtitles[groups[menuNumber].subtitles.length - 1].detailMenus.push({ detailMenu: line.trim(), interpretation_tool: '' })
              }
            }
          }
        }
      })
      
      // ?�메???�석?�구 ?�싱 (?�제목과 ?�서?��?매칭, ?�자 ?�함?�여 그�?�??�용)
      subtitleToolLines.forEach((line, toolIndex) => {
        const menuNumber = extractFirstNumber(line)
        if (menuNumber && groups[menuNumber]) {
          // ?�석?�구??그�?�??�용 (?�자 ?�함)
          const toolText = line.trim()
          
          // ?�당 메뉴???�석?�구�??�터�?          const sameMenuToolLines = subtitleToolLines.filter(l => extractFirstNumber(l) === menuNumber)
          const toolIndexInMenu = sameMenuToolLines.indexOf(line)
          
          // 같�? ?�덱?�의 ?�제목에 ?�석?�구 ?�당
          if (groups[menuNumber].subtitles[toolIndexInMenu]) {
            groups[menuNumber].subtitles[toolIndexInMenu].tool = toolText
          }
        }
      })
      
      // ?�세메뉴 ?�석?�구 ?�싱 (?? "1-1-1. ?�석?�구 ?�용" ???�세메뉴 "1-1-1"???�당)
      toolLines.forEach(line => {
        // ?�세메뉴 ?�두??추출 (?? "1-1-1" ??"1-1-1")
        const detailMenuMatch = line.match(/^(\d+-\d+-\d+)\./)
        if (detailMenuMatch) {
          const detailMenuPrefix = detailMenuMatch[1] // "1-1-1"
          const detailMenuNumber = detailMenuPrefix.split('-')[0] // "1"
          const menuNumber = parseInt(detailMenuNumber)
          
          if (groups[menuNumber]) {
            // ?�당 ?�두?��? 가�??�제�?찾기 (?? "1-1-1" ??"1-1")
            const subtitlePrefix = detailMenuPrefix.substring(0, detailMenuPrefix.lastIndexOf('-')) // "1-1"
            const subtitle = groups[menuNumber].subtitles.find(s => {
              const subPrefix = extractSubtitlePrefix(s.subtitle)
              return subPrefix === subtitlePrefix
            })
            
            if (subtitle) {
              // ?�당 ?�제목의 ?�세메뉴 중에???�두?��? ?�치?�는 ?�세메뉴 찾기
              const detailMenu = subtitle.detailMenus.find(dm => {
                const dmPrefix = extractDetailMenuPrefix(dm.detailMenu)
                return dmPrefix === subtitlePrefix && dm.detailMenu.startsWith(detailMenuPrefix)
              })
              
              if (detailMenu) {
                // ?�세메뉴 ?�석?�구 ?�당
                detailMenu.interpretation_tool = line.trim()
              } else {
                // ?�치?�는 ?�세메뉴가 ?�으�?마�?�??�세메뉴???�당
                if (subtitle.detailMenus.length > 0) {
                  subtitle.detailMenus[subtitle.detailMenus.length - 1].interpretation_tool = line.trim()
                }
              }
            }
          }
        }
      })
      
      // 그룹 번호 ?�서?��??�렬
      const sortedGroups = Object.values(groups).sort((a, b) => a.menuNumber - b.menuNumber)
      
      if (sortedGroups.length === 0) {
        alert('?�싱???�이?��? ?�습?�다. ?�식???�인?�주?�요.')
        return
      }
      
      // ?�자 ?�두??추출 ?�수 (?? "1. " ??"1.", "1-1. " ??"1-1.")
      const extractNumberPrefix = (text: string): string | null => {
        const match = text.match(/^(\d+(?:-\d+)?\.)/)
        return match ? match[1] : null
      }
      
      // �?번째 그룹?� firstMenuField?? ?�머지??menuFields??추�?
      const firstGroup = sortedGroups[0]
      const remainingGroups = sortedGroups.slice(1)
      
      // firstMenuField ?�데?�트 (?�네?��? 기존 �??��?, ?�제�??�네?�도 기존 �??��?)
      const firstMenuPrefix = extractNumberPrefix(firstGroup.menuTitle)
      const existingFirstMenu = firstMenuPrefix 
        ? (extractNumberPrefix(firstMenuField.value) === firstMenuPrefix ? firstMenuField : null)
        : firstMenuField // ?�두?��? ?�으�?기존 firstMenuField ?��?
      
      setFirstMenuField({
        value: firstGroup.menuTitle,
        thumbnail: existingFirstMenu?.thumbnail || '', // 기존 ?�네???��?
        subtitles: firstGroup.subtitles.map((sub) => {
          // ?�자 ?�두?�로 매칭
          const subtitlePrefix = extractNumberPrefix(sub.subtitle)
          const existingSubtitle = subtitlePrefix 
            ? existingFirstMenu?.subtitles.find(
                existing => extractNumberPrefix(existing.subtitle) === subtitlePrefix
              )
            : undefined
          
          return {
            id: existingSubtitle?.id || Date.now() + Math.random(),
            subtitle: sub.subtitle,
            interpretation_tool: sub.tool,
            thumbnail: existingSubtitle?.thumbnail || undefined, // 기존 ?�네???��? (?�으�?undefined)
              detailMenus: sub.detailMenus.map((dm, idx) => ({
                id: existingSubtitle?.detailMenus?.[idx]?.id || Date.now() + Math.random() + idx,
                detailMenu: dm.detailMenu,
                interpretation_tool: dm.interpretation_tool || '',
                thumbnail: existingSubtitle?.detailMenus?.[idx]?.thumbnail || undefined
              })) || []
          }
        })
      })
      
      // menuFields ?�데?�트 (기존 ?�네???��?)
      const newMenuFields = remainingGroups.map((group, groupIndex) => {
        // ?�자 ?�두?�로 매칭
        const menuPrefix = extractNumberPrefix(group.menuTitle)
        const existingMenu = menuPrefix
          ? menuFields.find(
              existing => extractNumberPrefix(existing.value) === menuPrefix
            )
          : undefined
        
        return {
          id: existingMenu?.id || Date.now() + 1000 + groupIndex,
          value: group.menuTitle,
          thumbnail: existingMenu?.thumbnail || undefined, // 기존 ?�네???��? (?�으�?undefined)
          subtitles: group.subtitles.map((sub, subIndex) => {
            // ?�자 ?�두?�로 매칭
            const subtitlePrefix = extractNumberPrefix(sub.subtitle)
            const existingSubtitle = subtitlePrefix && existingMenu
              ? existingMenu.subtitles.find(
                  existing => extractNumberPrefix(existing.subtitle) === subtitlePrefix
                )
              : undefined
            
            return {
              id: existingSubtitle?.id || Date.now() + 2000 + groupIndex * 100 + subIndex,
              subtitle: sub.subtitle,
              interpretation_tool: sub.tool,
              thumbnail: existingSubtitle?.thumbnail || undefined, // 기존 ?�네???��? (?�으�?undefined)
              detailMenus: sub.detailMenus.map((dm, idx) => ({
                id: existingSubtitle?.detailMenus?.[idx]?.id || Date.now() + 3000 + groupIndex * 100 + subIndex * 10 + idx,
                detailMenu: dm.detailMenu,
                interpretation_tool: dm.interpretation_tool || '',
                thumbnail: existingSubtitle?.detailMenus?.[idx]?.thumbnail || undefined
              })) || []
            }
          })
        }
      })
      
      setMenuFields(newMenuFields)
      
      // 모달 ?�기 (?�력 ?�드 ?�용?� ?��?)
      setShowEasyUploadModal(false)
      // setEasyUploadData({ menus: '', subtitles: '', subtitleTools: '', detailMenus: '', tools: '' }) // 반영 ?�에???�력 ?�드 ?�용 ?��?
    } catch (error) {

      alert('?�이???�싱 �??�류가 발생?�습?�다. ?�식???�인?�주?�요.')
    }
  }

  const handleThumbnailSelect = (url: string) => {
    if (currentThumbnailField === 'main') {
      setFormData(prev => ({ ...prev, thumbnailUrl: url }))
    } else if (typeof currentThumbnailField === 'number') {
      setMenuFields(menuFields.map(f => 
        f.id === currentThumbnailField ? { ...f, thumbnail: url } : f
      ))
    } else if (currentThumbnailField === 'firstMenu') {
      setFirstMenuField(prev => ({ ...prev, thumbnail: url }))
    } else if (currentThumbnailField === 'preview-0' || currentThumbnailField === 'preview-1' || currentThumbnailField === 'preview-2') {
      const index = parseInt(currentThumbnailField.split('-')[1])
      setFormData(prev => {
        const newThumbnails = [...prev.previewThumbnails]
        newThumbnails[index] = url
        return { ...prev, previewThumbnails: newThumbnails }
      })
    } else if (currentThumbnailField === 'bookCover') {

      setFormData(prev => {

        const updated = { ...prev, bookCoverThumbnail: url }

        return updated
      })
    } else if (currentThumbnailField === 'endingBookCover') {

      setFormData(prev => {

        const updated = { ...prev, endingBookCoverThumbnail: url }

        return updated
      })
    } else if (typeof currentThumbnailField === 'string' && currentThumbnailField.startsWith('subtitle-')) {
      const parts = currentThumbnailField.split('-')

      
      if (parts[1] === 'first') {
        // subtitle-first-{subtitleId} ?�식
        // ?�수?�이 ?�함??ID�?처리?�기 ?�해 parseFloat ?�용
        const subtitleIdStr = parts[2]
        const subtitleId = parseFloat(subtitleIdStr)

        setFirstMenuField(prev => {
          const updated = {
          ...prev,
            subtitles: prev.subtitles.map(s => {
              // ID�?문자?�로 변?�하??비교 (?�수???�함 ID ?�??
              const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
              const targetId = parseFloat(subtitleIdStr)
              if (sId === targetId || String(s.id) === subtitleIdStr) {

                return { ...s, thumbnail: url }
              }
              return s
            })
          }
            </label>
            <div className="flex justify-center">
            <button
              type="button"
              onClick={() => handleThumbnailClick('endingBookCover')}
              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-[85px] h-[151px] flex items-center justify-center"
              style={{ aspectRatio: '9/16' }}
            >
              {formData.endingBookCoverThumbnail ? (
                <img 
                  src={formData.endingBookCoverThumbnail} 
                  alt="?�딩북커�??�네?? 
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-center">?�딩북커�?br/>?�네??/span>
              )}
            </button>
            </div>
            {/* 무결??체크 버튼 */}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={handleIntegrityCheck}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 text-sm"
              >
                무결??체크
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 text-sm"
              >
                미리 보기
              </button>
            </div>
          </div>
        </div>


        {/* ?�트 ?�정 ?�션 */}
        <div className="border-t border-gray-600 pt-4 mt-4">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">?�트 ?�정</h3>
          
          {/* ?�폰??CSS ?�력 - 4개로 분리 (2x2 배열, ?�업?�로 ?�력) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* ?�메뉴 ?�폰??*/}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                ?�메뉴 ?�폰??              </label>
              <div className="flex items-center gap-2">
                {formData.menuFontFace && (
                  <div className="flex items-center gap-2">
                    <style dangerouslySetInnerHTML={{ __html: formData.menuFontFace }} />
                    <span 
                      style={{
                        fontFamily: (() => {
                          const match = formData.menuFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/);
                          return match ? (match[1] || match[2]?.trim()) : 'inherit';
                        })(),
                        fontSize: `${formData.menuFontSize || '16'}px`,
                        fontWeight: formData.menuFontBold ? 'bold' : 'normal',
                        color: formData.menuColor || '#fff'
                      }}
                    >
                      ?�트 미리보기
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTempMenuFontFace(formData.menuFontFace)
                    setShowMenuFontPopup(true)
                  }}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-xl font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setShowMenuColorPopup(true)}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-lg font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                  title="컬러 ?�정"
                >
                  ?��
                </button>
              </div>
            </div>

            {/* ?�메???�폰??*/}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                ?�메???�폰??              </label>
              <div className="flex items-center gap-2">
                {formData.subtitleFontFace && (
                  <div className="flex items-center gap-2">
                    <style dangerouslySetInnerHTML={{ __html: formData.subtitleFontFace }} />
                    <span 
                      style={{
                        fontFamily: (() => {
                          const match = formData.subtitleFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/);
                          return match ? (match[1] || match[2]?.trim()) : 'inherit';
                        })(),
                        fontSize: `${formData.subtitleFontSize || '14'}px`,
                        fontWeight: formData.subtitleFontBold ? 'bold' : 'normal',
                        color: formData.subtitleColor || '#fff'
                      }}
                    >
                      ?�트 미리보기
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTempSubtitleFontFace(formData.subtitleFontFace)
                    setShowSubtitleFontPopup(true)
                  }}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-xl font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubtitleColorPopup(true)}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-lg font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                  title="컬러 ?�정"
                >
                  ?��
                </button>
              </div>
            </div>

            {/* ?�세메뉴 ?�폰??*/}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                ?�세메뉴 ?�폰??              </label>
              <div className="flex items-center gap-2">
                {formData.detailMenuFontFace && (
                  <div className="flex items-center gap-2">
                    <style dangerouslySetInnerHTML={{ __html: formData.detailMenuFontFace }} />
                    <span 
                      style={{
                        fontFamily: (() => {
                          const match = formData.detailMenuFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/);
                          return match ? (match[1] || match[2]?.trim()) : 'inherit';
                        })(),
                        fontSize: `${formData.detailMenuFontSize || '12'}px`,
                        fontWeight: formData.detailMenuFontBold ? 'bold' : 'normal',
                        color: formData.detailMenuColor || '#fff'
                      }}
                    >
                      ?�트 미리보기
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTempDetailMenuFontFace(formData.detailMenuFontFace)
                    setShowDetailMenuFontPopup(true)
                  }}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-xl font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setShowDetailMenuColorPopup(true)}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-lg font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                  title="컬러 ?�정"
                >
                  ?��
                </button>
              </div>
            </div>

            {/* 본문 ?�폰??*/}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                본문 ?�폰??              </label>
              <div className="flex items-center gap-2">
                {formData.bodyFontFace && (
                  <div className="flex items-center gap-2">
                    <style dangerouslySetInnerHTML={{ __html: formData.bodyFontFace }} />
                    <span 
                      style={{
                        fontFamily: (() => {
                          const match = formData.bodyFontFace.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/);
                          return match ? (match[1] || match[2]?.trim()) : 'inherit';
                        })(),
                        fontSize: `${formData.bodyFontSize || '11'}px`,
                        fontWeight: formData.bodyFontBold ? 'bold' : 'normal',
                        color: formData.bodyColor || '#fff'
                      }}
                    >
                      ?�트 미리보기
                    </span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setTempBodyFontFace(formData.bodyFontFace)
                    setShowBodyFontPopup(true)
                  }}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-xl font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => setShowBodyColorPopup(true)}
                  className="text-pink-500 hover:text-pink-600 hover:bg-pink-500 hover:bg-opacity-10 text-lg font-bold w-8 h-8 flex items-center justify-center rounded border border-pink-500 transition-colors"
                  title="컬러 ?�정"
                >
                  ?��
                </button>
              </div>
            </div>
          </div>
          
          {/* ?�폰???�정 ?�래 ??*/}
          <div className="border-t border-gray-600 mt-4 mb-4"></div>
          
          {/* ?�폰???�업??*/}
          {/* ?�메뉴 ?�폰???�업 */}
          {showMenuFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">?�메뉴 ?�폰???�정</h3>
                <textarea
                  value={tempMenuFontFace}
                  onChange={(e) => setTempMenuFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS�??�력?�세??
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowMenuFontPopup(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, menuFontFace: tempMenuFontFace })
                      setShowMenuFontPopup(false)
                    }}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                  >
                    ?�료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ?�메???�폰???�업 */}
          {showSubtitleFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">?�메???�폰???�정</h3>
                <textarea
                  value={tempSubtitleFontFace}
                  onChange={(e) => setTempSubtitleFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS�??�력?�세??
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSubtitleFontPopup(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, subtitleFontFace: tempSubtitleFontFace })
                      setShowSubtitleFontPopup(false)
                    }}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                  >
                    ?�료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ?�세메뉴 ?�폰???�업 */}
          {showDetailMenuFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">?�세메뉴 ?�폰???�정</h3>
                <textarea
                  value={tempDetailMenuFontFace}
                  onChange={(e) => setTempDetailMenuFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS�??�력?�세??
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDetailMenuFontPopup(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, detailMenuFontFace: tempDetailMenuFontFace })
                      setShowDetailMenuFontPopup(false)
                    }}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                  >
                    ?�료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 본문 ?�폰???�업 */}
          {showBodyFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">본문 ?�폰???�정</h3>
                <textarea
                  value={tempBodyFontFace}
                  onChange={(e) => setTempBodyFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS�??�력?�세??
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBodyFontPopup(false)}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({ ...formData, bodyFontFace: tempBodyFontFace })
                      setShowBodyFontPopup(false)
                    }}
                    className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                  >
                    ?�료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 컬러 ?�업??*/}
          {/* 컬러 ?�레??컴포?�트 */}
          {(() => {
            // RGB�?HSV�?변??            const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
              r /= 255
              g /= 255
              b /= 255
              const max = Math.max(r, g, b)
              const min = Math.min(r, g, b)
              const delta = max - min
              
              let h = 0
              if (delta !== 0) {
                if (max === r) {
                  h = ((g - b) / delta) % 6
                } else if (max === g) {
                  h = (b - r) / delta + 2
                } else {
                  h = (r - g) / delta + 4
                }
              }
              h = Math.round(h * 60)
              if (h < 0) h += 360
              
              const s = max === 0 ? 0 : Math.round((delta / max) * 100)
              const v = Math.round(max * 100)
              
              return [h, s, v]
            }
            
            // HSV�?RGB�?변??            const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
              s /= 100
              v /= 100
              const c = v * s
              const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
              const m = v - c
              
              let r = 0, g = 0, b = 0
              if (h >= 0 && h < 60) {
                r = c; g = x; b = 0
              } else if (h >= 60 && h < 120) {
                r = x; g = c; b = 0
              } else if (h >= 120 && h < 180) {
                r = 0; g = c; b = x
              } else if (h >= 180 && h < 240) {
                r = 0; g = x; b = c
              } else if (h >= 240 && h < 300) {
                r = x; g = 0; b = c
              } else if (h >= 300 && h < 360) {
                r = c; g = 0; b = x
              }
              
              r = Math.round((r + m) * 255)
              g = Math.round((g + m) * 255)
              b = Math.round((b + m) * 255)
              
              return [r, g, b]
            }
            
            // Hex�?RGB�?변??            const hexToRgb = (hex: string): [number, number, number] => {
              const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
              return result
                ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
                : [0, 0, 0]
            }
            
            // RGB�?Hex�?변??            const rgbToHex = (r: number, g: number, b: number): string => {
              return '#' + [r, g, b].map(x => {
                const hex = x.toString(16)
                return hex.length === 1 ? '0' + hex : hex
              }).join('')
            }
            
            const ColorPicker = ({ 
              title, 
              currentColor, 
              onSelect, 
              onClose 
            }: { 
              title: string
              currentColor: string
              onSelect: (color: string) => void
              onClose: () => void
            }) => {
              const initialColor = currentColor || '#000000'
              const [r, g, b] = hexToRgb(initialColor)
              const [h, s, v] = rgbToHsv(r, g, b)
              
              const [hue, setHue] = useState(h)
              const [saturation, setSaturation] = useState(s)
              const [brightness, setBrightness] = useState(v)
              const [isDragging, setIsDragging] = useState(false)
              const [isDraggingHue, setIsDraggingHue] = useState(false)
              
              const saturationRef = React.useRef<HTMLDivElement>(null)
              const hueRef = React.useRef<HTMLDivElement>(null)
              
              const updateColor = (newH: number, newS: number, newV: number) => {
                setHue(newH)
                setSaturation(newS)
                setBrightness(newV)
              }
              
              const getCurrentColor = (): string => {
                const [r, g, b] = hsvToRgb(hue, saturation, brightness)
                return rgbToHex(r, g, b)
              }
              
              const handleSaturationClick = (e: React.MouseEvent<HTMLDivElement>) => {
                if (!saturationRef.current) return
                const rect = saturationRef.current.getBoundingClientRect()
                const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
                const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
                const s = Math.round((x / rect.width) * 100)
                const v = Math.round(100 - (y / rect.height) * 100)
                updateColor(hue, s, v)
              }
              
              const handleHueClick = (e: React.MouseEvent<HTMLDivElement>) => {
                if (!hueRef.current) return
                const rect = hueRef.current.getBoundingClientRect()
                const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
                const h = Math.round((y / rect.height) * 360)
                updateColor(h, saturation, brightness)
              }
              
              const handleMouseMove = (e: MouseEvent) => {
                if (isDragging && saturationRef.current) {
                  const rect = saturationRef.current.getBoundingClientRect()
                  const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
                  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
                  const s = Math.round((x / rect.width) * 100)
                  const v = Math.round(100 - (y / rect.height) * 100)
                  updateColor(hue, s, v)
                } else if (isDraggingHue && hueRef.current) {
                  const rect = hueRef.current.getBoundingClientRect()
                  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
                  const h = Math.round((y / rect.height) * 360)
                  updateColor(h, saturation, brightness)
                }
              }
              
              const handleMouseUp = () => {
                setIsDragging(false)
                setIsDraggingHue(false)
              }
              
              React.useEffect(() => {
                if (isDragging || isDraggingHue) {
                  window.addEventListener('mousemove', handleMouseMove)
                  window.addEventListener('mouseup', handleMouseUp)
                  return () => {
                    window.removeEventListener('mousemove', handleMouseMove)
                    window.removeEventListener('mouseup', handleMouseUp)
                  }
                }
              }, [isDragging, isDraggingHue, hue, saturation, brightness])
              
              // Canvas�??�용??채도/밝기 ?�각??그라?�언??              const saturationCanvasRef = React.useRef<HTMLCanvasElement>(null)
              const hueCanvasRef = React.useRef<HTMLCanvasElement>(null)
              
              // 채도/밝기 ?�각??그리�?              React.useEffect(() => {
                const canvas = saturationCanvasRef.current
                if (!canvas) return
                
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                
                const width = canvas.width
                const height = canvas.height
                
                // �??��???직접 계산
                const imageData = ctx.createImageData(width, height)
                const data = imageData.data
                
                for (let y = 0; y < height; y++) {
                  for (let x = 0; x < width; x++) {
                    const s = (x / width) * 100  // 채도: 0% (?�쪽) ~ 100% (?�른�?
                    const v = 100 - (y / height) * 100  // 밝기: 100% (?? ~ 0% (?�래)
                    const [r, g, b] = hsvToRgb(hue, s, v)
                    
                    const index = (y * width + x) * 4
                    data[index] = r      // R
                    data[index + 1] = g  // G
                    data[index + 2] = b  // B
                    data[index + 3] = 255 // A
                  }
                }
                
                ctx.putImageData(imageData, 0, 0)
              }, [hue])
              
              // ?�상 ?�트�?그리�?              React.useEffect(() => {
                const canvas = hueCanvasRef.current
                if (!canvas) return
                
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                
                const height = canvas.height
                
                // ?�로 방향: 0??빨강)?�서 360??빨강)�?                for (let y = 0; y < height; y++) {
                  const h = (y / height) * 360
                  const [r, g, b] = hsvToRgb(h, 100, 100)
                  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
                  ctx.fillRect(0, y, canvas.width, 1)
                }
              }, [])
              
              const currentColorHex = getCurrentColor()
              
              return (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                  <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg">
                    <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
                    
                    <div className="flex gap-4 mb-4">
                      {/* 채도/밝기 ?�각??*/}
                      <div className="flex-1 relative">
                        <canvas
                          ref={saturationCanvasRef}
                          width={256}
                          height={256}
                          className="w-full h-64 rounded border-2 border-gray-600 cursor-crosshair"
                          style={{ imageRendering: 'pixelated' }}
                        />
                        <div
                          ref={saturationRef}
                          className="absolute inset-0 rounded cursor-crosshair"
                          onMouseDown={(e) => {
                            setIsDragging(true)
                            handleSaturationClick(e)
                          }}
                        >
                          {/* ?�들 */}
                          <div
                            className="absolute w-4 h-4 rounded-full border-2 border-white shadow-lg transform -translate-x-1/2 -translate-y-1/2 pointer-events-none z-10"
                            style={{
                              left: `${saturation}%`,
                              top: `${100 - brightness}%`,
                              backgroundColor: currentColorHex
                            }}
                          />
                        </div>
                      </div>
                      
                      {/* ?�상 ?�트�?*/}
                      <div className="relative">
                        <canvas
                          ref={hueCanvasRef}
                          width={32}
                          height={256}
                          className="w-8 h-64 rounded border-2 border-gray-600 cursor-pointer"
                          style={{ imageRendering: 'pixelated' }}
                        />
                        <div
                          ref={hueRef}
                          className="absolute inset-0 rounded cursor-pointer"
                          onMouseDown={(e) => {
                            setIsDraggingHue(true)
                            handleHueClick(e)
                          }}
                        >
                          {/* ?�상 ?�들 */}
                          <div
                            className="absolute left-0 right-0 w-full h-1 bg-white border border-gray-400 shadow-lg transform -translate-y-1/2 pointer-events-none z-10"
                            style={{
                              top: `${(hue / 360) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* ?�재 ?�택??컬러 미리보기 �?Hex ?�력 */}
                    <div className="mb-4">
                      <div className="flex items-center gap-4">
                        <div 
                          className="w-16 h-16 rounded border-2 border-gray-600"
                          style={{ backgroundColor: currentColorHex }}
                        />
                        <div className="flex-1">
                          <label className="block text-sm font-medium text-gray-300 mb-1">Web Color</label>
                          <input
                            type="text"
                            value={currentColorHex}
                            onChange={(e) => {
                              const value = e.target.value
                              if (/^#[0-9A-Fa-f]{6}$/i.test(value)) {
                                const [r, g, b] = hexToRgb(value)
                                const [h, s, v] = rgbToHsv(r, g, b)
                                updateColor(h, s, v)
                              }
                            }}
                            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                            placeholder="#000000"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500"
                      >
                        취소
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onSelect(currentColorHex)
                          onClose()
                        }}
                        className="px-4 py-2 bg-pink-500 text-white rounded-lg hover:bg-pink-600"
                      >
                        ?�료
                      </button>
                    </div>
                  </div>
                </div>
              )
            }
            
            return (
              <>
                {/* ?�메뉴 컬러 ?�업 */}
                {showMenuColorPopup && (
                  <ColorPicker
                    title="?�메뉴 컬러 ?�정"
                    currentColor={formData.menuColor}
                    onSelect={(color) => setFormData({ ...formData, menuColor: color })}
                    onClose={() => setShowMenuColorPopup(false)}
                  />
                )}

                {/* ?�메??컬러 ?�업 */}
                {showSubtitleColorPopup && (
                  <ColorPicker
                    title="?�메??컬러 ?�정"
                    currentColor={formData.subtitleColor}
                    onSelect={(color) => setFormData({ ...formData, subtitleColor: color })}
                    onClose={() => setShowSubtitleColorPopup(false)}
                  />
                )}

                {/* ?�세메뉴 컬러 ?�업 */}
                {showDetailMenuColorPopup && (
                  <ColorPicker
                    title="?�세메뉴 컬러 ?�정"
                    currentColor={formData.detailMenuColor}
                    onSelect={(color) => setFormData({ ...formData, detailMenuColor: color })}
                    onClose={() => setShowDetailMenuColorPopup(false)}
                  />
                )}

                {/* 본문 컬러 ?�업 */}
                {showBodyColorPopup && (
                  <ColorPicker
                    title="본문 컬러 ?�정"
                    currentColor={formData.bodyColor}
                    onSelect={(color) => setFormData({ ...formData, bodyColor: color })}
                    onClose={() => setShowBodyColorPopup(false)}
                  />
                )}
              </>
            )
          })()}
          
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                ?�메?�당 글?�수
              </label>
              <input
                type="text"
                name="subtitleCharCount"
                value={formData.subtitleCharCount}
                onChange={handleChange}
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                placeholder="?�력?�세??
                maxLength={4}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                ?�세메뉴??글?�수
              </label>
              <input
                type="text"
                name="detailMenuCharCount"
                value={formData.detailMenuCharCount}
                onChange={handleChange}
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                placeholder="?�력?�세??
                maxLength={4}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                ?�메뉴 ?�트?�기
              </label>
              <div className="flex">
              <input
                type="text"
                name="menuFontSize"
                value={formData.menuFontSize}
                onChange={handleChange}
                  className="w-16 bg-gray-700 border border-gray-600 border-r-0 rounded-l-lg rounded-r-none px-2 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm text-center"
                  placeholder="16"
                  maxLength={2}
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, menuFontBold: !prev.menuFontBold }))}
                  className={`w-9 py-2 rounded-r-lg rounded-l-none text-sm transition-colors border border-gray-600 border-l-0 ${
                    formData.menuFontBold 
                      ? 'bg-pink-600 text-white font-bold' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 font-normal'
                  }`}
                >
                  B
                </button>
            </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                ?�메???�트?�기
              </label>
              <div className="flex">
              <input
                type="text"
                name="subtitleFontSize"
                value={formData.subtitleFontSize}
                onChange={handleChange}
                  className="w-16 bg-gray-700 border border-gray-600 border-r-0 rounded-l-lg rounded-r-none px-2 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm text-center"
                  placeholder="14"
                  maxLength={2}
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, subtitleFontBold: !prev.subtitleFontBold }))}
                  className={`w-9 py-2 rounded-r-lg rounded-l-none text-sm transition-colors border border-gray-600 border-l-0 ${
                    formData.subtitleFontBold 
                      ? 'bg-pink-600 text-white font-bold' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 font-normal'
                  }`}
                >
                  B
                </button>
            </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                ?�세메뉴 ?�트?�기
              </label>
              <div className="flex">
                <input
                  type="text"
                  name="detailMenuFontSize"
                  value={formData.detailMenuFontSize}
                  onChange={handleChange}
                  className="w-16 bg-gray-700 border border-gray-600 border-r-0 rounded-l-lg rounded-r-none px-2 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm text-center"
                  placeholder="12"
                  maxLength={2}
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, detailMenuFontBold: !prev.detailMenuFontBold }))}
                  className={`w-9 py-2 rounded-r-lg rounded-l-none text-sm transition-colors border border-gray-600 border-l-0 ${
                    formData.detailMenuFontBold 
                      ? 'bg-pink-600 text-white font-bold' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 font-normal'
                  }`}
                >
                  B
                </button>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                본문 ?�트?�기
              </label>
              <div className="flex">
              <input
                type="text"
                name="bodyFontSize"
                value={formData.bodyFontSize}
                onChange={handleChange}
                  className="w-16 bg-gray-700 border border-gray-600 border-r-0 rounded-l-lg rounded-r-none px-2 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm text-center"
                  placeholder="11"
                  maxLength={2}
                />
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, bodyFontBold: !prev.bodyFontBold }))}
                  className={`w-9 py-2 rounded-r-lg rounded-l-none text-sm transition-colors border border-gray-600 border-l-0 ${
                    formData.bodyFontBold 
                      ? 'bg-pink-600 text-white font-bold' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600 font-normal'
                  }`}
                >
                  B
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ?�??취소/??�� 버튼 */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '?�??�?..' : '?�??}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
          >
            취소
          </button>
          {contentId && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200"
            >
              ??��
            </button>
          )}
        </div>
      </form>

      {/* ?�네??모달 */}
      {/* ?�운 ?�로??모달 */}
      {showEasyUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {/* ?�메뉴 ?�력 ?�역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg h-60 p-4 flex flex-col">
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">?�메뉴</label>
                <textarea
                  value={easyUploadData.menus}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, menus: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모?�에??복사???�?�목??붙여?�으?�요&#10;?? 1. �?번째 ?�?�목&#10;2. ??번째 ?�?�목"
                />
              </div>
              
              {/* ?�메???�력 ?�역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">?�메??/label>
                <textarea
                  value={easyUploadData.subtitles}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, subtitles: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모?�에??복사???�제목을 붙여?�으?�요&#10;?? 1-1. �?번째 ?�제�?#10;1-2. ??번째 ?�제�?
                />
              </div>
              
              {/* ?�메???�석?�구 ?�력 ?�역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">?�메???�석?�구</label>
                <textarea
                  value={easyUploadData.subtitleTools}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, subtitleTools: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모?�에??복사???�메???�석?�구�?붙여?�으?�요&#10;?? 1-1. ?�메???�석?�구 ?�용&#10;1-2. ?�메???�석?�구 ?�용"
                />
              </div>
              
              {/* ?�세메뉴 ?�력 ?�역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">?�세메뉴</label>
                <textarea
                  value={easyUploadData.detailMenus}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, detailMenus: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모?�에??복사???�세메뉴�?붙여?�으?�요&#10;?? 1-1-1. �?번째 ?�세메뉴&#10;1-1-2. ??번째 ?�세메뉴"
                />
              </div>
              
              {/* ?�석?�구 ?�력 ?�역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">?�세메뉴 ?�석?�구</label>
                <textarea
                  value={easyUploadData.tools}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, tools: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모?�에??복사???�석?�구�?붙여?�으?�요&#10;?? 1-1-1. ?�석?�구 ?�용&#10;1-2-1. ?�석?�구 ?�용"
                />
              </div>
            </div>
            
            {/* ?�단 버튼 */}
            <div className="p-4 border-t border-gray-600 flex gap-3 justify-center">
              <button
                onClick={() => {
                  parseAndApplyEasyUpload()
                }}
                className="bg-pink-600 hover:bg-pink-500 text-white font-medium px-8 py-3 rounded-lg transition-colors duration-200"
              >
                반영
              </button>
              <button
                onClick={() => {
                  setShowEasyUploadModal(false)
                  // 취소 버튼?� ?�업�??�고 ?�력 ?�드 ?�용?� ?��?
                  // setEasyUploadData({ menus: '', subtitles: '', subtitleTools: '', detailMenus: '', tools: '' })
                }}
                className="bg-gray-700 hover:bg-gray-600 text-white font-medium px-8 py-3 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <ThumbnailModal
        isOpen={showThumbnailModal}
        onClose={() => setShowThumbnailModal(false)}
        onSelect={handleThumbnailSelect}
        currentThumbnail={
          currentThumbnailField === 'main'
            ? formData.thumbnailUrl
            : currentThumbnailField === 'firstMenu'
            ? firstMenuField.thumbnail
            : typeof currentThumbnailField === 'number'
            ? menuFields.find(f => f.id === currentThumbnailField)?.thumbnail
            : (currentThumbnailField === 'preview-0' || currentThumbnailField === 'preview-1' || currentThumbnailField === 'preview-2')
            ? formData.previewThumbnails[parseInt(currentThumbnailField.split('-')[1])]
            : currentThumbnailField === 'bookCover'
            ? formData.bookCoverThumbnail
            : currentThumbnailField === 'endingBookCover'
            ? formData.endingBookCoverThumbnail
            : typeof currentThumbnailField === 'string' && currentThumbnailField.startsWith('subtitle-')
            ? (() => {
                const parts = currentThumbnailField.split('-')
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텐�???�� ?�인 ?�업 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">컨텐�???��</h3>
            <p className="text-gray-300 mb-6">
              ?�말�???컨텐츠�? ??��?�시겠습?�까?
              {formData.contentName && (
                <span className="block mt-2 text-pink-400 font-semibold">
                  &quot;{formData.contentName}&quot;
                </span>
              )}
            </p>
            <div className="flex gap-3">
              <button
                onClick={async () => {
                  if (contentId) {
                    try {
                      const response = await fetch(`/api/admin/content/delete?id=${contentId}`, {
                        method: 'DELETE',
                      })

                      if (!response.ok) {
                        const errorData = await response.json().catch(() => ({ error: '??��???�패?�습?�다.' }))
                        throw new Error(errorData.error || '??��???�패?�습?�다.')
                      }

                      router.push('/admin')
                    } catch (error: any) {

                      alert(`??��???�패?�습?�다: ${error.message || '?????�는 ?�류'}`)
                      setShowDeleteConfirm(false)
                    }
                  }
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                ??��
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 무결??체크 결과 ?�업 */}
      {showIntegrityCheckResult && integrityCheckResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            {/* ?�더 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${integrityCheckResult.isValid ? 'text-green-600' : 'text-red-600'}`}>
                무결??체크 결과
              </h2>
              <button
                onClick={() => {
                  setShowIntegrityCheckResult(false)
                  setIntegrityCheckResult(null)
                }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              >
                ×
              </button>
            </div>
            
            {/* 메시지 */}
            <div className={`mb-4 p-4 rounded-lg ${integrityCheckResult.isValid ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              <p className="font-semibold">{integrityCheckResult.message}</p>
            </div>
            
            {/* ?�류 목록 */}
            {!integrityCheckResult.isValid && integrityCheckResult.errors.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">?�류 목록:</h3>
                <ul className="space-y-2">
                  {integrityCheckResult.errors.map((error, index) => (
                    <li key={index} className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* ?�터 */}
            <div>
              <button
                onClick={() => {
                  setShowIntegrityCheckResult(false)
                  setIntegrityCheckResult(null)
                }}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                ?�인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미리 보기 ?�업 */}
      {showPreview && (
        <PreviewModal
          formData={formData}
          menuFields={menuFields}
          firstMenuField={firstMenuField}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}

// 미리보기 모달 컴포?�트
function PreviewModal({ 
  formData, 
  menuFields, 
  firstMenuField,
  onClose 
}: { 
  formData: any
  menuFields: any[]
  firstMenuField: any
  onClose: () => void 
}) {
  const [viewMode, setViewMode] = useState<'pc' | 'mobile'>('pc')
  
  // ?�플 본문 ?�스???�성
  const generateSampleContent = (title: string) => {
    return `<p>${title}???�???�사 ?�용???�기???�시?�니?? ?�제 ?��??�이 ?�사 결과????부분에 ?�시?�며, ?�러 문단?�로 구성?????�습?�다.</p>
<p>?�사 ?�용?� ?�용?�의 ?�년?�일, ?�간, ?�별 ?�의 ?�보�?바탕?�로 ?�성?�며, �???��별로 ?�세???�석???�공?�니??</p>
<p>??미리보기???�제 ?�사 결과?� ?�사???�이?�웃�??��??�을 보여주기 ?�한 ?�플?�니??</p>`
  }

  // ?�트 ?��?�?추출 ?�수
  const extractFontFamily = (fontFaceCss: string): string | null => {
    if (!fontFaceCss) return null
    const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
    return match ? (match[1] || match[2]?.trim()) : null
  }

  const menuFontFamily = extractFontFamily(formData.menuFontFace || formData.fontFace || '')
  const subtitleFontFamily = extractFontFamily(formData.subtitleFontFace || formData.fontFace || '')
  const detailMenuFontFamily = extractFontFamily(formData.detailMenuFontFace || formData.fontFace || '')
  const bodyFontFamily = extractFontFamily(formData.bodyFontFace || formData.fontFace || '')

  // 모든 메뉴 ??�� ?�집
  const allMenuItems = [
    ...(firstMenuField.value || firstMenuField.thumbnail ? [firstMenuField] : []),
    ...menuFields
  ]

  // 목차 ?�성
  const generateTOC = () => {
    if (allMenuItems.length === 0) return null
    
    return (
      <div id="table-of-contents" className="mb-6 border-t border-b border-gray-200 pt-6 pb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">목차</h3>
        <div className="space-y-2">
          {allMenuItems.map((menuItem, mIndex) => {
            const menuTitle = (menuItem.value || '').trim()
            if (!menuTitle) return null
            
            return (
              <div key={`toc-menu-${mIndex}`} className="space-y-1">
                <button
                  onClick={() => {
                    const element = document.getElementById(`preview-menu-${mIndex}`)
                    if (element) {
                      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }
                  }}
                  className="text-left text-base font-semibold text-gray-800 hover:text-pink-600 transition-colors w-full py-1"
                >
                  {menuTitle}
                </button>
                {menuItem.subtitles && menuItem.subtitles.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {menuItem.subtitles.map((sub: any, sIndex: number) => {
                      const subTitle = (sub.subtitle || '').trim()
                      if (!subTitle || subTitle.includes('?�세메뉴 ?�석 목록')) return null
                      return (
                        <button
                          key={`toc-sub-${mIndex}-${sIndex}`}
                          onClick={() => {
                            const element = document.getElementById(`preview-subtitle-${mIndex}-${sIndex}`)
                            if (element) {
                              element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }
                          }}
                          className="text-left text-sm text-gray-600 hover:text-pink-600 transition-colors w-full py-0.5"
                        >
                          {subTitle}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ?�적 ?��????�성
  const dynamicStyles = `
    ${formData.menuFontFace ? formData.menuFontFace : ''}
    ${formData.subtitleFontFace ? formData.subtitleFontFace : ''}
    ${formData.detailMenuFontFace ? formData.detailMenuFontFace : ''}
    ${formData.bodyFontFace ? formData.bodyFontFace : ''}
    ${!formData.menuFontFace && !formData.subtitleFontFace && !formData.detailMenuFontFace && !formData.bodyFontFace && formData.fontFace ? formData.fontFace : ''}
  `

  // 목차�??�동 ?�수
  const scrollToTableOfContents = () => {
    const tocElement = document.getElementById('table-of-contents')
    if (tocElement) {
      tocElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl ${viewMode === 'pc' ? 'max-w-4xl' : 'max-w-md'} w-full shadow-2xl max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* ?�더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">미리 보기</h2>
          <div className="flex items-center gap-3">
            {/* PC/모바??모드 ?�환 버튼 */}
            <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('pc')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'pc'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                PC 모드
              </button>
              <button
                onClick={() => setViewMode('mobile')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'mobile'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                모바??모드
              </button>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            >
              ×
            </button>
          </div>
        </div>
        
        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 relative">
          <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
          <div className={`${viewMode === 'pc' ? 'max-w-4xl' : 'max-w-md'} mx-auto`}>
            {/* ?�목 */}
            <div className="mb-8 text-center">
              <h1 
                className="text-3xl md:text-4xl font-bold text-gray-900 mb-4"
                style={{
                  fontFamily: menuFontFamily ? `'${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined
                }}
              >
                {formData.contentName || '?�사 결과'}
              </h1>
            </div>

            {/* 북커�??�네??*/}
            {formData.bookCoverThumbnail && (
              <div className="w-full mb-10">
                <img 
                  src={formData.bookCoverThumbnail} 
                  alt="북커�??�네??
                  className="w-full h-auto"
                  style={{ objectFit: 'contain', display: 'block' }}
                />
              </div>
            )}

            {/* 목차 */}
            {generateTOC()}

            {/* 메뉴 ?�션??*/}
            <div className="jeminai-results space-y-6">
              {allMenuItems.map((menuItem, menuIndex) => {
                const menuTitle = (menuItem.value || '').trim()
                if (!menuTitle) return null

                return (
                  <div key={`preview-menu-${menuIndex}`} id={`preview-menu-${menuIndex}`} className="menu-section bg-white rounded-xl p-6 shadow-sm space-y-4">
                    {/* ?�메뉴 ?�목 */}
                    <div 
                      className="menu-title font-bold text-lg text-gray-900"
                      style={{
                        fontSize: `${formData.menuFontSize || 16}px`,
                        fontWeight: formData.menuFontBold ? 'bold' : 'normal',
                        fontFamily: menuFontFamily ? `'${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                        color: formData.menuColor || undefined
                      }}
                    >
                      {menuTitle}
                    </div>

                    {/* ?�메?�들 */}
                    {menuItem.subtitles && menuItem.subtitles.length > 0 && (
                      <div className="space-y-4">
                        {menuItem.subtitles.map((sub: any, subIndex: number) => {
                          const subTitle = (sub.subtitle || '').trim()
                          if (!subTitle || subTitle.includes('?�세메뉴 ?�석 목록')) return null

                          return (
                            <div key={`preview-subtitle-${menuIndex}-${subIndex}`} id={`preview-subtitle-${menuIndex}-${subIndex}`} className="subtitle-section space-y-2 pt-6 pb-6 border-b border-gray-100 last:border-b-0">
                              {/* ?�메???�목 */}
                              <div 
                                className="subtitle-title font-semibold text-gray-900"
                                style={{
                                  fontSize: `${formData.subtitleFontSize || 14}px`,
                                  fontWeight: formData.subtitleFontBold ? 'bold' : 'normal',
                                  fontFamily: subtitleFontFamily ? `'${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                                  color: formData.subtitleColor || undefined
                                }}
                              >
                                {subTitle}
                              </div>

                              {/* ?�메???�네??*/}
                              {sub.thumbnail && (
                                <div className="flex justify-center" style={{ width: '50%', marginLeft: 'auto', marginRight: 'auto' }}>
                                  <img
                                    src={sub.thumbnail}
                                    alt="?�제�??�네??
                                    className="w-full h-auto rounded-lg"
                                    style={{ display: 'block', objectFit: 'contain' }}
                                  />
                                </div>
                              )}

                              {/* ?�세메뉴??*/}
                              {sub.detailMenus && sub.detailMenus.length > 0 && (
                                <div className="space-y-3 mt-4">
                                  {sub.detailMenus.map((detailMenu: any, dmIndex: number) => {
                                    const detailMenuTitle = (detailMenu.detailMenu || '').trim()
                                    if (!detailMenuTitle) return null

                                    return (
                                      <div key={`preview-detail-${menuIndex}-${subIndex}-${dmIndex}`} className="detail-menu-section space-y-2">
                                        {/* ?�세메뉴 ?�목 */}
                                        <div 
                                          className="detail-menu-title font-semibold text-gray-800"
                                          style={{
                                            fontSize: `${formData.detailMenuFontSize || 12}px`,
                                            fontWeight: formData.detailMenuFontBold ? 'bold' : 'normal',
                                            fontFamily: detailMenuFontFamily ? `'${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                                            color: formData.detailMenuColor || undefined
                                          }}
                                        >
                                          {detailMenuTitle}
                                        </div>

                                        {/* ?�세메뉴 ?�네??*/}
                                        {detailMenu.thumbnail && (
                                          <div className="flex justify-center" style={{ width: '50%', marginLeft: 'auto', marginRight: 'auto' }}>
                                            <img
                                              src={detailMenu.thumbnail}
                                              alt="?�세메뉴 ?�네??
                                              className="w-full h-auto rounded-lg"
                                              style={{ display: 'block', objectFit: 'contain' }}
                                            />
                                          </div>
                                        )}

                                        {/* ?�세메뉴 본문 */}
                                        <div 
                                          className="detail-menu-content text-gray-800"
                                          style={{
                                            fontSize: `${formData.bodyFontSize || 11}px`,
                                            fontWeight: formData.bodyFontBold ? 'bold' : 'normal',
                                            fontFamily: bodyFontFamily ? `'${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                                            color: formData.bodyColor || undefined,
                                            lineHeight: '1.8',
                                            marginBottom: '1em'
                                          }}
                                          dangerouslySetInnerHTML={{ __html: generateSampleContent(detailMenuTitle) }}
                                        />
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {/* ?�메??본문 */}
                              <div 
                                className="subtitle-content text-gray-800 mt-4"
                                style={{
                                  fontSize: `${formData.bodyFontSize || 11}px`,
                                  fontWeight: formData.bodyFontBold ? 'bold' : 'normal',
                                  fontFamily: bodyFontFamily ? `'${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined,
                                  color: formData.bodyColor || undefined,
                                  lineHeight: '1.8',
                                  marginBottom: '2em'
                                }}
                                dangerouslySetInnerHTML={{ __html: generateSampleContent(subTitle) }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* ?�딩 북커�?*/}
                    {menuIndex === allMenuItems.length - 1 && formData.endingBookCoverThumbnail && (
                      <div className="w-full mt-4">
                        <img 
                          src={formData.endingBookCoverThumbnail} 
                          alt="?�딩북커�??�네??
                          className="w-full h-auto"
                          style={{ objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* ?�로??배너 - 목차�??�동 */}
            {allMenuItems.length > 0 && (
              <div className="sticky bottom-6 z-40 flex justify-end mt-6 mr-6">
                <button
                  onClick={scrollToTableOfContents}
                  className="bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold px-6 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center gap-2 opacity-80"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  <span>목차�??�동</span>
                </button>
              </div>
            )}
          </div>
        </div>
        
        {/* ?�터 */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            ?�기
          </button>
        </div>
      </div>
    </div>
  )
}

