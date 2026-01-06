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
  const duplicateId = searchParams.get('duplicate') // 복제할 컨텐츠 ID
  const speakerParam = searchParams.get('speaker') // URL에서 화자 파라미터 가져오기
  
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
    fontFace: '', // 하위 호환성을 위해 유지 (사용 안 함)
    menuFontFace: '', // 대메뉴 웹폰트
    subtitleFontFace: '', // 소메뉴 웹폰트
    detailMenuFontFace: '', // 상세메뉴 웹폰트
    bodyFontFace: '', // 본문 웹폰트
    menuColor: '', // 대메뉴 컬러
    subtitleColor: '', // 소메뉴 컬러
    detailMenuColor: '', // 상세메뉴 컬러
    bodyColor: '', // 본문 컬러
    ttsSpeaker: speakerParam || 'nara', // URL 파라미터 또는 기본값: nara
    previewThumbnails: ['', '', ''], // 재회상품 미리보기 썸네일 3개
    bookCoverThumbnail: '', // 북커버 썸네일 (첫 번째 대제목 전)
    endingBookCoverThumbnail: '', // 엔딩북커버 썸네일 (마지막 대제목 밑)
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
  const [showIntegrityCheckResult, setShowIntegrityCheckResult] = useState(false) // 무결성 체크 결과 팝업
  const [integrityCheckResult, setIntegrityCheckResult] = useState<{
    isValid: boolean
    errors: string[]
    message: string
  } | null>(null) // 무결성 체크 결과
  const [showPreview, setShowPreview] = useState(false) // 미리보기 팝업
  
  // 웹폰트 팝업 상태
  const [showMenuFontPopup, setShowMenuFontPopup] = useState(false)
  const [showSubtitleFontPopup, setShowSubtitleFontPopup] = useState(false)
  const [showDetailMenuFontPopup, setShowDetailMenuFontPopup] = useState(false)
  const [showBodyFontPopup, setShowBodyFontPopup] = useState(false)
  
  // 웹폰트 임시 입력값 (팝업에서 편집)
  const [tempMenuFontFace, setTempMenuFontFace] = useState('')
  const [tempSubtitleFontFace, setTempSubtitleFontFace] = useState('')
  const [tempDetailMenuFontFace, setTempDetailMenuFontFace] = useState('')
  const [tempBodyFontFace, setTempBodyFontFace] = useState('')
  
  // 컬러 팝업 상태
  const [showMenuColorPopup, setShowMenuColorPopup] = useState(false)
  const [showSubtitleColorPopup, setShowSubtitleColorPopup] = useState(false)
  const [showDetailMenuColorPopup, setShowDetailMenuColorPopup] = useState(false)
  const [showBodyColorPopup, setShowBodyColorPopup] = useState(false)

  // 초기 데이터 로드 (수정 모드 또는 복제 모드)
  useEffect(() => {
    if (contentId) {
      loadContent(parseInt(contentId))
    } else if (duplicateId) {
      loadContentForDuplicate(parseInt(duplicateId))
    }
  }, [contentId, duplicateId])

  // 변경 감지
  useEffect(() => {
    if (initialData) {
      // 현재 상태를 initialData와 같은 형식으로 변환
      const allMenuItems = [
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
        font_face: formData.fontFace || '', // 하위 호환성
        menu_font_face: formData.menuFontFace || '',
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
      
      // initialData도 정규화 (menu_items 배열 처리)
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
        subtitle_font_size: initialData.subtitle_font_size || 14,
        body_font_size: initialData.body_font_size || 11,
        font_face: initialData.font_face || '',
        menu_items: initialData.menu_items || [],
        is_new: initialData.is_new || false,
        tts_speaker: initialData.tts_speaker || 'nara',
        preview_thumbnails: initialData.preview_thumbnails || ['', '', ''],
        book_cover_thumbnail: initialData.book_cover_thumbnail || '',
        ending_book_cover_thumbnail: initialData.ending_book_cover_thumbnail || '',
      }
      
      // menu_items 배열 정규화 (id 제거하고 value, thumbnail, subtitles 비교)
      const normalizeMenuItems = (items: any[]) => {
        return items.map((item: any) => ({
          value: item.value || '',
          thumbnail: item.thumbnail || '',
          subtitles: item.subtitles || []
        })).sort((a, b) => {
          // value와 thumbnail을 조합해서 정렬 (일관된 비교를 위해)
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
      // 새로 생성하는 경우: 필드에 값이 있으면 변경사항 있음
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
      console.log('=== loadContent: 데이터 로드 ===')
      console.log('data.book_cover_thumbnail:', data.book_cover_thumbnail)
      console.log('data.ending_book_cover_thumbnail:', data.ending_book_cover_thumbnail)
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
        fontFace: data.font_face || '', // 하위 호환성
        menuFontFace: data.menu_font_face || data.font_face || '', // 하위 호환성
        subtitleFontFace: data.subtitle_font_face || data.font_face || '', // 하위 호환성
        detailMenuFontFace: data.detail_menu_font_face || data.font_face || '', // 하위 호환성
        bodyFontFace: data.body_font_face || data.font_face || '', // 하위 호환성
        menuColor: data.menu_color || '',
        subtitleColor: data.subtitle_color || '',
        detailMenuColor: data.detail_menu_color || '',
        bodyColor: data.body_color || '',
        ttsSpeaker: data.tts_speaker || 'nara',
        previewThumbnails: (() => {
          let thumbnails = data.preview_thumbnails
          // 문자열인 경우 파싱
          if (typeof thumbnails === 'string') {
            try {
              thumbnails = JSON.parse(thumbnails)
            } catch (e) {
              console.error('loadContent: preview_thumbnails 파싱 에러:', e)
              thumbnails = []
            }
          }
          // 배열이 아니거나 길이가 3이 아니면 기본값 사용
          if (!Array.isArray(thumbnails) || thumbnails.length !== 3) {
            // 배열이지만 길이가 다르면 3개로 맞춤
            if (Array.isArray(thumbnails)) {
              while (thumbnails.length < 3) {
                thumbnails.push('')
              }
              thumbnails = thumbnails.slice(0, 3)
            } else {
              thumbnails = ['', '', '']
            }
          }
          console.log('loadContent: previewThumbnails 로드됨:', thumbnails)
          return thumbnails
        })(),
        bookCoverThumbnail: data.book_cover_thumbnail || '',
        endingBookCoverThumbnail: data.ending_book_cover_thumbnail || '',
      })
      console.log('loadContent: formData.bookCoverThumbnail:', data.book_cover_thumbnail || '')
      console.log('loadContent: formData.endingBookCoverThumbnail:', data.ending_book_cover_thumbnail || '')
      console.log('==============================')
      // 기존 데이터를 새 구조로 변환
      if (data.menu_items && data.menu_items.length > 0) {
        // menu_items에 subtitles가 있는지 확인 (새 구조)
        const hasSubtitlesInMenuItems = data.menu_items.some((item: any) => item.subtitles && Array.isArray(item.subtitles))
        
        if (hasSubtitlesInMenuItems) {
          // 새 구조: menu_items에 subtitles가 포함되어 있음
          const firstItem = data.menu_items[0]
          const firstMenuSubtitles = firstItem.subtitles && firstItem.subtitles.length > 0 
            ? firstItem.subtitles.map((s: any, idx: number) => {
                console.log('첫 번째 메뉴 소제목 썸네일 로드:', {
                  subtitle: s.subtitle,
                  thumbnail: s.thumbnail,
                  thumbnailType: typeof s.thumbnail,
                  hasThumbnail: !!s.thumbnail
                })
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
            // 대메뉴에 값이 있는데 소메뉴가 없으면 디폴트 소메뉴 1개 추가
            subtitles: firstMenuValue.trim().length > 0 && firstMenuSubtitles.length === 0
              ? [{ id: Date.now(), subtitle: '', interpretation_tool: '' }]
              : firstMenuSubtitles
          })
          
          // 나머지 메뉴 항목들
          setMenuFields(data.menu_items.slice(1).map((item: any, idx: number) => {
            const menuSubtitles = item.subtitles && item.subtitles.length > 0
              ? item.subtitles.map((s: any, subIdx: number) => {
                  console.log('메뉴 필드 소제목 썸네일 로드:', {
                    menuValue: item.value,
                    subtitle: s.subtitle,
                    thumbnail: s.thumbnail,
                    thumbnailType: typeof s.thumbnail,
                    hasThumbnail: !!s.thumbnail
                  })
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
              // 대메뉴에 값이 있는데 소메뉴가 없으면 디폴트 소메뉴 1개 추가
              subtitles: menuValue.trim().length > 0 && menuSubtitles.length === 0
                ? [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '' }]
                : menuSubtitles
            }
          }))
        } else {
          // 기존 구조: menu_subtitle과 interpretation_tool을 파싱 (하위 호환성)
          const menuSubtitles = data.menu_subtitle ? data.menu_subtitle.split('\n').filter((s: string) => s.trim()) : []
          const interpretationTools = data.interpretation_tool ? data.interpretation_tool.split('\n').filter((s: string) => s.trim()) : []
          
          // 각 메뉴 항목에 소제목 할당 (기본적으로 첫 번째 메뉴에 모든 소제목 할당)
          const firstMenuSubtitles = menuSubtitles.map((subtitle: string, index: number) => ({
            id: Date.now() + index,
            subtitle: subtitle.trim(),
            interpretation_tool: interpretationTools[index] || interpretationTools[0] || '',
            thumbnail: '', // 기존 데이터에는 소제목 썸네일이 없음
            detailMenus: [] // 기존 데이터에는 상세메뉴가 없음
          }))
          
          const firstMenuValue = data.menu_items[0].value || ''
        setFirstMenuField({
            value: firstMenuValue,
          thumbnail: data.menu_items[0].thumbnail || '',
            // 대메뉴에 값이 있는데 소메뉴가 없으면 디폴트 소메뉴 1개 추가
            subtitles: firstMenuValue.trim().length > 0 && firstMenuSubtitles.length === 0
              ? [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
              : (firstMenuSubtitles.length > 0 ? firstMenuSubtitles : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }])
          })
          
          // 나머지 메뉴 항목들
          setMenuFields(data.menu_items.slice(1).map((item: any, idx: number) => {
            const menuValue = item.value || ''
            return {
            id: item.id || Date.now() + idx + 1000,
              value: menuValue,
            thumbnail: item.thumbnail || '',
              // 대메뉴에 값이 있으면 디폴트 소메뉴 1개 추가
              subtitles: menuValue.trim().length > 0
                ? [{ id: Date.now() + idx * 1000, subtitle: '', interpretation_tool: '', detailMenus: [] }]
                : []
            }
          }))
        }
      } else {
        // 메뉴 항목이 없으면 기본값
        setFirstMenuField({ value: '', thumbnail: '', subtitles: [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }] })
        setMenuFields([])
      }
    } catch (error) {
      console.error('컨텐츠 로드 실패:', error)
    }
  }

  // 복제를 위한 컨텐츠 로드 (ID 제거하고 content_name에 "복사본" 추가)
  const loadContentForDuplicate = async (id: number) => {
    try {
      const data = await getContentById(id)
      console.log('=== loadContentForDuplicate: 복제용 데이터 로드 ===')
      setInitialData(null) // 복제 모드이므로 initialData를 null로 설정 (새 컨텐츠로 인식)
      
      // content_name에 "복사본" 추가
      const duplicatedContentName = data.content_name ? `${data.content_name} (복사본)` : '새 컨텐츠 (복사본)'
      
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
        fontFace: data.font_face || '', // 하위 호환성
        menuFontFace: data.menu_font_face || data.font_face || '', // 하위 호환성
        subtitleFontFace: data.subtitle_font_face || data.font_face || '', // 하위 호환성
        detailMenuFontFace: data.detail_menu_font_face || data.font_face || '', // 하위 호환성
        bodyFontFace: data.body_font_face || data.font_face || '', // 하위 호환성
        menuColor: data.menu_color || '',
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
              console.error('loadContentForDuplicate: preview_thumbnails 파싱 에러:', e)
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
      
      // 기존 데이터를 새 구조로 변환 (loadContent와 동일한 로직)
      if (data.menu_items && data.menu_items.length > 0) {
        const hasSubtitlesInMenuItems = data.menu_items.some((item: any) => item.subtitles && Array.isArray(item.subtitles))
        
        if (hasSubtitlesInMenuItems) {
          // 새 구조
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
      console.error('컨텐츠 복제용 로드 실패:', error)
      alert('컨텐츠 복제 로드에 실패했습니다.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      console.log('=== 관리자 폼: 컨텐츠 저장 ===');
      console.log('formData.ttsSpeaker:', formData.ttsSpeaker);
      console.log('formData.bookCoverThumbnail:', formData.bookCoverThumbnail);
      console.log('formData.endingBookCoverThumbnail:', formData.endingBookCoverThumbnail);
      console.log('contentId:', contentId);
      console.log('speakerParam:', speakerParam);
      
      // 모든 메뉴 항목에서 소제목과 해석도구 추출
      const allMenuItems = [
        ...(firstMenuField.value || firstMenuField.thumbnail ? [firstMenuField] : []),
        ...menuFields
      ]
      
      console.log('저장 전 allMenuItems:', allMenuItems.map((item, idx) => ({
        index: idx,
        value: item.value,
        thumbnail: item.thumbnail,
        subtitles: item.subtitles.map(s => ({
          id: s.id,
          subtitle: s.subtitle,
          interpretation_tool: s.interpretation_tool,
          thumbnail: s.thumbnail
        }))
      })))
      
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
      
      const contentData: ContentData = {
        ...(contentId ? { id: parseInt(contentId) } : {}),
        role_prompt: formData.title,
        restrictions: formData.description,
        content_type: formData.isNew ? 'saju' : 'gonghap',
        content_name: formData.contentName,
        thumbnail_url: formData.thumbnailUrl,
        price: formData.price,
        summary: formData.summary,
        introduction: formData.introduction,
        recommendation: formData.recommendation,
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
        font_face: formData.fontFace || '', // 하위 호환성
        menu_font_face: formData.menuFontFace || '',
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
      
      console.log('저장할 contentData.tts_speaker:', contentData.tts_speaker);
      console.log('저장할 contentData.preview_thumbnails:', contentData.preview_thumbnails);
      console.log('저장할 contentData.book_cover_thumbnail:', contentData.book_cover_thumbnail);
      console.log('저장할 contentData.ending_book_cover_thumbnail:', contentData.ending_book_cover_thumbnail);
      console.log('저장할 menu_items:', JSON.stringify(contentData.menu_items, null, 2));
      console.log('저장할 폰트 필드들:');
      console.log('  menu_font_face:', contentData.menu_font_face ? `${contentData.menu_font_face.substring(0, 50)}...` : '(비어있음)');
      console.log('  subtitle_font_face:', contentData.subtitle_font_face ? `${contentData.subtitle_font_face.substring(0, 50)}...` : '(비어있음)');
      console.log('  detail_menu_font_face:', contentData.detail_menu_font_face ? `${contentData.detail_menu_font_face.substring(0, 50)}...` : '(비어있음)');
      console.log('  body_font_face:', contentData.body_font_face ? `${contentData.body_font_face.substring(0, 50)}...` : '(비어있음)');
      console.log('formData 폰트 필드들:');
      console.log('  menuFontFace:', formData.menuFontFace ? `${formData.menuFontFace.substring(0, 50)}...` : '(비어있음)');
      console.log('  subtitleFontFace:', formData.subtitleFontFace ? `${formData.subtitleFontFace.substring(0, 50)}...` : '(비어있음)');
      console.log('  detailMenuFontFace:', formData.detailMenuFontFace ? `${formData.detailMenuFontFace.substring(0, 50)}...` : '(비어있음)');
      console.log('  bodyFontFace:', formData.bodyFontFace ? `${formData.bodyFontFace.substring(0, 50)}...` : '(비어있음)');
      console.log('==============================');
      
      // API 라우트를 통해 저장 (서버 사이드에서 서비스 롤 키 사용)
      const response = await fetch('/api/admin/content/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(contentData),
      })

      // Content-Type 확인
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text()
        console.error('API가 JSON이 아닌 응답을 반환했습니다:', text.substring(0, 200))
        throw new Error('서버 오류가 발생했습니다. 콘솔을 확인하세요.')
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: '알 수 없는 오류가 발생했습니다.' }))
        throw new Error(errorData.error || '저장에 실패했습니다.')
      }

      const result = await response.json()
      console.log('저장 완료:', result.data)
      
      router.push('/admin')
    } catch (error: any) {
      console.error('저장 실패:', error)
      const errorMessage = error?.message || '저장에 실패했습니다.'
      alert(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (hasChanges) {
      setShowCancelWarning(true)
    } else {
      router.push('/admin')
    }
  }

  const handleThumbnailClick = (field: 'main' | 'firstMenu' | 'preview-0' | 'preview-1' | 'preview-2' | 'bookCover' | 'endingBookCover' | number) => {
    setCurrentThumbnailField(field)
    setShowThumbnailModal(true)
  }

  // 숫자 접두사 형식 체크 함수
  const checkNumberPrefix = (text: string, expectedPattern: 'menu' | 'subtitle' | 'detailMenu'): boolean => {
    if (!text || !text.trim()) return false
    
    const trimmed = text.trim()
    
    if (expectedPattern === 'menu') {
      // 대메뉴: "1. " 형식
      return /^\d+\.\s/.test(trimmed)
    } else if (expectedPattern === 'subtitle') {
      // 소메뉴: "1-1. " 형식
      return /^\d+-\d+\.\s/.test(trimmed)
    } else if (expectedPattern === 'detailMenu') {
      // 상세메뉴: "1-1-1. " 형식
      return /^\d+-\d+-\d+\.\s/.test(trimmed)
    }
    
    return false
  }

  // 무결성 체크 함수
  const handleIntegrityCheck = () => {
    console.log('무결성 체크 시작')
    const errors: string[] = []
    const allMenuItems = [
      ...(firstMenuField.value || firstMenuField.thumbnail ? [firstMenuField] : []),
      ...menuFields
    ]
    console.log('체크할 메뉴 항목 수:', allMenuItems.length)

    // 대메뉴 체크
    allMenuItems.forEach((menuItem, menuIndex) => {
      const menuValue = menuItem.value?.trim() || ''
      if (menuValue && !checkNumberPrefix(menuValue, 'menu')) {
        errors.push(`대메뉴 ${menuIndex + 1}: "${menuValue}" - 숫자 접두사 형식이 올바르지 않습니다. (예: "1. ")`)
      }

      // 소메뉴 체크
      if (menuItem.subtitles && Array.isArray(menuItem.subtitles)) {
        menuItem.subtitles.forEach((subtitle, subIndex) => {
          const subtitleText = subtitle.subtitle?.trim() || ''
          if (subtitleText && !checkNumberPrefix(subtitleText, 'subtitle')) {
            errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1}: "${subtitleText}" - 숫자 접두사 형식이 올바르지 않습니다. (예: "1-1. ")`)
          }

          // 해석도구 체크 (소메뉴와 일치해야 함)
          const interpretationTool = subtitle.interpretation_tool?.trim() || ''
          if (subtitleText && interpretationTool) {
            // 소메뉴의 숫자 접두사 추출 (점이 있든 없든 추출 시도)
            // "1-1. " 또는 "1-1 " 또는 "1-1" 형식 모두 지원
            const subtitlePrefixMatch = subtitleText.match(/^(\d+-\d+)(?:\.\s|\.|\s|$)/)
            const subtitlePrefix = subtitlePrefixMatch?.[1]
            
            // 해석도구 형식 체크 (올바른 형식인지 확인)
            const isValidToolFormat = checkNumberPrefix(interpretationTool, 'subtitle')
            if (!isValidToolFormat) {
              errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1}: 해석도구의 숫자 접두사 형식이 올바르지 않습니다. (예: "1-1. ")`)
            }
            
            // 해석도구의 숫자 접두사 추출 (점이 있든 없든 추출 시도)
            const toolPrefixMatch = interpretationTool.match(/^(\d+-\d+)(?:\.\s|\.|\s|$)/)
            const toolPrefix = toolPrefixMatch?.[1]
            
            // 소메뉴와 해석도구의 접두사 일치 여부 체크
            if (subtitlePrefix && toolPrefix) {
              if (subtitlePrefix !== toolPrefix) {
                errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1}: 소메뉴("${subtitleText}")와 해석도구의 숫자 접두사가 일치하지 않습니다.`)
              }
            } else if (subtitlePrefix && !toolPrefix && isValidToolFormat) {
              // 소메뉴에 접두사가 있고 해석도구 형식은 맞지만 접두사 추출 실패
              errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1}: 해석도구의 숫자 접두사를 추출할 수 없습니다. (예: "1-1. ")`)
            }
          }

          // 상세메뉴 체크
          if (subtitle.detailMenus && Array.isArray(subtitle.detailMenus)) {
            subtitle.detailMenus.forEach((detailMenu, detailIndex) => {
              const detailMenuText = detailMenu.detailMenu?.trim() || ''
              if (detailMenuText && !checkNumberPrefix(detailMenuText, 'detailMenu')) {
                errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1} 상세메뉴 ${detailIndex + 1}: "${detailMenuText}" - 숫자 접두사 형식이 올바르지 않습니다. (예: "1-1-1. ")`)
              }

              // 상세메뉴 해석도구 체크
              const detailInterpretationTool = detailMenu.interpretation_tool?.trim() || ''
              if (detailMenuText && detailInterpretationTool) {
                // 상세메뉴의 숫자 접두사 추출 (점이 있든 없든 추출 시도)
                // "1-1-1. " 또는 "1-1-1 " 또는 "1-1-1" 형식 모두 지원
                const detailPrefixMatch = detailMenuText.match(/^(\d+-\d+-\d+)(?:\.\s|\.|\s|$)/)
                const detailPrefix = detailPrefixMatch?.[1]
                
                // 해석도구 형식 체크 (올바른 형식인지 확인)
                const isValidDetailToolFormat = checkNumberPrefix(detailInterpretationTool, 'detailMenu')
                if (!isValidDetailToolFormat) {
                  errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1} 상세메뉴 ${detailIndex + 1}: 해석도구의 숫자 접두사 형식이 올바르지 않습니다. (예: "1-1-1. ")`)
                }
                
                // 해석도구의 숫자 접두사 추출 (점이 있든 없든 추출 시도)
                const detailToolPrefixMatch = detailInterpretationTool.match(/^(\d+-\d+-\d+)(?:\.\s|\.|\s|$)/)
                const detailToolPrefix = detailToolPrefixMatch?.[1]
                
                // 상세메뉴와 해석도구의 접두사 일치 여부 체크
                if (detailPrefix && detailToolPrefix) {
                  if (detailPrefix !== detailToolPrefix) {
                    errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1} 상세메뉴 ${detailIndex + 1}: 상세메뉴("${detailMenuText}")와 해석도구의 숫자 접두사가 일치하지 않습니다.`)
                  }
                } else if (detailPrefix && !detailToolPrefix && isValidDetailToolFormat) {
                  // 상세메뉴에 접두사가 있고 해석도구 형식은 맞지만 접두사 추출 실패
                  errors.push(`대메뉴 ${menuIndex + 1} 소메뉴 ${subIndex + 1} 상세메뉴 ${detailIndex + 1}: 해석도구의 숫자 접두사를 추출할 수 없습니다. (예: "1-1-1. ")`)
                }
              }
            })
          }
        })
      }
    })

    // 결과 설정
    const isValid = errors.length === 0
    console.log('무결성 체크 완료:', { isValid, errorsCount: errors.length })
    setIntegrityCheckResult({
      isValid,
      errors,
      message: isValid ? '모든 필드가 정상입니다.' : `${errors.length}개의 오류가 발견되었습니다.`
    })
    setShowIntegrityCheckResult(true)
    console.log('팝업 표시 상태 업데이트:', true)
  }

  // 쉬운 업로드 파싱 및 적용 함수
  const parseAndApplyEasyUpload = () => {
    try {
      // 각 텍스트를 줄바꿈으로 분리
      const menuLines = easyUploadData.menus.split('\n').filter(line => line.trim())
      const subtitleLines = easyUploadData.subtitles.split('\n').filter(line => line.trim())
      const subtitleToolLines = easyUploadData.subtitleTools.split('\n').filter(line => line.trim())
      const detailMenuLines = easyUploadData.detailMenus.split('\n').filter(line => line.trim())
      const toolLines = easyUploadData.tools.split('\n').filter(line => line.trim())
      
      // 첫번째 숫자 추출 함수
      const extractFirstNumber = (text: string): number | null => {
        const match = text.match(/^(\d+)/)
        return match ? parseInt(match[1]) : null
      }
      
      // 접두사 추출 함수 (예: "1-1-1" → "1-1", "1-2-1" → "1-2")
      const extractSubtitlePrefix = (text: string): string | null => {
        const match = text.match(/^(\d+-\d+)\./)
        return match ? match[1] : null
      }
      
      // 상세메뉴 접두사 추출 함수 (예: "1-1-1" → "1-1")
      const extractDetailMenuPrefix = (text: string): string | null => {
        const match = text.match(/^(\d+-\d+)-\d+\./)
        return match ? match[1] : null
      }
      
      // 그룹별로 데이터 정리
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
      
      // 대제목 파싱 (숫자 포함하여 그대로 사용)
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
      
      // 소제목 파싱 (숫자 포함하여 그대로 사용)
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
      
      // 상세메뉴 파싱 (접두사 "1-1"이 같으면 같은 그룹)
      detailMenuLines.forEach(line => {
        const detailMenuPrefix = extractDetailMenuPrefix(line)
        if (detailMenuPrefix) {
          // 접두사로 대메뉴 번호 추출 (예: "1-1" → 1)
          const menuNumber = parseInt(detailMenuPrefix.split('-')[0])
          if (groups[menuNumber]) {
            // 해당 접두사를 가진 소제목 찾기
            const subtitle = groups[menuNumber].subtitles.find(s => {
              const subPrefix = extractSubtitlePrefix(s.subtitle)
              return subPrefix === detailMenuPrefix
            })
            
            if (subtitle) {
              // 해당 소제목에 상세메뉴 추가
              subtitle.detailMenus.push({ detailMenu: line.trim(), interpretation_tool: '' })
            } else {
              // 접두사가 일치하는 소제목이 없으면 마지막 소제목에 추가
              if (groups[menuNumber].subtitles.length > 0) {
                groups[menuNumber].subtitles[groups[menuNumber].subtitles.length - 1].detailMenus.push({ detailMenu: line.trim(), interpretation_tool: '' })
              }
            }
          }
        }
      })
      
      // 소메뉴 해석도구 파싱 (소제목과 순서대로 매칭, 숫자 포함하여 그대로 사용)
      subtitleToolLines.forEach((line, toolIndex) => {
        const menuNumber = extractFirstNumber(line)
        if (menuNumber && groups[menuNumber]) {
          // 해석도구는 그대로 사용 (숫자 포함)
          const toolText = line.trim()
          
          // 해당 메뉴의 해석도구만 필터링
          const sameMenuToolLines = subtitleToolLines.filter(l => extractFirstNumber(l) === menuNumber)
          const toolIndexInMenu = sameMenuToolLines.indexOf(line)
          
          // 같은 인덱스의 소제목에 해석도구 할당
          if (groups[menuNumber].subtitles[toolIndexInMenu]) {
            groups[menuNumber].subtitles[toolIndexInMenu].tool = toolText
          }
        }
      })
      
      // 상세메뉴 해석도구 파싱 (예: "1-1-1. 해석도구 내용" → 상세메뉴 "1-1-1"에 할당)
      toolLines.forEach(line => {
        // 상세메뉴 접두사 추출 (예: "1-1-1" → "1-1-1")
        const detailMenuMatch = line.match(/^(\d+-\d+-\d+)\./)
        if (detailMenuMatch) {
          const detailMenuPrefix = detailMenuMatch[1] // "1-1-1"
          const detailMenuNumber = detailMenuPrefix.split('-')[0] // "1"
          const menuNumber = parseInt(detailMenuNumber)
          
          if (groups[menuNumber]) {
            // 해당 접두사를 가진 소제목 찾기 (예: "1-1-1" → "1-1")
            const subtitlePrefix = detailMenuPrefix.substring(0, detailMenuPrefix.lastIndexOf('-')) // "1-1"
            const subtitle = groups[menuNumber].subtitles.find(s => {
              const subPrefix = extractSubtitlePrefix(s.subtitle)
              return subPrefix === subtitlePrefix
            })
            
            if (subtitle) {
              // 해당 소제목의 상세메뉴 중에서 접두사가 일치하는 상세메뉴 찾기
              const detailMenu = subtitle.detailMenus.find(dm => {
                const dmPrefix = extractDetailMenuPrefix(dm.detailMenu)
                return dmPrefix === subtitlePrefix && dm.detailMenu.startsWith(detailMenuPrefix)
              })
              
              if (detailMenu) {
                // 상세메뉴 해석도구 할당
                detailMenu.interpretation_tool = line.trim()
              } else {
                // 일치하는 상세메뉴가 없으면 마지막 상세메뉴에 할당
                if (subtitle.detailMenus.length > 0) {
                  subtitle.detailMenus[subtitle.detailMenus.length - 1].interpretation_tool = line.trim()
                }
              }
            }
          }
        }
      })
      
      // 그룹 번호 순서대로 정렬
      const sortedGroups = Object.values(groups).sort((a, b) => a.menuNumber - b.menuNumber)
      
      if (sortedGroups.length === 0) {
        alert('파싱할 데이터가 없습니다. 형식을 확인해주세요.')
        return
      }
      
      // 숫자 접두사 추출 함수 (예: "1. " → "1.", "1-1. " → "1-1.")
      const extractNumberPrefix = (text: string): string | null => {
        const match = text.match(/^(\d+(?:-\d+)?\.)/)
        return match ? match[1] : null
      }
      
      // 첫 번째 그룹은 firstMenuField에, 나머지는 menuFields에 추가
      const firstGroup = sortedGroups[0]
      const remainingGroups = sortedGroups.slice(1)
      
      // firstMenuField 업데이트 (썸네일은 기존 것 유지, 소제목 썸네일도 기존 것 유지)
      const firstMenuPrefix = extractNumberPrefix(firstGroup.menuTitle)
      const existingFirstMenu = firstMenuPrefix 
        ? (extractNumberPrefix(firstMenuField.value) === firstMenuPrefix ? firstMenuField : null)
        : firstMenuField // 접두사가 없으면 기존 firstMenuField 유지
      
      setFirstMenuField({
        value: firstGroup.menuTitle,
        thumbnail: existingFirstMenu?.thumbnail || '', // 기존 썸네일 유지
        subtitles: firstGroup.subtitles.map((sub) => {
          // 숫자 접두사로 매칭
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
            thumbnail: existingSubtitle?.thumbnail || undefined, // 기존 썸네일 유지 (없으면 undefined)
              detailMenus: sub.detailMenus.map((dm, idx) => ({
                id: existingSubtitle?.detailMenus?.[idx]?.id || Date.now() + Math.random() + idx,
                detailMenu: dm.detailMenu,
                interpretation_tool: dm.interpretation_tool || '',
                thumbnail: existingSubtitle?.detailMenus?.[idx]?.thumbnail || undefined
              })) || []
          }
        })
      })
      
      // menuFields 업데이트 (기존 썸네일 유지)
      const newMenuFields = remainingGroups.map((group, groupIndex) => {
        // 숫자 접두사로 매칭
        const menuPrefix = extractNumberPrefix(group.menuTitle)
        const existingMenu = menuPrefix
          ? menuFields.find(
              existing => extractNumberPrefix(existing.value) === menuPrefix
            )
          : undefined
        
        return {
          id: existingMenu?.id || Date.now() + 1000 + groupIndex,
          value: group.menuTitle,
          thumbnail: existingMenu?.thumbnail || undefined, // 기존 썸네일 유지 (없으면 undefined)
          subtitles: group.subtitles.map((sub, subIndex) => {
            // 숫자 접두사로 매칭
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
              thumbnail: existingSubtitle?.thumbnail || undefined, // 기존 썸네일 유지 (없으면 undefined)
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
      
      // 모달 닫기
      setShowEasyUploadModal(false)
      setEasyUploadData({ menus: '', subtitles: '', subtitleTools: '', detailMenus: '', tools: '' })
    } catch (error) {
      console.error('파싱 오류:', error)
      alert('데이터 파싱 중 오류가 발생했습니다. 형식을 확인해주세요.')
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
      console.log('북커버 썸네일 선택:', url)
      setFormData(prev => {
        console.log('북커버 썸네일 업데이트 전 formData.bookCoverThumbnail:', prev.bookCoverThumbnail)
        const updated = { ...prev, bookCoverThumbnail: url }
        console.log('북커버 썸네일 업데이트 후 formData.bookCoverThumbnail:', updated.bookCoverThumbnail)
        return updated
      })
    } else if (currentThumbnailField === 'endingBookCover') {
      console.log('엔딩북커버 썸네일 선택:', url)
      setFormData(prev => {
        console.log('엔딩북커버 썸네일 업데이트 전 formData.endingBookCoverThumbnail:', prev.endingBookCoverThumbnail)
        const updated = { ...prev, endingBookCoverThumbnail: url }
        console.log('엔딩북커버 썸네일 업데이트 후 formData.endingBookCoverThumbnail:', updated.endingBookCoverThumbnail)
        return updated
      })
    } else if (typeof currentThumbnailField === 'string' && currentThumbnailField.startsWith('subtitle-')) {
      const parts = currentThumbnailField.split('-')
      console.log('썸네일 선택 - currentThumbnailField:', currentThumbnailField, 'parts:', parts)
      
      if (parts[1] === 'first') {
        // subtitle-first-{subtitleId} 형식
        // 소수점이 포함된 ID를 처리하기 위해 parseFloat 사용
        const subtitleIdStr = parts[2]
        const subtitleId = parseFloat(subtitleIdStr)
        console.log('첫 번째 메뉴의 소제목 썸네일 업데이트:', subtitleIdStr, subtitleId, url)
        setFirstMenuField(prev => {
          const updated = {
          ...prev,
            subtitles: prev.subtitles.map(s => {
              // ID를 문자열로 변환하여 비교 (소수점 포함 ID 대응)
              const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
              const targetId = parseFloat(subtitleIdStr)
              if (sId === targetId || String(s.id) === subtitleIdStr) {
                console.log('매칭된 소제목 찾음:', s.id, '->', url)
                return { ...s, thumbnail: url }
              }
              return s
            })
          }
          console.log('업데이트된 첫 번째 메뉴 subtitles:', updated.subtitles.map(s => ({ id: s.id, thumbnail: s.thumbnail })))
          return updated
        })
      } else if (parts[1] === 'menu') {
        // subtitle-menu-{menuId}-{subtitleId} 형식
        const menuIdStr = parts[2]
        const subtitleIdStr = parts[3]
        const menuId = Number(menuIdStr)
        const subtitleId = Number(subtitleIdStr)
        
        console.log('메뉴 필드의 소제목 썸네일 업데이트:', {
          menuIdStr,
          menuId,
          subtitleIdStr,
          subtitleId,
          url,
          currentMenuFields: menuFields.map(f => ({ 
            id: f.id, 
            idType: typeof f.id,
            value: f.value, 
            subtitlesCount: f.subtitles.length,
            subtitleIds: f.subtitles.map(s => ({ id: s.id, idType: typeof s.id }))
          }))
        })
        
        setMenuFields(prevFields => {
          const updated = prevFields.map(f => {
            // 타입 안전한 비교 (소수점 포함 ID 대응)
            const fId = typeof f.id === 'number' ? f.id : parseFloat(String(f.id))
            const menuIdNum = parseFloat(menuIdStr)
            if (fId === menuIdNum || String(f.id) === menuIdStr) {
              console.log('매칭된 메뉴 필드 찾음:', f.id, '소제목 개수:', f.subtitles.length)
              const updatedSubtitles = f.subtitles.map(s => {
                // 소수점 포함 ID 대응
                const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
                const targetSubtitleId = parseFloat(subtitleIdStr)
                if (sId === targetSubtitleId || String(s.id) === subtitleIdStr) {
                  console.log('소제목 썸네일 업데이트:', s.id, '->', url)
                  return { ...s, thumbnail: url }
                }
                return s
              })
              const updatedField = {
                ...f,
                subtitles: updatedSubtitles
              }
              console.log('업데이트된 메뉴 필드:', updatedField)
              return updatedField
            }
            return f
          })
          console.log('최종 업데이트된 menuFields:', updated.map(f => ({ 
            id: f.id, 
            value: f.value,
            subtitles: f.subtitles.map(s => ({ id: s.id, thumbnail: s.thumbnail }))
          })))
          return updated
        })
      }
    } else if (typeof currentThumbnailField === 'string' && currentThumbnailField.startsWith('detail-menu-')) {
      // detail-menu-first-{subtitleId}-{detailMenuId} 또는 detail-menu-menu-{menuId}-{subtitleId}-{detailMenuId} 형식
      const parts = currentThumbnailField.split('-')
      console.log('상세메뉴 썸네일 선택 - currentThumbnailField:', currentThumbnailField, 'parts:', parts)
      
      if (parts[2] === 'first') {
        // detail-menu-first-{subtitleId}-{detailMenuId} 형식
        const subtitleIdStr = parts[3]
        const detailMenuIdStr = parts[4]
        const subtitleId = parseFloat(subtitleIdStr)
        const detailMenuId = parseFloat(detailMenuIdStr)
        
        console.log('첫 번째 메뉴의 상세메뉴 썸네일 업데이트:', { subtitleIdStr, subtitleId, detailMenuIdStr, detailMenuId, url })
        setFirstMenuField(prev => {
          const updated = {
            ...prev,
            subtitles: prev.subtitles.map(s => {
              const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
              const targetSubtitleId = parseFloat(subtitleIdStr)
              if (sId === targetSubtitleId || String(s.id) === subtitleIdStr) {
                return {
                  ...s,
                  detailMenus: s.detailMenus.map(dm => {
                    const dmId = typeof dm.id === 'number' ? dm.id : parseFloat(String(dm.id))
                    const targetDetailMenuId = parseFloat(detailMenuIdStr)
                    if (dmId === targetDetailMenuId || String(dm.id) === detailMenuIdStr) {
                      console.log('매칭된 상세메뉴 찾음:', dm.id, '->', url)
                      return { ...dm, thumbnail: url }
                    }
                    return dm
                  })
                }
              }
              return s
            })
          }
          console.log('업데이트된 첫 번째 메뉴 상세메뉴 썸네일:', updated.subtitles.map(s => ({
            id: s.id,
            detailMenus: s.detailMenus.map(dm => ({ id: dm.id, thumbnail: dm.thumbnail }))
          })))
          return updated
        })
      } else if (parts[2] === 'menu') {
        // detail-menu-menu-{menuId}-{subtitleId}-{detailMenuId} 형식
        const menuIdStr = parts[3]
        const subtitleIdStr = parts[4]
        const detailMenuIdStr = parts[5]
        const menuId = parseFloat(menuIdStr)
        const subtitleId = parseFloat(subtitleIdStr)
        const detailMenuId = parseFloat(detailMenuIdStr)
        
        console.log('메뉴 필드의 상세메뉴 썸네일 업데이트:', { menuIdStr, menuId, subtitleIdStr, subtitleId, detailMenuIdStr, detailMenuId, url })
        
        setMenuFields(prevFields => {
          const updated = prevFields.map(f => {
            const fId = typeof f.id === 'number' ? f.id : parseFloat(String(f.id))
            const menuIdNum = parseFloat(menuIdStr)
            if (fId === menuIdNum || String(f.id) === menuIdStr) {
              const updatedSubtitles = f.subtitles.map(s => {
                const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
                const targetSubtitleId = parseFloat(subtitleIdStr)
                if (sId === targetSubtitleId || String(s.id) === subtitleIdStr) {
                  return {
                    ...s,
                    detailMenus: s.detailMenus.map(dm => {
                      const dmId = typeof dm.id === 'number' ? dm.id : parseFloat(String(dm.id))
                      const targetDetailMenuId = parseFloat(detailMenuIdStr)
                      if (dmId === targetDetailMenuId || String(dm.id) === detailMenuIdStr) {
                        console.log('상세메뉴 썸네일 업데이트:', dm.id, '->', url)
                        return { ...dm, thumbnail: url }
                      }
                      return dm
                    })
                  }
                }
                return s
              })
              return {
                ...f,
                subtitles: updatedSubtitles
              }
            }
            return f
          })
          return updated
        })
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* 상단: 2개의 넓은 입력 필드 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            역할 프롬프트
          </label>
          <textarea
            name="title"
            value={formData.title}
            onChange={handleChange}
            rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y"
            placeholder="역할 프롬프트를 입력하세요"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            주의사항 프롬프트
          </label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            rows={3}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y"
            placeholder="주의사항 프롬프트를 입력하세요"
            required
          />
        </div>

        {/* 라디오 버튼 섹션 */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="isNew"
              name="radioGroup"
              checked={formData.isNew}
              onChange={(e) => setFormData(prev => ({ ...prev, isNew: e.target.checked, isFree: false }))}
              className="w-5 h-5 text-green-500 bg-gray-700 border-2 border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            />
            <label htmlFor="isNew" className="text-sm font-medium text-gray-300">
              사주형
            </label>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="radio"
              id="isFree"
              name="radioGroup"
              checked={formData.isFree}
              onChange={(e) => setFormData(prev => ({ ...prev, isFree: e.target.checked, isNew: false }))}
              className="w-5 h-5 text-green-500 bg-gray-700 border-2 border-green-500 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            />
            <label htmlFor="isFree" className="text-sm font-medium text-gray-300">
              궁합형
            </label>
          </div>
          <div className="flex items-center gap-2 border border-red-500 rounded-lg px-4 py-2">
            <input
              type="checkbox"
              id="showNew"
              name="showNew"
              checked={formData.showNew}
              onChange={(e) => setFormData(prev => ({ ...prev, showNew: e.target.checked }))}
              className="w-5 h-5 text-pink-500 bg-gray-700 border-2 border-pink-500 rounded focus:ring-2 focus:ring-pink-500 focus:ring-offset-2 focus:ring-offset-gray-800"
            />
            <label htmlFor="showNew" className="text-sm font-medium text-gray-300">
              NEW
            </label>
          </div>
        </div>

        {/* 재회상품 미리보기 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            재회상품 미리보기
          </label>
          <div className="flex gap-2">
            {[0, 1, 2].map((index) => (
              <button
                key={index}
                type="button"
                onClick={() => {
                  setCurrentThumbnailField(`preview-${index}` as any)
                  setShowThumbnailModal(true)
                }}
                className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-36 h-64 flex items-center justify-center"
              >
                {formData.previewThumbnails[index] ? (
                  <img 
                    src={formData.previewThumbnails[index]} 
                    alt={`미리보기 ${index + 1}`} 
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                ) : (
                  <span className="text-xs">+</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 컨텐츠명 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            컨텐츠명
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              name="contentName"
              value={formData.contentName}
              onChange={handleChange}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="컨텐츠명을 입력하세요"
            />
            <button
              type="button"
              onClick={() => handleThumbnailClick('main')}
              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 relative overflow-hidden w-[85px] h-[48px] flex items-center justify-center"
            >
              {formData.thumbnailUrl ? (
                <img 
                  src={formData.thumbnailUrl} 
                  alt="썸네일" 
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs">썸네일</span>
              )}
            </button>
          </div>
          <div className="mt-3 text-sm text-gray-400 space-y-1">
            <p>1. 썸네일을 16:9로 생성하세요</p>
            <p>2. 썸네일을 포토스케이프에서 가로를 680 픽셀로 줄이고 jpg 저장품질을 100으로 저장하세요</p>
            <p>3. <a href="https://compresspng.com/ko/" target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 underline">https://compresspng.com/ko/</a> 사이트에서 JPEG 탭을 선택하고 2번에서 저장된 파일을 드래그&드랍해서 파일용량을 최적화하세요</p>
          </div>
        </div>

        {/* 가격 섹션 (컨텐츠명 밑으로 이동) */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            가격
          </label>
          <input
            type="text"
            name="price"
            value={formData.price}
            onChange={handleChange}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
            placeholder="예: 22,000원"
          />
        </div>

        {/* 요약 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            요약
          </label>
          <textarea
            name="summary"
            value={formData.summary}
            onChange={handleChange}
            rows={2}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y"
            placeholder="요약을 입력하세요"
          />
        </div>

        {/* 추가 필드 섹션 */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            소개
          </label>
          <textarea
            name="introduction"
            value={formData.introduction}
            onChange={handleChange}
            rows={8}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y"
            placeholder="소개를 입력하세요"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            추천
          </label>
          <textarea
            name="recommendation"
            value={formData.recommendation}
            onChange={handleChange}
            rows={5}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y"
            placeholder="추천을 입력하세요"
          />
        </div>

        {/* 상품 메뉴 구성 섹션 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-300">
            상품 메뉴 구성
          </label>
            <button
              type="button"
              onClick={() => setShowEasyUploadModal(true)}
              className="bg-pink-600 hover:bg-pink-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 text-sm"
            >
              쉬운 업로드
            </button>
          </div>
          
          {/* 북커버 썸네일 (첫 번째 대제목 전) */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-400 mb-2 text-center">
              북커버 (첫 번째 대제목 전, 9:16 비율)
            </label>
            <div className="flex justify-center">
            <button
              type="button"
              onClick={() => handleThumbnailClick('bookCover')}
              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-[85px] h-[151px] flex items-center justify-center"
              style={{ aspectRatio: '9/16' }}
            >
              {formData.bookCoverThumbnail ? (
                <img 
                  src={formData.bookCoverThumbnail} 
                  alt="북커버 썸네일" 
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-center">북커버<br/>썸네일</span>
              )}
            </button>
            </div>
          </div>
          
          <div className="flex gap-3">
            <input
              type="text"
              value={firstMenuField.value}
              onChange={(e) => {
                const newValue = e.target.value
                setFirstMenuField(prev => {
                  // 대메뉴에 값이 입력되었는데 소메뉴가 없으면 디폴트 소메뉴 1개 추가
                  const hasValue = newValue.trim().length > 0
                  const hasSubtitles = prev.subtitles && prev.subtitles.length > 0
                  if (hasValue && !hasSubtitles) {
                    return {
                      ...prev,
                      value: newValue,
                      subtitles: [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
                    }
                  }
                  return { ...prev, value: newValue }
                })
              }}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="상품 메뉴 구성을 입력하세요"
            />
            <button
              type="button"
              onClick={() => handleThumbnailClick('firstMenu')}
              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-4 py-3 rounded-lg transition-colors duration-200 relative overflow-hidden min-w-[85px] h-[48px] flex items-center justify-center"
            >
              {firstMenuField.thumbnail ? (
                <img 
                  src={firstMenuField.thumbnail} 
                  alt="썸네일" 
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <span className="text-[10px] leading-tight whitespace-nowrap">썸네일</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenuFields([...menuFields, { id: Date.now(), value: '', subtitles: [{ id: Date.now() + 1, subtitle: '', interpretation_tool: '', detailMenus: [] }] }])}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-xl w-12 h-12 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
            >
              +
            </button>
          </div>
          
          {/* 첫 번째 메뉴 필드의 소제목들 */}
          {(firstMenuField.value || (firstMenuField.subtitles && firstMenuField.subtitles.length > 0)) && (
            <div className="mt-3 ml-4 border-l-2 border-gray-600 pl-4 space-y-3">
              {(firstMenuField.subtitles && firstMenuField.subtitles.length > 0 ? firstMenuField.subtitles : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]).map((subtitle, subIndex) => (
                <div key={subtitle.id} className="space-y-2">
                  <div className="flex gap-2 items-start">
                    <textarea
                    value={subtitle.subtitle}
                    onChange={(e) => setFirstMenuField(prev => ({
                      ...prev,
                      subtitles: prev.subtitles.map(s => 
                        s.id === subtitle.id ? { ...s, subtitle: e.target.value } : s
                      )
                    }))}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                    placeholder="상품 메뉴 소제목"
                      rows={1}
                      style={{ minHeight: '36px' }}
                  />
                  <textarea
                    value={subtitle.interpretation_tool}
                    onChange={(e) => setFirstMenuField(prev => ({
                      ...prev,
                      subtitles: prev.subtitles.map(s => 
                        s.id === subtitle.id ? { ...s, interpretation_tool: e.target.value } : s
                      )
                    }))}
                    rows={1}
                      className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                    placeholder="해석도구"
                    style={{ minHeight: '36px' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentThumbnailField(`subtitle-first-${subtitle.id}` as any)
                      console.log('첫 번째 메뉴 소제목 썸네일 클릭:', subtitle.id)
                      setShowThumbnailModal(true)
                    }}
                    className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-2 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-[60px] h-[36px] flex items-center justify-center"
                  >
                      {subtitle.thumbnail && subtitle.thumbnail.trim() ? (
                      <img 
                        src={subtitle.thumbnail} 
                        alt="썸네일" 
                        className="absolute inset-0 w-full h-full object-contain"
                          onError={(e) => {
                            console.error('소메뉴 썸네일 로드 실패:', subtitle.thumbnail, e)
                            // 이미지 로드 실패 시 텍스트로 대체
                            const target = e.target as HTMLImageElement
                            target.style.display = 'none'
                            const parent = target.parentElement
                            if (parent && !parent.querySelector('span')) {
                              const span = document.createElement('span')
                              span.className = 'text-[10px] leading-tight whitespace-nowrap'
                              span.textContent = '썸네일'
                              parent.appendChild(span)
                            }
                          }}
                      />
                    ) : (
                      <span className="text-[10px] leading-tight whitespace-nowrap">썸네일</span>
                    )}
                  </button>
                  {subIndex === 0 ? (
                    <button
                      type="button"
                      onClick={() => setFirstMenuField(prev => ({
                        ...prev,
                          subtitles: [...prev.subtitles, { id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
                      }))}
                      className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                    >
                      +
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSubtitleToDelete({ menuId: 'first', subtitleId: subtitle.id })
                        setShowDeleteSubtitleConfirm(true)
                      }}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* 상세메뉴 필드들 */}
                  <div className="ml-4 border-l-2 border-gray-500 pl-4 space-y-2">
                    {(subtitle.detailMenus && subtitle.detailMenus.length > 0 ? subtitle.detailMenus : []).map((detailMenu, detailIndex) => (
                      <div key={detailMenu.id} className="flex gap-2 items-start">
                        <textarea
                          value={detailMenu.detailMenu}
                          onChange={(e) => setFirstMenuField(prev => ({
                            ...prev,
                            subtitles: prev.subtitles.map(s => 
                              s.id === subtitle.id ? {
                                ...s,
                                detailMenus: s.detailMenus.map(dm => 
                                  dm.id === detailMenu.id ? { ...dm, detailMenu: e.target.value } : dm
                                )
                              } : s
                            )
                          }))}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                          placeholder="상세메뉴"
                          rows={1}
                          style={{ minHeight: '36px' }}
                        />
                        <textarea
                          value={detailMenu.interpretation_tool || ''}
                          onChange={(e) => setFirstMenuField(prev => ({
                            ...prev,
                            subtitles: prev.subtitles.map(s => 
                              s.id === subtitle.id ? {
                                ...s,
                                detailMenus: s.detailMenus.map(dm => 
                                  dm.id === detailMenu.id ? { ...dm, interpretation_tool: e.target.value } : dm
                                )
                              } : s
                            )
                          }))}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                          placeholder="상세메뉴 해석도구"
                          rows={1}
                          style={{ minHeight: '36px' }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentThumbnailField(`detail-menu-first-${subtitle.id}-${detailMenu.id}` as any)
                            console.log('첫 번째 메뉴 상세메뉴 썸네일 클릭:', subtitle.id, detailMenu.id)
                            setShowThumbnailModal(true)
                          }}
                          className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-2 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-[60px] h-[36px] flex items-center justify-center"
                        >
                          {detailMenu.thumbnail && detailMenu.thumbnail.trim() ? (
                            <img 
                              src={detailMenu.thumbnail} 
                              alt="썸네일" 
                              className="absolute inset-0 w-full h-full object-contain"
                              onError={(e) => {
                                console.error('상세메뉴 썸네일 로드 실패:', detailMenu.thumbnail, e)
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                const parent = target.parentElement
                                if (parent && !parent.querySelector('span')) {
                                  const span = document.createElement('span')
                                  span.className = 'text-[10px] leading-tight whitespace-nowrap'
                                  span.textContent = '썸네일'
                                  parent.appendChild(span)
                                }
                              }}
                            />
                          ) : (
                            <span className="text-[10px] leading-tight whitespace-nowrap">썸네일</span>
                          )}
                        </button>
                        {detailIndex === 0 ? (
                          <button
                            type="button"
                            onClick={() => setFirstMenuField(prev => ({
                              ...prev,
                              subtitles: prev.subtitles.map(s => 
                                s.id === subtitle.id ? {
                                  ...s,
                                  detailMenus: [...s.detailMenus, { id: Date.now(), detailMenu: '', interpretation_tool: '', thumbnail: undefined }]
                                } : s
                              )
                            }))}
                            className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                          >
                            +
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setFirstMenuField(prev => ({
                              ...prev,
                              subtitles: prev.subtitles.map(s => 
                                s.id === subtitle.id ? {
                                  ...s,
                                  detailMenus: s.detailMenus.filter(dm => dm.id !== detailMenu.id)
                                } : s
                              )
                            }))}
                      className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                    >
                      ×
                    </button>
                  )}
                      </div>
                    ))}
                    {(!subtitle.detailMenus || subtitle.detailMenus.length === 0) && (
                      <button
                        type="button"
                        onClick={() => setFirstMenuField(prev => ({
                          ...prev,
                          subtitles: prev.subtitles.map(s => 
                            s.id === subtitle.id ? {
                              ...s,
                              detailMenus: [{ id: Date.now(), detailMenu: '', interpretation_tool: '', thumbnail: undefined }]
                            } : s
                          )
                        }))}
                        className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                      >
                        +
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* 동적으로 생성된 메뉴 필드들 */}
          {menuFields.map((field) => (
            <div key={field.id} className="mt-3">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setMenuFields(menuFields.map(f => {
                      if (f.id === field.id) {
                        // 대메뉴에 값이 입력되었는데 소메뉴가 없으면 디폴트 소메뉴 1개 추가
                        const hasValue = newValue.trim().length > 0
                        const hasSubtitles = f.subtitles && f.subtitles.length > 0
                        if (hasValue && !hasSubtitles) {
                          return {
                            ...f,
                            value: newValue,
                            subtitles: [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
                          }
                        }
                        return { ...f, value: newValue }
                      }
                      return f
                    }))
                  }}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="상품 메뉴 구성을 입력하세요"
                />
                <button
                  type="button"
                  onClick={() => handleThumbnailClick(field.id)}
                  className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 relative overflow-hidden w-[85px] h-[48px] flex items-center justify-center"
                >
                  {field.thumbnail ? (
                    <img 
                      src={field.thumbnail} 
                      alt="썸네일" 
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  ) : (
                    <span className="text-[10px] leading-tight whitespace-nowrap">썸네일</span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuFieldToDelete(field.id)
                    setShowDeleteMenuConfirm(true)
                  }}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-xl w-12 h-12 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                >
                  ×
                </button>
              </div>
              {/* 각 메뉴 필드의 소제목들 */}
              {(field.value || (field.subtitles && field.subtitles.length > 0)) && (
                <div className="mt-3 ml-4 border-l-2 border-gray-600 pl-4 space-y-3">
                  {(field.subtitles && field.subtitles.length > 0 ? field.subtitles : [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]).map((subtitle, subIndex) => (
                    <div key={subtitle.id} className="space-y-2">
                      <div className="flex gap-2 items-start">
                        <textarea
                        value={subtitle.subtitle}
                        onChange={(e) => setMenuFields(menuFields.map(f => 
                          f.id === field.id ? {
                            ...f,
                            subtitles: f.subtitles.map(s => 
                              s.id === subtitle.id ? { ...s, subtitle: e.target.value } : s
                            )
                          } : f
                        ))}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                        placeholder="상품 메뉴 소제목"
                          rows={1}
                          style={{ minHeight: '36px' }}
                      />
            <textarea
                        value={subtitle.interpretation_tool}
                        onChange={(e) => setMenuFields(menuFields.map(f => 
                          f.id === field.id ? {
                            ...f,
                            subtitles: f.subtitles.map(s => 
                              s.id === subtitle.id ? { ...s, interpretation_tool: e.target.value } : s
                            )
                          } : f
                        ))}
                        rows={1}
                          className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                        placeholder="해석도구"
                        style={{ minHeight: '36px' }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const fieldId = field.id
                          const subtitleId = subtitle.id
                          const fieldKey = `subtitle-menu-${fieldId}-${subtitleId}`
                          console.log('메뉴 필드 소제목 썸네일 클릭:', {
                            fieldId,
                            fieldIdType: typeof fieldId,
                            subtitleId,
                            subtitleIdType: typeof subtitleId,
                            fieldKey,
                            currentThumbnail: subtitle.thumbnail,
                            fieldValue: field.value
                          })
                          setCurrentThumbnailField(fieldKey as any)
                          setShowThumbnailModal(true)
                        }}
                        className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-2 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-[60px] h-[36px] flex items-center justify-center"
                      >
                        {subtitle.thumbnail ? (
                          <img 
                            src={subtitle.thumbnail} 
                            alt="썸네일" 
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-[10px] leading-tight whitespace-nowrap">썸네일</span>
                        )}
                      </button>
                      {subIndex === 0 ? (
                        <button
                          type="button"
                          onClick={() => setMenuFields(menuFields.map(f => 
                            f.id === field.id ? {
                              ...f,
                                subtitles: [...f.subtitles, { id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
                            } : f
                          ))}
                          className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                        >
                          +
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSubtitleToDelete({ menuId: field.id, subtitleId: subtitle.id })
                            setShowDeleteSubtitleConfirm(true)
                          }}
                          className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                        >
                          ×
                        </button>
                      )}
          </div>
                      {/* 상세메뉴 필드들 */}
                      <div className="ml-4 border-l-2 border-gray-500 pl-4 space-y-2">
                        {(subtitle.detailMenus && subtitle.detailMenus.length > 0 ? subtitle.detailMenus : []).map((detailMenu, detailIndex) => (
                          <div key={detailMenu.id} className="flex gap-2 items-start">
                            <textarea
                              value={detailMenu.detailMenu}
                              onChange={(e) => setMenuFields(menuFields.map(f => 
                                f.id === field.id ? {
                                  ...f,
                                  subtitles: f.subtitles.map(s => 
                                    s.id === subtitle.id ? {
                                      ...s,
                                      detailMenus: s.detailMenus.map(dm => 
                                        dm.id === detailMenu.id ? { ...dm, detailMenu: e.target.value } : dm
                                      )
                                    } : s
                                  )
                                } : f
                              ))}
                              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                              placeholder="상세메뉴"
                              rows={1}
                              style={{ minHeight: '36px' }}
                            />
                            <textarea
                              value={detailMenu.interpretation_tool || ''}
                              onChange={(e) => setMenuFields(menuFields.map(f => 
                                f.id === field.id ? {
                                  ...f,
                                  subtitles: f.subtitles.map(s => 
                                    s.id === subtitle.id ? {
                                      ...s,
                                      detailMenus: s.detailMenus.map(dm => 
                                        dm.id === detailMenu.id ? { ...dm, interpretation_tool: e.target.value } : dm
                                      )
                                    } : s
                                  )
                                } : f
                              ))}
                              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize overflow-y-scroll"
                              placeholder="상세메뉴 해석도구"
                              rows={1}
                              style={{ minHeight: '36px' }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const fieldId = field.id
                                const subtitleId = subtitle.id
                                const detailMenuId = detailMenu.id
                                const fieldKey = `detail-menu-menu-${fieldId}-${subtitleId}-${detailMenuId}`
                                console.log('메뉴 필드 상세메뉴 썸네일 클릭:', {
                                  fieldId,
                                  subtitleId,
                                  detailMenuId,
                                  fieldKey,
                                  currentThumbnail: detailMenu.thumbnail
                                })
                                setCurrentThumbnailField(fieldKey as any)
                                setShowThumbnailModal(true)
                              }}
                              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-2 py-2 rounded-lg transition-colors duration-200 relative overflow-hidden w-[60px] h-[36px] flex items-center justify-center"
                            >
                              {detailMenu.thumbnail && detailMenu.thumbnail.trim() ? (
                                <img 
                                  src={detailMenu.thumbnail} 
                                  alt="썸네일" 
                                  className="absolute inset-0 w-full h-full object-contain"
                                  onError={(e) => {
                                    console.error('상세메뉴 썸네일 로드 실패:', detailMenu.thumbnail, e)
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    const parent = target.parentElement
                                    if (parent && !parent.querySelector('span')) {
                                      const span = document.createElement('span')
                                      span.className = 'text-[10px] leading-tight whitespace-nowrap'
                                      span.textContent = '썸네일'
                                      parent.appendChild(span)
                                    }
                                  }}
                                />
                              ) : (
                                <span className="text-[10px] leading-tight whitespace-nowrap">썸네일</span>
                              )}
                            </button>
                            {detailIndex === 0 ? (
                              <button
                                type="button"
                                onClick={() => setMenuFields(menuFields.map(f => 
                                  f.id === field.id ? {
                                    ...f,
                                    subtitles: f.subtitles.map(s => 
                                      s.id === subtitle.id ? {
                                        ...s,
                                        detailMenus: [...s.detailMenus, { id: Date.now(), detailMenu: '', interpretation_tool: '', thumbnail: undefined }]
                                      } : s
                                    )
                                  } : f
                                ))}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                              >
                                +
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMenuFields(menuFields.map(f => 
                                  f.id === field.id ? {
                                    ...f,
                                    subtitles: f.subtitles.map(s => 
                                      s.id === subtitle.id ? {
                                        ...s,
                                        detailMenus: s.detailMenus.filter(dm => dm.id !== detailMenu.id)
                                      } : s
                                    )
                                  } : f
                                ))}
                                className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                              >
                                ×
                              </button>
                            )}
                </div>
                        ))}
                        {(!subtitle.detailMenus || subtitle.detailMenus.length === 0) && (
                          <button
                            type="button"
                            onClick={() => setMenuFields(menuFields.map(f => 
                              f.id === field.id ? {
                                ...f,
                                subtitles: f.subtitles.map(s => 
                                  s.id === subtitle.id ? {
                                    ...s,
                                    detailMenus: [{ id: Date.now(), detailMenu: '', interpretation_tool: '' }]
                                  } : s
                                )
                              } : f
                            ))}
                            className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
                          >
                            +
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          
          {/* 엔딩북커버 썸네일 (마지막 대제목 밑) */}
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-400 mb-2 text-center">
              엔딩북커버 (마지막 대제목 밑, 9:16 비율)
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
                  alt="엔딩북커버 썸네일" 
                  className="absolute inset-0 w-full h-full object-contain"
                />
              ) : (
                <span className="text-xs text-center">엔딩북커버<br/>썸네일</span>
              )}
            </button>
            </div>
            {/* 무결성 체크 버튼 */}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={handleIntegrityCheck}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 text-sm"
              >
                무결성 체크
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


        {/* 폰트 설정 섹션 */}
        <div className="border-t border-gray-600 pt-4 mt-4">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">폰트 설정</h3>
          
          {/* 웹폰트 CSS 입력 - 4개로 분리 (2x2 배열, 팝업으로 입력) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* 대메뉴 웹폰트 */}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                대메뉴 웹폰트
              </label>
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
                      폰트 미리보기
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
                  title="컬러 설정"
                >
                  🎨
                </button>
              </div>
            </div>

            {/* 소메뉴 웹폰트 */}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                소메뉴 웹폰트
              </label>
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
                      폰트 미리보기
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
                  title="컬러 설정"
                >
                  🎨
                </button>
              </div>
            </div>

            {/* 상세메뉴 웹폰트 */}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                상세메뉴 웹폰트
              </label>
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
                      폰트 미리보기
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
                  title="컬러 설정"
                >
                  🎨
                </button>
              </div>
            </div>

            {/* 본문 웹폰트 */}
            <div className="flex items-center justify-between min-h-[28px]">
              <label className="block text-sm font-medium text-gray-300">
                본문 웹폰트
              </label>
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
                      폰트 미리보기
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
                  title="컬러 설정"
                >
                  🎨
                </button>
              </div>
            </div>
          </div>
          
          {/* 웹폰트 설정 아래 선 */}
          <div className="border-t border-gray-600 mt-4 mb-4"></div>
          
          {/* 웹폰트 팝업들 */}
          {/* 대메뉴 웹폰트 팝업 */}
          {showMenuFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">대메뉴 웹폰트 설정</h3>
                <textarea
                  value={tempMenuFontFace}
                  onChange={(e) => setTempMenuFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS를 입력하세요"
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
                    완료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 소메뉴 웹폰트 팝업 */}
          {showSubtitleFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">소메뉴 웹폰트 설정</h3>
                <textarea
                  value={tempSubtitleFontFace}
                  onChange={(e) => setTempSubtitleFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS를 입력하세요"
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
                    완료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 상세메뉴 웹폰트 팝업 */}
          {showDetailMenuFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">상세메뉴 웹폰트 설정</h3>
                <textarea
                  value={tempDetailMenuFontFace}
                  onChange={(e) => setTempDetailMenuFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS를 입력하세요"
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
                    완료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 본문 웹폰트 팝업 */}
          {showBodyFontPopup && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-white mb-4">본문 웹폰트 설정</h3>
                <textarea
                  value={tempBodyFontFace}
                  onChange={(e) => setTempBodyFontFace(e.target.value)}
                  rows={8}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-y text-sm mb-4"
                  placeholder="@font-face CSS를 입력하세요"
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
                    완료
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 컬러 팝업들 */}
          {/* 컬러 팔레트 컴포넌트 */}
          {(() => {
            // RGB를 HSV로 변환
            const rgbToHsv = (r: number, g: number, b: number): [number, number, number] => {
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
            
            // HSV를 RGB로 변환
            const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
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
            
            // Hex를 RGB로 변환
            const hexToRgb = (hex: string): [number, number, number] => {
              const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
              return result
                ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
                : [0, 0, 0]
            }
            
            // RGB를 Hex로 변환
            const rgbToHex = (r: number, g: number, b: number): string => {
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
              
              // Canvas를 사용한 채도/밝기 사각형 그라디언트
              const saturationCanvasRef = React.useRef<HTMLCanvasElement>(null)
              const hueCanvasRef = React.useRef<HTMLCanvasElement>(null)
              
              // 채도/밝기 사각형 그리기
              React.useEffect(() => {
                const canvas = saturationCanvasRef.current
                if (!canvas) return
                
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                
                const width = canvas.width
                const height = canvas.height
                
                // 각 픽셀을 직접 계산
                const imageData = ctx.createImageData(width, height)
                const data = imageData.data
                
                for (let y = 0; y < height; y++) {
                  for (let x = 0; x < width; x++) {
                    const s = (x / width) * 100  // 채도: 0% (왼쪽) ~ 100% (오른쪽)
                    const v = 100 - (y / height) * 100  // 밝기: 100% (위) ~ 0% (아래)
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
              
              // 색상 스트립 그리기
              React.useEffect(() => {
                const canvas = hueCanvasRef.current
                if (!canvas) return
                
                const ctx = canvas.getContext('2d')
                if (!ctx) return
                
                const height = canvas.height
                
                // 세로 방향: 0도(빨강)에서 360도(빨강)로
                for (let y = 0; y < height; y++) {
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
                      {/* 채도/밝기 사각형 */}
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
                          {/* 핸들 */}
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
                      
                      {/* 색상 스트립 */}
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
                          {/* 색상 핸들 */}
                          <div
                            className="absolute left-0 right-0 w-full h-1 bg-white border border-gray-400 shadow-lg transform -translate-y-1/2 pointer-events-none z-10"
                            style={{
                              top: `${(hue / 360) * 100}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    {/* 현재 선택된 컬러 미리보기 및 Hex 입력 */}
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
                        완료
                      </button>
                    </div>
                  </div>
                </div>
              )
            }
            
            return (
              <>
                {/* 대메뉴 컬러 팝업 */}
                {showMenuColorPopup && (
                  <ColorPicker
                    title="대메뉴 컬러 설정"
                    currentColor={formData.menuColor}
                    onSelect={(color) => setFormData({ ...formData, menuColor: color })}
                    onClose={() => setShowMenuColorPopup(false)}
                  />
                )}

                {/* 소메뉴 컬러 팝업 */}
                {showSubtitleColorPopup && (
                  <ColorPicker
                    title="소메뉴 컬러 설정"
                    currentColor={formData.subtitleColor}
                    onSelect={(color) => setFormData({ ...formData, subtitleColor: color })}
                    onClose={() => setShowSubtitleColorPopup(false)}
                  />
                )}

                {/* 상세메뉴 컬러 팝업 */}
                {showDetailMenuColorPopup && (
                  <ColorPicker
                    title="상세메뉴 컬러 설정"
                    currentColor={formData.detailMenuColor}
                    onSelect={(color) => setFormData({ ...formData, detailMenuColor: color })}
                    onClose={() => setShowDetailMenuColorPopup(false)}
                  />
                )}

                {/* 본문 컬러 팝업 */}
                {showBodyColorPopup && (
                  <ColorPicker
                    title="본문 컬러 설정"
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
                소메뉴당 글자수
              </label>
              <input
                type="text"
                name="subtitleCharCount"
                value={formData.subtitleCharCount}
                onChange={handleChange}
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                placeholder="입력하세요"
                maxLength={4}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                상세메뉴당 글자수
              </label>
              <input
                type="text"
                name="detailMenuCharCount"
                value={formData.detailMenuCharCount}
                onChange={handleChange}
                className="w-20 bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
                placeholder="입력하세요"
                maxLength={4}
              />
            </div>
            <div className="flex-1 min-w-0">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                대메뉴 폰트크기
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
                소메뉴 폰트크기
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
                상세메뉴 폰트크기
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
                본문 폰트크기
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

        {/* 저장/취소/삭제 버튼 */}
        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '저장'}
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
              삭제
            </button>
          )}
        </div>
      </form>

      {/* 썸네일 모달 */}
      {/* 쉬운 업로드 모달 */}
      {showEasyUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {/* 대메뉴 입력 영역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg h-60 p-4 flex flex-col">
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">대메뉴</label>
                <textarea
                  value={easyUploadData.menus}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, menus: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모장에서 복사한 대제목을 붙여넣으세요&#10;예: 1. 첫 번째 대제목&#10;2. 두 번째 대제목"
                />
              </div>
              
              {/* 소메뉴 입력 영역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">소메뉴</label>
                <textarea
                  value={easyUploadData.subtitles}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, subtitles: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모장에서 복사한 소제목을 붙여넣으세요&#10;예: 1-1. 첫 번째 소제목&#10;1-2. 두 번째 소제목"
                />
              </div>
              
              {/* 소메뉴 해석도구 입력 영역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">소메뉴 해석도구</label>
                <textarea
                  value={easyUploadData.subtitleTools}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, subtitleTools: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모장에서 복사한 소메뉴 해석도구를 붙여넣으세요&#10;예: 1-1. 소메뉴 해석도구 내용&#10;1-2. 소메뉴 해석도구 내용"
                />
              </div>
              
              {/* 상세메뉴 입력 영역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">상세메뉴</label>
                <textarea
                  value={easyUploadData.detailMenus}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, detailMenus: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모장에서 복사한 상세메뉴를 붙여넣으세요&#10;예: 1-1-1. 첫 번째 상세메뉴&#10;1-1-2. 두 번째 상세메뉴"
                />
              </div>
              
              {/* 해석도구 입력 영역 */}
              <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 flex flex-col" style={{ height: '240px' }}>
                <label className="block text-sm font-medium text-gray-300 mb-2 flex-shrink-0">상세메뉴 해석도구</label>
                <textarea
                  value={easyUploadData.tools}
                  onChange={(e) => setEasyUploadData(prev => ({ ...prev, tools: e.target.value }))}
                  className="flex-1 w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent resize-none min-h-0"
                  placeholder="메모장에서 복사한 해석도구를 붙여넣으세요&#10;예: 1-1-1. 해석도구 내용&#10;1-2-1. 해석도구 내용"
                />
              </div>
            </div>
            
            {/* 하단 버튼 */}
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
                  setEasyUploadData({ menus: '', subtitles: '', subtitleTools: '', detailMenus: '', tools: '' })
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
                console.log('ThumbnailModal currentThumbnail 계산:', {
                  currentThumbnailField,
                  parts,
                  menuFieldsLength: menuFields.length,
                  menuFields: menuFields.map(f => ({ id: f.id, value: f.value, subtitlesCount: f.subtitles.length }))
                })
                if (parts[1] === 'first') {
                  // 소수점이 포함된 ID를 처리하기 위해 parseFloat 사용
                  const subtitleIdStr = parts[2]
                  const subtitleIdNum = parseFloat(subtitleIdStr)
                  const thumbnail = firstMenuField.subtitles.find(s => {
                    // ID를 문자열 또는 숫자로 비교 (소수점 포함 ID 대응)
                    const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
                    return sId === subtitleIdNum || String(s.id) === subtitleIdStr
                  })?.thumbnail
                  console.log('첫 번째 메뉴 소제목 썸네일:', { subtitleIdStr, subtitleIdNum, thumbnail, allSubtitleIds: firstMenuField.subtitles.map(s => ({ id: s.id, idType: typeof s.id, thumbnail: s.thumbnail })) })
                  return thumbnail
                } else if (parts[1] === 'menu') {
                  // 소수점이 포함된 ID를 처리하기 위해 parseFloat 사용
                  const menuIdStr = parts[2]
                  const menuIdNum = parseFloat(menuIdStr)
                  const subtitleIdStr = parts[3] // 문자열로 유지
                  const subtitleIdNum = parseFloat(subtitleIdStr) // 숫자 비교용
                  console.log('메뉴 필드 소제목 썸네일 찾기:', { menuIdStr, menuIdNum, subtitleIdStr, subtitleIdNum })
                  const menuField = menuFields.find(f => {
                    // 숫자 비교 시 타입 변환하여 비교 (소수점 포함 ID 대응)
                    const fieldIdNum = typeof f.id === 'number' ? f.id : parseFloat(String(f.id))
                    const match = fieldIdNum === menuIdNum || String(f.id) === menuIdStr
                    console.log('메뉴 필드 비교:', { fieldId: f.id, fieldIdNum, menuIdStr, menuIdNum, match })
                    return match
                  })
                  console.log('찾은 메뉴 필드:', menuField)
                  if (menuField) {
                    const subtitle = menuField.subtitles.find(s => {
                      // ID를 문자열 또는 숫자로 비교 (소수점 포함 ID 대응)
                      const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
                      const match = sId === subtitleIdNum || String(s.id) === subtitleIdStr
                      console.log('소제목 비교:', { subtitleId: s.id, sId, subtitleIdStr, subtitleIdNum, match })
                      return match
                    })
                    console.log('찾은 소제목:', subtitle)
                    const thumbnail = subtitle?.thumbnail
                    console.log('최종 썸네일:', thumbnail)
                    return thumbnail
                  }
                  return undefined
                }
                return undefined
              })()
            : typeof currentThumbnailField === 'string' && currentThumbnailField.startsWith('detail-menu-')
            ? (() => {
                const parts = currentThumbnailField.split('-')
                console.log('ThumbnailModal 상세메뉴 썸네일 계산:', {
                  currentThumbnailField,
                  parts
                })
                if (parts[2] === 'first') {
                  // detail-menu-first-{subtitleId}-{detailMenuId} 형식
                  const subtitleIdStr = parts[3]
                  const detailMenuIdStr = parts[4]
                  const subtitleIdNum = parseFloat(subtitleIdStr)
                  const detailMenuIdNum = parseFloat(detailMenuIdStr)
                  const subtitle = firstMenuField.subtitles.find(s => {
                    const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
                    return sId === subtitleIdNum || String(s.id) === subtitleIdStr
                  })
                  if (subtitle) {
                    const detailMenu = subtitle.detailMenus.find(dm => {
                      const dmId = typeof dm.id === 'number' ? dm.id : parseFloat(String(dm.id))
                      return dmId === detailMenuIdNum || String(dm.id) === detailMenuIdStr
                    })
                    console.log('첫 번째 메뉴 상세메뉴 썸네일:', { subtitleIdStr, detailMenuIdStr, thumbnail: detailMenu?.thumbnail })
                    return detailMenu?.thumbnail
                  }
                  return undefined
                } else if (parts[2] === 'menu') {
                  // detail-menu-menu-{menuId}-{subtitleId}-{detailMenuId} 형식
                  const menuIdStr = parts[3]
                  const menuIdNum = parseFloat(menuIdStr)
                  const subtitleIdStr = parts[4]
                  const subtitleIdNum = parseFloat(subtitleIdStr)
                  const detailMenuIdStr = parts[5]
                  const detailMenuIdNum = parseFloat(detailMenuIdStr)
                  const menuField = menuFields.find(f => {
                    const fieldIdNum = typeof f.id === 'number' ? f.id : parseFloat(String(f.id))
                    return fieldIdNum === menuIdNum || String(f.id) === menuIdStr
                  })
                  if (menuField) {
                    const subtitle = menuField.subtitles.find(s => {
                      const sId = typeof s.id === 'number' ? s.id : parseFloat(String(s.id))
                      return sId === subtitleIdNum || String(s.id) === subtitleIdStr
                    })
                    if (subtitle) {
                      const detailMenu = subtitle.detailMenus.find(dm => {
                        const dmId = typeof dm.id === 'number' ? dm.id : parseFloat(String(dm.id))
                        return dmId === detailMenuIdNum || String(dm.id) === detailMenuIdStr
                      })
                      console.log('메뉴 필드 상세메뉴 썸네일:', { menuIdStr, subtitleIdStr, detailMenuIdStr, thumbnail: detailMenu?.thumbnail })
                      return detailMenu?.thumbnail
                    }
                  }
                  return undefined
                }
                return undefined
              })()
            : undefined
        }
      />

      {/* 취소 경고 팝업 */}
      {showCancelWarning && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">변경사항이 있습니다</h3>
            <p className="text-gray-300 mb-6">
              저장하지 않은 변경사항이 있습니다. 정말 나가시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCancelWarning(false)
                  router.push('/admin')
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                나가기
              </button>
              <button
                onClick={() => setShowCancelWarning(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 메뉴 필드 삭제 확인 팝업 */}
      {showDeleteMenuConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">메뉴 항목 삭제</h3>
            <p className="text-gray-300 mb-6">
              정말로 이 메뉴 항목을 삭제하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (menuFieldToDelete !== null) {
                    setMenuFields(menuFields.filter(f => f.id !== menuFieldToDelete))
                  }
                  setShowDeleteMenuConfirm(false)
                  setMenuFieldToDelete(null)
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                삭제
              </button>
              <button
                onClick={() => {
                  setShowDeleteMenuConfirm(false)
                  setMenuFieldToDelete(null)
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 소제목 삭제 확인 팝업 */}
      {showDeleteSubtitleConfirm && subtitleToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">소제목 삭제</h3>
            <p className="text-gray-300 mb-6">
              정말로 이 소제목을 삭제하시겠습니까?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (subtitleToDelete.menuId === 'first') {
                    setFirstMenuField(prev => {
                      const filtered = prev.subtitles.filter(s => s.id !== subtitleToDelete.subtitleId)
                      // 소메뉴가 모두 삭제되면 디폴트 소메뉴 1개 추가
                      const newSubtitles = filtered.length === 0 
                        ? [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
                        : filtered
                      return {
                      ...prev,
                        subtitles: newSubtitles
                      }
                    })
                  } else {
                    setMenuFields(menuFields.map(f => {
                      if (f.id === subtitleToDelete.menuId) {
                        const filtered = f.subtitles.filter(s => s.id !== subtitleToDelete.subtitleId)
                        // 소메뉴가 모두 삭제되면 디폴트 소메뉴 1개 추가
                        const newSubtitles = filtered.length === 0
                          ? [{ id: Date.now(), subtitle: '', interpretation_tool: '', detailMenus: [] }]
                          : filtered
                        return {
                        ...f,
                          subtitles: newSubtitles
                        }
                      }
                      return f
                    }))
                  }
                  setShowDeleteSubtitleConfirm(false)
                  setSubtitleToDelete(null)
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                삭제
              </button>
              <button
                onClick={() => {
                  setShowDeleteSubtitleConfirm(false)
                  setSubtitleToDelete(null)
                }}
                className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 컨텐츠 삭제 확인 팝업 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-white mb-4">컨텐츠 삭제</h3>
            <p className="text-gray-300 mb-6">
              정말로 이 컨텐츠를 삭제하시겠습니까?
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
                        const errorData = await response.json().catch(() => ({ error: '삭제에 실패했습니다.' }))
                        throw new Error(errorData.error || '삭제에 실패했습니다.')
                      }

                      router.push('/admin')
                    } catch (error: any) {
                      console.error('삭제 실패:', error)
                      alert(`삭제에 실패했습니다: ${error.message || '알 수 없는 오류'}`)
                      setShowDeleteConfirm(false)
                    }
                  }
                }}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
              >
                삭제
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

      {/* 무결성 체크 결과 팝업 */}
      {showIntegrityCheckResult && integrityCheckResult && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${integrityCheckResult.isValid ? 'text-green-600' : 'text-red-600'}`}>
                무결성 체크 결과
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
            
            {/* 오류 목록 */}
            {!integrityCheckResult.isValid && integrityCheckResult.errors.length > 0 && (
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">오류 목록:</h3>
                <ul className="space-y-2">
                  {integrityCheckResult.errors.map((error, index) => (
                    <li key={index} className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border border-gray-200">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            
            {/* 푸터 */}
            <div>
              <button
                onClick={() => {
                  setShowIntegrityCheckResult(false)
                  setIntegrityCheckResult(null)
                }}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 미리 보기 팝업 */}
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

// 미리보기 모달 컴포넌트
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
  
  // 샘플 본문 텍스트 생성
  const generateSampleContent = (title: string) => {
    return `<p>${title}에 대한 점사 내용이 여기에 표시됩니다. 실제 제미나이 점사 결과는 이 부분에 표시되며, 여러 문단으로 구성될 수 있습니다.</p>
<p>점사 내용은 사용자의 생년월일, 시간, 성별 등의 정보를 바탕으로 생성되며, 각 항목별로 상세한 해석을 제공합니다.</p>
<p>이 미리보기는 실제 점사 결과와 유사한 레이아웃과 스타일을 보여주기 위한 샘플입니다.</p>`
  }

  // 폰트 패밀리 추출 함수
  const extractFontFamily = (fontFaceCss: string): string | null => {
    if (!fontFaceCss) return null
    const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
    return match ? (match[1] || match[2]?.trim()) : null
  }

  const menuFontFamily = extractFontFamily(formData.menuFontFace || formData.fontFace || '')
  const subtitleFontFamily = extractFontFamily(formData.subtitleFontFace || formData.fontFace || '')
  const detailMenuFontFamily = extractFontFamily(formData.detailMenuFontFace || formData.fontFace || '')
  const bodyFontFamily = extractFontFamily(formData.bodyFontFace || formData.fontFace || '')

  // 모든 메뉴 항목 수집
  const allMenuItems = [
    ...(firstMenuField.value || firstMenuField.thumbnail ? [firstMenuField] : []),
    ...menuFields
  ]

  // 목차 생성
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
                      if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) return null
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

  // 동적 스타일 생성
  const dynamicStyles = `
    ${formData.menuFontFace ? formData.menuFontFace : ''}
    ${formData.subtitleFontFace ? formData.subtitleFontFace : ''}
    ${formData.detailMenuFontFace ? formData.detailMenuFontFace : ''}
    ${formData.bodyFontFace ? formData.bodyFontFace : ''}
    ${!formData.menuFontFace && !formData.subtitleFontFace && !formData.detailMenuFontFace && !formData.bodyFontFace && formData.fontFace ? formData.fontFace : ''}
  `

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-xl ${viewMode === 'pc' ? 'max-w-4xl' : 'max-w-md'} w-full shadow-2xl max-h-[90vh] overflow-hidden flex flex-col`}>
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">미리 보기</h2>
          <div className="flex items-center gap-3">
            {/* PC/모바일 모드 전환 버튼 */}
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
                모바일 모드
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
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
          <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
          <div className={`${viewMode === 'pc' ? 'max-w-4xl' : 'max-w-md'} mx-auto`}>
            {/* 제목 */}
            <div className="mb-8 text-center">
              <h1 
                className="text-3xl md:text-4xl font-bold text-gray-900 mb-4"
                style={{
                  fontFamily: menuFontFamily ? `'${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif` : undefined
                }}
              >
                {formData.contentName || '점사 결과'}
              </h1>
            </div>

            {/* 북커버 썸네일 */}
            {formData.bookCoverThumbnail && (
              <div className="w-full mb-10">
                <img 
                  src={formData.bookCoverThumbnail} 
                  alt="북커버 썸네일"
                  className="w-full h-auto"
                  style={{ objectFit: 'contain', display: 'block' }}
                />
              </div>
            )}

            {/* 목차 */}
            {generateTOC()}

            {/* 메뉴 섹션들 */}
            <div className="jeminai-results space-y-6">
              {allMenuItems.map((menuItem, menuIndex) => {
                const menuTitle = (menuItem.value || '').trim()
                if (!menuTitle) return null

                return (
                  <div key={`preview-menu-${menuIndex}`} id={`preview-menu-${menuIndex}`} className="menu-section bg-white rounded-xl p-6 shadow-sm space-y-4">
                    {/* 대메뉴 제목 */}
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

                    {/* 소메뉴들 */}
                    {menuItem.subtitles && menuItem.subtitles.length > 0 && (
                      <div className="space-y-4">
                        {menuItem.subtitles.map((sub: any, subIndex: number) => {
                          const subTitle = (sub.subtitle || '').trim()
                          if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) return null

                          return (
                            <div key={`preview-subtitle-${menuIndex}-${subIndex}`} id={`preview-subtitle-${menuIndex}-${subIndex}`} className="subtitle-section space-y-2 pt-6 pb-6 border-b border-gray-100 last:border-b-0">
                              {/* 소메뉴 제목 */}
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

                              {/* 소메뉴 썸네일 */}
                              {sub.thumbnail && (
                                <div className="flex justify-center" style={{ width: '50%', marginLeft: 'auto', marginRight: 'auto' }}>
                                  <img
                                    src={sub.thumbnail}
                                    alt="소제목 썸네일"
                                    className="w-full h-auto rounded-lg"
                                    style={{ display: 'block', objectFit: 'contain' }}
                                  />
                                </div>
                              )}

                              {/* 상세메뉴들 */}
                              {sub.detailMenus && sub.detailMenus.length > 0 && (
                                <div className="space-y-3 mt-4">
                                  {sub.detailMenus.map((detailMenu: any, dmIndex: number) => {
                                    const detailMenuTitle = (detailMenu.detailMenu || '').trim()
                                    if (!detailMenuTitle) return null

                                    return (
                                      <div key={`preview-detail-${menuIndex}-${subIndex}-${dmIndex}`} className="detail-menu-section space-y-2">
                                        {/* 상세메뉴 제목 */}
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

                                        {/* 상세메뉴 썸네일 */}
                                        {detailMenu.thumbnail && (
                                          <div className="flex justify-center" style={{ width: '50%', marginLeft: 'auto', marginRight: 'auto' }}>
                                            <img
                                              src={detailMenu.thumbnail}
                                              alt="상세메뉴 썸네일"
                                              className="w-full h-auto rounded-lg"
                                              style={{ display: 'block', objectFit: 'contain' }}
                                            />
                                          </div>
                                        )}

                                        {/* 상세메뉴 본문 */}
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

                              {/* 소메뉴 본문 */}
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

                    {/* 엔딩 북커버 */}
                    {menuIndex === allMenuItems.length - 1 && formData.endingBookCoverThumbnail && (
                      <div className="w-full mt-4">
                        <img 
                          src={formData.endingBookCoverThumbnail} 
                          alt="엔딩북커버 썸네일"
                          className="w-full h-auto"
                          style={{ objectFit: 'contain', display: 'block' }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
        
        {/* 푸터 */}
        <div className="p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

