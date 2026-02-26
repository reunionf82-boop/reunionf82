# .env.local 변수 정리

프로젝트에서 사용하는 환경 변수 목록과 용도입니다. **비밀 키는 절대 Git에 커밋하지 마세요.**

---

## 1. DCC 턴 (STT + Claude + Cartesia)

| 변수명 | 용도 | 필수 |
|--------|------|:----:|
| **STT — 리턴제로 VITO (우선)** | | |
| `VITO_CLIENT_ID` | 리턴제로 VITO STT 발급 Client ID. 없으면 `RETURNZERO_VITO_CLIENT_ID` 사용 | (VITO 사용 시) |
| `VITO_CLIENT_SECRET` | 위와 쌍인 Client Secret. 없으면 `RETURNZERO_VITO_CLIENT_SECRET` 사용 | (VITO 사용 시) |
| **STT — 네이버 클로바 (VITO 미설정 시)** | | |
| `NAVER_CLOVA_STT_CLIENT_ID` | NCP 애플리케이션 등록 발급 Client ID (STT). 없으면 `NAVER_CLOVA_CLIENT_ID` 사용 | (Clova 사용 시) |
| `NAVER_CLOVA_STT_CLIENT_SECRET` | 위와 쌍인 Client Secret | (Clova 사용 시) |
| `NAVER_CLOVA_SPEECH_SECRET_KEY` | 단문 인식 도메인 Secret Key | (대안) |
| `NAVER_CLOVA_SPEECH_INVOKE_URL` | (선택) 도메인별 REST Invoke URL | |
| **공통** | | |
| `ANTHROPIC_API_KEY` | Claude API 키 (STT 결과 → LLM 응답) | ✅ |
| `CARTESIA_API_KEY` | Cartesia TTS (LLM 응답 → 음성) | ✅ |

- **리턴제로 VITO**: `VITO_CLIENT_ID` + `VITO_CLIENT_SECRET` 설정 시 DCC 턴에서 실시간 스트리밍 전사(STT)로 VITO 사용. openapi.vito.ai 인증(6시간 유효) 후 PCM 16kHz LINEAR16 스트리밍 전사.
- **네이버 클로바**: VITO 미설정 시 NCP Client ID/Secret 또는 단문 인식 도메인 Secret Key로 REST STT 사용.

---

## 2. Supabase

| 변수명 | 용도 | 필수 |
|--------|------|:----:|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 익명(퍼블릭) 키 | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 (백엔드 전용) | ✅ |

---

## 3. 기타 음성 / AI

| 변수명 | 용도 | 필수 |
|--------|------|:----:|
| `NAVER_CLOVA_CLIENT_ID` | Clova **Voice**(TTS)용 Client ID. `/api/tts` | TTS 사용 시 |
| `NAVER_CLOVA_CLIENT_SECRET` | Clova **Voice**(TTS)용 Client Secret | TTS 사용 시 |
| `DEEPGRAM_API_KEY` | Deepgram STT (다른 보이스 프로바이더 사용 시) | 선택 |
| `GROQ_API_KEY` | Groq STT (현재 DCC는 Clova 사용) | 선택 |
| `OPENAI_API_KEY` | OpenAI 음성/기타 API | 선택 |
| `XAI_API_KEY` | xAI API | 선택 |
| `GEMINI_API_KEY` / `NEXT_PUBLIC_JEMINAI_API_URL` | Gemini/제미나이 API | 제미나이 사용 시 |
| `TYPECAST_API_KEY` | 타입캐스트 TTS | 타입캐스트 사용 시 |

---

## 4. Vertex / 제미나이 라이브

| 변수명 | 용도 | 필수 |
|--------|------|:----:|
| `GOOGLE_APPLICATION_CREDENTIALS` | GCP 서비스 계정 JSON 경로 | Vertex 사용 시 |
| `GOOGLE_GENAI_USE_VERTEXAI` | Vertex AI 사용 여부 | |
| `GOOGLE_CLOUD_PROJECT` | GCP 프로젝트 ID | |
| `GOOGLE_CLOUD_LOCATION` | 리전 (예: us-central1) | |
| `NEXT_PUBLIC_VERTEX_LIVE_PRIMARY_REGION` | 라이브 프라이머리 리전 | |
| `NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL` | Vertex Live 프록시 WebSocket URL | |
| `VOICE_MVP_ENABLED` | 음성 MVP 사용 여부 | |
| `VOICE_MVP_AUDIO_ENGINE` | 예: genai_live, browser | |

---

## 5. 기타

| 변수명 | 용도 | 필수 |
|--------|------|:----:|
| `ADMIN_PASSWORD` | 관리자 로그인 비밀번호 | ✅ |
| `ENCRYPTION_KEY` | 전화번호 등 암호화 키 | ✅ |
| `NEXT_PUBLIC_SITE_URL` | 사이트 기본 URL (시트맵 등) | |
| `NEXT_PUBLIC_CLOUDWAYS_URL` | Cloudways 서버 URL | |
| `NEXT_PUBLIC_SKIP_WAIT_PAY_AMOUNT` | 무료 음성상담 시 대기 스킵 금액 | |
| `OPENWEATHERMAP_API_KEY` | 날씨 API (음성 상담 날씨 문맥) | |
| `CLEANUP_API_KEY` | saved-results 클린업 API (내부용) | |
| `FFMPEG_PATH` | voice-audio-m4a용 ffmpeg 경로 | |

---

## DCC(턴 방식)만 쓸 때 최소 등록 예시

**리턴제로 VITO STT 사용 시 (권장)**

```env
VITO_CLIENT_ID=발급받은_Client_ID
VITO_CLIENT_SECRET=발급받은_Client_Secret
ANTHROPIC_API_KEY=sk-ant-...
CARTESIA_API_KEY=sk_car_...
```

**네이버 클로바 STT 사용 시**  
NCP Application Registration에서 CLOVA Speech Recognition 발급 후:

```env
NAVER_CLOVA_STT_CLIENT_ID=발급받은_Client_ID
NAVER_CLOVA_STT_CLIENT_SECRET=발급받은_Client_Secret
# 또는 TTS와 동일 앱이면 NAVER_CLOVA_CLIENT_ID / NAVER_CLOVA_CLIENT_SECRET
ANTHROPIC_API_KEY=sk-ant-...
CARTESIA_API_KEY=sk_car_...
```

**단문 인식 도메인 Secret Key 사용 시**

```env
NAVER_CLOVA_SPEECH_SECRET_KEY=단문_인식_도메인_Secret_Key
ANTHROPIC_API_KEY=sk-ant-...
CARTESIA_API_KEY=sk_car_...
```

변수 추가/수정 후에는 **개발 서버 재시작**이 필요합니다.
