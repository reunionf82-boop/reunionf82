# 클라우드웨이즈 서버 Supabase Connection Pooling 설정 가이드

## 개요

클라우드웨이즈 서버에서 Supabase 데이터베이스에 연결할 때, Connection Pooling을 사용하여 연결 효율성을 높이고 연결 수 제한 문제를 해결할 수 있습니다.

---

## 1단계: Supabase Connection Pooling URL 확인

### Supabase 대시보드에서 Connection Pooling URL 복사

1. **Supabase 대시보드 로그인**
   - https://app.supabase.com 접속
   - 프로젝트 선택

2. **Connection Pooling URL 확인**
   - 왼쪽 메뉴에서 **Settings** (설정) → **Database** 클릭
   - **Connection Pooling** 섹션으로 스크롤
   - **Connection string** 섹션에서 **Session mode** 또는 **Transaction mode** 선택
   - **URI** 형식의 연결 문자열 복사
   - 형식 예시:
     ```
     postgresql://postgres.fdnfeqdrrjtxernozmdi:[YOUR-PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres
     ```
   - 또는 **Connection parameters** 형식:
     ```
     Host: aws-1-ap-northeast-2.pooler.supabase.com
     Port: 5432
     Database: postgres
     User: postgres.fdnfeqdrrjtxernozmdi
     Password: [YOUR-PASSWORD]
     ```

3. **비밀번호 확인**
   - **Database** → **Connection string** 섹션에서
   - 또는 **Settings** → **Database** → **Database password** 섹션
   - 비밀번호를 모르면 **Reset database password** 버튼으로 재설정 가능

---

## 2단계: 클라우드웨이즈 서버에 .env 파일 생성

### SSH 접속

1. **Cloudways → 해당 Application → Access Details**
2. **SSH 접속 정보 확인**:
   - Host/IP
   - Username
   - Password

3. **SSH 접속** (Windows PowerShell/CMD):
   ```bash
   ssh [사용자명]@[서버 IP]
   ```

### .env 파일 생성

1. **public_html 폴더로 이동**:
   ```bash
   cd public_html
   ```

2. **.env 파일 생성/편집**:
   ```bash
   nano .env
   ```
   또는
   ```bash
   vi .env
   ```

3. **환경 변수 추가**:
   ```env
   # Supabase Connection Pooling URL
   SUPABASE_DB_URL=postgresql://postgres.fdnfeqdrrjtxernozmdi:[YOUR-PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require

   # 또는 별도로 분리하여 설정
   SUPABASE_DB_HOST=aws-1-ap-northeast-2.pooler.supabase.com
   SUPABASE_DB_PORT=5432
   SUPABASE_DB_NAME=postgres
   SUPABASE_DB_USER=postgres.fdnfeqdrrjtxernozmdi
   SUPABASE_DB_PASSWORD=[YOUR-PASSWORD]
   SUPABASE_DB_SSL=require

   # Supabase API 설정 (Next.js 프로젝트와 동일)
   NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
   SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]

   # Gemini API Key
   GEMINI_API_KEY=[your-gemini-api-key]
   ```

4. **파일 저장**:
   - `nano` 사용 시: `Ctrl + X` → `Y` → `Enter`
   - `vi` 사용 시: `Esc` → `:wq` → `Enter`

---

## 3단계: .env 파일 권한 설정 (보안)

```bash
# .env 파일 권한을 소유자만 읽을 수 있도록 설정
chmod 600 .env

# 파일 소유자 확인
ls -la .env
```

---

## 4단계: 환경 변수 확인

```bash
# .env 파일 내용 확인 (비밀번호는 마스킹되어 표시)
cat .env | sed 's/:.*@/:****@/g'
```

---

## 5단계: Node.js 서버에서 환경 변수 사용

### cloudways-server.js에서 사용 예시

```javascript
// .env 파일 로드
require('dotenv').config();

// Connection Pooling URL 사용 (pg 라이브러리 사용 시)
const { Client } = require('pg');

const dbClient = new Client({
  connectionString: process.env.SUPABASE_DB_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// 또는 개별 변수 사용
const dbClient = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT,
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: process.env.SUPABASE_DB_SSL === 'require' ? { rejectUnauthorized: false } : false
});

// 연결
await dbClient.connect();
```

### Supabase JS 클라이언트 사용 시 (일반적)

현재 프로젝트는 `@supabase/supabase-js`를 사용하므로, Connection Pooling URL이 필요하지 않습니다.
Supabase JS 클라이언트는 HTTP를 통해 API를 호출하므로 Connection Pooling이 자동으로 처리됩니다.

```javascript
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);
```

---

## Connection Pooling 모드 선택

### Session Mode (권장)
- 각 클라이언트가 독립적인 세션을 유지
- Prepared statements, temporary tables 등 사용 가능
- 일반적인 웹 애플리케이션에 적합

### Transaction Mode
- 연결을 더 효율적으로 재사용
- Prepared statements 사용 불가
- 단순 쿼리에 적합

**권장**: Session Mode를 사용하세요.

---

## 주의사항

1. **비밀번호 보안**
   - `.env` 파일은 절대 Git에 커밋하지 마세요
   - `.gitignore`에 `.env` 추가 확인

2. **SSL 연결**
   - Connection Pooling URL에는 `?sslmode=require` 추가
   - 프로덕션 환경에서는 SSL 연결 필수

3. **연결 제한**
   - Connection Pooling을 사용하면 연결 수 제한 문제 완화
   - Supabase 무료 플랜: 최대 60 동시 연결
   - Connection Pooling 사용 시: 최대 200 동시 연결

4. **환경 변수 확인**
   - 서버 재시작 후 환경 변수가 제대로 로드되는지 확인
   - `console.log(process.env.SUPABASE_DB_URL)` 로 확인

---

## 문제 해결

### 환경 변수가 로드되지 않는 경우

```bash
# .env 파일 위치 확인
pwd
ls -la .env

# dotenv 패키지 설치 확인
npm list dotenv

# dotenv 설치 (없는 경우)
npm install dotenv
```

### 연결 오류 발생 시

1. **비밀번호 확인**
   - Supabase 대시보드에서 비밀번호 재설정
   - `.env` 파일의 비밀번호 업데이트

2. **SSL 설정 확인**
   - `?sslmode=require` 추가 확인
   - 또는 `ssl: { rejectUnauthorized: false }` 설정

3. **방화벽 확인**
   - Cloudways 서버에서 Supabase 서버로의 아웃바운드 연결 허용 확인

---

## 참고 링크

- [Supabase Connection Pooling 문서](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Supabase Database 설정](https://app.supabase.com/project/_/settings/database)
