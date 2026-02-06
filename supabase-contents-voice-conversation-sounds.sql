-- contents: 대화중 소리 목록 (라벨+URL, 여러 개 추가 가능)
-- 기존 voice_bubble_sound_url / voice_bubble_sound_probability_pct 와 병행 사용 가능 (로드 시 마이그레이션)

ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_conversation_sounds JSONB DEFAULT '[]';
COMMENT ON COLUMN contents.voice_conversation_sounds IS '음성형: 대화중 소리 목록 [{ label: string, url: string }, ...]';

ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_conversation_sound_probability_pct INTEGER DEFAULT 5;
COMMENT ON COLUMN contents.voice_conversation_sound_probability_pct IS '음성형: 대화중 소리 발현 확률 %';
