# Supabase 테이블 SQL 추출 가이드

## 방법 1: Supabase 대시보드에서 직접 추출 (권장)

### 단계별 가이드

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard 접속
   - 프로젝트 선택

2. **SQL Editor 사용**
   - 좌측 메뉴에서 "SQL Editor" 클릭
   - "New query" 클릭

3. **테이블 정의 조회**
   ```sql
   -- 모든 테이블 목록 조회
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
     AND table_type = 'BASE TABLE'
   ORDER BY table_name;

   -- 특정 테이블의 구조 조회
   SELECT 
     column_name,
     data_type,
     character_maximum_length,
     is_nullable,
     column_default
   FROM information_schema.columns
   WHERE table_schema = 'public' 
     AND table_name = 'contents'
   ORDER BY ordinal_position;

   -- 테이블의 인덱스 조회
   SELECT
     indexname,
     indexdef
   FROM pg_indexes
   WHERE schemaname = 'public' 
     AND tablename = 'contents';

   -- RLS 정책 조회
   SELECT
     policyname,
     permissive,
     roles,
     cmd,
     qual,
     with_check
   FROM pg_policies
   WHERE schemaname = 'public' 
     AND tablename = 'contents';
   ```

4. **결과 복사 방법**
   - **방법 A: Export 탭 사용 (권장)**
     - SQL Editor에서 쿼리 실행 후 상단의 "Export" 탭 클릭
     - CSV 또는 JSON 형식으로 다운로드 가능
     - CSV로 다운로드하면 텍스트 에디터에서 열어서 SQL 추출 가능
   
   - **방법 B: 전체 결과 선택 후 복사**
     - 결과 테이블에서 첫 번째 셀 클릭
     - Ctrl+A (전체 선택) 또는 마우스로 전체 드래그
     - Ctrl+C로 복사
     - 텍스트 에디터에 붙여넣기
   
   - **방법 C: 개별 셀 복사 (비권장)**
     - 각 셀을 마우스 오른쪽 클릭 → "Copy cell content"
     - 여러 테이블이 있으면 반복 작업 필요

5. **Table Editor에서 확인 (더 간단한 방법)**
   - 좌측 메뉴에서 "Table Editor" 클릭
   - 각 테이블을 선택하면 우측에 "Show table definition" 버튼이 있습니다
   - 클릭하면 CREATE TABLE 문이 표시됩니다
   - 이 방법이 가장 정확하고 완전한 SQL을 제공합니다

## 방법 2: Supabase CLI 사용

### 설치
```bash
npm install -g supabase
```

### 로그인 및 프로젝트 연결
```bash
supabase login
supabase link --project-ref your-project-ref
```

### SQL 추출
```bash
# 모든 테이블 구조 추출
supabase db dump --schema public > supabase-schema.sql

# 특정 테이블만 추출
supabase db dump --schema public --table contents > contents-table.sql
```

## 방법 3: pg_dump 사용 (로컬에서)

### 연결 정보 확인
- Supabase 대시보드 → Settings → Database
- Connection string 확인

### pg_dump 실행
```bash
pg_dump -h db.your-project.supabase.co \
        -U postgres \
        -d postgres \
        -n public \
        --schema-only \
        > supabase-schema.sql
```

## 리전 변경 방법

### 1. Supabase 대시보드에서 변경
1. Settings → General → Region
2. 원하는 리전 선택
3. 주의: 리전 변경 시 데이터베이스가 재생성될 수 있으므로 백업 필수

### 2. 새 프로젝트 생성 후 마이그레이션
1. 새 리전에 프로젝트 생성
2. 기존 프로젝트에서 SQL 추출 (위 방법 사용)
3. 새 프로젝트에 SQL 실행

## 현재 프로젝트에서 사용 중인 테이블

코드베이스를 확인한 결과, 다음 테이블들이 사용되고 있습니다:

- `contents` - 컨텐츠 정보
- `app_settings` - 앱 설정
- `portal_results` - 포털 결과 저장 (이전에 생성했던 테이블)

## SQL 파일 생성 후 작업

1. 생성된 SQL 파일을 확인
2. 리전 변경 시 새 프로젝트에 SQL 실행
3. 환경 변수 업데이트:
   - `.env.local` 파일에서 `NEXT_PUBLIC_SUPABASE_URL` 업데이트
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` 업데이트

## 주의사항

- 리전 변경은 데이터베이스 재생성과 동일하므로 **모든 데이터가 삭제**됩니다
- 반드시 **백업**을 먼저 수행하세요
- RLS 정책도 함께 마이그레이션해야 합니다
- Storage 버킷도 별도로 마이그레이션해야 합니다

