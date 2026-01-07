/**
 * Cloudways 스트리밍/재요청 관련 공통 상수(SSOT).
 * 
 * 10만자 제한 로직 제거됨 (MAX_TOKENS까지 계속 진행)
 */

// 완료 판정/체크 간격
const COMPLETION_CHECK_INTERVAL_CHUNKS = Number(process.env.JEMINAI_COMPLETION_CHECK_INTERVAL || 50)

// "완료된 소제목/상세메뉴"로 판정할 최소 텍스트 길이(태그 제거 전 기준이 아니라, 태그 제거 후 텍스트 기준으로 쓰는 걸 권장)
const MIN_TEXT_LEN_SUBTITLE = Number(process.env.JEMINAI_MIN_TEXT_LEN_SUBTITLE || 30)
const MIN_TEXT_LEN_DETAIL = Number(process.env.JEMINAI_MIN_TEXT_LEN_DETAIL || 30)

module.exports = {
  COMPLETION_CHECK_INTERVAL_CHUNKS,
  MIN_TEXT_LEN_SUBTITLE,
  MIN_TEXT_LEN_DETAIL,
}

