# ReunionF82 - Fortune82 클론 사이트

Fortune82의 궁합/애정 페이지를 클론한 Next.js 프로젝트입니다.

## 기술 스택

- **Next.js 14** - React 프레임워크
- **Supabase** - 백엔드 및 데이터베이스
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 스타일링

## 설정 방법

### 1. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 변수를 설정하세요:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Supabase 데이터베이스 설정

Supabase에서 다음 테이블을 생성하세요:

```sql
CREATE TABLE contents (
  id SERIAL PRIMARY KEY,
  role_prompt TEXT,
  restrictions TEXT,
  content_type TEXT CHECK (content_type IN ('saju', 'gonghap')),
  content_name TEXT,
  thumbnail_url TEXT,
  price TEXT,
  summary TEXT,
  introduction TEXT,
  recommendation TEXT,
  menu_subtitle TEXT,
  interpretation_tool TEXT,
  subtitle_char_count INTEGER DEFAULT 500,
  menu_font_size INTEGER DEFAULT 16,
  subtitle_font_size INTEGER DEFAULT 14,
  body_font_size INTEGER DEFAULT 11,
  menu_items JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- RLS 활성화
ALTER TABLE contents ENABLE ROW LEVEL SECURITY;

-- RLS 정책 설정 (모든 사용자가 읽기/쓰기 가능)
CREATE POLICY "Allow public read access"
ON contents FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public insert access"
ON contents FOR INSERT
TO public
WITH CHECK (true);

CREATE POLICY "Allow public update access"
ON contents FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public delete access"
ON contents FOR DELETE
TO public
USING (true);
```

**중요: 기존 테이블이 있는 경우, 누락된 컬럼을 추가하세요:**

```sql
-- 누락된 컬럼 추가 (이미 존재하는 컬럼은 자동으로 건너뜀)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS role_prompt TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS restrictions TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_type TEXT CHECK (content_type IN ('saju', 'gonghap'));
ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_name TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS price TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS introduction TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_subtitle TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS interpretation_tool TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS subtitle_char_count INTEGER DEFAULT 500;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_font_size INTEGER DEFAULT 16;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS subtitle_font_size INTEGER DEFAULT 14;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS body_font_size INTEGER DEFAULT 11;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_items JSONB;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE contents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
```

**모델 설정 테이블 생성:**

```sql
-- app_settings 테이블 생성 (모델 설정 저장용)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  selected_model TEXT DEFAULT 'gemini-2.5-flash',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 초기 레코드 삽입 (없는 경우만)
INSERT INTO app_settings (id, selected_model, updated_at)
VALUES (1, 'gemini-2.5-flash', NOW())
ON CONFLICT (id) DO NOTHING;

-- RLS 활성화
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLS 정책 설정 (모든 사용자가 읽기/쓰기 가능)
CREATE POLICY "Allow public read access"
ON app_settings FOR SELECT
TO public
USING (true);

CREATE POLICY "Allow public update access"
ON app_settings FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow public insert access"
ON app_settings FOR INSERT
TO public
WITH CHECK (true);
```

### 3. Supabase Storage 설정

1. Supabase 대시보드에서 Storage로 이동
2. `thumbnails` 버킷 생성
3. Public 액세스 권한 설정
4. **Storage 정책 설정 (필수)**

Storage → `thumbnails` 버킷 → Policies에서 다음 정책들을 추가하세요:

**업로드 정책 (INSERT):**
```sql
CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'thumbnails');
```

**읽기 정책 (SELECT):**
```sql
CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');
```

**삭제 정책 (DELETE):**
```sql
CREATE POLICY "Allow public deletes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'thumbnails');
```

또는 SQL Editor에서 다음 스크립트를 실행하세요:

```sql
-- thumbnails 버킷 정책 설정
CREATE POLICY "Allow public uploads"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'thumbnails');

CREATE POLICY "Allow public reads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'thumbnails');

CREATE POLICY "Allow public deletes"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'thumbnails');
```
- **TypeScript** - 타입 안정성
- **Tailwind CSS** - 유틸리티 기반 CSS
- **App Router** - Next.js 최신 라우팅 시스템

## 시작하기

### 설치

```bash
npm install
```

### 개발 서버 실행

```bash
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 열어 확인하세요.

### 빌드

```bash
npm run build
```

### 프로덕션 실행

```bash
npm start
```

## 프로젝트 구조

```
reunionf82/
├── app/
│   ├── layout.tsx      # 루트 레이아웃
│   ├── page.tsx        # 메인 페이지
│   └── globals.css     # 전역 스타일
├── components/
│   ├── Header.tsx      # 헤더 컴포넌트
│   └── ServiceCard.tsx # 서비스 카드 컴포넌트
├── data/
│   └── services.ts     # 서비스 데이터
└── package.json
```

## 기능

- ✅ 반응형 디자인
- ✅ SEO 최적화
- ✅ 서비스 카드 그리드 레이아웃
- ✅ 헤더 네비게이션
- ✅ 무료/유료 서비스 구분

## 라이선스

Copyrights © 2022 All Rights Reserved by Techenjoy Inc.
