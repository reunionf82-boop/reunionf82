'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function PaymentErrorContent() {
  const searchParams = useSearchParams()
  const code = searchParams.get('code')
  const msg = searchParams.get('msg')

  useEffect(() => {
    // opener에 오류 알림 (성공 페이지와 동일한 패턴)
    if (typeof window === 'undefined') return

    console.log('[결제 오류 페이지] useEffect 실행:', { 
      hasWindow: typeof window !== 'undefined',
      code: code || '없음',
      msg: msg || '없음',
      url: typeof window !== 'undefined' ? window.location.href : 'N/A',
      hasOpener: !!window.opener,
      openerClosed: window.opener?.closed
    })

    // opener 함수 직접 호출 (성공 페이지와 동일한 패턴)
    const callOpenerFunction = async () => {
      if (window.opener && !window.opener.closed) {
        try {
          const opener = window.opener as any
          if (typeof opener.handlePaymentError === 'function') {
            console.log('[결제 오류 페이지] opener.handlePaymentError 호출 시도:', { code, msg })
            await opener.handlePaymentError(code || 'UNKNOWN', msg || 'Payment failed')
            console.log('[결제 오류 페이지] opener.handlePaymentError 호출 성공')
            return true
          } else {
            console.log('[결제 오류 페이지] opener.handlePaymentError 함수 없음')
          }
        } catch (error) {
          console.error('[결제 오류 페이지] opener 함수 호출 오류:', error)
        }
      } else {
        console.log('[결제 오류 페이지] opener 없음 또는 닫힘')
      }
      return false
    }

    // fallback: localStorage 저장 (opener 호출 실패 시 대비)
    try {
      localStorage.setItem('payment_error_code', code || 'UNKNOWN')
      localStorage.setItem('payment_error_msg', msg || 'Payment failed')
      localStorage.setItem('payment_error_timestamp', Date.now().toString())
    } catch {
      // localStorage가 막혀도 무시
    }

    // 약간의 딜레이를 주고 opener 함수 호출 시도
    setTimeout(() => {
      let functionCalled = false
      callOpenerFunction().then(result => { 
        functionCalled = result
        if (result) {
          console.log('[결제 오류 페이지] opener 호출 성공, 창 닫기 준비')
        }
      })

      // 추가로 여러 번 시도
      let attemptCount = 0
      const maxAttempts = 20
      const messageInterval = setInterval(() => {
        attemptCount++
        if (window.opener && !window.opener.closed) {
          if (!functionCalled) {
            callOpenerFunction().then(result => { 
              functionCalled = result
              if (result) {
                console.log('[결제 오류 페이지] opener 호출 성공 (재시도), 창 닫기 준비')
              }
            })
          }
        }
        
        if (attemptCount >= maxAttempts || functionCalled) {
          clearInterval(messageInterval)
          setTimeout(() => {
            console.log('[결제 오류 페이지] 창 닫기 실행')
            window.close()
          }, 500)
        }
      }, 100)

      // 최대 3초 후에는 무조건 창 닫기
      setTimeout(() => {
        clearInterval(messageInterval)
        console.log('[결제 오류 페이지] 최대 시간 도달, 창 닫기')
        window.close()
      }, 3000)
    }, 300)
  }, [code, msg])

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
