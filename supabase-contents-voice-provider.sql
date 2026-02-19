-- contents: 음성 제공사 및 Hume 설정 추가
-- voice_provider: 'gemini' | 'openai' | 'xai' | 'hume' (기존 데이터는 voice_model로 추론하거나 기본값 설정)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_provider TEXT DEFAULT 'gemini';
COMMENT ON COLUMN contents.voice_provider IS '음성형: 제공사 (gemini, openai, xai, hume)';

-- Hume AI Configuration ID
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_hume_config_id TEXT;
COMMENT ON COLUMN contents.voice_hume_config_id IS '음성형(Hume): EVI Configuration ID';

-- 기존 데이터 마이그레이션 (voice_model 기반)
UPDATE contents 
SET voice_provider = CASE 
    WHEN voice_model LIKE 'gpt%' THEN 'openai'
    WHEN voice_model LIKE 'grok%' THEN 'xai'
    WHEN voice_model LIKE 'hume%' THEN 'hume'
    ELSE 'gemini'
END
WHERE voice_provider IS NULL OR voice_provider = 'gemini';
