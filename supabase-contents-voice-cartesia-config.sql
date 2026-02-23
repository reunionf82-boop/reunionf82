-- Deepgram+Claude+Cartesia 음성 설정 저장
-- contents 테이블에 voice_cartesia_config 컬럼 추가 (JSONB)
ALTER TABLE contents
ADD COLUMN IF NOT EXISTS voice_cartesia_config jsonb DEFAULT NULL;

COMMENT ON COLUMN contents.voice_cartesia_config IS 'Deepgram+Claude+Cartesia: { gender, voice_id, voices_female, voices_male, speed, volume, emotions }';
