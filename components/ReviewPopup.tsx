'use client'

import { useState, useRef, useEffect } from 'react'

const MAX_IMAGE_WIDTH = 1024

async function resizeImageIfNeeded(file: File): Promise<File> {
  // GIF/SVG 등은 캔버스 변환 시 손실/문제 가능성이 있어 원본 유지
  if (!file.type.startsWith('image/')) return file
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = objectUrl

    if (typeof (img as any).decode === 'function') {
      await (img as any).decode()
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('이미지 로드에 실패했습니다.'))
      })
    }

    const width = img.naturalWidth || img.width
    const height = img.naturalHeight || img.height

    if (!width || width <= MAX_IMAGE_WIDTH) return file

    const targetWidth = MAX_IMAGE_WIDTH
    const targetHeight = Math.round((height * targetWidth) / width)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight)

    // PNG는 투명도 유지, 그 외는 JPEG로 압축(용량 절감)
    const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const jpegQuality = 1.0

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('이미지 변환에 실패했습니다.'))),
        outputType,
        outputType === 'image/jpeg' ? jpegQuality : undefined
      )
    })

    const baseName = (file.name || 'image').replace(/\.[^.]+$/, '')
    const ext = outputType === 'image/png' ? 'png' : 'jpg'
    return new File([blob], `${baseName}-${targetWidth}.${ext}`, { type: outputType })
  } catch (e) {
    // HEIC 등 브라우저가 디코딩 못하는 포맷이면 원본 전송
    console.warn('[ReviewPopup] 이미지 리사이즈 실패(원본 전송):', e)
    return file
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

interface ReviewPopupProps {
  isOpen: boolean
  onClose: () => void
  contentId: number
  userName?: string | null
  title?: string | null
  onSuccess: () => void
}

export default function ReviewPopup({ isOpen, onClose, contentId, userName, title, onSuccess }: ReviewPopupProps) {
  const [reviewText, setReviewText] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const maxLength = 3000
  const currentLength = reviewText.length

  // 팝업이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setReviewText('')
      setSelectedImage(null)
      setImagePreview(null)
      setImageLoaded(false)
      setIsUploading(false)
      setShowConfirmDialog(false)
      setShowSuccessMessage(false)
    }
  }, [isOpen])

  // 이미지 선택 핸들러
  const handleImageSelect = async (file: File | null) => {
    if (!file) return

    // 이미지 파일인지 확인
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 선택할 수 있습니다.')
      return
    }

    // 너무 큰 파일은 브라우저 메모리/성능 문제로 제한 (리사이즈 전)
    const hardMaxSize = 25 * 1024 * 1024
    if (file.size > hardMaxSize) {
      alert('이미지 파일 크기가 너무 큽니다. (최대 25MB)')
      return
    }

    // 가로 해상도 1024 초과 시 로컬에서 리사이즈 후 업로드
    const processedFile = await resizeImageIfNeeded(file)

    setSelectedImage(processedFile)
    setImageLoaded(false)
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result as string)
      // 이미지가 DOM에 로드될 때까지 약간의 지연
      setTimeout(() => {
        setImageLoaded(true)
      }, 50)
    }
    reader.readAsDataURL(processedFile)
  }

  // 앨범에서 선택
  const handleAlbumSelect = () => {
    fileInputRef.current?.click()
  }

  // 카메라로 촬영
  const handleCameraCapture = () => {
    cameraInputRef.current?.click()
  }

  // 이미지 제거
  const handleRemoveImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    setImageLoaded(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }

  // 저장 버튼 클릭
  const handleSave = async () => {
    if (!reviewText.trim()) {
      alert('리뷰 내용을 입력해주세요.')
      return
    }

    // 텍스트만 있고 이미지가 없으면 확인 다이얼로그 표시
    if (!selectedImage) {
      setShowConfirmDialog(true)
      return
    }

    // 이미지가 있으면 바로 저장
    await submitReview()
  }

  // 확인 다이얼로그에서 저장 확인
  const handleConfirmSave = async () => {
    setShowConfirmDialog(false)
    await submitReview()
  }

  // 리뷰 제출
  const submitReview = async () => {
    setIsSubmitting(true)

    try {
      // 이미지가 있으면 먼저 업로드
      let imageUrl: string | null = null
      if (selectedImage) {
        // 이미지가 완전히 로드될 때까지 대기 (최대 1초)
        let waitCount = 0
        while (!imageLoaded && waitCount < 20) {
          await new Promise(resolve => setTimeout(resolve, 50))
          waitCount++
        }
        
        setIsUploading(true)
        // 상태 업데이트가 DOM에 반영될 시간을 줌
        await new Promise(resolve => setTimeout(resolve, 100))
        
        try {
          const formData = new FormData()
          formData.append('file', selectedImage)

          const uploadResponse = await fetch('/api/reviews/upload-image', {
            method: 'POST',
            body: formData
          })

          if (!uploadResponse.ok) {
            const errorData = await uploadResponse.json().catch(() => ({}))
            throw new Error(errorData.error || '이미지 업로드에 실패했습니다.')
          }

          const uploadData = await uploadResponse.json()
          if (!uploadData.success || !uploadData.url) {
            throw new Error('이미지 업로드에 실패했습니다.')
          }
          imageUrl = uploadData.url
        } finally {
          setIsUploading(false)
        }
      }

      // 리뷰 저장 (contentId와 함께 title도 전달 - contentId가 유효하지 않을 경우 대비)
      const response = await fetch('/api/reviews/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_id: contentId,
          review_text: reviewText.trim(),
          user_name: userName || null,
          image_url: imageUrl,
          title: title || null
        })
      })

      const text = await response.text()
      let result_data: any = {}
      if (text) {
        try {
          result_data = JSON.parse(text)
        } catch (e) {
          throw new Error('응답 파싱에 실패했습니다.')
        }
      }

      if (response.ok && result_data.success) {
        // 성공 메시지 표시
        setShowSuccessMessage(true)
        setTimeout(() => {
          setShowSuccessMessage(false)
          onSuccess()
          onClose()
        }, 2000)
      } else {
        console.error('[ReviewPopup] 리뷰 저장 실패:', {
          status: response.status,
          statusText: response.statusText,
          result_data
        })
        const errorMessage = result_data.error || result_data.details || '리뷰 등록에 실패했습니다.'
        throw new Error(errorMessage)
      }
    } catch (error: any) {
      console.error('[ReviewPopup] 에러 발생:', error)
      alert(error.message || '리뷰 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const successTitle = selectedImage
    ? '베스트리뷰 후보가 되셨습니다'
    : '리뷰가 저장되었습니다'

  return (
    <>
      {/* 메인 팝업 */}
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* 헤더 */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">리뷰 작성</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 내용 */}
          <div className="p-6 space-y-4">
            {/* 텍스트 입력 영역 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                리뷰 내용
              </label>
              <textarea
                value={reviewText}
                onChange={(e) => {
                  if (e.target.value.length <= maxLength) {
                    setReviewText(e.target.value)
                  }
                }}
                placeholder="리뷰를 작성해주세요..."
                className="w-full h-48 p-4 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
              />
              <div className="flex justify-between items-center mt-2">
                <div className="text-sm text-gray-500">
                  {currentLength} / {maxLength}자
                </div>
                {currentLength >= maxLength && (
                  <div className="text-sm text-red-500">최대 글자수에 도달했습니다.</div>
                )}
              </div>
            </div>

            {/* 이미지 선택 영역 */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                사진 (선택사항)
              </label>
              {imagePreview ? (
                <div className="relative bg-gray-50 rounded-lg border border-gray-300 overflow-hidden" style={{ minHeight: '256px', height: '256px' }}>
                  <div className="w-full h-full flex items-center justify-center">
                    {!imageLoaded && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                      </div>
                    )}
                    <img
                      src={imagePreview}
                      alt="미리보기"
                      className={`w-full h-full object-contain transition-opacity duration-200 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setImageLoaded(true)}
                      onError={() => setImageLoaded(true)}
                    />
                  </div>
                  {/* 업로드 중 오버레이 */}
                  {isUploading && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20">
                      <div className="bg-white rounded-lg p-4 flex flex-col items-center gap-2">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500"></div>
                        <span className="text-sm font-semibold text-gray-700">업로드 중...</span>
                      </div>
                    </div>
                  )}
                  {!isUploading && imageLoaded && (
                    <button
                      onClick={handleRemoveImage}
                      className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-colors z-10"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleAlbumSelect}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>앨범에서 선택</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={handleCameraCapture}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
                  >
                    <div className="flex items-center justify-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>사진 촬영</span>
                    </div>
                  </button>
                </div>
              )}

              {/* 숨겨진 파일 입력 */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { void handleImageSelect(e.target.files?.[0] || null) }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { void handleImageSelect(e.target.files?.[0] || null) }}
              />
            </div>
          </div>

          {/* 푸터 */}
          <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={isSubmitting || isUploading || !reviewText.trim()}
              className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
            >
              {isUploading ? '업로드 중...' : isSubmitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 확인 다이얼로그 */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10001] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">저장 확인</h3>
            <p className="text-gray-600 mb-6">
              이용 사진까지 저장하시면 올리브영 5만원 모바일 쿠폰을 드립니다. 이대로 저장하시겠어요?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
              >
                취소
              </button>
              <button
                onClick={handleConfirmSave}
                className="flex-1 bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성공 메시지 */}
      {showSuccessMessage && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10001] p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 text-center">
            <div className="mb-4">
              <svg className="w-16 h-16 text-green-500 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">{successTitle}</h3>
          </div>
        </div>
      )}
    </>
  )
}
