'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'

function PaymentSuccessContent() {
  // 컴포넌트 렌더링 즉시 로그
  if (typeof window !== 'undefined') {

  }
  
  const searchParams = useSearchParams()
  const oid = searchParams.get('oid')
  
  // oid 확인 로그
  if (typeof window !== 'undefined') {

  }

  useEffect(() => {
    // 페이지 로드 확인용 즉시 로그

    if (typeof window === 'undefined' || !oid) {

      return
    }

    // 1. 먼저 DB 상태를 success로 업데이트 (processPaymentSuccess에서 상태 확인할 수 있도록)

    fetch('/api/payment/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oid })
    })
      .then(async (res) => {
        const data = await res.json()
        if (res.ok && data.success) {

        } else {

        }
      })
      .catch(e => {

      })

    // 2. opener 함수 직접 호출 (주 방식)
    // 통화 내용: "본창에 함수 하나 만들어 놓고 오픈창에서 호출하면 된다"
    // "오픈창에서 이 오픈어의 함수를 호출하면 돼요"
    const callOpenerFunction = async () => {
      if (window.opener && !window.opener.closed) {
        try {
          // 본창에 정의된 함수 직접 호출
          const opener = window.opener as any
          if (typeof opener.handlePaymentSuccess === 'function') {

            await opener.handlePaymentSuccess(oid)

            return true
          } else {

          }
        } catch (error) {

        }
      } else {

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

    // DB 업데이트 후 약간의 딜레이를 주고 opener 함수 호출 시도 (DB 업데이트가 완료될 시간 확보)
    setTimeout(() => {
      // 즉시 opener 함수 호출 시도
      let functionCalled = false
      callOpenerFunction().then(result => { 
        functionCalled = result
        if (result) {

        }
      })

      // 추가로 여러 번 시도 (opener가 준비될 시간 확보)
      let attemptCount = 0
      const maxAttempts = 20 // 더 많이 시도
      const messageInterval = setInterval(() => {
        attemptCount++
        if (window.opener && !window.opener.closed) {
          if (!functionCalled) {
            callOpenerFunction().then(result => { 
              functionCalled = result
              if (result) {

              }
            })
          }
        } else {

        }
        
        // 최대 시도 횟수에 도달하거나 성공적으로 처리되면 창 닫기
        if (attemptCount >= maxAttempts || functionCalled) {
          clearInterval(messageInterval)
          // 너무 빨리 닫히면 전달이 씹히는 브라우저가 있어 약간 대기
          setTimeout(() => {

            window.close()
          }, 500)
        }
      }, 100)

      // 최대 3초 후에는 무조건 창 닫기
      setTimeout(() => {
        clearInterval(messageInterval)

        window.close()
      }, 3000)
    }, 300) // DB 업데이트 완료를 위한 딜레이
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
