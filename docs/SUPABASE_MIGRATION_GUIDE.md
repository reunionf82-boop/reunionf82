# Supabase 데이터베이스 전체 마이그레이션 가이드

## 개요
이 가이드는 Supabase 프로젝트를 한 리전에서 다른 리전으로 완전히 마이그레이션하는 방법을 설명합니다.

## 마이그레이션 대상
- ✅ 테이블 구조 (스키마)
- ✅ 데이터
- ✅ 인덱스
- ✅ 제약조건 (Primary Key, Foreign Key 등)
- ✅ RLS (Row Level Security) 정책
- ✅ Storage 버킷 및 파일
- ✅ 함수 및 트리거 (있는 경우)

## 사전 준비

### 1. Supabase CLI 설치
```bash
npm install -g supabase
```

### 2. 로그인
```bash
supabase login
```

## 단계별 마이그레이션

### 1단계: 기존 프로젝트에서 전체 덤프 생성

#### 방법 A: Supabase CLI 사용 (권장)

```bash
# 프로젝트 연결
supabase link --project-ref 기존-프로젝트-ref

# 전체 데이터베이스 덤프 (스키마 + 데이터)
supabase db dump --data-only > data-only.sql
supabase db dump --schema-only > schema-only.sql
supabase db dump > full-dump.sql  # 스키마 + 데이터 모두

# 또는 특정 테이블만
supabase db dump --table contents --table app_settings --table portal_results > tables.sql
```

#### 방법 B: pg_dump 사용

```bash
# Supabase 대시보드 → Settings → Database에서 연결 정보 확인
# Connection string 또는 Connection pooling 사용

pg_dump -h db.프로젝트-ref.supabase.co \
        -U postgres \
        -d postgres \
        -n public \
        --schema-only \
        --no-owner \
        --no-privileges \
        > schema.sql

pg_dump -h db.프로젝트-ref.supabase.co \
        -U postgres \
        -d postgres \
        -n public \
        --data-only \
        --no-owner \
        --no-privileges \
        > data.sql
```

#### 방법 C: Supabase 대시보드에서 수동 추출

1. **SQL Editor에서 스키마 추출**
   ```sql
   -- 모든 테이블의 CREATE 문 생성
   SELECT 
     'CREATE TABLE IF NOT EXISTS ' || table_name || ' (' || 
     string_agg(
       column_name || ' ' || 
       CASE 
         WHEN data_type = 'character varying' THEN 'VARCHAR(' || COALESCE(character_maximum_length::text, '255') || ')'
         WHEN data_type = 'text' THEN 'TEXT'
         WHEN data_type = 'integer' THEN 'INTEGER'
         WHEN data_type = 'bigint' THEN 'BIGINT'
         WHEN data_type = 'boolean' THEN 'BOOLEAN'
         WHEN data_type = 'timestamp with time zone' THEN 'TIMESTAMPTZ'
         WHEN data_type = 'timestamp without time zone' THEN 'TIMESTAMP'
         WHEN data_type = 'jsonb' THEN 'JSONB'
         WHEN data_type = 'uuid' THEN 'UUID'
         ELSE UPPER(data_type)
       END ||
       CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
       COALESCE(' DEFAULT ' || column_default, ''),
       ', '
     ) || ');'
   FROM information_schema.columns
   WHERE table_schema = 'public'
   GROUP BY table_name;
   ```

2. **Table Editor에서 각 테이블 정의 확인**
   - 각 테이블 선택 → "Show table definition" 클릭
   - 완전한 CREATE TABLE 문 복사

3. **RLS 정책 추출**
   ```sql
   SELECT
     'CREATE POLICY "' || policyname || '" ON ' || tablename || 
     ' FOR ' || cmd || 
     ' TO ' || array_to_string(roles, ', ') ||
     CASE 
       WHEN qual IS NOT NULL THEN ' USING (' || qual || ')'
       ELSE ''
     END ||
     CASE 
       WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')'
       ELSE ''
     END || ';'
   FROM pg_policies
   WHERE schemaname = 'public';
   ```

4. **인덱스 추출**
   ```sql
   SELECT indexdef || ';'
   FROM pg_indexes
   WHERE schemaname = 'public';
   ```

### 2단계: 새 리전에 프로젝트 생성

1. Supabase 대시보드 접속
2. "New Project" 클릭
3. 원하는 리전 선택
4. 프로젝트 생성 (약 2분 소요)

### 3단계: 새 프로젝트에 데이터베이스 복원

#### 방법 A: Supabase CLI 사용

```bash
# 새 프로젝트 연결
supabase link --project-ref 새-프로젝트-ref

# 스키마 복원
supabase db reset  # 기존 스키마 초기화 (선택사항)
psql -h db.새-프로젝트-ref.supabase.co -U postgres -d postgres -f schema.sql

# 데이터 복원
psql -h db.새-프로젝트-ref.supabase.co -U postgres -d postgres -f data.sql
```

#### 방법 B: Supabase SQL Editor 사용

1. 새 프로젝트의 **SQL Editor** 접속
2. "New query" 클릭
3. 덤프한 SQL 파일 내용을 복사하여 붙여넣기
4. 실행 (Run 또는 Ctrl+Enter)

**주의사항:**
- 큰 데이터의 경우 여러 번에 나눠서 실행
- 트랜잭션 오류 시 롤백 확인

### 4단계: RLS 정책 복원

```sql
-- 추출한 RLS 정책 SQL을 SQL Editor에서 실행
-- 예시:
CREATE POLICY "Enable read access for all users" ON contents
FOR SELECT TO public USING (true);

CREATE POLICY "Enable insert for authenticated users" ON contents
FOR INSERT TO authenticated WITH CHECK (true);
```

### 5단계: Storage 버킷 마이그레이션

#### Storage 버킷 확인
```sql
-- 기존 프로젝트에서 버킷 목록 확인
SELECT name FROM storage.buckets;
```

#### Storage 파일 마이그레이션

**방법 A: Supabase Storage API 사용**

```javascript
// Node.js 스크립트 예시
const { createClient } = require('@supabase/supabase-js')

const oldSupabase = createClient(
  'https://기존-프로젝트-ref.supabase.co',
  '기존-서비스-롤-키'
)

const newSupabase = createClient(
  'https://새-프로젝트-ref.supabase.co',
  '새-서비스-롤-키'
)

async function migrateStorage(bucketName) {
  // 기존 버킷에서 파일 목록 가져오기
  const { data: files, error } = await oldSupabase.storage
    .from(bucketName)
    .list('', { limit: 1000 })

  if (error) throw error

  // 새 버킷에 파일 복사
  for (const file of files) {
    // 파일 다운로드
    const { data: fileData, error: downloadError } = await oldSupabase.storage
      .from(bucketName)
      .download(file.name)

    if (downloadError) {
      console.error(`다운로드 실패: ${file.name}`, downloadError)
      continue
    }

    // 새 버킷에 업로드
    const { error: uploadError } = await newSupabase.storage
      .from(bucketName)
      .upload(file.name, fileData, {
        contentType: file.metadata?.mimetype,
        upsert: true
      })

    if (uploadError) {
      console.error(`업로드 실패: ${file.name}`, uploadError)
    } else {
      console.log(`✅ 복사 완료: ${file.name}`)
    }
  }
}

// 사용 예시
migrateStorage('thumbnails')
```

**방법 B: 수동 복사**
1. 기존 프로젝트 Storage에서 파일 다운로드
2. 새 프로젝트 Storage에 업로드

### 6단계: 환경 변수 업데이트

`.env.local` 파일 수정:

```env
# 기존
NEXT_PUBLIC_SUPABASE_URL=https://기존-프로젝트-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=기존-키

# 새로 변경
NEXT_PUBLIC_SUPABASE_URL=https://새-프로젝트-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=새-키
```

### 7단계: 검증

1. **테이블 확인**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public';
   ```

2. **데이터 개수 확인**
   ```sql
   SELECT 
     'contents' as table_name, COUNT(*) as count FROM contents
   UNION ALL
   SELECT 'app_settings', COUNT(*) FROM app_settings
   UNION ALL
   SELECT 'portal_results', COUNT(*) FROM portal_results;
   ```

3. **RLS 정책 확인**
   ```sql
   SELECT tablename, policyname 
   FROM pg_policies 
   WHERE schemaname = 'public';
   ```

4. **애플리케이션 테스트**
   - 로컬에서 개발 서버 실행
   - 모든 기능 테스트
   - 데이터 읽기/쓰기 확인

## 자동화 스크립트

### 전체 마이그레이션 스크립트 (PowerShell)

```powershell
# migrate-supabase.ps1

param(
    [string]$OldProjectRef,
    [string]$NewProjectRef,
    [string]$OldServiceKey,
    [string]$NewServiceKey
)

Write-Host "🚀 Supabase 마이그레이션 시작..." -ForegroundColor Cyan

# 1. 덤프 생성
Write-Host "📦 기존 프로젝트에서 덤프 생성 중..." -ForegroundColor Yellow
supabase link --project-ref $OldProjectRef
supabase db dump > old-project-dump.sql

# 2. 새 프로젝트에 복원
Write-Host "📥 새 프로젝트에 복원 중..." -ForegroundColor Yellow
supabase link --project-ref $NewProjectRef
# 주의: db reset은 모든 데이터를 삭제합니다!
# supabase db reset
# psql 명령으로 SQL 파일 실행 필요

Write-Host "✅ 마이그레이션 완료!" -ForegroundColor Green
Write-Host "⚠️  다음 단계를 수동으로 수행하세요:" -ForegroundColor Yellow
Write-Host "   1. 새 프로젝트 SQL Editor에서 old-project-dump.sql 실행"
Write-Host "   2. Storage 버킷 수동 마이그레이션"
Write-Host "   3. 환경 변수 업데이트"
```

## 주의사항

1. **데이터 손실 방지**
   - 마이그레이션 전 반드시 백업
   - 새 프로젝트에 복원 후 검증 완료 전까지 기존 프로젝트 유지

2. **다운타임**
   - 마이그레이션 중에는 애플리케이션 사용 불가
   - 계획된 다운타임 시간 확보

3. **비용**
   - 두 프로젝트가 동시에 실행되므로 비용 발생
   - 마이그레이션 완료 후 기존 프로젝트 삭제

4. **RLS 정책**
   - RLS 정책이 제대로 복원되지 않으면 데이터 접근 불가
   - 반드시 검증 필요

5. **Storage**
   - Storage 파일은 별도로 마이그레이션 필요
   - 큰 파일의 경우 시간 소요

## 문제 해결

### 문제: 외래 키 제약조건 오류
**해결:** 테이블 생성 순서 조정 또는 제약조건 비활성화 후 재활성화

### 문제: RLS 정책으로 인한 데이터 접근 불가
**해결:** 임시로 RLS 비활성화 후 데이터 복원, 이후 RLS 재활성화

### 문제: Storage 파일 업로드 실패
**해결:** 버킷 정책 확인, 서비스 롤 키 사용

## 체크리스트

- [ ] 기존 프로젝트에서 전체 덤프 생성
- [ ] 새 리전에 프로젝트 생성
- [ ] 스키마 복원
- [ ] 데이터 복원
- [ ] RLS 정책 복원
- [ ] 인덱스 확인
- [ ] Storage 버킷 마이그레이션
- [ ] 환경 변수 업데이트
- [ ] 데이터 검증
- [ ] 애플리케이션 테스트
- [ ] 프로덕션 배포
- [ ] 기존 프로젝트 삭제 (선택사항)

