# Cloudways 로컬 테스트 방법

## 로컬에서 Cloudways 서버 테스트하기

### 방법 1: .env.local 파일에 환경 변수 설정 (권장)

1. **프로젝트 루트에 `.env.local` 파일 생성/수정**

```env
# Cloudways 서버 URL (로컬 테스트용)
NEXT_PUBLIC_CLOUDWAYS_URL=http://158.247.253.163:3000
```

⚠️ **주의**: HTTP로 설정하면 Mixed Content 오류가 발생하지만, 로컬 개발 서버(`http://localhost:3000`)에서는 테스트 가능합니다.

2. **개발 서버 재시작**

```bash
npm run dev
```

3. **테스트**
   - 브라우저에서 `http://localhost:3000` 접속
   - 점사 생성 기능 테스트
   - 개발자 도구(F12) → Network 탭에서 `/chat` 요청 확인

---

### 방법 2: 브라우저에서 Mixed Content 허용 (로컬 테스트용)

Chrome에서 Mixed Content를 허용하면 HTTP Cloudways 서버에 접근할 수 있습니다.

1. **Chrome 주소창에 입력:**
   ```
   chrome://flags/#unsafely-treat-insecure-origin-as-secure
   ```

2. **설정:**
   - "Insecure origins treated as secure" 활성화
   - 아래 입력란에: `http://158.247.253.163:3000` 추가
   - Chrome 재시작

3. **.env.local 설정:**
   ```env
   NEXT_PUBLIC_CLOUDWAYS_URL=http://158.247.253.163:3000
   ```

4. **테스트:**
   - `npm run dev` 실행
   - 점사 생성 테스트

---

### 방법 3: Vercel 환경 변수 설정 후 Vercel Preview에서 테스트

1. **Vercel 대시보드 → 프로젝트 → Settings → Environment Variables**
2. **환경 변수 추가:**
   - `NEXT_PUBLIC_CLOUDWAYS_URL`: `http://158.247.253.163:3000` (임시)
3. **Vercel에 배포**
4. **Preview URL에서 테스트**

---

## 로컬 테스트 체크리스트

- [ ] `.env.local` 파일에 `NEXT_PUBLIC_CLOUDWAYS_URL` 설정
- [ ] 개발 서버 재시작 (`npm run dev`)
- [ ] 브라우저에서 점사 생성 테스트
- [ ] 개발자 도구에서 `/chat` 요청 확인
- [ ] Mixed Content 오류 확인 (HTTP 사용 시)

---

## 예상 결과

### 성공 시:
- 점사 생성이 정상적으로 진행됨
- 개발자 도구 Network 탭에서 `/chat` 요청이 200 OK
- 스트리밍 응답이 정상적으로 수신됨

### Mixed Content 오류 발생 시:
- 브라우저 콘솔에 "Mixed Content" 경고
- 요청이 차단됨
- **해결**: Cloudways 지원팀이 프록시 설정 완료 후 HTTPS URL 사용

---

## 프로덕션 배포 전

Cloudways 지원팀이 프록시 설정을 완료하면:

1. **Vercel 환경 변수 수정:**
   - `NEXT_PUBLIC_CLOUDWAYS_URL`: `https://phpstack-1342840-6086717.cloudwaysapps.com`

2. **.env.local도 수정 (로컬 테스트용):**
   ```env
   NEXT_PUBLIC_CLOUDWAYS_URL=https://phpstack-1342840-6086717.cloudwaysapps.com
   ```

3. **재배포 및 테스트**
