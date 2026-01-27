import crypto from 'crypto'

// 환경 변수에서 암호화 키 가져오기 (32바이트 = 256비트)
// ENCRYPTION_KEY가 없으면 런타임에 생성하지만, 프로덕션에서는 반드시 환경 변수로 설정해야 함
let ENCRYPTION_KEY: string = process.env.ENCRYPTION_KEY || ''

if (!ENCRYPTION_KEY) {
  // 개발 환경에서만 임시 키 생성 (경고 로그 출력)
  if (process.env.NODE_ENV !== 'production') {
    ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
  } else {
    // 프로덕션 환경에서는 기본 키 사용 (경고만 출력)
    // 실제 사용 시에는 반드시 환경 변수로 설정해야 함
    const defaultKey = crypto.createHash('sha256').update('default-temp-key-change-in-production').digest('hex')
    ENCRYPTION_KEY = defaultKey
  }
}

// 키가 hex 형식이 아니면 SHA-256 해시로 변환하여 사용
// (암호화/복호화 함수에서 처리)

const ALGORITHM = 'aes-256-gcm'

/**
 * 데이터를 암호화
 * @param text 암호화할 텍스트
 * @returns 암호화된 텍스트 (iv:authTag:encryptedData 형식)
 */
export function encrypt(text: string): string {
  try {
    // 키를 32바이트 버퍼로 변환
    // ENCRYPTION_KEY가 hex 문자열이면 그대로 사용, 아니면 해시로 변환
    let key: Buffer
    if (/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
      // 64자 hex 문자열인 경우
      key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32)
    } else {
      // 그 외의 경우 SHA-256 해시로 32바이트 키 생성
      key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
    }
    
    // 랜덤 IV 생성 (12바이트)
    const iv = crypto.randomBytes(12)
    
    // 암호화 객체 생성
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
    
    // 암호화 수행
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    // 인증 태그 가져오기
    const authTag = cipher.getAuthTag()
    
    // IV:authTag:encrypted 형식으로 반환
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  } catch (error) {
    throw new Error(`암호화 실패: ${error}`)
  }
}

/**
 * 암호화된 데이터를 복호화
 * @param encryptedText 암호화된 텍스트 (iv:authTag:encryptedData 형식)
 * @returns 복호화된 텍스트
 */
export function decrypt(encryptedText: string): string {
  try {
    // 키를 32바이트 버퍼로 변환
    // ENCRYPTION_KEY가 hex 문자열이면 그대로 사용, 아니면 해시로 변환
    let key: Buffer
    if (/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
      // 64자 hex 문자열인 경우
      key = Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32)
    } else {
      // 그 외의 경우 SHA-256 해시로 32바이트 키 생성
      key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
    }
    
    // IV:authTag:encrypted 형식에서 분리
    const parts = encryptedText.split(':')
    if (parts.length !== 3) {
      throw new Error('잘못된 암호화 형식')
    }
    
    const iv = Buffer.from(parts[0], 'hex')
    const authTag = Buffer.from(parts[1], 'hex')
    const encrypted = parts[2]
    
    // 복호화 객체 생성
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    // 복호화 수행
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  } catch (error) {
    throw new Error(`복호화 실패: ${error}`)
  }
}
