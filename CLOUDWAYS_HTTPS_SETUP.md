# Cloudways HTTPS 설정 가이드

## 문제 상황

HTTPS 페이지(`https://reunion.fortune82.com`)에서 HTTP Cloudways 서버(`http://158.247.253.163:3000`)에 접근하려고 하면 브라우저가 **Mixed Content 오류**를 발생시킵니다.

## 해결 방법

Cloudways 서버를 HTTPS로 접근 가능하게 설정해야 합니다.

---

## 방법 1: Cloudways Application URL 사용 (권장)

Cloudways의 Application URL은 기본적으로 HTTPS를 지원합니다. 리버스 프록시를 설정하여 포트 3000을 노출합니다.

### 1단계: Cloudways Application URL 확인

- Cloudways → 해당 Application → **[Access Details]**
- **Application URL** 확인 (예: `phpstack-1342840-6086717.cloudwaysapps.com`)

### 2단계: Nginx 리버스 프록시 설정

SSH 터미널에서:

```bash
# Nginx 설정 파일 찾기
cd /etc/nginx/sites-available
# 또는
cd /etc/nginx/conf.d

# Application 설정 파일 확인
ls -la | grep [애플리케이션명]
```

설정 파일에 다음 추가:

```nginx
location /chat {
    proxy_pass http://localhost:3000/chat;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 스트리밍을 위한 타임아웃 설정
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;
}
```

설정 적용:

```bash
# Nginx 설정 테스트
sudo nginx -t

# Nginx 재시작
sudo systemctl restart nginx
```

### 3단계: Vercel 환경 변수 설정

- `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://phpstack-1342840-6086717.cloudwaysapps.com`

---

## 방법 2: Let's Encrypt SSL 인증서 설치

포트 3000에 직접 SSL 인증서를 설치합니다.

### 1단계: Certbot 설치

```bash
# Certbot 설치
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx
```

### 2단계: SSL 인증서 발급

```bash
# 도메인이 있다면
sudo certbot --nginx -d your-domain.com

# 또는 수동으로
sudo certbot certonly --standalone -d your-domain.com
```

### 3단계: Node.js 서버에 HTTPS 적용

`cloudways-server.js` 수정:

```javascript
const https = require('https');
const fs = require('fs');

// SSL 인증서 로드
const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/your-domain.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/your-domain.com/fullchain.pem')
};

// HTTPS 서버 시작
https.createServer(options, app).listen(3000, () => {
  console.log('✅ HTTPS 서버가 3000번 포트에서 실행 중...');
});
```

---

## 방법 3: Cloudways SSL 인증서 사용

Cloudways에서 제공하는 SSL 인증서를 사용합니다.

1. Cloudways → 해당 Application → **[SSL Certificate]**
2. Let's Encrypt 또는 Cloudways SSL 선택
3. 도메인 설정
4. 인증서 설치

---

## 방법 4: 서브도메인 설정 (가장 간단)

Cloudways Application URL의 서브도메인을 사용합니다.

1. Cloudways → 해당 Application → **[Domain Management]**
2. 서브도메인 추가 (예: `ai.phpstack-1342840-6086717.cloudwaysapps.com`)
3. SSL 인증서 자동 설치
4. Nginx 리버스 프록시 설정 (방법 1 참고)

---

## 빠른 해결책 (임시)

개발/테스트 환경이라면 브라우저에서 Mixed Content를 허용할 수 있습니다 (프로덕션에서는 권장하지 않음):

1. Chrome: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
2. 또는 브라우저 확장 프로그램 사용

---

## 권장 방법

**방법 1 (Nginx 리버스 프록시)**을 권장합니다:
- Cloudways Application URL은 이미 HTTPS 지원
- 추가 SSL 인증서 설치 불필요
- 설정이 간단

---

## 설정 후 확인

1. Vercel 환경 변수 업데이트:
   - `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://[Application URL]`

2. 브라우저에서 테스트:
   - `https://[Application URL]/chat` (직접 접속은 안 되지만, 프록시를 통해 접근)

3. 헬스 체크:
   - `https://[Application URL]/health` (Nginx 프록시 설정 후)

---

## 문제 해결

### Nginx 설정 오류
```bash
# Nginx 설정 테스트
sudo nginx -t

# 에러 로그 확인
sudo tail -f /var/log/nginx/error.log
```

### 포트 3000 접근 불가
- 방화벽에서 포트 3000이 열려있는지 확인
- `netstat -tulpn | grep 3000`로 서버 실행 확인

### SSL 인증서 오류
- 인증서 경로 확인
- 인증서 만료 날짜 확인: `sudo certbot certificates`
