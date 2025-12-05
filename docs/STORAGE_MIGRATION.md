# Supabase Storage 마이그레이션 가이드

## 방법 1: 자동화 스크립트 사용 (권장)

### 준비

1. **환경 변수 설정**
   - `.env.local` 파일에 다음 추가:
   ```env
   OLD_SUPABASE_URL=https://기존-프로젝트-ref.supabase.co
   OLD_SUPABASE_SERVICE_KEY=기존-서비스-롤-키
   NEW_SUPABASE_URL=https://새-프로젝트-ref.supabase.co
   NEW_SUPABASE_SERVICE_KEY=새-서비스-롤-키
   ```

   **서비스 롤 키 확인:**
   - Supabase 대시보드 → Settings → API
   - "service_role" 키 복사 (주의: 이 키는 비밀입니다!)

2. **새 프로젝트에 버킷 생성**
   - 새 프로젝트 → Storage → "New bucket" 클릭
   - 버킷 이름 입력 (예: `thumbnails`)
   - Public bucket으로 설정 (필요한 경우)

### 실행

```bash
node scripts/migrate-storage.js
```

스크립트가 자동으로:
- 기존 프로젝트에서 모든 파일 목록 가져오기
- 각 파일 다운로드
- 새 프로젝트에 업로드

## 방법 2: Supabase 대시보드에서 수동 복사

### 단계별 가이드

1. **기존 프로젝트에서 파일 확인**
   - 기존 프로젝트 → Storage → 버킷 선택 (예: `thumbnails`)
   - 파일 목록 확인

2. **파일 다운로드**
   - 각 파일을 클릭하여 다운로드
   - 또는 여러 파일 선택 후 일괄 다운로드 (브라우저 기능 사용)

3. **새 프로젝트에 업로드**
   - 새 프로젝트 → Storage → 버킷 선택
   - "Upload file" 또는 "Upload folder" 클릭
   - 다운로드한 파일 업로드

**주의:** 파일이 많으면 시간이 오래 걸립니다.

## 방법 3: Storage API 사용 (고급)

### Node.js 스크립트 예시

```javascript
const { createClient } = require('@supabase/supabase-js')

const oldSupabase = createClient(
  'https://기존-프로젝트-ref.supabase.co',
  '기존-서비스-롤-키'
)

const newSupabase = createClient(
  'https://새-프로젝트-ref.supabase.co',
  '새-서비스-롤-키'
)

async function migrateFile(bucketName, filePath) {
  // 다운로드
  const { data: fileData, error: downloadError } = await oldSupabase.storage
    .from(bucketName)
    .download(filePath)

  if (downloadError) {
    console.error(`다운로드 실패: ${filePath}`, downloadError)
    return false
  }

  // 업로드
  const { error: uploadError } = await newSupabase.storage
    .from(bucketName)
    .upload(filePath, fileData, {
      contentType: fileData.type,
      upsert: true
    })

  if (uploadError) {
    console.error(`업로드 실패: ${filePath}`, uploadError)
    return false
  }

  console.log(`✅ 완료: ${filePath}`)
  return true
}

// 사용 예시
migrateFile('thumbnails', 'image.jpg')
```

## 방법 4: rclone 사용 (대량 파일)

rclone은 대량 파일 마이그레이션에 유용합니다.

### 설치
```bash
# Windows: Chocolatey
choco install rclone

# 또는 직접 다운로드
# https://rclone.org/downloads/
```

### 설정
```bash
# rclone 설정
rclone config

# Supabase Storage를 S3 호환으로 설정
# Access Key: Supabase 프로젝트의 Access Key
# Secret Key: Supabase 프로젝트의 Secret Key
# Endpoint: https://[프로젝트-ref].supabase.co/storage/v1/s3
```

### 복사
```bash
# 기존 프로젝트에서 새 프로젝트로 복사
rclone copy old-storage:thumbnails new-storage:thumbnails
```

## 체크리스트

- [ ] 기존 프로젝트에서 Storage 버킷 목록 확인
- [ ] 새 프로젝트에 동일한 버킷 생성
- [ ] 환경 변수 설정 (자동화 스크립트 사용 시)
- [ ] 파일 마이그레이션 실행
- [ ] 파일 개수 및 크기 확인
- [ ] 새 프로젝트에서 파일 접근 테스트

## 문제 해결

### 업로드 실패
- 버킷 정책 확인 (Public 또는 인증 필요)
- 서비스 롤 키 확인
- 파일 크기 제한 확인 (Supabase 기본 제한: 50MB)

### 권한 오류
- 서비스 롤 키 사용 확인
- 버킷 정책에서 업로드 권한 확인

### 파일 경로 문제
- 파일 경로에 특수문자 확인
- 폴더 구조 유지 확인

## 팁

- **대량 파일:** 자동화 스크립트 사용 권장
- **소량 파일:** 대시보드에서 수동 복사 가능
- **백업:** 마이그레이션 전 기존 파일 백업 권장
- **검증:** 마이그레이션 후 파일 개수 및 크기 확인

