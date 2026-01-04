/**
 * Cloudways 스트리밍/재요청 관련 공통 상수(SSOT).
 *
 * - 개발 테스트: 20000
 * - 운영 목표: 100000 (환경변수로 전환 권장)
 */
const STREAM_MAX_CHARS = Number(process.env.JEMINAI_STREAM_MAX_CHARS || 20000) // TODO: 운영에서 100000으로 올릴 때 env로 변경

// 환경변수 로드 확인 로그
console.log('📊 [스트리밍 설정] STREAM_MAX_CHARS:', STREAM_MAX_CHARS, '자 (환경변수:', process.env.JEMINAI_STREAM_MAX_CHARS || '미설정 → 기본값 20000)')

// 완료 판정/체크 간격
const COMPLETION_CHECK_INTERVAL_CHUNKS = Number(process.env.JEMINAI_COMPLETION_CHECK_INTERVAL || 50)

// “완료된 소제목/상세메뉴”로 판정할 최소 텍스트 길이(태그 제거 전 기준이 아니라, 태그 제거 후 텍스트 기준으로 쓰는 걸 권장)
const MIN_TEXT_LEN_SUBTITLE = Number(process.env.JEMINAI_MIN_TEXT_LEN_SUBTITLE || 30)
const MIN_TEXT_LEN_DETAIL = Number(process.env.JEMINAI_MIN_TEXT_LEN_DETAIL || 30)

module.exports = {
  STREAM_MAX_CHARS,
  COMPLETION_CHECK_INTERVAL_CHUNKS,
  MIN_TEXT_LEN_SUBTITLE,
  MIN_TEXT_LEN_DETAIL,
}

