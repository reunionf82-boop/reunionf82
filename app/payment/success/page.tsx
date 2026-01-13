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

    // 1. 먼저 DB 상태를 success로 업데이트 (processPaymentSuccess에서 상태 확인할 수 있도록)
    console.log('[결제 성공 페이지] DB 업데이트 시작:', oid)
    fetch('/api/payment/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oid })
    })
      .then(async (res) => {
        const data = await res.json()
        if (res.ok && data.success) {
          console.log('[결제 성공 페이지] DB 업데이트 성공:', data)
        } else {
          console.error('[결제 성공 페이지] DB 업데이트 실패:', res.status, data)
        }
      })
      .catch(e => {
        console.error('[결제 성공 페이지] DB 업데이트 오류:', e)
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

    // DB 업데이트 후 약간의 딜레이를 주고 opener 함수 호출 시도 (DB 업데이트가 완료될 시간 확보)
    setTimeout(() => {
      // 즉시 opener 함수 호출 시도
      let functionCalled = false
      callOpenerFunction().then(result => { 
        functionCalled = result
        if (result) {
          console.log('[결제 성공 페이지] opener 호출 성공, 창 닫기 준비')
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
                console.log('[결제 성공 페이지] opener 호출 성공 (재시도), 창 닫기 준비')
              }
            })
          }
        } else {
          console.log(`[결제 성공 페이지] opener 확인 (${attemptCount}회):`, { 
            hasOpener: !!window.opener, 
            isClosed: window.opener?.closed 
          })
        }
        
        // 최대 시도 횟수에 도달하거나 성공적으로 처리되면 창 닫기
        if (attemptCount >= maxAttempts || functionCalled) {
          clearInterval(messageInterval)
          // 너무 빨리 닫히면 전달이 씹히는 브라우저가 있어 약간 대기
          setTimeout(() => {
            console.log('[결제 성공 페이지] 창 닫기 실행')
            window.close()
          }, 500)
        }
      }, 100)

      // 최대 3초 후에는 무조건 창 닫기
      setTimeout(() => {
        clearInterval(messageInterval)
        console.log('[결제 성공 페이지] 최대 시간 도달, 창 닫기')
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
