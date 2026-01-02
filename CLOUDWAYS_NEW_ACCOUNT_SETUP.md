# 클라우드웨이즈 새 계정 설정 가이드

## 📋 개요

클라우드웨이즈 새 계정에서 Node.js 서버를 설정하는 완전한 가이드입니다.

---

## 1단계: 필수 정보 확인

Cloudways 대시보드에서 다음 정보를 확인하세요:

### Cloudways 대시보드 확인

1. **Application URL 확인**
   - Cloudways → 해당 Application → **[Access Details]**
   - **Application URL**: `phpstack-1569797-6109694.cloudwaysapps.com` ✅
   - 또는 대시보드에서 확인한 실제 URL을 사용하세요

2. **SFTP/SSH 접속 정보 확인**
   - Cloudways → 해당 Application → **[Access Details]** → **[SFTP/SSH]** 탭
   - **Host**: `[서버 IP 주소]`
   - **Username**: `[사용자명]`
   - **Password**: `[비밀번호]`
   - **Port**: `22`

3. **Master Credentials 확인**
   - Cloudways → 해당 Application → **[Access Details]** → **[Master Credentials]**
   - **User**: `[사용자명]`
   - **Password**: `[비밀번호]`

---

## 2단계: 파일 업로드 (FileZilla)

### 1. FileZilla 연결

1. **FileZilla 실행**
2. **상단 접속 정보 입력**:
   - Host: `[서버 IP]` (위에서 확인한 Host)
   - Username: `[사용자명]`
   - Password: `[비밀번호]`
   - Port: `22`
3. **[빠른 연결]** 클릭

### 2. 파일 업로드

1. **원격 사이트**: `/applications/[애플리케이션명]/public_html` 폴더로 이동
2. **로컬 사이트**: 다음 파일들을 업로드:
   - `cloudways-server.js` ⭐ (또는 `cloudways-server-complete.js`)
   - `cloudways-package.json` (업로드 후 파일명을 `package.json`으로 변경)
3. 파일을 드래그해서 업로드

**중요**: 
- `cloudways-server.js` 파일명이 맞는지 확인하세요
- `cloudways-package.json`을 업로드한 후, 서버에서 파일명을 `package.json`으로 변경해야 합니다
- `package-lock.json`은 업로드할 필요 없습니다 (npm install 시 자동 생성됨)

---

## 3단계: 패키지 설치 (SSH 터미널)

### SSH 접속

**Windows PowerShell/CMD**:
```bash
ssh [사용자명]@[서버 IP]
```
- 비밀번호 입력 (화면에 안 보이는 게 정상)
- 첫 접속 시 `yes` 입력

**또는 Cloudways 대시보드**:
- Cloudways → 해당 Application → **[SSH Terminal]** 또는 **[Terminal]**

### 패키지 설치

```bash
# 1. public_html 폴더로 이동
cd public_html

# 2. 파일명 변경 (필요한 경우)
# cloudways-package.json을 package.json으로 변경
mv cloudways-package.json package.json

# 3. 파일 확인
ls -la
# cloudways-server.js, package.json 파일이 보여야 함

# 3. Node.js 버전 확인
node --version
# Node.js 18 이상이어야 함

# 4. npm 확인
npm --version
# npm이 없으면 아래 단계 진행

# 5. npm이 없는 경우: nvm으로 Node.js 재설치 (npm 포함)
# npm: command not found 오류가 발생하면 실행
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18 --reinstall-packages-from=18
# 또는 기존 버전 삭제 후 재설치
# nvm uninstall 18
# nvm install 18
nvm use 18
nvm alias default 18

# 6. 설치 확인
node --version
npm --version

# 7. 패키지 설치
npm install
# "added ... packages" 메시지가 뜨면 성공!
```

---

## 4단계: 환경 변수 설정 (.env 파일)

### .env 파일 생성

```bash
# public_html 폴더에서
cd public_html
nano .env
```

### 환경 변수 입력

다음 내용을 입력하세요 (각 값은 실제 값으로 변경):

```env
# Gemini API Key (필수)
GEMINI_API_KEY=your_gemini_api_key_here

# 포트 (기본값: 3000)
PORT=3000

# Supabase Connection Pooling (필요한 경우)
# Supabase 대시보드 → Settings → Database → Connection Pooling에서 확인
SUPABASE_DB_URL=postgresql://postgres.xxx:[PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require

# Supabase API (Next.js와 동일)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

### 파일 저장

- `Ctrl + X` → `Y` → `Enter`

### 권한 설정 (보안)

```bash
chmod 600 .env
ls -la .env  # 권한 확인
```

---

## 5단계: 서버 시작 (PM2)

### PM2 설치 및 시작

```bash
# public_html 폴더에서
cd public_html

# PM2 설치 (전역)
npm install -g pm2

# 서버 시작
pm2 start cloudways-server.js --name ai-backend

# PM2 상태 확인
pm2 list

# 로그 확인
pm2 logs ai-backend

# PM2 자동 시작 설정 (서버 재시작 시 자동 시작)
pm2 save
pm2 startup
# 출력되는 명령어를 복사해서 실행 (sudo 권한 필요할 수 있음)
```

### 서버 상태 확인

```bash
# 서버가 실행 중인지 확인
pm2 list
# ai-backend가 online 상태여야 함

# 헬스 체크 (서버 내부에서)
curl http://localhost:3000/health
# 응답: {"status":"ok","timestamp":"..."} 이면 성공!
```

---

## 6단계: Cloudways 지원팀에 문의

### 지원팀 문의 내용

Cloudways 지원팀에 다음 내용으로 문의하세요:

**제목**: Node.js 서버 리버스 프록시 설정 요청

**본문**:

```
안녕하세요.

포트 3000에서 실행 중인 Node.js 서버를 Application URL의 특정 경로로 프록시 설정을 요청드립니다.

### 현재 상황
- Application URL: `phpstack-1569797-6109694.cloudwaysapps.com`
- Node.js 서버: 포트 3000에서 실행 중 (http://localhost:3000)
- 서버 상태: 정상 작동 확인 (헬스 체크 성공)

### 요청 사항
다음 경로를 포트 3000의 Node.js 서버로 프록시 설정을 요청드립니다:

- `https://phpstack-1569797-6109694.cloudwaysapps.com/chat` → `http://localhost:3000/chat`

### 필요한 설정
- 프록시 타임아웃: 1800초 (30분) - 긴 AI 생성 작업을 위해 필요
- 스트리밍 지원: Server-Sent Events (SSE) 스트리밍 응답 지원 필요
- 헤더 전달: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto 헤더 전달

### 참고 사항
- Node.js 서버는 이미 포트 3000에서 실행 중입니다
- 서버 내부에서 curl http://localhost:3000/health 테스트 성공
- HTTPS 페이지에서 HTTP 서버 접근 시 Mixed Content 오류가 발생하여 프록시 설정이 필요합니다

### 예상 Nginx 설정
location /chat {
    proxy_pass http://localhost:3000/chat;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;
}

설정 완료 후 알려주시면 테스트하겠습니다.

감사합니다.
```

### 지원팀 문의 방법

1. **Cloudways 대시보드**
   - 우측 상단 **Support** 또는 **Help** 클릭
   - **New Ticket** 또는 **Create Ticket** 클릭
   - 위 내용을 복사해서 붙여넣기

2. **또는 이메일**
   - Cloudways 지원 이메일로 전송

---

## 7단계: Vercel 환경 변수 설정

프록시 설정이 완료되면 Vercel 환경 변수를 설정하세요.

### Vercel 대시보드

1. **Vercel 대시보드** → 프로젝트 선택
2. **Settings** → **Environment Variables**
3. 다음 변수 추가:

```
변수명: NEXT_PUBLIC_CLOUDWAYS_URL
값: https://phpstack-1569797-6109694.cloudwaysapps.com
```

4. **Save** 클릭
5. **Deployments** → **Redeploy** (환경 변수 반영)

---

## 8단계: 테스트

### 1. 헬스 체크 테스트

브라우저 또는 curl로 테스트:

```bash
# SSH 터미널에서 (서버 내부)
curl http://localhost:3000/health

# 로컬 컴퓨터에서 (프록시 설정 후)
curl https://phpstack-1569797-6109694.cloudwaysapps.com/chat
# 또는 브라우저에서 접속
```

### 2. 실제 애플리케이션 테스트

1. **Vercel 애플리케이션 재배포** (환경 변수 반영)
2. **점사 생성 기능 테스트**
3. **브라우저 개발자 도구** (F12) → **Network 탭** 확인
   - `/chat` 요청이 성공하는지 확인
   - 응답이 정상적으로 오는지 확인

---

## 🔍 문제 해결

### 서버가 시작되지 않음

```bash
# 직접 실행해서 에러 확인
cd public_html
node cloudways-server.js
# 에러 메시지 확인

# PM2 로그 확인
pm2 logs ai-backend --lines 50
```

### 환경 변수가 로드되지 않음

```bash
# .env 파일 확인
cd public_html
cat .env
# 비밀번호는 마스킹되어 표시: sed 's/:.*@/:****@/g' .env

# dotenv 패키지 확인
npm list dotenv

# dotenv 설치 (없는 경우)
npm install dotenv
```

### 포트 3000이 이미 사용 중

```bash
# 포트 3000 사용 중인 프로세스 확인
lsof -i :3000
# 또는
netstat -tulpn | grep 3000

# 프로세스 종료
kill [PID]
# 또는 PM2로 관리 중인 서버 종료
pm2 stop ai-backend
pm2 delete ai-backend
```

### 헬스 체크가 실패함

```bash
# 서버가 실행 중인지 확인
pm2 list

# 로그 확인
pm2 logs ai-backend

# 포트 3000 리스닝 확인
netstat -tulpn | grep 3000
```

### 프록시 설정이 작동하지 않음

1. **Cloudways 지원팀에 재문의**
2. **Application URL 확인**
3. **Vercel 환경 변수 확인** (`NEXT_PUBLIC_CLOUDWAYS_URL`)
4. **브라우저 개발자 도구에서 네트워크 요청 확인**

---

## 📋 체크리스트

설정 완료 후 다음을 확인하세요:

- [ ] FileZilla로 파일 업로드 완료 (`cloudways-server.js`, `cloudways-package.json`)
- [ ] 서버에서 파일명 변경 완료 (`cloudways-package.json` → `package.json`)
- [ ] SSH 접속 성공
- [ ] Node.js 18 이상 설치 완료
- [ ] `npm install` 성공
- [ ] `.env` 파일 생성 및 환경 변수 설정 완료
- [ ] PM2로 서버 시작 성공 (`pm2 list`에서 online 상태)
- [ ] 헬스 체크 성공 (`curl http://localhost:3000/health`)
- [ ] Cloudways 지원팀에 프록시 설정 요청 완료
- [ ] Vercel 환경 변수 설정 완료 (`NEXT_PUBLIC_CLOUDWAYS_URL`)
- [ ] 실제 애플리케이션 테스트 성공

---

## 💡 참고 문서

- **상세 설정 가이드**: `CLOUDWAYS_SETUP_GUIDE.md`
- **빠른 시작 가이드**: `CLOUDWAYS_QUICK_START.md`
- **Supabase 설정**: `CLOUDWAYS_SUPABASE_SETUP.md`
- **지원팀 문의 템플릿**: `CLOUDWAYS_SUPPORT_REQUEST.md`
- **SSH 접속 방법**: `CLOUDWAYS_SSH_ACCESS.md`

---

## ✅ 완료!

모든 단계를 완료하면 Vercel의 5분 제한 없이 긴 점사를 생성할 수 있습니다!
