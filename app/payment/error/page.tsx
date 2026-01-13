'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function PaymentErrorContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const msg = searchParams.get('msg')

  useEffect(() => {
    // 오픈창에서 열린 경우이므로, 일정 시간 후 자동으로 창 닫기
    // 또는 사용자가 닫기 버튼을 클릭할 수 있도록 함
  }, [])

  const handleClose = () => {
    if (typeof window !== 'undefined') {
      window.close()
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full border border-gray-700">
        <div className="text-center">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-white mb-4">결제 오류</h1>
          <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-700">
            <p className="text-gray-300 mb-2">
              결제 시스템에 일시적인 문제가 발생했습니다.
            </p>
            <p className="text-gray-300 mb-4">
              잠시 후 다시 시도해 주세요.
            </p>
            {code && (
              <div className="text-sm text-gray-400 mt-4 pt-4 border-t border-gray-700">
                <p>에러 코드: <span className="font-mono">{code}</span></p>
                {msg && <p className="mt-1">메시지: <span className="font-mono">{msg}</span></p>}
              </div>
            )}
          </div>
          <button
            onClick={handleClose}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            창 닫기
          </button>
        </div>
      </div>
    </div>
  )
}

export default function PaymentErrorPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    }>
      <PaymentErrorContent />
    </Suspense>
  )
}
