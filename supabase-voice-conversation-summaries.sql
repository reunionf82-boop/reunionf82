-- 음성 상담: 같은 전화번호 = 같은 사람. 대화 저장 시 LLM 요약(핵심 포인트·주요 일정) 저장 및
-- 재접속 시 안부로 물어볼 항목 조회·이미 물어본 항목 제외용 테이블

-- 1) 회차별 요약 (저장 시 LLM이 생성)
CREATE TABLE IF NOT EXISTS voice_conversation_summaries (
  id BIGSERIAL PRIMARY KEY,
  phone_normalized TEXT NOT NULL,
  saved_result_id BIGINT NOT NULL,
  content_id INTEGER,
  summary_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(saved_result_id)
);

COMMENT ON TABLE voice_conversation_summaries IS '음성 상담 회차별 LLM 요약 (핵심 포인트, 주요 일정). phone_normalized로 같은 사람 조회';
COMMENT ON COLUMN voice_conversation_summaries.phone_normalized IS '휴대폰 번호 숫자만 (같은 사람 식별)';
COMMENT ON COLUMN voice_conversation_summaries.saved_result_id IS 'saved_results.id';
COMMENT ON COLUMN voice_conversation_summaries.content_id IS '같은 음성 상담 서비스(content) 내에서만 문맥 공유';
COMMENT ON COLUMN voice_conversation_summaries.summary_json IS '예: { "corePoints": ["면접 보러 감", "그분과 통화 예정"], "keyDates": [{ "description": "면접", "date": "2025-02-10" }, { "description": "통화", "date": "2025-02-09" }] }';

CREATE INDEX IF NOT EXISTS idx_voice_summaries_phone_content ON voice_conversation_summaries(phone_normalized, content_id);
CREATE INDEX IF NOT EXISTS idx_voice_summaries_created_at ON voice_conversation_summaries(created_at DESC);

-- 2) 이미 안부로 물어본 항목 (한 번 물어본 건 다시 물어보지 않음)
CREATE TABLE IF NOT EXISTS voice_summary_asked (
  id BIGSERIAL PRIMARY KEY,
  summary_id BIGINT NOT NULL REFERENCES voice_conversation_summaries(id) ON DELETE CASCADE,
  item_ref TEXT NOT NULL,
  asked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(summary_id, item_ref)
);

COMMENT ON TABLE voice_summary_asked IS '음성 상담: 이미 안부로 물어본 요약 항목 (재질문 방지)';
COMMENT ON COLUMN voice_summary_asked.item_ref IS '예: point_0, date_1 (summary 내 항목 식별)';

CREATE INDEX IF NOT EXISTS idx_voice_asked_summary ON voice_summary_asked(summary_id);

-- RLS 활성화 (Security Advisor: RLS Disabled in Public 해결)
ALTER TABLE voice_conversation_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_summary_asked ENABLE ROW LEVEL SECURITY;

-- 서비스 롤만 접근 허용 (API는 SUPABASE_SERVICE_ROLE_KEY 사용, anon은 접근 불가)
DROP POLICY IF EXISTS "Allow service role access to voice_conversation_summaries" ON voice_conversation_summaries;
CREATE POLICY "Allow service role access to voice_conversation_summaries" ON voice_conversation_summaries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role access to voice_summary_asked" ON voice_summary_asked;
CREATE POLICY "Allow service role access to voice_summary_asked" ON voice_summary_asked
  FOR ALL TO service_role USING (true) WITH CHECK (true);
