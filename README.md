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
NEXT_PUBLIC_JEMINAI_API_URL=your_gemini_api_key
NAVER_CLOVA_CLIENT_ID=your_naver_clova_client_id
NAVER_CLOVA_CLIENT_SECRET=your_naver_clova_client_secret

# 포털 연동 설정 (선택사항)
PORTAL_API_URL=https://portal.example.com
PORTAL_API_KEY=your_portal_api_key
PORTAL_SECRET_KEY=your_portal_secret_key
JWT_SECRET=your_jwt_secret_key
NEXT_PUBLIC_BASE_URL=https://subdomain.example.com
```

**환경 변수 설명:**
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase 프로젝트 URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase 익명 키
- `NEXT_PUBLIC_JEMINAI_API_URL`: Google Gemini API 키
- `NAVER_CLOVA_CLIENT_ID`: 네이버 클라우드 플랫폼 Clova Voice Client ID
- `NAVER_CLOVA_CLIENT_SECRET`: 네이버 클라우드 플랫폼 Clova Voice Client Secret
- `PORTAL_API_URL`: 포털 API URL (포털 연동 시 필요)
- `PORTAL_API_KEY`: 포털 API 키 (포털 연동 시 필요)
- `PORTAL_SECRET_KEY`: 포털 HMAC 서명용 비밀 키 (포털 연동 시 필요)
- `JWT_SECRET`: JWT 토큰 검증용 비밀 키 (포털 연동 시 필요)
- `NEXT_PUBLIC_BASE_URL`: 서브 도메인 기본 URL (포털 연동 시 필요)

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
  detail_menu_char_count INTEGER DEFAULT 500,
  menu_font_size INTEGER DEFAULT 16,
  menu_font_bold BOOLEAN DEFAULT false,
  subtitle_font_size INTEGER DEFAULT 14,
  subtitle_font_bold BOOLEAN DEFAULT false,
  detail_menu_font_size INTEGER DEFAULT 12,
  detail_menu_font_bold BOOLEAN DEFAULT false,
  body_font_size INTEGER DEFAULT 11,
  body_font_bold BOOLEAN DEFAULT false,
  menu_items JSONB,
  is_new BOOLEAN DEFAULT false,
  tts_speaker TEXT DEFAULT 'nara',
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
ALTER TABLE contents ADD COLUMN IF NOT EXISTS detail_menu_char_count INTEGER DEFAULT 500;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_font_size INTEGER DEFAULT 16;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_font_bold BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS subtitle_font_size INTEGER DEFAULT 14;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS subtitle_font_bold BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS detail_menu_font_size INTEGER DEFAULT 12;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS detail_menu_font_bold BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS body_font_size INTEGER DEFAULT 11;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS body_font_bold BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS menu_items JSONB;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_new BOOLEAN DEFAULT false;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS tts_speaker TEXT DEFAULT 'nara';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE contents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();
```

**모델 설정 테이블 생성:**

```sql
-- app_settings 테이블 생성 (모델 설정 저장용)
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  selected_model TEXT DEFAULT 'gemini-2.5-flash',
  selected_speaker TEXT DEFAULT 'nara',
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 초기 레코드 삽입 (없는 경우만)
INSERT INTO app_settings (id, selected_model, selected_speaker, updated_at)
VALUES (1, 'gemini-2.5-flash', 'nara', NOW())
ON CONFLICT (id) DO NOTHING;

-- 기존 테이블에 selected_speaker 컬럼 추가 (이미 존재하는 경우 자동으로 건너뜀)
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS selected_speaker TEXT DEFAULT 'nara';

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
- ✅ 관리자 페이지 (컨텐츠 관리)
- ✅ AI 기반 점사 결과 생성 (Google Gemini)
- ✅ 텍스트-음성 변환 (Naver Clova Voice)
- ✅ 포털 연동 지원 (JWT 토큰 + HMAC 서명)

## 포털 연동

포털 사이트에서 2차 도메인으로 서브 페이지를 연동할 수 있습니다.

### 연동 가이드

자세한 연동 가이드는 [`docs/PORTAL_INTEGRATION_GUIDE.md`](./docs/PORTAL_INTEGRATION_GUIDE.md)를 참고하세요.

### 주요 기능

1. **사용자 정보 자동 입력**: 포털로부터 JWT 토큰을 받아 사용자 정보를 자동으로 채웁니다.
2. **결제 연동**: 결제 요청을 포털로 전송하고, 결제 완료 후 콜백을 받습니다.
3. **보안**: JWT 토큰 검증 및 HMAC 서명을 통한 요청 검증

### 연동 방식

- **JWT 토큰**: 사용자 정보 전달 (만료 시간 5분)
- **HMAC 서명**: 모든 API 요청 검증
- **웹훅 콜백**: 결제 완료 후 포털로부터 알림 수신

## 라이선스

Copyrights © 2022 All Rights Reserved by Techenjoy Inc.
