# 포털 다시보기 연동 API 규격서

## 1. 개요

포털의 "my메뉴 > 다시보기" 기능을 통해 사용자가 이전에 생성한 점사 결과를 조회하고 재확인할 수 있도록 하는 API 연동 규격서입니다.

## 2. 보안 요구사항

### 2.1 인증 방식
- **JWT (JSON Web Token) 기반 인증** 사용
- 포털에서 발급한 JWT 토큰을 헤더에 포함하여 전송
- 토큰 만료 시간: 1시간 (3600초)
- 토큰 검증 실패 시 401 Unauthorized 응답

### 2.2 권한 검증
- JWT 토큰에서 추출한 사용자 ID로만 해당 사용자의 결과만 조회
- Supabase RLS (Row Level Security) 정책으로 데이터 접근 제어
- 다른 사용자의 데이터 접근 시도 차단

### 2.3 통신 보안
- HTTPS 통신 필수
- CORS 설정: 포털 도메인만 허용
- Rate Limiting: IP당 분당 60회 요청 제한

## 3. API 엔드포인트

### 3.1 결과 목록 조회 API

**엔드포인트**: `GET /api/portal/review/list`

**요청 헤더**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**요청 파라미터**: 없음 (사용자 ID는 JWT 토큰에서 추출)

**응답 성공 (200 OK)**:
```json
{
  "success": true,
  "data": {
    "results": [
      {
        "id": 123,
        "title": "2024년 운세",
        "availableUntil": "2024-12-31T23:59:59Z",
        "createdAt": "2024-01-01T10:00:00Z",
        "model": "gemini-1.5-pro"
      },
      {
        "id": 124,
        "title": "2024년 궁합",
        "availableUntil": "2024-12-31T23:59:59Z",
        "createdAt": "2024-01-02T14:30:00Z",
        "model": "gemini-2.5-flash"
      }
    ],
    "totalCount": 2
  }
}
```

**응답 실패 - 결과 없음 (200 OK)**:
```json
{
  "success": true,
  "data": {
    "results": [],
    "totalCount": 0
  },
  "message": "조회된 결과가 없습니다."
}
```

**응답 실패 - 인증 오류 (401 Unauthorized)**:
```json
{
  "success": false,
  "error": {
    "code": "AUTH_ERROR",
    "message": "인증 토큰이 유효하지 않습니다."
  }
}
```

**응답 실패 - 서버 오류 (500 Internal Server Error)**:
```json
{
  "success": false,
  "error": {
    "code": "SERVER_ERROR",
    "message": "서버 오류가 발생했습니다."
  }
}
```

### 3.2 결과 상세 조회 API

**엔드포인트**: `GET /api/portal/review/view`

**요청 헤더**:
```
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**요청 파라미터 (Query String)**:
- `id` (required): 결과 ID

**응답 성공 (200 OK)**:
```json
{
  "success": true,
  "data": {
    "id": 123,
    "title": "2024년 운세",
    "html": "<html>...</html>",
    "content": {
      "content_name": "2024년 운세",
      "thumbnail_url": "https://...",
      "tts_speaker": "nara",
      "menu_font_size": 16,
      "subtitle_font_size": 14,
      "body_font_size": 11
    },
    "model": "gemini-1.5-pro",
    "processingTime": "45초",
    "userName": "홍길동",
    "savedAt": "2024-01-01T10:00:00Z",
    "availableUntil": "2024-12-31T23:59:59Z"
  }
}
```

**응답 실패 - 결과 없음 (404 Not Found)**:
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "요청하신 결과를 찾을 수 없습니다."
  }
}
```

**응답 실패 - 권한 없음 (403 Forbidden)**:
```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "해당 결과에 대한 접근 권한이 없습니다."
  }
}
```

**응답 실패 - 만료됨 (410 Gone)**:
```json
{
  "success": false,
  "error": {
    "code": "EXPIRED",
    "message": "해당 결과의 이용 가능 기간이 만료되었습니다."
  }
}
```

## 4. 데이터 구조

### 4.1 JWT 토큰 페이로드 구조
```json
{
  "userId": "user_12345",
  "userName": "홍길동",
  "iat": 1704067200,
  "exp": 1704070800
}
```

### 4.2 Supabase 테이블 구조 (saved_results)

| 컬럼명 | 타입 | 설명 |
|--------|------|------|
| id | BIGSERIAL | 결과 ID (PK) |
| title | TEXT | 결과 제목 |
| html | TEXT | 결과 HTML 내용 |
| content | JSONB | 결과 메타데이터 |
| model | TEXT | 사용된 AI 모델 |
| processing_time | TEXT | 처리 시간 |
| user_name | TEXT | 사용자 이름 |
| user_id | TEXT | 포털 사용자 ID (인덱스) |
| saved_at | TIMESTAMPTZ | 저장 일시 |
| created_at | TIMESTAMPTZ | 생성 일시 |
| updated_at | TIMESTAMPTZ | 수정 일시 |

**인덱스**:
- `idx_saved_results_user_id`: user_id 컬럼 인덱스
- `idx_saved_results_saved_at`: saved_at 컬럼 인덱스 (DESC)

**RLS 정책**:
- 사용자는 자신의 user_id와 일치하는 결과만 조회 가능
- SELECT 권한만 부여 (INSERT, UPDATE, DELETE는 다른 API에서 처리)

### 4.3 결과 목록 항목 구조

| 필드명 | 타입 | 설명 |
|--------|------|------|
| id | number | 결과 ID |
| title | string | 결과 제목 |
| availableUntil | string (ISO 8601) | 이용 가능 종료 일시 |
| createdAt | string (ISO 8601) | 생성 일시 |
| model | string | 사용된 AI 모델 |

### 4.4 이용 가능 기간 계산
- 저장 일시(`saved_at`) 기준으로 60일 후까지 이용 가능
- `availableUntil = saved_at + 60일`
- 현재 시각이 `availableUntil`을 초과한 경우 만료된 것으로 간주

## 5. 에러 코드 정의

| 에러 코드 | HTTP 상태 | 설명 |
|-----------|-----------|------|
| AUTH_ERROR | 401 | 인증 토큰이 유효하지 않음 |
| FORBIDDEN | 403 | 접근 권한 없음 |
| NOT_FOUND | 404 | 결과를 찾을 수 없음 |
| EXPIRED | 410 | 이용 가능 기간 만료 |
| SERVER_ERROR | 500 | 서버 내부 오류 |
| RATE_LIMIT_EXCEEDED | 429 | 요청 횟수 초과 |

## 6. 연동 흐름도

### 6.1 결과 목록 조회 흐름
```
[포털] → [JWT 토큰 포함] → [GET /api/portal/review/list]
                                    ↓
                            [토큰 검증 및 사용자 ID 추출]
                                    ↓
                            [Supabase에서 user_id로 조회]
                                    ↓
                            [이용 가능 기간 필터링]
                                    ↓
                            [결과 목록 반환]
                                    ↓
[포털] ← [JSON 응답] ← [API 응답]
```

### 6.2 결과 상세 조회 및 표시 흐름
```
[포털] → [결과 목록에서 항목 클릭]
              ↓
    [GET /api/portal/review/view?id={resultId}]
              ↓
    [토큰 검증 및 권한 확인]
              ↓
    [결과 데이터 조회]
              ↓
    [이용 가능 기간 확인]
              ↓
    [결과 HTML 및 메타데이터 반환]
              ↓
[포털] → [새 창 열기] → [결과 페이지 표시]
              ↓
    [form 페이지의 "저장된 결과 보기"와 동일한 UI/UX]
```

## 7. 포털 연동 구현 가이드

### 7.1 결과 목록 조회 구현
1. 포털 "my메뉴 > 다시보기" 클릭 시
2. JWT 토큰을 Authorization 헤더에 포함하여 `GET /api/portal/review/list` 호출
3. 응답의 `data.results` 배열을 화면에 표시
4. 각 항목에 제목과 이용 가능일 표시
5. `totalCount`가 0이면 "조회된 결과가 없습니다." 메시지 표시

### 7.2 결과 상세 조회 구현
1. 결과 목록에서 항목 클릭 시
2. JWT 토큰을 Authorization 헤더에 포함하여 `GET /api/portal/review/view?id={resultId}` 호출
3. 응답 성공 시:
   - 새 창(`window.open`) 또는 새 탭에서 결과 페이지 열기
   - URL: `https://{2차도메인}/portal/review?id={resultId}&token={JWT_TOKEN}`
   - 또는 결과 HTML을 직접 렌더링
4. 응답 실패 시:
   - 에러 코드에 따라 적절한 메시지 표시
   - 410 (EXPIRED)인 경우 "이용 가능 기간이 만료되었습니다." 메시지

### 7.3 결과 페이지 표시 방식
- 옵션 1: 새 창에서 별도 페이지로 표시
  - URL: `https://{2차도메인}/portal/review?id={resultId}&token={JWT_TOKEN}`
  - form 페이지의 "저장된 결과 보기"와 동일한 UI/UX 적용
  - TTS 기능, 추가 질문하기 기능 포함

- 옵션 2: 포털 내 iframe으로 표시
  - 보안상 권장하지 않음 (X-Frame-Options 설정 필요)

- 옵션 3: 포털 페이지에 직접 렌더링
  - API에서 받은 HTML을 포털 페이지에 삽입
  - 스타일 충돌 주의 필요

## 8. 보안 체크리스트

- [ ] JWT 토큰 검증 로직 구현
- [ ] 사용자 ID 추출 및 검증
- [ ] Supabase RLS 정책 설정
- [ ] HTTPS 통신 강제
- [ ] CORS 설정 (포털 도메인만 허용)
- [ ] Rate Limiting 구현
- [ ] SQL Injection 방지 (파라미터화된 쿼리)
- [ ] XSS 방지 (HTML 이스케이프)
- [ ] 토큰 만료 시간 검증
- [ ] 로그 기록 (접근 로그, 에러 로그)

## 9. 테스트 시나리오

### 9.1 정상 케이스
1. 유효한 JWT 토큰으로 결과 목록 조회 → 성공
2. 유효한 JWT 토큰으로 결과 상세 조회 → 성공
3. 결과 없음 케이스 → 빈 배열 반환

### 9.2 에러 케이스
1. 토큰 없이 요청 → 401 AUTH_ERROR
2. 만료된 토큰으로 요청 → 401 AUTH_ERROR
3. 잘못된 토큰으로 요청 → 401 AUTH_ERROR
4. 존재하지 않는 결과 ID 조회 → 404 NOT_FOUND
5. 다른 사용자의 결과 조회 → 403 FORBIDDEN
6. 만료된 결과 조회 → 410 EXPIRED
7. Rate Limit 초과 → 429 RATE_LIMIT_EXCEEDED

## 10. 모니터링 및 로깅

### 10.1 로그 기록 항목
- API 요청 시간
- 사용자 ID
- 요청 엔드포인트
- 응답 상태 코드
- 처리 시간
- 에러 발생 시 에러 메시지

### 10.2 모니터링 지표
- API 응답 시간 (P50, P95, P99)
- 에러율
- Rate Limit 초과 횟수
- 인증 실패 횟수

## 11. 버전 관리

- API 버전: v1
- 버전 관리 방식: URL 경로에 버전 포함 (`/api/v1/portal/review/list`)
- 하위 호환성 유지 원칙

## 12. 추가 고려사항

### 12.1 캐싱
- 결과 목록: 사용자별로 5분간 캐싱 가능
- 결과 상세: 캐싱하지 않음 (실시간 데이터 필요)

### 12.2 페이지네이션
- 결과가 많을 경우를 대비한 페이지네이션 지원 (선택사항)
- 기본값: 최대 100개까지 조회

### 12.3 정렬
- 기본 정렬: `saved_at DESC` (최신순)
- 선택 가능한 정렬: 생성일시, 이용 가능일

## 13. 연동 테스트 체크리스트

- [ ] JWT 토큰 발급 및 검증 테스트
- [ ] 결과 목록 조회 테스트 (정상 케이스)
- [ ] 결과 목록 조회 테스트 (결과 없음)
- [ ] 결과 상세 조회 테스트 (정상 케이스)
- [ ] 결과 상세 조회 테스트 (존재하지 않는 ID)
- [ ] 결과 상세 조회 테스트 (권한 없음)
- [ ] 결과 상세 조회 테스트 (만료됨)
- [ ] 인증 실패 테스트
- [ ] Rate Limit 테스트
- [ ] CORS 테스트
- [ ] HTTPS 통신 테스트
- [ ] 결과 페이지 UI/UX 테스트










