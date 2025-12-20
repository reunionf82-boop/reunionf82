# Cloudways 빠른 시작 가이드 (PHP 애플리케이션 선택한 경우)

## ✅ PHP 애플리케이션 선택해도 됩니다!

PHP 애플리케이션을 선택하셔도 Node.js는 별도로 실행할 수 있습니다.

---

## 📝 필요한 정보 (Cloudways에서 확인)

설정 전에 다음 정보를 Cloudways에서 확인하세요:

1. **Application URL**
   - Cloudways → 해당 Application → **[Access Details]**
   - 예: `phpstack-1234.cloudwaysapps.com`

2. **SFTP 접속 정보**
   - Cloudways → 해당 Application → **[Access Details]** → **[SFTP/SSH]** 탭
   - Host: `[서버 IP]`
   - Username: `[사용자명]`
   - Password: `[비밀번호]`
   - Port: `22`

3. **SSH 접속 정보**
   - Master Credentials 확인
   - User: `[사용자명]`
   - Password: `[비밀번호]`

---

## 🚀 빠른 설정 (5단계)

### 1️⃣ 파일 업로드 (FileZilla)

1. FileZilla로 Cloudways 서버에 연결
2. `/applications/[앱이름]/public_html` 폴더로 이동
3. 다음 파일 업로드:
   - `cloudways-server-complete.js` (또는 `cloudways-server.js`)
   - `cloudways-package.json`

### 2️⃣ 패키지 설치 (SSH 터미널)

```bash
cd public_html
npm install
```

### 3️⃣ 환경 변수 설정 (.env 파일)

SSH 터미널에서:
```bash
cd public_html
nano .env
```

다음 내용 입력:
```
GEMINI_API_KEY=여기에_Gemini_API_키_입력
PORT=3000
```

저장: `Ctrl + X` → `Y` → `Enter`

### 4️⃣ 서버 시작 (PM2 권장)

```bash
cd public_html
npm install -g pm2
pm2 start cloudways-server-complete.js --name ai-backend
pm2 save
pm2 startup
```

### 5️⃣ Vercel 코드 수정

`lib/jeminai.ts` 파일의 91번째 줄 수정:

**수정 전:**
```typescript
const edgeFunctionUrl = `${supabaseUrl}/functions/v1/jeminai`
```

**수정 후:**
```typescript
// Cloudways 서버 사용
const cloudwaysUrl = process.env.NEXT_PUBLIC_CLOUDWAYS_URL || ''
const edgeFunctionUrl = cloudwaysUrl ? `${cloudwaysUrl}/chat` : `${supabaseUrl}/functions/v1/jeminai`
```

Vercel 환경 변수 추가:
- `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://[Application URL]`
  - 예: `https://phpstack-1234.cloudwaysapps.com`

---

## 🔍 확인 사항

### 서버가 실행 중인지 확인
```bash
pm2 list
pm2 logs ai-backend
```

### 헬스 체크
브라우저에서 접속:
- `http://[서버 IP]:3000/health`
- 또는 `https://[Application URL]:3000/health`

응답: `{"status":"ok","timestamp":"..."}`

---

## ⚠️ 주의사항

1. **포트 3000 접속**: Cloudways의 Application URL은 보통 포트 80/443을 사용하므로, Node.js 서버(포트 3000)에 직접 접속해야 할 수 있습니다.

2. **방화벽 설정**: Cloudways에서 포트 3000이 열려있는지 확인하세요.

3. **PM2 자동 시작**: `pm2 startup` 명령어를 실행하면 서버 재시작 시 자동으로 Node.js 서버가 시작됩니다.

---

## 🆘 문제 해결

### Node.js가 설치되지 않음
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

### 포트 3000 접속 불가
- Cloudways 방화벽 설정 확인
- 또는 Cloudways 리버스 프록시 설정 (포트 3000을 외부에 노출)

### 서버가 시작되지 않음
```bash
cd public_html
node cloudways-server-complete.js
# 에러 메시지 확인
```

---

## ✅ 완료!

이제 Vercel의 5분 제한 없이 긴 점사를 생성할 수 있습니다!
