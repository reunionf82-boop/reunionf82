# ENCRYPTION_KEY 설정 가이드

## 개요
`ENCRYPTION_KEY`는 휴대폰 번호와 비밀번호를 암호화하는 데 사용되는 비밀 키입니다. 이 키는 반드시 안전하게 관리해야 하며, 프로덕션 환경에서는 환경 변수로 설정해야 합니다.

## 키 생성 방법

### 방법 1: Node.js로 64자 hex 문자열 생성 (권장)

**터미널에서 실행:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**또는 PowerShell에서:**
```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**출력 예시:**
```
a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

이 출력된 값을 복사하여 `.env.local` 파일에 설정합니다.

---

### 방법 2: 온라인 도구 사용

1. **Random.org** (https://www.random.org/strings/)
   - Length: 64
   - Characters: 0-9, a-f (hexadecimal)
   - Generate 버튼 클릭
   - 생성된 문자열 복사

2. **Online Random String Generator**
   - Hex characters 선택
   - Length: 64
   - 생성된 문자열 복사

---

### 방법 3: Python으로 생성

**Python 스크립트:**
```python
import secrets
print(secrets.token_hex(32))
```

**또는:**
```python
import os
print(os.urandom(32).hex())
```

---

### 방법 4: OpenSSL 사용 (Linux/Mac)

```bash
openssl rand -hex 32
```

---

### 방법 5: 일반 문자열 사용 (자동 해시 변환)

암호화 라이브러리는 64자 hex 문자열이 아닌 경우 자동으로 SHA-256 해시로 변환합니다.

**예시:**
```env
ENCRYPTION_KEY=my-super-secret-password-12345
```

이 경우 자동으로 SHA-256 해시로 변환되어 32바이트 키가 생성됩니다.

**주의:** 일반 문자열을 사용할 경우, 충분히 길고 복잡한 문자열을 사용해야 합니다 (최소 32자 이상 권장).

---

## 환경 변수 설정

### 1. 로컬 개발 환경 (`.env.local`)

프로젝트 루트에 `.env.local` 파일을 생성하거나 수정:

```env
# 암호화 키 (64자 hex 문자열 권장)
ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456

# 기존 환경 변수들...
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### 2. 프로덕션 환경 (Vercel)

1. Vercel 대시보드 접속
2. 프로젝트 선택
3. Settings → Environment Variables
4. `ENCRYPTION_KEY` 추가
5. Value에 생성한 키 입력
6. Save

### 3. 프로덕션 환경 (Cloudways/기타 서버)

**환경 변수 파일에 추가:**
```bash
# .env 파일 또는 시스템 환경 변수
export ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456
```

**또는 PM2 사용 시:**
```json
{
  "apps": [{
    "name": "your-app",
    "script": "npm",
    "args": "start",
    "env": {
      "ENCRYPTION_KEY": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
    }
  }]
}
```

---

## 키 형식 요구사항

### 권장 형식: 64자 hex 문자열
- 길이: 정확히 64자
- 문자: 0-9, a-f (소문자 또는 대문자)
- 예시: `a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456`

### 대안: 일반 문자열 (자동 변환)
- 길이: 최소 32자 이상 권장
- 문자: 모든 ASCII 문자 가능
- 예시: `my-very-long-and-complex-secret-key-12345`
- 처리: 자동으로 SHA-256 해시로 변환됨

---

## 보안 주의사항

### ✅ DO (해야 할 것)
1. **프로덕션 환경에서는 반드시 환경 변수로 설정**
2. **키를 코드에 하드코딩하지 않기**
3. **Git 저장소에 커밋하지 않기** (`.env.local`은 `.gitignore에 포함)
4. **정기적으로 키 로테이션** (선택사항, 하지만 권장)
5. **충분히 긴 랜덤 키 사용** (64자 hex 또는 32자 이상의 복잡한 문자열)

### ❌ DON'T (하지 말아야 할 것)
1. **간단한 키 사용** (예: `123456`, `password`)
2. **키를 공유하거나 노출**
3. **개발 키를 프로덕션에서 사용**
4. **키를 로그에 출력**
5. **키를 클라이언트 사이드 코드에 포함**

---

## 키 생성 스크립트

프로젝트 루트에 `generate-encryption-key.js` 파일 생성:

```javascript
const crypto = require('crypto')

// 64자 hex 문자열 생성
const key = crypto.randomBytes(32).toString('hex')

console.log('\n🔐 암호화 키 생성 완료!\n')
console.log('생성된 키:')
console.log(key)
console.log('\n.env.local 파일에 다음을 추가하세요:')
console.log(`ENCRYPTION_KEY=${key}\n`)
```

**실행:**
```bash
node generate-encryption-key.js
```

---

## 키 변경 시 주의사항

⚠️ **중요:** 기존에 암호화된 데이터가 있는 경우, 키를 변경하면 기존 데이터를 복호화할 수 없습니다!

키를 변경하려면:
1. 기존 데이터 백업 (필요한 경우)
2. 새 키 생성
3. 환경 변수 업데이트
4. 기존 `user_credentials` 테이블 데이터 삭제 또는 마이그레이션

---

## 검증

키가 제대로 설정되었는지 확인:

**로컬에서 테스트:**
```bash
node -e "const {encrypt, decrypt} = require('./lib/encryption.ts'); const test = encrypt('test'); console.log('암호화 성공:', test); console.log('복호화 성공:', decrypt(test));"
```

또는 간단한 테스트 스크립트:

```javascript
// test-encryption.js
const { encrypt, decrypt } = require('./lib/encryption')

const testData = '010-1234-5678'
const encrypted = encrypt(testData)
const decrypted = decrypt(encrypted)

console.log('원본:', testData)
console.log('암호화:', encrypted)
console.log('복호화:', decrypted)
console.log('검증:', testData === decrypted ? '✅ 성공' : '❌ 실패')
```

---

## 문제 해결

### 오류: "ENCRYPTION_KEY 환경 변수가 설정되지 않았습니다"
- `.env.local` 파일이 프로젝트 루트에 있는지 확인
- 환경 변수 이름이 정확한지 확인 (`ENCRYPTION_KEY`)
- 서버 재시작 (환경 변수 변경 후 반드시 필요)

### 오류: "복호화 실패"
- 키가 변경되었는지 확인
- 키 형식이 올바른지 확인
- 기존 데이터가 새 키로 암호화되었는지 확인

### 개발 환경에서 임시 키 사용
개발 환경에서 `ENCRYPTION_KEY`가 없으면 자동으로 임시 키가 생성되지만, 서버 재시작 시마다 변경되므로 개발용으로만 사용해야 합니다.

---

## 요약

1. **키 생성:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. **환경 변수 설정:** `.env.local`에 `ENCRYPTION_KEY=생성된키` 추가
3. **서버 재시작:** 환경 변수 변경 후 반드시 재시작
4. **보안:** 키를 Git에 커밋하지 않기
