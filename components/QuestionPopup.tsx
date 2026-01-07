'use client'

import { useState, useEffect } from 'react'

interface QuestionPopupProps {
  isOpen: boolean
  onClose: () => void
  menuTitle: string
  subtitles: string[] // 소제목 목록
  onQuestionSubmit: (question: string) => Promise<string> // 질문 제출 시 답변 반환
  usedQuestions: number // 사용된 질문 횟수
  maxQuestions: number // 최대 질문 횟수
}

export default function QuestionPopup({ isOpen, onClose, menuTitle, subtitles, onQuestionSubmit, usedQuestions, maxQuestions }: QuestionPopupProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isLimitReached = usedQuestions >= maxQuestions

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim()) {
      setError('질문을 입력해주세요.')
      return
    }

    if (isLimitReached) {
      setError('질문 횟수를 모두 소진했습니다.')
      return
    }

    setIsLoading(true)
    setError(null)
    setAnswer(null)

    try {
      style.id = styleId
      style.textContent = `
        .question-textarea-custom::-webkit-scrollbar {
          width: 6px;
        }
        .question-textarea-custom::-webkit-scrollbar-track {
          background: transparent;
          margin: 2px 0;
          border-radius: 0;
        }
        .question-textarea-custom::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 3px;
        }
        .question-textarea-custom::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
      `
      document.head.appendChild(style)
    }
  }, [])

  return (
    <div 
        className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 transition-opacity duration-200 ${
          isOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'
        }`}
      >
        <div className={`bg-white rounded-[20px] shadow-xl max-w-2xl w-full transition-transform duration-200 ${
          isOpen ? 'scale-100' : 'scale-95'
        }`}>
        <div className="bg-white border-b border-gray-200 px-5 py-3 rounded-t-[20px] flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">추가 질문하기</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-4 px-5">
          <div className="mb-3 flex justify-between items-start">
            <div className="flex-1">
              <p className="text-base text-gray-600 mb-1.5">
                <span className="font-semibold text-gray-900">{menuTitle}</span>에 대한 추가 질문이 있으신가요?
              </p>
            </div>
            <div className="bg-gray-100 px-3 py-1 rounded-full text-xs font-medium text-gray-600 ml-2 whitespace-nowrap">
              남은 질문: <span className={isLimitReached ? 'text-red-500 font-bold' : 'text-pink-500 font-bold'}>{Math.max(0, maxQuestions - usedQuestions)}</span> / {maxQuestions}회
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <textarea
                value={question}
                onChange={(e) => {
                  const value = e.target.value
                  if (value.length <= 50) {
                    setQuestion(value)
                  }
                }}
                placeholder={isLimitReached ? "질문 횟수를 모두 소진했습니다." : "예: 이 부분에 대해 더 자세히 알려주세요 (50자 이내)"}
                className={`question-textarea-custom w-full px-3.5 py-2.5 border border-gray-300 focus:ring-2 focus:ring-pink-500 focus:border-transparent focus:outline-none resize-none ${isLimitReached ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                style={{
                  minHeight: 'calc(17px * 1.4 * 2 + 10px * 2)',
                  paddingRight: '18px',
                  borderRadius: '2px',
                  lineHeight: '1.4',
                  fontSize: '17px',
                  overflowY: 'auto',
                }}
                maxLength={50}
                rows={2}
                disabled={isLoading || isLimitReached}
              />
              <div className="mt-1 flex justify-between items-center text-sm">
                 <span className="text-xs text-gray-400">
                   {isLimitReached ? '최대 3회까지 질문할 수 있습니다.' : '한 번에 하나의 질문만 가능합니다.'}
                 </span>
                 <div className="text-gray-500">
                   {question.length}/50
                 </div>
              </div>
            </div>

            {(error || isLimitReached) && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3.5 py-2.5 rounded-xl text-base">
                {isLimitReached ? '질문 횟수를 모두 소진했습니다.' : error}
              </div>
            )}

            {answer && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 max-h-[200px] overflow-y-auto">
                <p className="text-gray-700 whitespace-pre-line leading-relaxed text-base">{answer}</p>
              </div>
            )}
            
            {isLoading && (
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                <div className="inline-flex items-center gap-2">
                  <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-gray-600 text-base">점사 중입니다...</span>
                </div>
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                type="submit"
                disabled={isLoading || !question.trim() || isLimitReached}
                className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-5 rounded-xl transition-colors duration-200 text-[17px]"
              >
                질문하기
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-2.5 px-5 rounded-xl transition-colors duration-200 text-[17px]"
              >
                닫기
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

