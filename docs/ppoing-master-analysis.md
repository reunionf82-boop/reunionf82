# 뿌잉보살 마스터 시트 - 프롬프트 vs 개발 구분

## 1. 프롬프트로만 해결 가능 (AI 지시/설정)

| 구분 | 내용 | 적용 방법 |
|------|------|----------|
| 페르소나 | 5살 여자아이 말투, 신점 전문, 공수 시 서늘한 톤 | `persona_shinjeom` 프롬프트 |
| 언어/호칭 | 영어 금지, 언니/오빠 호칭, 본인 지칭 | 프롬프트 지시 |
| 효과음 금지 | "딸랑", "휘익" 등 의성어 금지, 상황 묘사로 대체 | 프롬프트 지시 |
| 도구 사용 금지 | 사주/타로/생년월일시 거부 | 프롬프트 지시 |
| 대화 훈육 | 반말/영어/무례 시 훈계 대사 | 프롬프트 지시 |
| 방문 빈도별 **멘트 가이드** | 첫방문/2~3회/5회+/수십번 시 입구·출구 대사 스타일 | 프롬프트 예시 (실제 횟수는 개발 필요) |
| 환기 시트 | 아이 돌발행동, 영적 신호 감지 등 | 프롬프트 지시 |
| 심리 케어 | 울음/자해/불안 등 긴급 위로 | 프롬프트 지시 |
| 보안/운영 | 역할 고정, 탈옥 방지, 민감 주제 대응 | 프롬프트 지시 |
| 괄호 지문 묵음 | 최종 출력에 ( ) [[ ]] 포함 금지 | 프롬프트 + **TTS 전 sanitize(개발)** |
| 정적 깨기 **멘트** | "언니! 자요? 왜 말이 없떠..." 등 | 프롬프트 예시 (트리거는 개발 필요) |

---

## 2. 반드시 개발(코드)으로 구현해야 하는 항목

### 2.1 정적 깨기 (Silence Breaking) ⭐ 핵심

**문서 명시:** "기술적 구현 필수: 프롬프트만으로는 불가능하며, 반드시 개발 코드에서 타이머를 설정해 '지금 정적이야, 네가 한마디 해!'라고 찔러주는 구조"

| 구현 항목 | 설명 |
|----------|------|
| 침묵 감지 타이머 | 클라이언트에서 "마지막 사용자 발화/입력 이후 N초" 또는 "AI 발화 종료 후 사용자 미응답 N초" 감지 |
| 트리거 API 확장 | `POST /turn` 시 `trigger: 'silence'`, `silence_seconds: 3 | 5` 등 전달 시, 해당 정적 깨기 프롬프트로 응답 생성 |
| 클라이언트 연동 | 2~3초 침묵 → 재촉형, 5초 이상 → 관찰형/환기형 등 구간별로 API 호출 |

**구현 위치:** `VoiceMvpSessionClient`, `VoiceMvpSessionLiveClient`, `app/api/voice-mvp/sessions/[id]/turn/route.ts`

---

### 2.2 방문 빈도 추적 (Visit Count)

**문서 요구:** "방문 횟수에 따라 오프닝/클로징 테마 선택"

| 구현 항목 | 설명 |
|----------|------|
| 방문 횟수 저장 | 오늘 날짜 기준 동일 사용자(세션)의 방문 횟수 저장 |
| 세션 생성 시 전달 | 클라이언트 `localStorage`에 `voice_mvp:visits:YYYY-MM-DD` 카운트, 세션 생성 시 `visit_count_today` 전달 |
| turn context 주입 | `visit_count_today`를 시스템/컨텍스트에 포함하여 AI가 "첫 방문" vs "오늘 2~3회" 등 구분 가능하게 함 |

**구현 위치:** `VoiceMvpNewClient`, `app/api/voice-mvp/sessions/route.ts`, `turn/route.ts`

---

### 2.3 시간/요일/상황 변수 주입 (Dynamic Variables)

**문서 요구:** "대화 시작 시 현재 시간과 요일을 확인하여 오프닝에 섞어야 함"

| 구현 항목 | 설명 |
|----------|------|
| 한국 시각 확장 | 이미 `getCurrentKoreaTimeString()` 존재 → 요일(월/금 등), 시간대(새벽/낮) 추가 |
| 변수 블록 생성 | `weekday`, `timeSlot`, `isFullMoon`, `isHoliday` 등 구조화된 변수를 context에 주입 |
| AI 활용 | 프롬프트에서 "현재 weekday=월요일, timeSlot=새벽" 등 참조하도록 안내 |

**구현 위치:** `app/api/voice-mvp/sessions/[id]/turn/route.ts`, `lib/voice-mvp/ppoing-rules.ts`

---

### 2.4 괄호 제거 (TTS Sanitize)

**문서 요구:** "최종 답변 결과물에 괄호 ( ) 나 대괄호 [[ ]] 기호 자체를 절대 포함하지 마"

| 구현 항목 | 설명 |
|----------|------|
| 후처리 함수 | `sanitizeForTts(text)` → `( )`, `[[ ]]` 내부 내용 제거 또는 전체 괄호 제거 |
| TTS 호출 전 적용 | `speak()` 직전에 `sanitizeForTts(assistantText)` 적용 |

**구현 위치:** `lib/voice-mvp/ppoing-rules.ts`, `VoiceMvpSessionClient.speak()` 호출부

---

### 2.5 (선택) 사주 입력 선차단

사주(생년월일시) 패턴 감지 시 AI 호출 전에 미리 차단 응답 반환 가능.  
현재는 프롬프트로 "사주 말하지 마" 지시만 해도 대부분 처리 가능하므로, 우선순위는 낮음.

---

## 3. 구현 체크리스트

- [ ] `lib/voice-mvp/ppoing-rules.ts` - `sanitizeForTts`, `getKoreaContextVars`, `getVisitGuidanceText` 등
- [ ] `turn/route.ts` - `trigger_silence` 처리, `visit_count_today`, 시간/요일 context 주입
- [ ] `sessions/route.ts` - `visit_count_today` 수신 및 저장 (또는 events payload)
- [ ] `VoiceMvpNewClient` - `visit_count_today` localStorage 추적 및 API 전달
- [ ] `VoiceMvpSessionClient` - 침묵 타이머, `speak` 전 `sanitizeForTts`
- [ ] `VoiceMvpSessionLiveClient` - 침묵 타이머 (AI 발화 종료 후 사용자 미응답 시)
- [ ] 뿌잉보살 마스터 프롬프트 - `persona_shinjeom`에 넣을 전체 규칙 텍스트
