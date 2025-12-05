# Supabase 빠른 마이그레이션 가이드

## 🚀 5분 안에 마이그레이션하기

### 1단계: 덤프 생성 (자동화 스크립트 사용)

**PowerShell에서 실행:**

1. **PowerShell 열기**
   - Windows 키 + X → "Windows PowerShell" 또는 "터미널" 선택
   - 또는 프로젝트 폴더에서 우클릭 → "터미널에서 열기"

2. **프로젝트 폴더로 이동** (아직 안 했다면)
   ```powershell
   cd C:\Users\goric\reunionf82
   ```

3. **스크립트 실행**
   ```powershell
   .\scripts\migrate-supabase.ps1 -OldProjectRef "기존-프로젝트-ref" -NewProjectRef "새-프로젝트-ref"
   ```
   
   **프로젝트 참조 ID 확인 방법:**
   - Supabase 대시보드 → Settings → General
   - "Reference ID" 항목에서 확인
   - 또는 프로젝트 URL에서 확인: `https://[프로젝트-ref].supabase.co`
   
   **예시:**
   - 기존 프로젝트 URL: `https://abcdefghijklmnop.supabase.co`
   - 참조 ID: `abcdefghijklmnop`
   
   ```powershell
   .\scripts\migrate-supabase.ps1 -OldProjectRef "abcdefghijklmnop" -NewProjectRef "qrstuvwxyz123456"
   ```

**⚠️ 실행 정책 오류가 발생하는 경우:**
```powershell
# 현재 세션에서만 실행 정책 변경
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# 그 다음 스크립트 실행
.\scripts\migrate-supabase.ps1 -OldProjectRef "기존-ref" -NewProjectRef "새-ref"
```

또는 수동으로:

```bash
# Supabase CLI 설치 (없는 경우)
npm install -g supabase

# 로그인
supabase login

# 기존 프로젝트 연결
supabase link --project-ref 기존-프로젝트-ref

# 덤프 생성
supabase db dump > full-dump.sql
```

### 2단계: 새 프로젝트 생성

1. https://supabase.com/dashboard 접속
2. "New Project" 클릭
3. 원하는 리전 선택
4. 프로젝트 생성

### 3단계: SQL 복원

1. 새 프로젝트의 **SQL Editor** 접속
2. "New query" 클릭
3. `full-dump.sql` 파일 내용 복사하여 붙여넣기
4. 실행 (Run)

### 4단계: Storage 마이그레이션 (있는 경우)

```bash
# .env.local에 환경 변수 설정
OLD_SUPABASE_URL=https://기존-프로젝트-ref.supabase.co
OLD_SUPABASE_SERVICE_KEY=기존-서비스-롤-키
NEW_SUPABASE_URL=https://새-프로젝트-ref.supabase.co
NEW_SUPABASE_SERVICE_KEY=새-서비스-롤-키

# Storage 마이그레이션 실행
node scripts/migrate-storage.js
```

### 5단계: 환경 변수 업데이트

`.env.local` 파일 수정:

```env
NEXT_PUBLIC_SUPABASE_URL=https://새-프로젝트-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=새-프로젝트-키
```

### 6단계: 테스트

```bash
npm run dev
```

애플리케이션이 정상 작동하는지 확인하세요.

## ⚠️ 주의사항

- 마이그레이션 전 반드시 백업 확인
- 새 프로젝트 검증 완료 전까지 기존 프로젝트 유지
- Storage 파일이 많으면 시간 소요

## 📚 상세 가이드

더 자세한 내용은 `docs/SUPABASE_MIGRATION_GUIDE.md` 참고

