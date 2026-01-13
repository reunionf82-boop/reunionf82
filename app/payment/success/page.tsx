'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const oid = searchParams.get('oid')

  useEffect(() => {
    if (typeof window === 'undefined' || !oid) {
      console.log('[결제 성공 페이지] 초기화 실패: window 또는 oid 없음')
      return
    }

    console.log('[결제 성공 페이지] 초기화 시작:', { oid, hasOpener: !!window.opener, origin: window.location.origin })

    // 통화 내용 기반: "본창에 함수 하나 만들어 놓고 오픈창에서 호출하면 된다"
    // "오픈창에서 이 오픈어의 함수를 호출하면 돼요"
    
    // opener 함수 직접 호출 (주 방식)
    const callOpenerFunction = async () => {
      if (window.opener && !window.opener.closed) {
        try {
          // 본창에 정의된 함수 직접 호출
          const opener = window.opener as any
          if (typeof opener.handlePaymentSuccess === 'function') {
            console.log('[결제 성공 페이지] opener.handlePaymentSuccess 호출 시도:', oid)
            await opener.handlePaymentSuccess(oid)
            console.log('[결제 성공 페이지] opener.handlePaymentSuccess 호출 성공')
            return true
          } else {
            console.log('[결제 성공 페이지] opener.handlePaymentSuccess 함수 없음')
          }
        } catch (error) {
          console.error('[결제 성공 페이지] opener 함수 호출 오류:', error)
        }
      } else {
        console.log('[결제 성공 페이지] opener 없음 또는 닫힘')
      }
      return false
    }

    // fallback: localStorage 저장 (opener 호출 실패 시 대비)
    try {
      localStorage.setItem('payment_success_oid', oid)
      localStorage.setItem('payment_success_timestamp', Date.now().toString())
      localStorage.setItem('payment_success_signal', `${oid}:${Date.now()}:${Math.random().toString(16).slice(2)}`)
    } catch {
      // localStorage가 막혀도 무시
    }

    // 즉시 opener 함수 호출 시도
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
      }
      
      // 최대 시도 횟수에 도달하거나 성공적으로 처리되면 창 닫기
      if (attemptCount >= maxAttempts || functionCalled) {
        clearInterval(messageInterval)
        // 너무 빨리 닫히면 전달이 씹히는 브라우저가 있어 약간 대기
        setTimeout(() => {
          console.log('[결제 성공 페이지] 창 닫기')
          window.close()
        }, 400)
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
