-- contents: GPT Realtime 전용 음성 (OpenAI voice: alloy, echo, fable, onyx, nova, shimmer, cedar, marin 등)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_gpt_name TEXT;
COMMENT ON COLUMN contents.voice_gpt_name IS '음성형(GPT): OpenAI Realtime API 음성명 (alloy, echo, fable, onyx, nova, shimmer, cedar, marin 등)';
