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
const CVALUE_URL = 'https://www.fortune82.com/api/payment/cvalue.html'

/**
 * 브라우저에서 포춘82 cvalue 직접 호출(쿠키 자동 전달). CORS가 허용된 경우에만 성공.
 * 서버 프록시에 Cookie 포워딩이 없을 때 보조용.
 */
export async function fetchFortune82CvalueBalanceFromBrowser(uno: number): Promise<number | null> {
  if (typeof window === 'undefined') return null
  try {
    const res = await fetch(CVALUE_URL, {
      method: 'POST',
      credentials: 'include',
      mode: 'cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ uno: String(uno) }).toString(),
    })
    const text = (await res.text()).trim()
    if (/^\d+$/.test(text)) return parseInt(text, 10)
    return null
  } catch {
    return null
  }
}

/**
 * 1) 브라우저 직접 cvalue (쿠키 포함) 2) 실패 시 리유니온 API(서버가 Cookie 포워딩)
 */
export async function fetchFortune82CoinBalanceResolved(uno: number): Promise<number | null> {
  const direct = await fetchFortune82CvalueBalanceFromBrowser(uno)
  if (direct != null) return direct
  try {
    const r = await fetch('/api/payment/coin-balance', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uno: String(uno) }),
    })
    const data = await r.json().catch(() => ({}))
    if (data?.success && typeof data.balance === 'number') return data.balance
  } catch {
    /* ignore */
  }
  return null
}

export function mapPaymentCodeToCoinItemCode(paymentCode: string): string {
  const digits = String(paymentCode ?? '').replace(/\D/g, '')
  const tail = digits.slice(-4) || '1'
  const n = parseInt(tail, 10)
  const bucket = Number.isFinite(n) ? n % 100 : 0
  return String(9001 + bucket)
}
