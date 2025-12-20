# Cloudways 연결 문제 해결

## 문제
로컬에서 `http://158.247.253.163:3000/chat` 접근 시 `ERR_CONNECTION_TIMED_OUT` 오류 발생

## 원인
Cloudways 방화벽에서 포트 3000이 외부 접근을 막고 있을 가능성이 높습니다.

## 해결 방법

### 방법 1: Cloudways 방화벽에서 포트 3000 열기 (지원팀 요청)

Cloudways 지원팀에 다음을 추가로 요청:

**추가 요청:**
"포트 3000을 외부에서 접근할 수 있도록 방화벽 설정을 해주세요. 
로컬 개발 환경에서 테스트하기 위해 필요합니다."

---

### 방법 2: 임시로 Supabase Edge Function 사용 (프록시 설정 완료 전까지)

Cloudways 프록시 설정이 완료될 때까지 Supabase Edge Function을 사용:

**`.env.local` 파일:**
```env
# Cloudways URL 주석 처리 (프록시 설정 완료 전까지)
# NEXT_PUBLIC_CLOUDWAYS_URL=http://158.247.253.163:3000
```

또는 환경 변수를 제거하면 자동으로 Supabase Edge Function을 사용합니다.

---

### 방법 3: SSH 터미널에서 서버 상태 확인

SSH 터미널에서:

```bash
# 서버가 실행 중인지 확인
ps aux | grep node

# 포트 3000이 리스닝 중인지 확인
netstat -tulpn | grep 3000

# 서버 로그 확인
cd ~/public_html
tail -f server.log
```

---

## 현재 상황 정리

1. **Cloudways 서버**: 포트 3000에서 실행 중 (서버 내부에서 확인됨)
2. **외부 접근**: 포트 3000이 방화벽에 막혀 있음
3. **해결책**: 
   - Cloudways 지원팀에 포트 3000 외부 노출 요청
   - 또는 프록시 설정 완료 후 HTTPS URL 사용

---

## 권장 조치

1. **Cloudways 지원팀에 추가 요청:**
   - 프록시 설정: `/chat` 경로 프록시
   - 방화벽 설정: 포트 3000 외부 노출 (선택사항, 프록시 설정이면 불필요)

2. **프록시 설정 완료 전까지:**
   - Supabase Edge Function 사용 (기존 방식)
   - 또는 로컬 테스트는 잠시 보류

---

## 프록시 설정 완료 후

프록시 설정이 완료되면:
- `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://phpstack-1342840-6086717.cloudwaysapps.com`
- 로컬과 프로덕션 모두에서 정상 작동
