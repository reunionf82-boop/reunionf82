/**
 * 포춘82 포털 연동: 회원 쿠키(uno) 및 코인 결제용 아이템 코드(9001~9100)
 */

const UNO_COOKIE = 'uno'

/** document.cookie에서 단일 쿠키 값 읽기 (클라이언트 전용) */
export function getBrowserCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`))
  return m ? decodeURIComponent(m[1].trim()) : null
}

/**
 * 포춘82 로그인 회원 여부: uno 쿠키가 0보다 큰 숫자면 회원 번호
 * @returns 회원 번호 또는 null(비회원·미로그인)
 */
export function parseFortune82UnoFromBrowser(): number | null {
  const raw = getBrowserCookieValue(UNO_COOKIE)
  if (raw == null || String(raw).trim() === '') return null
  const n = parseInt(String(raw).replace(/\D/g, ''), 10)
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/**
 * reunion payment_code → 포춘82 코인 API용 9001~9100 (가이드 구간, 중복 완화용 버킷)
 */
export function mapPaymentCodeToCoinItemCode(paymentCode: string): string {
  const digits = String(paymentCode ?? '').replace(/\D/g, '')
  const tail = digits.slice(-4) || '1'
  const n = parseInt(tail, 10)
  const bucket = Number.isFinite(n) ? n % 100 : 0
  return String(9001 + bucket)
}
