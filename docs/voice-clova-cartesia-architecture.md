# 네이버 클로바 스피치 + 카테시아 음성 연동 아키텍처

제미나이 샘플 코드를 참고한 아키텍처 정리 및 현재 구현과의 대응입니다.

## 목표 아키텍처 (샘플 기준)

```
Frontend (React)
  - 마이크 권한 → AudioContext로 오디오 추출 (첫 단어 잘림 방지용 세밀 제어)
  - WebSocket으로 백엔드에 실시간 오디오 전송

Backend (Node.js)
  - Secret Key는 여기서만 보관 (절대 클라이언트 노출 금지)
  - 클라이언트 WebSocket 수신 → 네이버 클로바 gRPC 스트리밍 연결 → 오디오 중계
  - 인식 결과(FINAL)를 WebSocket으로 클라이언트에 전달

Output (Cartesia)
  - AI 답변 텍스트 → 카테시아 TTS → 재생
```

## 보안 (CFO 조언 반영)

- **Secret Key**: 백엔드 서버 환경 변수로만 관리 (`NAVER_CLOVA_SPEECH_SECRET_KEY`).
- 클라이언트(브라우저) 코드에는 키를 넣지 않음. 현재도 dcc-turn API에서만 사용.

## 현재 구현과의 대응

| 항목 | 샘플 제안 | 현재 구현 |
|------|------------|-----------|
| STT | 백엔드가 gRPC(Secret Key + gRPC URL)로 실시간 스트리밍 | 백엔드가 REST 단문 인식 (`/recog/v1/stt`) 또는 도메인 Invoke URL 사용. Secret Key는 `X-CLOVASPEECH-API-KEY` 또는 Bearer로 전달 |
| 오디오 전달 | 클라이언트 → WebSocket → 백엔드 → Clova gRPC | 클라이언트: 침묵 800ms 후 WAV를 POST `/api/voice/dcc-turn` (audioBase64)로 전송 |
| 첫 단어 보정 | AudioContext + ScriptProcessor(4096,1,1)로 세밀 제어 | WAV 앞에 500ms 무음 패딩 + 침묵 구간 감지 후 전송 |
| TTS | Cartesia REST → Audio 재생 | 동일. Cartesia batch/streaming 사용 중 |

## gRPC 실시간 스트리밍으로 전환 시 (참고)

설정 화면의 **Secret Key + gRPC URL**을 그대로 쓰려면 gRPC 클라이언트가 필요합니다.

1. **nest.proto**: NCP 문서 [실시간 스트리밍 인식](https://api.ncloud-docs.com/docs/ai-application-service-clovaspeech-grpc)에서 확인.
2. **인증**: gRPC 메타데이터에 `authorization: Bearer ${secretKey}`.
3. **연결**: `clovaspeech-gw.ncloud.com:50051` (또는 도메인별 gRPC URL).
4. **오디오**: 16kHz, 1ch, 16bit PCM (헤더 없음).
5. **백엔드**: Next.js API Route는 장기 WebSocket 유지에 불리하므로, 별도 Node 서버(Express + ws)에서 WebSocket 수신 → gRPC 스트리밍 중계 구성하는 방식이 샘플에 가깝습니다.

현재는 REST 단문 인식으로 턴 단위 전송을 유지하고, 도메인 Invoke URL(`NAVER_CLOVA_SPEECH_INVOKE_URL`) 또는 공용 URL + Secret Key로 동작합니다.

## 환경 변수

| 변수 | 용도 |
|------|------|
| `NAVER_CLOVA_SPEECH_SECRET_KEY` | Clova Speech 인증 (REST 헤더 또는 gRPC Bearer). **서버 전용** |
| `NAVER_CLOVA_SPEECH_INVOKE_URL` | (선택) 도메인별 REST Invoke URL. 없으면 공용 `clovaspeech-gw.ncloud.com/recog/v1/stt` 사용 |
