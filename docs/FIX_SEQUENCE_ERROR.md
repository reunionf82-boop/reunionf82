# 시퀀스 오류 해결 방법

## 문제
```
ERROR: 42P01: relation "contents_id_seq" does not exist
```

이 오류는 `id` 컬럼이 시퀀스를 참조하지만 시퀀스가 아직 생성되지 않았을 때 발생합니다.

## 해결 방법

### 방법 1: SERIAL 타입 사용 (가장 간단)

CREATE TABLE 문에서 `INTEGER NOT NULL DEFAULT nextval(...)` 대신 `SERIAL`을 사용하세요:

**수정 전:**
```sql
CREATE TABLE contents (
  id INTEGER NOT NULL DEFAULT nextval('contents_id_seq'::regclass),
  ...
);
```

**수정 후:**
```sql
CREATE TABLE contents (
  id SERIAL PRIMARY KEY,
  ...
);
```

또는 PRIMARY KEY가 별도로 있다면:
```sql
CREATE TABLE contents (
  id SERIAL NOT NULL,
  ...
  PRIMARY KEY (id)
);
```

### 방법 2: 시퀀스 먼저 생성

테이블 생성 전에 시퀀스를 먼저 생성:

```sql
CREATE SEQUENCE IF NOT EXISTS contents_id_seq;
CREATE SEQUENCE IF NOT EXISTS app_settings_id_seq;
-- 다른 테이블의 시퀀스도 필요하면 추가
```

그 다음 테이블 생성.

### 방법 3: DEFAULT 제거 후 나중에 시퀀스 생성

1. CREATE TABLE에서 `DEFAULT nextval(...)` 부분 제거:
```sql
CREATE TABLE contents (
  id INTEGER NOT NULL,
  ...
);
```

2. 테이블 생성 후 시퀀스 생성 및 연결:
```sql
CREATE SEQUENCE contents_id_seq;
ALTER TABLE contents ALTER COLUMN id SET DEFAULT nextval('contents_id_seq');
ALTER SEQUENCE contents_id_seq OWNED BY contents.id;
```

## 권장 방법

**가장 간단하고 권장되는 방법:**

각 테이블의 CREATE 문을 다음과 같이 수정:

### contents 테이블
```sql
CREATE TABLE contents (
  id SERIAL PRIMARY KEY,
  role_prompt TEXT,
  restrictions TEXT,
  content_type TEXT,
  content_name TEXT,
  price TEXT,
  introduction TEXT,
  recommendation TEXT,
  menu_subtitle TEXT,
  interpretation_tool TEXT,
  subtitle_char_count INTEGER DEFAULT 500,
  menu_font_size INTEGER DEFAULT 16,
  subtitle_font_size INTEGER DEFAULT 14,
  body_font_size INTEGER DEFAULT 11,
  menu_items JSONB,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now(),
  thumbnail_url TEXT,
  is_new BOOLEAN DEFAULT false,
  summary TEXT,
  tts_speaker TEXT DEFAULT 'nara'::text
);
```

### app_settings 테이블
```sql
CREATE TABLE app_settings (
  id SERIAL PRIMARY KEY,
  selected_model TEXT,
  selected_speaker TEXT,
  updated_at TIMESTAMP DEFAULT now()
);
```

### portal_results 테이블
```sql
CREATE TABLE portal_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  result_id VARCHAR(255) NOT NULL,
  title TEXT,
  content JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
```

## 빠른 수정

현재 오류가 발생한 SQL에서:

1. `id INTEGER NOT NULL DEFAULT nextval('contents_id_seq'::regclass)` 
   → `id SERIAL PRIMARY KEY`로 변경

2. 실행

이렇게 하면 시퀀스가 자동으로 생성됩니다!

