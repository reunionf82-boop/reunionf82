/**
 * user_credentials 테이블의 encrypted_phone, encrypted_password를 복호화하여
 * phone_plain, password_plain 컬럼에 채우는 일회성 스크립트.
 *
 * 사전 준비:
 * 1. supabase-user-credentials-add-plain-columns.sql 적용 (phone_plain, password_plain 컬럼 추가)
 * 2. .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ENCRYPTION_KEY 설정
 *
 * 사용법:
 *   node scripts/decrypt-user-credentials-to-plain.js
 *
 * 보안: 비밀번호 평문 저장은 권장하지 않습니다. 전화번호만 복호화해서 채우려면
 *       아래 update 시 password_plain 대신 encrypted_password를 그대로 두거나
 *       스크립트에서 password_plain 업데이트 부분을 제거하세요.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

// .env.local 로드 (dotenv 없이)
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (m) {
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1).replace(/\\n/g, '\n')
      }
      process.env[key] = val
    }
  })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || ''

const ALGORITHM = 'aes-256-gcm'

function getKey() {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY 환경 변수가 필요합니다.')
  }
  if (/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    return Buffer.from(ENCRYPTION_KEY, 'hex').slice(0, 32)
  }
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
}

function decrypt(encryptedText) {
  const parts = encryptedText.split(':')
  if (parts.length !== 3) {
    throw new Error('잘못된 암호화 형식')
  }
  const key = getKey()
  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encrypted = parts[2]
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

async function main() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    process.exit(1)
  }
  if (!ENCRYPTION_KEY) {
    console.error('❌ ENCRYPTION_KEY 가 필요합니다. (.env.local)')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  })

  const { data: rows, error: fetchError } = await supabase
    .from('user_credentials')
    .select('id, encrypted_phone, encrypted_password')

  if (fetchError) {
    console.error('❌ user_credentials 조회 실패:', fetchError.message)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('처리할 행이 없습니다.')
    return
  }

  console.log(`총 ${rows.length}건 복호화 후 phone_plain, password_plain 채우기 시작...`)

  let ok = 0
  let fail = 0
  for (const row of rows) {
    try {
      const phonePlain = decrypt(row.encrypted_phone)
      const passwordPlain = decrypt(row.encrypted_password)
      const { error: updateError } = await supabase
        .from('user_credentials')
        .update({
          phone_plain: phonePlain,
          password_plain: passwordPlain
        })
        .eq('id', row.id)
      if (updateError) {
        console.error(`id=${row.id} 업데이트 실패:`, updateError.message)
        fail++
      } else {
        ok++
      }
    } catch (e) {
      console.error(`id=${row.id} 복호화 실패:`, e.message)
      fail++
    }
  }

  console.log(`완료: 성공 ${ok}건, 실패 ${fail}건`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
