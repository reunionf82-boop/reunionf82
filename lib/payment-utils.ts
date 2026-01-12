/**
 * 결제 관련 유틸리티 함수
 */

/**
 * 주문번호(oid) 생성
 * 형식: AI + YYYYMMDDHHmmss + _ + 밀리초 타임스탬프
 * 예: AI20260112163927_1768203567123
 */
export function generateOrderId(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  
  const dateTime = `${year}${month}${day}${hour}${minute}${second}`
  const timestamp = Date.now() // 밀리초 타임스탬프
  
  return `AI${dateTime}_${timestamp}`
}

/**
 * 결제 타입을 한글 표시명으로 변환
 */
export function getPaymentTypeDisplayName(paymentType: 'card' | 'mobile'): string {
  return paymentType === 'card' ? '카드결제' : '휴대폰 결제'
}
