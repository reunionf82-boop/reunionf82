# Cloudways 설정 가이드

## 📋 개요
Vercel의 5분(300초) 제한을 피하기 위해 **프론트엔드는 Vercel, AI 백엔드는 Cloudways**로 분리합니다.
이렇게 하면 시간 제한 없이(10분, 20분도 가능) 긴 점사를 안정적으로 생성할 수 있습니다.

---

## 1단계: Cloudways에 애플리케이션 생성

### ✅ PHP 애플리케이션 선택 (Node.js가 목록에 없는 경우)

**중요**: PHP 애플리케이션을 선택해도 Node.js는 별도로 실행할 수 있습니다!

1. **Cloudways 로그인** 후 상단 **[Applications]** 클릭
2. 우측 상단 **[+ Add Application]** 클릭 → 내 서버 선택
3. **Application Type**에서 **PHP** 선택 (Node.js가 목록에 없는 경우)
4. 이름 입력 (예: `ai-backend`) → **[Add Application]** 클릭
5. 설치 완료까지 대기 (약 2~3분)

**참고**: 
- PHP 애플리케이션을 선택해도 Node.js 서버는 정상 작동합니다
- PHP는 무시하고 Node.js 서버만 사용하면 됩니다
- `/applications/[앱이름]/public_html` 폴더에 Node.js 파일을 업로드하면 됩니다

---

## 2단계: 파일 준비

다음 파일들을 준비하세요:

### 📁 파일 목록
1. `cloudways-server-complete.js` - 완전한 서버 파일 (Supabase Edge Function 로직 포함) ⭐ **이 파일 사용 권장**
2. `cloudways-server.js` - 간단한 버전 (테스트용)
3. `cloudways-package.json` - 패키지 의존성 파일

**⚠️ 중요**: `cloudways-server-complete.js` 파일을 사용하세요. 이 파일은 Supabase Edge Function의 모든 로직을 포함하고 있습니다.

---

## 3단계: Cloudways에 파일 업로드

### FileZilla 사용 (SFTP)

1. **Cloudways 접속 정보 확인**
   - Cloudways → 해당 Application → **[Access Details]** 메뉴
   - **SFTP/SSH** 탭에서 접속 정보 확인:
     - Host: `[서버 IP]`
     - Username: `[사용자명]`
     - Password: `[비밀번호]`
     - Port: `22`

2. **FileZilla 연결**
   - FileZilla 실행
   - 상단에 접속 정보 입력 후 **[빠른 연결]**

3. **파일 업로드**
   - **원격 사이트**: `/applications/[앱이름]/public_html` 폴더로 이동
     - PHP 애플리케이션을 만든 경우에도 같은 경로입니다
   - **로컬 사이트**: 다음 파일들을 업로드:
     - `cloudways-server-complete.js` (또는 `cloudways-server.js`)
     - `cloudways-package.json`
   - 파일을 드래그해서 업로드
   - ⚠️ **주의**: 
     - 기존 `index.html`, `index.php` 등은 삭제해도 됩니다
     - PHP 애플리케이션이어도 Node.js 서버는 정상 작동합니다
     - `cloudways-server-complete.js`를 사용하는 경우, 파일명을 `cloudways-server.js`로 변경하거나 `package.json`의 `main` 필드를 수정하세요

---

## 4단계: 환경 변수 설정 (.env 파일)

클라우드웨이즈 서버에서 Supabase Connection Pooling 등을 사용하려면 `.env` 파일을 설정해야 합니다.

**상세 가이드**: `CLOUDWAYS_SUPABASE_SETUP.md` 파일 참조

### 빠른 설정

1. **SSH 접속** (위 참조)
2. **public_html 폴더로 이동**:
   ```bash
   cd public_html
   ```
3. **.env 파일 생성**:
   ```bash
   nano .env
   ```
4. **환경 변수 추가** (최소 필수 항목):
   ```env
   # Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key

   # Supabase Connection Pooling (필요한 경우)
   SUPABASE_DB_URL=postgresql://postgres.xxx:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require

   # Supabase API (Next.js와 동일)
   NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
5. **파일 저장**: `Ctrl + X` → `Y` → `Enter`
6. **권한 설정**:
   ```bash
   chmod 600 .env
   ```

---

## 5단계: 패키지 설치 (SSH 터미널)

### SSH 접속 방법

**방법 1: Windows PowerShell/CMD 사용 (권장)**

1. **SSH 접속 정보 확인**
   - Cloudways → 해당 Application → **[Access Details]**
   - **[Master Credentials]** 또는 **[SFTP/SSH]** 탭에서 확인:
     - Host/IP: `[서버 IP]`
     - Username: `[사용자명]`
     - Password: `[비밀번호]`

2. **PowerShell 또는 CMD 열기**
   - Windows 키 + R → `powershell` 또는 `cmd` 입력

3. **SSH 접속**
   ```bash
   ssh [사용자명]@[서버 IP]
   ```
   - 비밀번호 입력 (화면에 안 보이는 게 정상, 입력 후 Enter)
   - 첫 접속 시 `yes` 입력

**방법 2: Cloudways 대시보드에서 찾기**
- Cloudways UI가 다를 수 있으니 다음 메뉴 확인:
  - **Applications** → 해당 Application → **[SSH Terminal]** 또는 **[Terminal]**
  - **Access Details** → 하단 **SSH** 버튼
  - **Settings** → **SSH Access**

### 패키지 설치

SSH 접속 후:

1. **public_html 폴더로 이동**
   ```bash
   cd public_html
   ```

2. **파일 확인**
   ```bash
   ls -la
   ```
   - `cloudways-server.js`, `package.json`, `.env` 파일이 보여야 합니다

3. **Node.js 버전 확인**
   ```bash
   node --version
   npm --version
   ```
   - Node.js 18 이상이어야 합니다
   - 없거나 버전이 낮으면:
     ```bash
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
     source ~/.bashrc
     nvm install 18
     nvm use 18
     ```

4. **패키지 설치**
   ```bash
   npm install
   ```
   - `added ... packages` 메시지가 뜨면 성공!

---

## 5단계: 환경 변수 설정 (Gemini API Key)

### 방법 1: .env 파일 생성 (권장)

1. **FileZilla로 .env 파일 업로드**
   - 로컬에 `.env` 파일 생성:
     ```
     GEMINI_API_KEY=여기에_Gemini_API_키_입력
     PORT=3000
     ```
   - `public_html` 폴더에 업로드

2. **또는 SSH 터미널에서 생성**
   ```bash
   cd public_html
   nano .env
   ```
   - 다음 내용 입력:
     ```
     GEMINI_API_KEY=여기에_Gemini_API_키_입력
     PORT=3000
     ```
   - `Ctrl + X` → `Y` → `Enter` (저장)

### 방법 2: 코드에 직접 입력 (테스트용, 비추천)

`cloudways-server.js` 파일의 24번째 줄을 수정:
```javascript
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '여기에_Gemini_API_키를_입력하세요';
```
→ 실제 API 키로 변경

---

## 6단계: 서버 시작 및 확인

### 서버 시작

1. **Cloudways Application Settings**
   - Cloudways → 해당 Application → **[Application Settings]**
   - **[Reset Permissions]** 한 번 클릭 (권한 에러 방지)

2. **Node.js 버전 확인 및 설치 (필요한 경우)**
   - SSH 터미널에서:
     ```bash
     cd public_html
     node --version  # Node.js 버전 확인
     npm --version   # npm 버전 확인
     ```
   - Node.js가 설치되어 있지 않거나 버전이 낮다면:
     ```bash
     # nvm으로 Node.js 설치 (서버 레벨)
     curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
     source ~/.bashrc
     nvm install 18
     nvm use 18
     node --version  # 다시 확인 (v18.x.x 이상이어야 함)
     ```
   - ⚠️ **중요**: Node.js 18 이상이 필요합니다!
   - 서버 실행:
     ```bash
     # 파일명이 cloudways-server-complete.js인 경우
     node cloudways-server-complete.js
     
     # 또는 파일명을 cloudways-server.js로 변경한 경우
     node cloudways-server.js
     
     # 또는 package.json의 start 스크립트 사용
     npm start
     ```
   - 또는 PM2 사용 (백그라운드 실행, 권장):
     ```bash
     npm install -g pm2
     pm2 start cloudways-server-complete.js --name ai-backend
     # 또는
     pm2 start cloudways-server.js --name ai-backend
     pm2 save
     pm2 startup
     ```

3. **서버 주소 확인**
   - Cloudways → 해당 Application → **[Access Details]**
   - **Application URL** 확인:
     - 예: `phpstack-1234.cloudwaysapps.com`
   - ⚠️ **중요**: Node.js는 기본적으로 포트 3000에서 실행됩니다
   - Cloudways의 Application URL은 보통 포트 80/443을 사용하므로, 직접 포트 3000으로 접속해야 할 수 있습니다
   - 또는 Cloudways의 리버스 프록시 설정을 통해 포트 3000을 외부에 노출

4. **포트 확인 및 헬스 체크**
   - SSH 터미널에서 포트 확인:
     ```bash
     netstat -tulpn | grep 3000
     ```
   - 헬스 체크:
     - 방법 1: `http://[서버 IP]:3000/health` (직접 포트 접속)
     - 방법 2: Cloudways 리버스 프록시 설정 후 `https://[Application URL]/health`
   - `{"status":"ok","timestamp":"..."}` 응답이 오면 성공!

---

## 7단계: Vercel 코드 수정

### lib/jeminai.ts 파일 수정

현재 Supabase Edge Function을 호출하는 부분을 Cloudways로 변경:

**수정 전:**
```typescript
const edgeFunctionUrl = `${supabaseUrl}/functions/v1/jeminai`
```

**수정 후:**
```typescript
// Cloudways 서버 URL (환경 변수로 설정)
const cloudwaysUrl = process.env.NEXT_PUBLIC_CLOUDWAYS_URL || 'https://[Application URL]'
const edgeFunctionUrl = `${cloudwaysUrl}/chat`
```

### 환경 변수 추가 (Vercel)

1. **Vercel 대시보드** → 프로젝트 → **[Settings]** → **[Environment Variables]**
2. 다음 변수 추가:
   - `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://[Cloudways Application URL]`
     - 예: `https://phpstack-1234.cloudwaysapps.com`

---

## 8단계: 테스트

1. **개발 서버 재시작**
   ```bash
   npm run dev
   ```

2. **점사 생성 테스트**
   - 긴 점사(소제목 많은 경우)로 테스트
   - 5분 이상 걸려도 중단되지 않는지 확인

---

## 🔧 문제 해결

### 서버가 시작되지 않음
- SSH 터미널에서 에러 로그 확인: `node cloudways-server-complete.js`
- 포트 충돌 확인: `lsof -i :3000` 또는 `netstat -tulpn | grep 3000`
- 권한 문제: `chmod +x cloudways-server-complete.js`
- Node.js 버전 확인: `node --version` (18 이상 필요)
- npm 패키지 설치 확인: `ls node_modules` (폴더가 있어야 함)

### API 키 오류
- `.env` 파일이 `public_html` 폴더에 있는지 확인
- 환경 변수 로드 확인: `console.log(process.env.GEMINI_API_KEY)`

### CORS 오류
- `cloudways-server.js`의 `origin: '*'` 부분을 실제 Vercel 도메인으로 변경:
  ```javascript
  origin: ['https://reunion.fortune82.com']
  ```

### 타임아웃 여전히 발생
- Cloudways 서버의 타임아웃 설정 확인
- `req.setTimeout(1200000)` 값 증가 (20분 → 30분 등)

---

## 📝 체크리스트

- [ ] Cloudways에 Node.js 애플리케이션 생성 완료
- [ ] `cloudways-server-complete.js` 파일 업로드 완료 (또는 `cloudways-server.js`)
- [ ] `cloudways-package.json` 파일 업로드 완료
- [ ] SSH 터미널에서 `npm install` 실행 완료
- [ ] `.env` 파일에 `GEMINI_API_KEY` 설정 완료
- [ ] 서버 시작 및 헬스 체크 성공
- [ ] Vercel 환경 변수에 `NEXT_PUBLIC_CLOUDWAYS_URL` 추가 완료
- [ ] `lib/jeminai.ts` 파일 수정 완료
- [ ] 테스트 완료 (긴 점사 생성 성공)

---

## 💡 추가 팁

### PM2로 백그라운드 실행 (권장)
서버가 항상 실행되도록 PM2 사용:
```bash
npm install -g pm2
pm2 start cloudways-server.js --name ai-backend
pm2 save
pm2 startup  # 서버 재시작 시 자동 실행
```

### 로그 확인
```bash
pm2 logs ai-backend
```

### 서버 재시작
```bash
pm2 restart ai-backend
```

---

## 🎉 완료!

이제 Vercel의 5분 제한 없이 긴 점사를 생성할 수 있습니다!
