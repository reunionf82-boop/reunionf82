/**
 * 다자형 "계속 토론" 요청용 상수.
 * 라우트(route.ts)에서 named export를 쓰면 Next.js 빌드 타입 검사에 걸리므로 별도 모듈로 분리.
 */

/** 클라이언트가 이 문자열을 transcript로 보내면 1라운드(3발화)만 생성. 재생 끝난 뒤 다시 보내 STT 감지될 때까지 반복 */
export const DCC_MULTI_CONTINUE_TRANSCRIPT =
  '[다음 라운드] 사용자는 아직 말하지 않았습니다. 앞선 발화를 이어받아 세 전문가가 토론/배틀을 계속하세요. 서로 반론·보완하며 대화를 이어가세요.'

/** 위 문자열의 접두어. startsWith 체크용 */
export const DCC_MULTI_CONTINUE_TRANSCRIPT_PREFIX = '[다음 라운드]'
