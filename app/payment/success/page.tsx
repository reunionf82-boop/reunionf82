'use client'

import { useSearchParams, type ReadonlyURLSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

function PaymentSuccessContent() {
  const searchParams = useSearchParams() as ReadonlyURLSearchParams
  const oid = searchParams.get('oid')
  const [completeDone, setCompleteDone] = useState(false)

  // oid 없이 로드된 경우: PG가 쿼리스트링을 제거했을 수 있음 → opener에 알려 본창이 저장된 oid로 complete 호출하도록
  useEffect(() => {
    if (typeof window === 'undefined' || oid) return
    if (window.opener && !window.opener.closed) {
      try {
        // 동일 origin만 수신하도록 (리다이렉트된 도메인 기준)
        window.opener.postMessage({ type: 'PAYMENT_SUCCESS_POPUP_LOADED', hasOid: false }, '*')
      } catch { /* ignore */ }
    }
  }, [oid])

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

    // 2. opener 함수 직접 호출 (주 방식)
    const callOpenerFunction = async () => {
      if (window.opener && !window.opener.closed) {
        try {
          const opener = window.opener as any
          if (typeof opener.handlePaymentSuccess === 'function') {
            await opener.handlePaymentSuccess(oid)
            return true
          }
        } catch {
          // ignore
        }
      }
      return false
    }

    // DB 업데이트를 먼저 완료한 뒤 opener에 즉시 알림 (결제 완료 = 서버 노티)
    runCompleteWithRetry().then(() => {
      try {
        localStorage.setItem('payment_success_oid', oid)
        localStorage.setItem('payment_success_timestamp', Date.now().toString())
        localStorage.setItem('payment_success_signal', `${oid}:${Date.now()}:${Math.random().toString(16).slice(2)}`)
      } catch {
        // ignore
      }

      let functionCalled = false
      const tryClose = () => {
        if (window.opener && !window.opener.closed && !functionCalled) return
        try {
          window.close()
        } catch {}
      }

      // 결제 완료 즉시 opener에 노티 (딜레이 제거 → 보이스 화면 즉시 이동)
      callOpenerFunction().then((result) => {
        functionCalled = result
        if (result) setTimeout(tryClose, 300)
      })

      const messageInterval = setInterval(() => {
        if (!functionCalled && window.opener && !window.opener.closed) {
          callOpenerFunction().then((result) => {
            if (result) functionCalled = true
          })
        }
        tryClose()
      }, 150)
      setTimeout(() => {
        clearInterval(messageInterval)
        tryClose()
      }, 2500)
    })
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
