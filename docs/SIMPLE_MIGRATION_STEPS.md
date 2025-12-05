# 간단한 Supabase 마이그레이션 가이드 (CLI 없이)

## 단계별 가이드

### 1단계: 기존 프로젝트에서 SQL 추출

1. **기존 Supabase 프로젝트 대시보드 접속**
   - https://supabase.com/dashboard
   - 기존 프로젝트 선택

2. **각 테이블의 SQL 추출**

   **방법 A: SQL Editor에서 직접 조회 (권장)**
   - 좌측 메뉴: **SQL Editor** 클릭
   - **"New query"** 클릭
   - 다음 SQL 실행:
   ```sql
   SELECT 
     'CREATE TABLE ' || table_name || ' (' || 
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
     ) || ');' as create_table_sql
   FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'contents'
   GROUP BY table_name;
   ```
   - `table_name = 'contents'` 부분을 각 테이블명으로 변경하여 실행
   - 결과를 복사

   **방법 B: Table Editor에서 확인**
   - 좌측 메뉴: **Table Editor** 클릭
   - 각 테이블 선택 (예: `contents`, `app_settings`, `portal_results`)
   - 테이블 구조를 보고 수동으로 CREATE TABLE 문 작성
   - 또는 테이블 이름 우클릭 → 메뉴에서 "View definition" 또는 유사한 옵션 확인

3. **RLS 정책 확인** (선택사항)
   - SQL Editor에서 다음 쿼리 실행:
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
     END || ';' as policy_sql
   FROM pg_policies
   WHERE schemaname = 'public'
   ORDER BY tablename, policyname;
   ```
   - 결과를 복사해 두기

### 2단계: 새 프로젝트 생성

1. **Supabase 대시보드 접속**
   - https://supabase.com/dashboard
   - **"New Project"** 클릭
   - 원하는 리전 선택
   - 프로젝트 생성 (약 2분 소요)

### 3단계: 새 프로젝트에 테이블 생성

1. **새 프로젝트의 SQL Editor 접속**
   - 좌측 메뉴: **SQL Editor** 클릭
   - **"New query"** 클릭

2. **테이블 생성**
   - 1단계에서 복사한 각 테이블의 CREATE TABLE 문을 붙여넣기
   - 하나씩 실행 (Run 버튼 또는 Ctrl+Enter)
   - 순서: `contents` → `app_settings` → `portal_results`

### 4단계: RLS 정책 적용

1. **RLS 정책 SQL 실행**
   - SQL Editor에서 `supabase-rls-policies-simple.sql` 파일 내용을 복사
   - 붙여넣기 후 실행

   또는

   - 1단계에서 추출한 RLS 정책 SQL 실행

2. **확인**
   - Security Advisor에서 에러가 사라졌는지 확인
   - 좌측 메뉴: **Database** → **Security Advisor**

### 5단계: 데이터 마이그레이션 (있는 경우)

**소량 데이터인 경우:**
- 기존 프로젝트 Table Editor에서 데이터 확인
- 새 프로젝트 Table Editor에서 수동으로 입력

**대량 데이터인 경우:**
- 기존 프로젝트에서 CSV로 내보내기
- 새 프로젝트에서 CSV로 가져오기

### 6단계: 환경 변수 업데이트

`.env.local` 파일 수정:

```env
NEXT_PUBLIC_SUPABASE_URL=https://새-프로젝트-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=새-프로젝트-키
```

**참조 ID 확인:**
- Supabase 대시보드 → Settings → General → Reference ID

### 7단계: 테스트

```bash
npm run dev
```

애플리케이션이 정상 작동하는지 확인하세요.

## 체크리스트

- [ ] 기존 프로젝트에서 모든 테이블 CREATE 문 복사
- [ ] 새 프로젝트 생성
- [ ] 새 프로젝트에 테이블 생성
- [ ] RLS 정책 적용 (`supabase-rls-policies-simple.sql`)
- [ ] Security Advisor 확인 (에러 0개)
- [ ] 데이터 마이그레이션 (있는 경우)
- [ ] 환경 변수 업데이트
- [ ] 애플리케이션 테스트

## 문제 해결

### 테이블 생성 오류
- 외래 키가 있는 경우 참조되는 테이블을 먼저 생성
- 오류 메시지 확인 후 순서 조정

### RLS 정책 오류
- `supabase-rls-policies-simple.sql` 파일을 다시 확인
- 각 테이블에 RLS가 활성화되었는지 확인:
  ```sql
  SELECT tablename, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public';
  ```

## 완료!

이제 새 리전의 Supabase 프로젝트가 준비되었습니다! 🎉

