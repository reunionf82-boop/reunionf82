-- saved_results 테이블에 음성 상담 다시보기/다시듣기용 컬럼 추가

-- 결과 타입 (fortune: 점사형, voice: 음성형)
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS result_type TEXT DEFAULT 'fortune';
COMMENT ON COLUMN saved_results.result_type IS '결과 타입: fortune(점사형), voice(음성형)';

-- 음성 대화 메시지 (JSONB 배열: [{role, text}])
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS voice_messages JSONB;
COMMENT ON COLUMN saved_results.voice_messages IS '음성형: 대화 내용 [{role:"user"|"assistant", text:"..."}]';

-- 음성 녹음 파일 URL (Supabase Storage)
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS voice_audio_url TEXT;
COMMENT ON COLUMN saved_results.voice_audio_url IS '음성형: AI 오디오 녹음 파일 URL';

-- 상담 시간 (초)
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS voice_duration_seconds INTEGER;
COMMENT ON COLUMN saved_results.voice_duration_seconds IS '음성형: 상담 시간 (초)';

-- 컨텐츠 ID (음성형에서 컨텐츠 연결용)
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS content_id INTEGER;
COMMENT ON COLUMN saved_results.content_id IS '연결된 컨텐츠 ID';
