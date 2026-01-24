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

/**
 * 현재 시간을 ISO 문자열로 반환 (UTC)
 * Supabase timestamptz는 자동으로 UTC로 저장/반환하므로 변환 불필요
 * 표시할 때 KST로 변환하면 됨
 */
export function getKSTNow(): string {
  // UTC 시간을 그대로 반환 (Supabase가 자동으로 처리)
  return new Date().toISOString()
}

/**
 * KST 기준으로 오늘의 시작 시간(00:00:00)을 ISO 문자열로 반환
 */
export function getKSTTodayStart(): string {
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)
  
  // KST 기준으로 오늘 00:00:00
  const kstTodayStart = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    0, 0, 0, 0
  ))
  // UTC로 변환 (KST에서 9시간 빼기)
  const utcTodayStart = new Date(kstTodayStart.getTime() - kstOffset)
  return utcTodayStart.toISOString()
}

/**
 * KST 기준으로 오늘의 끝 시간(23:59:59.999)을 ISO 문자열로 반환
 */
export function getKSTTodayEnd(): string {
  const now = new Date()
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)
  
  // KST 기준으로 오늘 23:59:59.999
  const kstTodayEnd = new Date(Date.UTC(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth(),
    kstNow.getUTCDate(),
    23, 59, 59, 999
  ))
  // UTC로 변환 (KST에서 9시간 빼기)
  const utcTodayEnd = new Date(kstTodayEnd.getTime() - kstOffset)
  return utcTodayEnd.toISOString()
}

/**
 * KST 기준으로 특정 날짜의 시작 시간(00:00:00)을 ISO 문자열로 반환
 * @param dateString YYYY-MM-DD 형식의 날짜 문자열 (KST 기준)
 */
export function getKSTDateStart(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const kstOffset = 9 * 60 * 60 * 1000
  
  // KST 기준으로 해당 날짜 00:00:00
  const kstDateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0))
  // UTC로 변환 (KST에서 9시간 빼기)
  const utcDateStart = new Date(kstDateStart.getTime() - kstOffset)
  return utcDateStart.toISOString()
}

/**
 * KST 기준으로 특정 날짜의 끝 시간(23:59:59.999)을 ISO 문자열로 반환
 * @param dateString YYYY-MM-DD 형식의 날짜 문자열 (KST 기준)
 */
export function getKSTDateEnd(dateString: string): string {
  const [year, month, day] = dateString.split('-').map(Number)
  const kstOffset = 9 * 60 * 60 * 1000
  
  // KST 기준으로 해당 날짜 23:59:59.999
  const kstDateEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999))
  // UTC로 변환 (KST에서 9시간 빼기)
  const utcDateEnd = new Date(kstDateEnd.getTime() - kstOffset)
  return utcDateEnd.toISOString()
}

/**
 * Date 객체를 KST 기준 날짜 문자열(YYYY-MM-DD)로 변환
 */
export function toKSTDateString(date: Date): string {
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(date.getTime() + kstOffset)
  const year = kstDate.getUTCFullYear()
  const month = String(kstDate.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kstDate.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Date 객체를 KST 기준 시간(0-23)으로 반환
 */
export function getKSTHour(date: Date): number {
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(date.getTime() + kstOffset)
  return kstDate.getUTCHours()
}

/**
 * Date 객체를 KST 기준 요일(0=일요일, 6=토요일)로 반환
 */
export function getKSTDayOfWeek(date: Date): number {
  const kstOffset = 9 * 60 * 60 * 1000
  const kstDate = new Date(date.getTime() + kstOffset)
  return kstDate.getUTCDay()
}

/**
 * 문자열을 지정된 바이트 길이(UTF-8 기준)로 자릅니다.
 * 한글 등 멀티바이트 문자는 안전하게 3바이트로 계산합니다.
 * @param str 원본 문자열
 * @param maxBytes 최대 바이트 수
 */
export function truncateStringByBytes(str: string, maxBytes: number): string {
  if (!str) return ''
  
  let totalBytes = 0
  let result = ''
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i]
    const charCode = char.charCodeAt(0)
    
    // ASCII 범위는 1바이트, 그 외(한글 등)는 3바이트로 계산 (UTF-8)
    // PG사 인코딩이 EUC-KR(2바이트)일 수도 있지만, 3바이트로 계산하면 더 짧게 잘리므로 안전함
    const charBytes = (charCode <= 127) ? 1 : 3
    
    if (totalBytes + charBytes > maxBytes) {
      break
    }
    
    totalBytes += charBytes
    result += char
  }
  
  return result
}
