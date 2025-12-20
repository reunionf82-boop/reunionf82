# Cloudways 프록시 타임아웃 수정 요청

## 제목
프록시 타임아웃을 1800초(30분)로 증가 요청

## 요청 내용

안녕하세요.

이전에 `/chat` 경로 프록시 설정을 요청드렸는데, 현재 프록시 타임아웃이 400초로 설정되어 있어 긴 AI 생성 작업이 중단되고 있습니다.

### 문제 상황
- **현재 타임아웃**: 약 400초 (6분 40초)
- **발생 문제**: AI 생성 작업이 400초 경과 후 연결이 끊어짐
- **필요한 타임아웃**: 1800초 (30분)

### 요청 사항
`/chat` 경로의 프록시 타임아웃을 **1800초(30분)**로 증가해주세요.

### 필요한 Nginx 설정 수정
```nginx
location /chat {
    proxy_pass http://localhost:3000/chat;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    
    # 타임아웃 설정 (30분 = 1800초)
    proxy_read_timeout 1800s;
    proxy_send_timeout 1800s;
    proxy_connect_timeout 1800s;
    
    # SSE 스트리밍을 위한 설정
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    chunked_transfer_encoding on;
}
```

### 중요 사항
1. **`proxy_read_timeout 1800s`**: 백엔드 서버로부터 응답을 읽는 최대 시간 (30분)
2. **`proxy_send_timeout 1800s`**: 백엔드 서버로 요청을 보내는 최대 시간 (30분)
3. **`proxy_connect_timeout 1800s`**: 백엔드 서버 연결 최대 시간 (30분)
4. **`proxy_buffering off`**: Server-Sent Events (SSE) 스트리밍을 위해 버퍼링 비활성화 필수
5. **`proxy_cache off`**: 스트리밍 응답 캐싱 비활성화

### 테스트 방법
설정 완료 후 다음 명령어로 확인할 수 있습니다:

```bash
# 타임아웃 테스트 (30분 이상 실행되는 요청)
curl -X POST https://phpstack-1342840-6086717.cloudwaysapps.com/chat \
  -H "Content-Type: application/json" \
  -d '{"test": "long_running_request"}' \
  --max-time 2000
```

### 참고 정보
- **Application URL**: `phpstack-1342840-6086717.cloudwaysapps.com`
- **백엔드 서버**: `http://localhost:3000/chat`
- **Node.js 서버 타임아웃**: 이미 1800초(30분)로 설정됨
- **문제**: 프록시 레벨에서 400초 후 연결이 끊어짐

설정 완료 후 알려주시면 테스트하겠습니다.

감사합니다.
