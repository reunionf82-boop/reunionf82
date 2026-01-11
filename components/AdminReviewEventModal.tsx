'use client'

import { useState, useEffect, useRef } from 'react'

interface AdminReviewEventModalProps {
  isOpen: boolean
  onClose: () => void
  contentId: number
  contentName: string
}

export default function AdminReviewEventModal({
  isOpen,
  onClose,
  contentId,
  contentName
}: AdminReviewEventModalProps) {
  const [basicBanner, setBasicBanner] = useState<string>('')
  const [detailBanners, setDetailBanners] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragOverBasic, setDragOverBasic] = useState(false)
  const [dragOverDetail, setDragOverDetail] = useState(false)
  const [dragOverDetailIndex, setDragOverDetailIndex] = useState<number | null>(null)
  const [mounted, setMounted] = useState(false)

  // 상세 배너 드래그 앤 드롭 순서 변경을 위한 상태
  const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen && contentId) {
      loadData()
    } else {
      setBasicBanner('')
      setDetailBanners([])
    }
  }, [isOpen, contentId])

  const loadData = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/settings/review-events?content_id=${contentId}`)
      if (response.ok) {
        const data = await response.json()
        const banners = data.review_event_banners || {}
        setBasicBanner(banners.basic || '')
        setDetailBanners(banners.details || [])
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error)
      alert('데이터를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (file: File, type: 'basic' | 'detail', index?: number) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 업로드 가능합니다.')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('folder', 'review-events')

      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error('업로드 실패')
      }

      const result = await response.json()
      const url = result.url

      if (type === 'basic') {
        setBasicBanner(url)
      } else {
        if (typeof index === 'number' && index < detailBanners.length) {
          // 기존 이미지 교체
          const newBanners = [...detailBanners]
          newBanners[index] = url
          setDetailBanners(newBanners)
        } else {
          // 새 이미지 추가
          setDetailBanners([...detailBanners, url])
        }
      }
    } catch (error) {
      console.error('업로드 에러:', error)
      alert('이미지 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleSave = async () => {
    if (uploading) {
      alert('이미지 업로드 중입니다.')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/admin/review-events/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content_id: contentId,
          review_event_banners: {
            basic: basicBanner,
            details: detailBanners
          }
        }),
      })

      if (!response.ok) {
        throw new Error('저장 실패')
      }

      // alert('성공적으로 저장되었습니다.') // 팝업 제거
      onClose()
    } catch (error) {
      console.error('저장 에러:', error)
      alert('저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleRemoveDetail = (index: number) => {
    const newBanners = detailBanners.filter((_, i) => i !== index)
    setDetailBanners(newBanners)
  }

  // 드래그 앤 드롭 이벤트 핸들러 (파일 업로드)
  const handleDrop = (e: React.DragEvent, type: 'basic' | 'detail', index?: number) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (type === 'basic') setDragOverBasic(false)
    if (type === 'detail') setDragOverDetail(false)
    if (typeof index === 'number') setDragOverDetailIndex(null)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0]
      handleUpload(file, type, index)
    }
  }

  // 순서 변경 드래그 시작
  const handleSortDragStart = (e: React.DragEvent, index: number) => {
    setDraggedItemIndex(index)
    e.dataTransfer.effectAllowed = 'move'
    // 드래그 이미지 설정 (선택 사항)
  }

  // 순서 변경 드래그 오버
  const handleSortDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // 순서 변경 드롭
  const handleSortDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedItemIndex === null || draggedItemIndex === index) return

    const newBanners = [...detailBanners]
    const [draggedItem] = newBanners.splice(draggedItemIndex, 1)
    newBanners.splice(index, 0, draggedItem)
    setDetailBanners(newBanners)
    setDraggedItemIndex(null)
  }

  if (!mounted || !isOpen) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm transition-all duration-300">
      <div className="w-full max-w-5xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-100">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-pink-500">리뷰 이벤트 관리</span>
              <span className="text-gray-500 text-sm font-normal">| {contentName}</span>
            </h2>
            <p className="text-xs text-gray-400 mt-1">드래그 앤 드롭으로 배너를 쉽고 빠르게 등록하세요.</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 컨텐츠 영역 */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-gray-900 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500"></div>
              <p className="mt-4 text-gray-400">데이터를 불러오는 중입니다...</p>
            </div>
          ) : (
            <>
              {/* 1. 기본 배너 섹션 */}
              <section className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-3 h-8 bg-gradient-to-b from-pink-500 to-purple-600 rounded-full inline-block shadow-lg shadow-pink-500/30"></span>
                    기본 배너
                    <span className="text-xs font-medium text-pink-300 bg-pink-500/10 px-2 py-0.5 rounded ml-2 border border-pink-500/20">1개 필수</span>
                  </h3>
                  {basicBanner && (
                    <button 
                      onClick={() => setBasicBanner('')}
                      className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      삭제하기
                    </button>
                  )}
                </div>
                
                <div 
                  className={`relative w-full min-h-[200px] max-h-[300px] rounded-xl border-2 transition-all duration-300 group overflow-hidden bg-gray-900 ${
                    basicBanner 
                      ? 'border-gray-700' 
                      : dragOverBasic 
                        ? 'border-pink-500 bg-gray-800/80 scale-[1.01]' 
                        : 'border-dashed border-gray-600 bg-gray-800/30 hover:border-gray-500 hover:bg-gray-800/50'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); setDragOverBasic(true); }}
                  onDragLeave={() => setDragOverBasic(false)}
                  onDrop={(e) => handleDrop(e, 'basic')}
                >
                  {basicBanner ? (
                    <>
                      <img 
                        src={basicBanner} 
                        alt="기본 배너" 
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <label className="cursor-pointer bg-white text-gray-900 font-bold px-6 py-2 rounded-full transform hover:scale-105 transition-transform flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          이미지 교체
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'basic')}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 pointer-events-none">
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mb-3 group-hover:bg-gray-700 transition-colors">
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="font-medium text-gray-400">여기에 이미지를 드래그하거나</p>
                      <label className="mt-2 text-pink-500 hover:text-pink-400 cursor-pointer pointer-events-auto hover:underline font-semibold">
                        파일 선택하기
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'basic')}
                        />
                      </label>
                    </div>
                  )}
                  {uploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                  )}
                </div>
              </section>

              {/* 2. 상세 배너 섹션 */}
              <section className="bg-gray-800/50 p-6 rounded-2xl border border-gray-700/50">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span className="w-3 h-8 bg-gradient-to-b from-purple-500 to-indigo-600 rounded-full inline-block shadow-lg shadow-purple-500/30"></span>
                    상세 배너
                    <span className="text-xs font-medium text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded ml-2 border border-purple-500/20">여러 장 등록 가능 (순서 변경 가능)</span>
                  </h3>
                  <label className="bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold px-3 py-1.5 rounded cursor-pointer transition-colors border border-gray-700 flex items-center gap-1 shadow-sm hover:shadow-md">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    추가하기
                    <input 
                      type="file" 
                      accept="image/*" 
                      className="hidden" 
                      multiple
                      onChange={(e) => {
                        if (e.target.files) {
                          Array.from(e.target.files).forEach(file => handleUpload(file, 'detail'))
                        }
                      }}
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {detailBanners.map((url, index) => (
                    <div 
                      key={index}
                      draggable
                      onDragStart={(e) => handleSortDragStart(e, index)}
                      onDragOver={(e) => handleSortDragOver(e, index)}
                      onDrop={(e) => handleSortDrop(e, index)}
                      className={`relative aspect-[85.6/53.98] group rounded-xl overflow-hidden bg-gray-800 border-2 transition-all duration-200 cursor-move ${
                        draggedItemIndex === index ? 'opacity-50 border-pink-500' : 'border-gray-700 hover:border-gray-500'
                      }`}
                    >
                      {/* 순서 표시 */}
                      <div className="absolute top-2 left-2 w-6 h-6 bg-black/70 rounded-full flex items-center justify-center text-xs font-bold text-white z-10">
                        {index + 1}
                      </div>

                      <img src={url} alt={`상세 배너 ${index + 1}`} className="w-full h-full object-cover" />
                      
                      {/* 호버 시 액션 */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-2">
                        {/* 교체용 dropzone 역할 */}
                        <div 
                          className="absolute inset-0"
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDragOverDetailIndex(index); }}
                          onDragLeave={() => setDragOverDetailIndex(null)}
                          onDrop={(e) => { handleDrop(e, 'detail', index); setDragOverDetailIndex(null); }}
                        ></div>
                        
                        <label className="relative cursor-pointer bg-white text-gray-900 text-xs font-bold px-3 py-1.5 rounded-full hover:bg-gray-100 z-10">
                          교체
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'detail', index)}
                          />
                        </label>
                        <button 
                          onClick={() => handleRemoveDetail(index)}
                          className="relative bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded-full hover:bg-red-600 z-10"
                        >
                          삭제
                        </button>
                        <p className="text-[10px] text-gray-300 mt-2">드래그하여 순서 변경</p>
                      </div>

                      {/* 드래그 오버 시 하이라이트 */}
                      {dragOverDetailIndex === index && (
                        <div className="absolute inset-0 bg-pink-500/20 border-2 border-pink-500 z-20 flex items-center justify-center">
                          <p className="text-white font-bold text-shadow">여기에 놓기</p>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* 추가 버튼 카드 */}
                  <div 
                    className={`aspect-[85.6/53.98] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all duration-200 group ${
                      dragOverDetail 
                        ? 'border-pink-500 bg-gray-800/80' 
                        : 'border-gray-600 bg-gray-800/30 hover:border-gray-500 hover:bg-gray-800/50'
                    }`}
                    onDragOver={(e) => { e.preventDefault(); setDragOverDetail(true); }}
                    onDragLeave={() => setDragOverDetail(false)}
                    onDrop={(e) => handleDrop(e, 'detail')}
                    onClick={() => document.getElementById('add-detail-input')?.click()}
                  >
                    <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center mb-2 group-hover:bg-gray-600 transition-colors">
                      <svg className="w-6 h-6 text-gray-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                    <span className="text-sm text-gray-400 group-hover:text-gray-200 font-medium">배너 추가</span>
                    <input 
                      id="add-detail-input"
                      type="file" 
                      accept="image/*" 
                      multiple
                      className="hidden" 
                      onChange={(e) => {
                        if (e.target.files) {
                          Array.from(e.target.files).forEach(file => handleUpload(file, 'detail'))
                        }
                      }}
                    />
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {/* 푸터 */}
        <div className="p-6 border-t border-gray-700 bg-gray-800 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-lg text-gray-300 font-medium hover:bg-gray-700 hover:text-white transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={loading || uploading}
            className="px-6 py-2.5 rounded-lg bg-pink-500 hover:bg-pink-600 text-white font-bold shadow-lg hover:shadow-pink-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95"
          >
            {uploading ? '업로드 중...' : loading ? '저장 중...' : '저장하기'}
          </button>
        </div>
      </div>
    </div>
  )
}
