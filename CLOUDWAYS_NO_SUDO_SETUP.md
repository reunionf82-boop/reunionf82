# Cloudways 설정 - sudo 없이 하는 방법

## 문제
Cloudways에서 sudo 권한이 없어 Nginx 설정을 직접 수정할 수 없습니다.

## 해결 방법

### 방법 1: Cloudways 대시보드에서 설정 (가장 간단)

1. **Cloudways → 해당 Application → [Application Settings]**
2. **Domain Management** 또는 **Application URL** 설정 확인
3. Cloudways 지원팀에 문의:
   - "포트 3000의 Node.js 서버를 Application URL의 /chat 경로로 프록시 설정 요청"
   - 또는 "리버스 프록시 설정 방법 안내 요청"

---

### 방법 2: Node.js 서버를 포트 80으로 실행 (권한 문제 가능)

포트 80은 root 권한이 필요하므로 일반적으로 불가능합니다.

---

### 방법 3: Cloudways Application URL의 기본 경로 사용

Application URL이 이미 HTTPS를 지원하므로, Node.js 서버를 Application URL의 루트 경로에서 실행하도록 설정합니다.

하지만 이 방법도 PHP와 충돌할 수 있습니다.

---

### 방법 4: Cloudways 지원팀에 직접 요청 (권장)

Cloudways 지원팀에 다음을 요청하세요:

**요청 내용:**
"포트 3000에서 실행 중인 Node.js 서버를 Application URL(https://phpstack-1342840-6086717.cloudwaysapps.com)의 /chat 경로로 프록시 설정해주세요."

또는:

"Node.js 서버를 Application URL의 서브 경로(/chat, /health)로 접근할 수 있도록 리버스 프록시 설정을 해주세요."

---

### 방법 5: 임시 해결책 - HTTP로 접근 허용 (개발용)

프로덕션에서는 권장하지 않지만, 개발/테스트 환경에서는:

1. 브라우저에서 Mixed Content 허용 설정
2. 또는 Vercel 환경 변수를 일시적으로 HTTP로 설정 (Mixed Content 오류 발생)

---

## 가장 현실적인 해결책

**Cloudways 지원팀에 문의**하는 것이 가장 빠르고 확실합니다.

1. Cloudways 대시보드 → **Support** 또는 **Help**
2. 티켓 생성:
   - 제목: "Node.js 서버 리버스 프록시 설정 요청"
   - 내용: "포트 3000에서 실행 중인 Node.js 서버를 Application URL의 /chat 경로로 프록시 설정해주세요."

---

## 또는 다른 접근: 서브도메인 사용

Cloudways에서 서브도메인을 추가하고, 그 서브도메인을 Node.js 서버에 연결하는 방법도 있습니다.

1. Cloudways → 해당 Application → **Domain Management**
2. 서브도메인 추가 (예: `ai.phpstack-1342840-6086717.cloudwaysapps.com`)
3. SSL 인증서 설치
4. 서브도메인을 포트 3000으로 프록시 설정 (지원팀 요청)

---

## 결론

**Cloudways 지원팀에 직접 문의**하는 것이 가장 확실하고 빠른 방법입니다.
