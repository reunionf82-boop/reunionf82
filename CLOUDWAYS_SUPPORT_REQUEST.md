# Cloudways 지원팀 문의 내용

## 제목
Node.js 서버 리버스 프록시 설정 요청

## 요청 내용

안녕하세요.

포트 3000에서 실행 중인 Node.js 서버를 Application URL의 특정 경로로 프록시 설정을 요청드립니다.

### 현재 상황
- **Application URL**: `phpstack-1342840-6086717.cloudwaysapps.com`
- **Node.js 서버**: 포트 3000에서 실행 중 (`http://localhost:3000`)
- **서버 상태**: 정상 작동 확인 (헬스 체크 성공)
- **SSL 인증서**: Let's Encrypt 설치 완료

### 요청 사항
다음 경로를 포트 3000의 Node.js 서버로 프록시 설정을 요청드립니다:

- `https://phpstack-1342840-6086717.cloudwaysapps.com/chat` → `http://localhost:3000/chat`

### 필요한 설정 요청드립니다.
- 프록시 타임아웃: 1800초 (30분) - 긴 AI 생성 작업을 위해 필요
- 스트리밍 지원: Server-Sent Events (SSE) 스트리밍 응답 지원 필요
- 헤더 전달: Host, X-Real-IP, X-Forwarded-For, X-Forwarded-Proto 헤더 전달

### 참고 사항
- Node.js 서버는 이미 포트 3000에서 실행 중입니다
- 서버 내부에서 `curl http://localhost:3000/health` 테스트 성공
- HTTPS 페이지에서 HTTP 서버 접근 시 Mixed Content 오류가 발생하여 프록시 설정이 필요합니다

### 예상 Nginx 설정
```nginx
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
```

설정 완료 후 알려주시면 테스트하겠습니다.

감사합니다.

---

## 추가 정보 (필요시 제공)

### 서버 정보
- **서버 IP**: 158.247.253.163
- **애플리케이션 이름**: atpxdvnsqm
- **Node.js 버전**: v18.17.1
- **서버 프로세스**: PID 2172631 (포트 3000 리스닝 확인)

### 테스트 방법

설정 완료 후 다음 방법으로 테스트할 수 있습니다:

#### 방법 1: curl 명령어 (터미널)
```bash
# POST 요청 테스트
curl -X POST https://phpstack-1342840-6086717.cloudwaysapps.com/chat \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

#### 방법 2: 실제 애플리케이션에서 테스트
- Vercel 환경 변수 설정:
  - `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://phpstack-1342840-6086717.cloudwaysapps.com`
- 실제 점사 생성 기능을 사용하여 테스트

#### 방법 3: 브라우저 개발자 도구
- 브라우저 개발자 도구(F12) → Network 탭
- 점사 생성 버튼 클릭
- `/chat` 요청이 성공하는지 확인
