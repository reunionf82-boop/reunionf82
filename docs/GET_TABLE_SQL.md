# 테이블 SQL 추출 방법

## 가장 간단한 방법: SQL Editor 사용

### 1. SQL Editor 열기
- 좌측 메뉴: **SQL Editor** (코드 아이콘) 클릭
- **"New query"** 클릭

### 2. 테이블별로 SQL 생성

각 테이블마다 다음 SQL을 실행하세요:

#### app_settings 테이블
```sql
SELECT 
  'CREATE TABLE app_settings (' || 
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
WHERE table_schema = 'public' AND table_name = 'app_settings'
GROUP BY table_name;
```

#### contents 테이블
```sql
SELECT 
  'CREATE TABLE contents (' || 
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

#### portal_results 테이블
```sql
SELECT 
  'CREATE TABLE portal_results (' || 
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
WHERE table_schema = 'public' AND table_name = 'portal_results'
GROUP BY table_name;
```

### 3. 결과 복사
- 쿼리 실행 후 결과 테이블의 `create_table_sql` 컬럼 값을 복사
- 새 프로젝트 SQL Editor에 붙여넣기 → 실행

## 더 정확한 방법: pg_dump 스타일

모든 테이블을 한 번에 가져오려면:

```sql
SELECT 
  'CREATE TABLE IF NOT EXISTS ' || table_name || ' (' || 
  string_agg(
    column_name || ' ' || 
    pg_catalog.format_type(atttypid, atttypmod) ||
    CASE WHEN attnotnull THEN ' NOT NULL' ELSE '' END ||
    COALESCE(' DEFAULT ' || pg_get_expr(adbin, adrelid), ''),
    ', '
  ) || ');' as create_table_sql
FROM information_schema.columns c
JOIN pg_attribute a ON a.attname = c.column_name
JOIN pg_class cl ON cl.relname = c.table_name
LEFT JOIN pg_attrdef ad ON ad.adrelid = cl.oid AND ad.adnum = a.attnum
WHERE c.table_schema = 'public' 
  AND c.table_name IN ('app_settings', 'contents', 'portal_results')
GROUP BY c.table_name
ORDER BY c.table_name;
```

## Table Editor에서 직접 확인

Table Editor에서 테이블 구조를 보고 수동으로 작성할 수도 있습니다:

1. **Table Editor** 열기
2. 테이블 선택 (예: `app_settings`)
3. 컬럼 정보 확인:
   - 컬럼명
   - 데이터 타입
   - NULL 허용 여부
   - 기본값
4. CREATE TABLE 문 수동 작성

## 팁

- SQL 결과가 길면 Export 버튼으로 CSV 다운로드 가능
- 복사할 때 따옴표가 포함되어 있으면 제거하고 복사









