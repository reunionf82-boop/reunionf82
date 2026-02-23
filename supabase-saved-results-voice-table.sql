-- 음성형 저장 결과 전용 테이블 (점사형 saved_results와 분리)
-- 폼 "OO명이 이용하셨습니다"를 점사/음성별로 따로 집계할 수 있도록 함.

CREATE TABLE IF NOT EXISTS saved_results_voice (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  html TEXT NOT NULL DEFAULT '',
  user_name TEXT,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 음성 전용 필드
  voice_messages JSONB,
  voice_audio_url TEXT,
  voice_audio_url_m4a TEXT,
  voice_duration_seconds INTEGER,
  voice_pay_amount INTEGER,
  content_id INTEGER
);

COMMENT ON TABLE saved_results_voice IS '음성 상담 저장 결과 (점사형 saved_results와 별도 집계)';
COMMENT ON COLUMN saved_results_voice.voice_messages IS '대화 내용 [{role:"user"|"assistant", text:"..."}]';
COMMENT ON COLUMN saved_results_voice.voice_audio_url IS 'AI 오디오 녹음 파일 URL (WebM 등)';
COMMENT ON COLUMN saved_results_voice.voice_audio_url_m4a IS 'iOS 재생용 M4A 변환본 URL';
COMMENT ON COLUMN saved_results_voice.voice_duration_seconds IS '상담 시간 (초)';
COMMENT ON COLUMN saved_results_voice.voice_pay_amount IS '결제 금액(원). 0=무료';
COMMENT ON COLUMN saved_results_voice.content_id IS '연결된 컨텐츠 ID';

CREATE INDEX IF NOT EXISTS idx_saved_results_voice_saved_at ON saved_results_voice(saved_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_results_voice_content_id ON saved_results_voice(content_id);

ALTER TABLE saved_results_voice ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow service role access to saved_results_voice" ON saved_results_voice;
CREATE POLICY "Allow service role access to saved_results_voice" ON saved_results_voice
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- voice_conversation_summaries.saved_result_id는 출처 표시용(FK 없음). 음성형은 saved_results_voice.id를 저장.
-- (기존 컬럼명/테이블 변경 없이, 새로 저장되는 음성 요약만 saved_results_voice.id 참조)

-- user_credentials: 음성 저장 결과 ID 연결 (나의 이용내역에서 다시듣기용)
ALTER TABLE user_credentials ADD COLUMN IF NOT EXISTS voice_saved_id BIGINT;
COMMENT ON COLUMN user_credentials.voice_saved_id IS '음성 저장 결과 ID (saved_results_voice.id). 점사형은 saved_id 사용';

CREATE INDEX IF NOT EXISTS idx_user_credentials_voice_saved_id ON user_credentials(voice_saved_id);

-- 60일 이상 된 음성 저장 결과 자동 삭제 (기존 delete_old_saved_results에 추가하거나 별도 함수)
CREATE OR REPLACE FUNCTION delete_old_saved_results_voice()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.saved_results_voice
  WHERE saved_at < NOW() - INTERVAL '60 days';
  RAISE NOTICE 'Deleted old saved_results_voice older than 60 days';
END;
$$;
