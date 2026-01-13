'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const oid = searchParams.get('oid')

  useEffect(() => {
    if (typeof window === 'undefined' || !oid) return

    // 0. 서버 DB 상태를 success로 업데이트 (가장 확실한 방법)
    fetch('/api/payment/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oid })
    }).catch(e => console.error('DB update failed', e))

    // ⚠️ sessionStorage는 창(탭) 단위라 opener가 읽을 수 없음
    // fallback은 localStorage(동일 origin 공유)로 남기고, opener는 이를 폴링해서 처리
    try {
      localStorage.setItem('payment_success_oid', oid)
      localStorage.setItem('payment_success_timestamp', Date.now().toString())
      // storage 이벤트를 강제로 발생시키기 위한 신호(동일 oid라도 매번 값이 바뀌게)
      localStorage.setItem('payment_success_signal', `${oid}:${Date.now()}:${Math.random().toString(16).slice(2)}`)
    } catch {
      // localStorage가 막혀도 postMessage로 최대한 처리
    }

    // BroadcastChannel로도 전달 (storage/postMessage 놓칠 경우 대비)
    try {
      const bc = new BroadcastChannel('payment_success')
      bc.postMessage({ type: 'PAYMENT_SUCCESS', oid })
      // 짧게 유지 후 닫기
      setTimeout(() => bc.close(), 500)
    } catch {
      // 무시
    }

    // opener 함수 직접 호출 (가장 확실한 방법)
    const callOpenerFunction = async () => {
      if (window.opener && !window.opener.closed) {
        try {
          // 본창에 정의된 함수 직접 호출
          const opener = window.opener as any
          if (typeof opener.handlePaymentSuccess === 'function') {
            console.log('[결제 성공 페이지] opener.handlePaymentSuccess 호출 시도')
            await opener.handlePaymentSuccess(oid)
            console.log('[결제 성공 페이지] opener.handlePaymentSuccess 호출 성공')
            return true
          } else {
            console.log('[결제 성공 페이지] opener.handlePaymentSuccess 함수 없음')
          }
        } catch (error) {
          console.error('[결제 성공 페이지] opener 함수 호출 오류:', error)
        }
      }
      return false
    }

    // postMessage로 원래 form 페이지에 결제 성공 알림
    const sendMessage = () => {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(
            {
              type: 'PAYMENT_SUCCESS',
              oid: oid
            },
            window.location.origin
          )
          return true
        } catch (error) {
          return false
        }
      }
      return false
    }

    // 즉시 메시지 전송 및 함수 호출 시도
    let messageSent = sendMessage()
    let functionCalled = false
    callOpenerFunction().then(result => { functionCalled = result })

    // 추가로 여러 번 시도 (opener가 준비될 시간 확보)
    let attemptCount = 0
    const maxAttempts = 10
    const messageInterval = setInterval(() => {
      attemptCount++
      if (window.opener && !window.opener.closed) {
        if (!functionCalled) {
          callOpenerFunction().then(result => { functionCalled = result })
        }
        if (!messageSent) {
          messageSent = sendMessage()
        }
      }
      
      // 최대 시도 횟수에 도달하거나 성공적으로 처리되면 창 닫기
      if (attemptCount >= maxAttempts || functionCalled || messageSent) {
        clearInterval(messageInterval)
        // 너무 빨리 닫히면 전달이 씹히는 브라우저가 있어 약간 대기
        setTimeout(() => window.close(), 400)
      }
    }, 100)

    // 최대 2초 후에는 무조건 창 닫기
    setTimeout(() => {
      clearInterval(messageInterval)
      window.close()
    }, 2000)
  }, [oid])

  // UI 없이 메시지 전송 및 창 닫기만 수행
  return null
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessContent />
    </Suspense>
  )
}
