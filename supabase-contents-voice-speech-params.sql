-- contents: 음성 파라미터 및 분위기 연출(SSML) 설정
-- Pitch/Speaking Rate/Volume Gain: API 지원 시 적용, 현재는 시스템 프롬프트로 전달

ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_pitch NUMERIC;
COMMENT ON COLUMN contents.voice_pitch IS '음성형: 음높이 (semitones) -20.0~20.0. 차분:-0.5~-1.5, 밝음:+2 이상';

ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_speaking_rate NUMERIC;
COMMENT ON COLUMN contents.voice_speaking_rate IS '음성형: 발화 속도 0.25~4.0. 별님아씨 추천 0.8~0.9';

ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_volume_gain NUMERIC;
COMMENT ON COLUMN contents.voice_volume_gain IS '음성형: 음량 증폭(dB) -96~16. 속삭임 시 +2 등';

ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_ssml_instruction TEXT;
COMMENT ON COLUMN contents.voice_ssml_instruction IS '음성형: SSML 활용 안내 (break, prosody, emphasis 등). 페르소나에 반영';
