-- 음성대화 설정: 종료소리 URL (시간 0 시 재생 후 자동저장, TTS 강제 중단)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_end_sound_url TEXT;
COMMENT ON COLUMN contents.voice_end_sound_url IS '시간 0이 되면 TTS를 끊고 이 소리를 재생한 뒤 자동 저장';
