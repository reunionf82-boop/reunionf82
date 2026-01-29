'use client'

import { useState, useEffect } from 'react'

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
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccessMessage, setShowSuccessMessage] = useState(false)

  const maxLength = 3000
  const currentLength = reviewText.length

  // 팝업이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setReviewText('')
      setShowSuccessMessage(false)
    }
  }, [isOpen])

  // 저장 버튼 클릭
  const handleSave = async () => {
    if (!reviewText.trim()) {
      alert('리뷰 내용을 입력해주세요.')
      return
    }
    await submitReview()
  }

  // 리뷰 제출
  const submitReview = async () => {
    setIsSubmitting(true)

    try {
      // 리뷰 저장 (contentId와 함께 title도 전달 - contentId가 유효하지 않을 경우 대비)
      const response = await fetch('/api/reviews/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content_id: contentId,
          review_text: reviewText.trim(),
          user_name: userName || null,
          image_url: null,
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
        const errorMessage = result_data.error || result_data.details || '리뷰 등록에 실패했습니다.'
        throw new Error(errorMessage)
      }
    } catch (error: any) {
      alert(error.message || '리뷰 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  const successTitle = '리뷰가 저장되었습니다'

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
              disabled={isSubmitting || !reviewText.trim()}
              className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-lg transition-colors duration-200"
            >
              {isSubmitting ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>

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
