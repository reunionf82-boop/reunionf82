# SQL Editor에서 직접 복사하여 마이그레이션하기

## 방법: SQL Editor의 "Show definition" 사용

### 단계별 가이드

1. **기존 프로젝트에서 SQL 추출**
   - Supabase 대시보드 → SQL Editor
   - 좌측 테이블 목록에서 각 테이블을 우클릭
   - 또는 Table Editor에서 테이블 선택 후 "Show table definition" 클릭
   - 나타나는 CREATE TABLE 문을 복사

2. **새 프로젝트에 실행**
   - 새 프로젝트의 SQL Editor에서 실행
   - 하나씩 순서대로 실행

## ⚠️ 주의사항

### 1. 실행 순서가 중요합니다

**올바른 순서:**
1. 테이블 생성 (CREATE TABLE)
2. 인덱스 생성 (CREATE INDEX)
3. RLS 정책 생성 (CREATE POLICY)
4. 데이터 삽입 (INSERT)

**잘못된 순서 예시:**
- 외래 키가 있는 테이블을 참조하는 테이블보다 먼저 생성해야 함
- RLS 정책을 테이블 생성 전에 실행하면 오류 발생

### 2. 필수로 함께 실행해야 하는 것들

#### A. RLS 정책
테이블만 생성하면 Security Advisor 에러가 발생합니다.
반드시 RLS 정책도 함께 적용하세요:

```sql
-- 각 테이블마다 RLS 활성화
ALTER TABLE public.table_name ENABLE ROW LEVEL SECURITY;

-- 적절한 정책 생성
CREATE POLICY "policy_name" ON public.table_name ...
```

**간편한 방법:**
- `supabase-rls-policies-simple.sql` 파일을 실행하면 모든 테이블에 RLS 정책이 적용됩니다.

#### B. 인덱스
성능을 위해 인덱스도 함께 생성하세요:

```sql
CREATE INDEX IF NOT EXISTS idx_name ON public.table_name (column_name);
```

#### C. 제약조건
Primary Key, Foreign Key 등도 함께 확인하세요.

### 3. 데이터는 별도로 마이그레이션

**중요:** SQL Editor의 "Show definition"은 **스키마만** 보여줍니다.
데이터는 별도로 마이그레이션해야 합니다:

**방법 A: Table Editor에서 수동 복사**
- 기존 프로젝트 Table Editor에서 데이터 확인
- 새 프로젝트에 수동으로 입력 (소량 데이터인 경우)

**방법 B: SQL 덤프 사용**
```bash
supabase db dump --data-only > data.sql
```

**방법 C: CSV Export/Import**
- 기존 프로젝트에서 CSV로 내보내기
- 새 프로젝트에서 CSV로 가져오기

## 추천 마이그레이션 순서

### 1단계: 스키마 마이그레이션
```
1. contents 테이블 생성
2. app_settings 테이블 생성
3. portal_results 테이블 생성
4. 기타 테이블들 생성
```

### 2단계: 인덱스 및 제약조건
```
1. Primary Key 확인
2. Foreign Key 확인
3. 인덱스 생성
```

### 3단계: RLS 정책 적용
```sql
-- supabase-rls-policies-simple.sql 실행
-- 또는 각 테이블마다 수동으로 정책 생성
```

### 4단계: 데이터 마이그레이션
```
1. 데이터 덤프 또는 수동 복사
2. 새 프로젝트에 데이터 삽입
```

### 5단계: 검증
```sql
-- 테이블 개수 확인
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- 데이터 개수 확인
SELECT 'contents' as table_name, COUNT(*) FROM contents
UNION ALL
SELECT 'app_settings', COUNT(*) FROM app_settings
UNION ALL
SELECT 'portal_results', COUNT(*) FROM portal_results;
```

## 자주 발생하는 오류와 해결

### 오류 1: "relation already exists"
**원인:** 테이블이 이미 존재함
**해결:**
```sql
DROP TABLE IF EXISTS public.table_name CASCADE;
-- 그 다음 CREATE TABLE 실행
```

### 오류 2: "permission denied"
**원인:** RLS 정책이 없거나 잘못 설정됨
**해결:**
```sql
-- RLS 정책 확인 및 수정
SELECT * FROM pg_policies WHERE tablename = 'table_name';
```

### 오류 3: "foreign key constraint"
**원인:** 참조하는 테이블이 아직 생성되지 않음
**해결:** 테이블 생성 순서 조정

## 체크리스트

- [ ] 모든 테이블 CREATE 문 복사 완료
- [ ] 테이블 생성 순서 확인 (외래 키 의존성)
- [ ] 인덱스 생성 확인
- [ ] RLS 정책 적용 (`supabase-rls-policies-simple.sql` 실행)
- [ ] 데이터 마이그레이션 완료
- [ ] Security Advisor 에러 확인 (0개여야 함)
- [ ] 애플리케이션 테스트

## 팁

1. **한 번에 하나씩 실행**
   - 여러 SQL을 한 번에 실행하면 오류 위치 파악이 어려움
   - 하나씩 실행하여 오류 즉시 확인

2. **백업 유지**
   - 새 프로젝트에 데이터 입력 전 백업
   - 문제 발생 시 롤백 가능

3. **환경 변수 업데이트**
   - 마이그레이션 완료 후 `.env.local` 파일 업데이트
   - 새 프로젝트 URL과 키로 변경

