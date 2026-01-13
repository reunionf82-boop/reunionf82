'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const oid = searchParams.get('oid')

  useEffect(() => {
    if (typeof window === 'undefined') return

    // postMessage로 원래 form 페이지에 결제 성공 알림
    if (window.opener && !window.opener.closed && oid) {
      console.log('[결제 성공 페이지] opener 확인됨, 메시지 전송 시작:', oid)
      // 여러 번 시도하여 메시지 전달 보장
      let attemptCount = 0
      const maxAttempts = 5
      
      const sendMessage = () => {
        attemptCount++
        console.log(`[결제 성공 페이지] 메시지 전송 시도 ${attemptCount}/${maxAttempts}`)
        
        try {
          window.opener.postMessage(
            {
              type: 'PAYMENT_SUCCESS',
              oid: oid
            },
            window.location.origin
          )
          console.log('[결제 성공 페이지] 메시지 전송 완료')
        } catch (error) {
          console.error('[결제 성공 페이지] 메시지 전송 오류:', error)
        }
        
        // 마지막 시도 후 창 닫기
        if (attemptCount >= maxAttempts) {
          setTimeout(() => {
            console.log('[결제 성공 페이지] 창 닫기 시도')
            window.close()
          }, 200)
        }
      }
      
      // 즉시 한 번 전송
      sendMessage()
      
      // 추가로 여러 번 전송 (opener가 준비될 시간 확보)
      for (let i = 1; i < maxAttempts; i++) {
        setTimeout(() => {
          if (window.opener && !window.opener.closed) {
            sendMessage()
          }
        }, 100 * i)
      }
    } else {
      console.log('[결제 성공 페이지] opener가 없거나 닫혔음, form 페이지로 리다이렉트')
      // opener가 없거나 닫혔으면 sessionStorage에 저장하고 form 페이지로 리다이렉트
      if (oid) {
        sessionStorage.setItem('payment_success_oid', oid)
        sessionStorage.setItem('payment_success_timestamp', Date.now().toString())
        // form 페이지로 리다이렉트 (같은 탭에서 열린 경우)
        setTimeout(() => {
          window.location.href = '/form'
        }, 100)
      } else {
        // oid가 없으면 그냥 form 페이지로 이동
        setTimeout(() => {
          window.location.href = '/form'
        }, 100)
      }
    }
  }, [oid])

  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg p-8 max-w-md w-full border border-gray-700">
        <div className="text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-white mb-4">결제 완료</h1>
          <div className="bg-gray-900 rounded-lg p-4 mb-6 border border-gray-700">
            <p className="text-gray-300 mb-2">
              결제가 성공적으로 완료되었습니다.
            </p>
            <p className="text-gray-300 mb-4">
              점사를 시작합니다...
            </p>
            {oid && (
              <div className="text-sm text-gray-400 mt-4 pt-4 border-t border-gray-700">
                <p>주문번호: <span className="font-mono">{oid}</span></p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">로딩 중...</div>
      </div>
    }>
      <PaymentSuccessContent />
    </Suspense>
  )
}
