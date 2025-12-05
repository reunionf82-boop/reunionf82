'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getContentById, deleteContent, type ContentData } from '@/lib/supabase-admin'
import ThumbnailModal from '@/components/ThumbnailModal'

interface AdminFormProps {
  onAdd?: (service: any) => void
}

export default function AdminForm({ onAdd }: AdminFormProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const contentId = searchParams.get('id')
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
    menuSubtitle: '',
    interpretationTool: '',
    subtitleCharCount: '500',
    menuFontSize: '16',
    subtitleFontSize: '14',
    bodyFontSize: '11',
    ttsSpeaker: speakerParam || 'nara', // URL 파라미터 또는 기본값: nara
  })
  const [menuFields, setMenuFields] = useState<Array<{ id: number; value: string; thumbnail?: string }>>([])
  const [firstMenuField, setFirstMenuField] = useState({ value: '', thumbnail: '' })
  const [initialData, setInitialData] = useState<any>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [showThumbnailModal, setShowThumbnailModal] = useState(false)
  const [currentThumbnailField, setCurrentThumbnailField] = useState<'main' | 'firstMenu' | number>('main')
  const [showCancelWarning, setShowCancelWarning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showDeleteMenuConfirm, setShowDeleteMenuConfirm] = useState(false)
  const [menuFieldToDelete, setMenuFieldToDelete] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 초기 데이터 로드 (수정 모드)
  useEffect(() => {
    if (contentId) {
      loadContent(parseInt(contentId))
    }
  }, [contentId])

  // 변경 감지
  useEffect(() => {
    if (initialData) {
      // 현재 상태를 initialData와 같은 형식으로 변환
      const currentMenuItems = firstMenuField.value || firstMenuField.thumbnail 
        ? [firstMenuField, ...menuFields] 
        : []
      
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
        menu_subtitle: formData.menuSubtitle || '',
        interpretation_tool: formData.interpretationTool || '',
        subtitle_char_count: parseInt(formData.subtitleCharCount) || 500,
        menu_font_size: parseInt(formData.menuFontSize) || 16,
        subtitle_font_size: parseInt(formData.subtitleFontSize) || 14,
        body_font_size: parseInt(formData.bodyFontSize) || 11,
        menu_items: currentMenuItems,
        is_new: formData.showNew,
        tts_speaker: formData.ttsSpeaker || 'nara',
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
        menu_font_size: initialData.menu_font_size || 16,
        subtitle_font_size: initialData.subtitle_font_size || 14,
        body_font_size: initialData.body_font_size || 11,
        menu_items: initialData.menu_items || [],
        is_new: initialData.is_new || false,
        tts_speaker: initialData.tts_speaker || 'nara',
      }
      
      // menu_items 배열 정규화 (id 제거하고 value와 thumbnail만 비교)
      const normalizeMenuItems = (items: any[]) => {
        return items.map((item: any) => ({
          value: item.value || '',
          thumbnail: item.thumbnail || '',
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
        formData.menuSubtitle ||
        formData.interpretationTool ||
        firstMenuField.value ||
        firstMenuField.thumbnail ||
        menuFields.length > 0 ||
        menuFields.some(f => f.value || f.thumbnail)
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
        menuSubtitle: data.menu_subtitle || '',
        interpretationTool: data.interpretation_tool || '',
        subtitleCharCount: String(data.subtitle_char_count || '500'),
        menuFontSize: String(data.menu_font_size || '16'),
        subtitleFontSize: String(data.subtitle_font_size || '14'),
        bodyFontSize: String(data.body_font_size || '11'),
        ttsSpeaker: data.tts_speaker || 'nara',
      })
      if (data.menu_items && data.menu_items.length > 0) {
        setFirstMenuField({
          value: data.menu_items[0].value || '',
          thumbnail: data.menu_items[0].thumbnail || '',
        })
        setMenuFields(data.menu_items.slice(1))
      }
    } catch (error) {
      console.error('컨텐츠 로드 실패:', error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      console.log('=== 관리자 폼: 컨텐츠 저장 ===');
      console.log('formData.ttsSpeaker:', formData.ttsSpeaker);
      console.log('contentId:', contentId);
      console.log('speakerParam:', speakerParam);
      
      const contentData: ContentData = {
        id: contentId ? parseInt(contentId) : undefined,
        role_prompt: formData.title,
        restrictions: formData.description,
        content_type: formData.isNew ? 'saju' : 'gonghap',
        content_name: formData.contentName,
        thumbnail_url: formData.thumbnailUrl,
        price: formData.price,
        summary: formData.summary,
        introduction: formData.introduction,
        recommendation: formData.recommendation,
        menu_subtitle: formData.menuSubtitle,
        interpretation_tool: formData.interpretationTool,
        subtitle_char_count: parseInt(formData.subtitleCharCount) || 500,
        menu_font_size: parseInt(formData.menuFontSize) || 16,
        subtitle_font_size: parseInt(formData.subtitleFontSize) || 14,
        body_font_size: parseInt(formData.bodyFontSize) || 11,
        menu_items: [
          ...(firstMenuField.value || firstMenuField.thumbnail ? [{ id: 0, value: firstMenuField.value, thumbnail: firstMenuField.thumbnail }] : []),
          ...menuFields
        ],
        is_new: formData.showNew,
        tts_speaker: formData.ttsSpeaker || 'nara',
      }
      
      console.log('저장할 contentData.tts_speaker:', contentData.tts_speaker);
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

  const handleThumbnailClick = (field: 'main' | 'firstMenu' | number) => {
    setCurrentThumbnailField(field)
    setShowThumbnailModal(true)
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
              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 relative overflow-hidden min-w-[120px] h-[48px] flex items-center justify-center"
            >
              {formData.thumbnailUrl ? (
                <img 
                  src={formData.thumbnailUrl} 
                  alt="썸네일" 
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <span>썸네일</span>
              )}
            </button>
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
          <label className="block text-sm font-medium text-gray-300 mb-2">
            상품 메뉴 구성
          </label>
          <div className="flex gap-3">
            <input
              type="text"
              value={firstMenuField.value}
              onChange={(e) => setFirstMenuField(prev => ({ ...prev, value: e.target.value }))}
              className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
              placeholder="상품 메뉴 구성을 입력하세요"
            />
            <button
              type="button"
              onClick={() => handleThumbnailClick('firstMenu')}
              className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 relative overflow-hidden min-w-[120px] h-[48px] flex items-center justify-center"
            >
              {firstMenuField.thumbnail ? (
                <img 
                  src={firstMenuField.thumbnail} 
                  alt="썸네일" 
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <span>썸네일</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMenuFields([...menuFields, { id: Date.now(), value: '' }])}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold text-xl w-12 h-12 rounded-lg flex items-center justify-center transition-colors duration-200 border border-gray-600"
            >
              +
            </button>
          </div>
          
          {/* 동적으로 생성된 메뉴 필드들 */}
          {menuFields.map((field) => (
            <div key={field.id}>
              <div className="flex gap-3 mt-3">
                <input
                  type="text"
                  value={field.value}
                  onChange={(e) => setMenuFields(menuFields.map(f => 
                    f.id === field.id ? { ...f, value: e.target.value } : f
                  ))}
                  className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent"
                  placeholder="상품 메뉴 구성을 입력하세요"
                />
                <button
                  type="button"
                  onClick={() => handleThumbnailClick(field.id)}
                  className="bg-gray-600 hover:bg-gray-500 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 relative overflow-hidden min-w-[120px] h-[48px] flex items-center justify-center"
                >
                  {field.thumbnail ? (
                    <img 
                      src={field.thumbnail} 
                      alt="썸네일" 
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <span>썸네일</span>
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
            </div>
          ))}
        </div>

        {/* 하단 섹션: 작은 입력 필드들 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              상품 메뉴 소제목
            </label>
            <textarea
              name="menuSubtitle"
              value={formData.menuSubtitle}
              onChange={handleChange}
              rows={16}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize-y"
              placeholder="입력하세요"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              해석도구
            </label>
            <textarea
              name="interpretationTool"
              value={formData.interpretationTool}
              onChange={handleChange}
              rows={16}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm resize-y"
              placeholder="입력하세요"
            />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              소제목당 글자수
            </label>
            <input
              type="text"
              name="subtitleCharCount"
              value={formData.subtitleCharCount}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              placeholder="입력하세요"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              메뉴 폰트크기
            </label>
            <input
              type="text"
              name="menuFontSize"
              value={formData.menuFontSize}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              placeholder="입력하세요"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              소제목 폰트크기
            </label>
            <input
              type="text"
              name="subtitleFontSize"
              value={formData.subtitleFontSize}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              placeholder="입력하세요"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">
              본문 폰트크기
            </label>
            <input
              type="text"
              name="bodyFontSize"
              value={formData.bodyFontSize}
              onChange={handleChange}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-transparent text-sm"
              placeholder="입력하세요"
            />
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
                      await deleteContent(parseInt(contentId))
                      router.push('/admin')
                    } catch (error) {
                      console.error('삭제 실패:', error)
                      alert('삭제에 실패했습니다.')
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
    </div>
  )
}

