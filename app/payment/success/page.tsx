'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams()
  const oid = searchParams.get('oid')
  const [completeDone, setCompleteDone] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !oid) {
      return
    }

    // 1. DB 상태를 success로 업데이트 (일시적 실패 대비 2회 재시도)
    const callComplete = (attempt: number): Promise<boolean> => {
      return fetch('/api/payment/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oid })
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}))
          if (res.ok && data.success) {
            setCompleteDone(true)
            return true
          }
          return false
        })
        .catch(() => false)
    }

    const runCompleteWithRetry = async () => {
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (await callComplete(attempt)) return
        if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt))
      }
    }
    runCompleteWithRetry()

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

  // oid 없음: PG가 쿼리스트링을 누락한 경우 등 — 사용자 안내 후 창 닫기
  if (!oid) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border border-gray-700 text-center">
          <p className="text-gray-300 mb-4">결제 완료 페이지입니다. 주문 정보가 전달되지 않았습니다.</p>
          <p className="text-gray-400 text-sm mb-6">결제가 완료되었다면 잠시 후 자동으로 반영되거나, 본창에서 확인해 주세요. 문제가 계속되면 고객센터에 문의해 주세요.</p>
          <button
            type="button"
            onClick={() => window.close()}
            className="bg-pink-500 hover:bg-pink-600 text-white font-medium py-2 px-4 rounded-lg"
          >
            창 닫기
          </button>
        </div>
      </div>
    )
  }

  // 정상: UI 없이 메시지 전송 및 창 닫기만 수행
  return null
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={null}>
      <PaymentSuccessContent />
    </Suspense>
  )
}
