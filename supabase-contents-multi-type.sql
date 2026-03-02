-- 다자형(multi) 컨텐츠: 3인 페르소나 + 카테시아 보이스 3개
-- content_type = 'multi' 사용. 리턴제로+클로드+카테시아 고정.
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_system_prompt TEXT;
COMMENT ON COLUMN contents.multi_system_prompt IS '다자형: 전체 시나리오 시스템 프롬프트 (3인이 신점/타로/사주/역술가 관점으로 경쟁 상담 등)';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_1_prompt TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_2_prompt TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_3_prompt TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_voice_id_1 TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_voice_id_2 TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_voice_id_3 TEXT;
COMMENT ON COLUMN contents.multi_persona_1_prompt IS '다자형: 페르소나 1 시스템 프롬프트';
COMMENT ON COLUMN contents.multi_persona_2_prompt IS '다자형: 페르소나 2 시스템 프롬프트';
COMMENT ON COLUMN contents.multi_persona_3_prompt IS '다자형: 페르소나 3 시스템 프롬프트';
COMMENT ON COLUMN contents.multi_cartesia_voice_id_1 IS '다자형: 카테시아 보이스 ID 1';
COMMENT ON COLUMN contents.multi_cartesia_voice_id_2 IS '다자형: 카테시아 보이스 ID 2';
COMMENT ON COLUMN contents.multi_cartesia_voice_id_3 IS '다자형: 카테시아 보이스 ID 3';

ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_1_name TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_2_name TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_3_name TEXT;
COMMENT ON COLUMN contents.multi_persona_1_name IS '다자형: 페르소나 1 표시 이름 (이퀄라이저 좌측하단)';
COMMENT ON COLUMN contents.multi_persona_2_name IS '다자형: 페르소나 2 표시 이름';
COMMENT ON COLUMN contents.multi_persona_3_name IS '다자형: 페르소나 3 표시 이름';

-- 다자형 확장: 여성/남성 분리, 속도/볼륨/감정/특수태그, 시작·종료소리, 시간상품, 요약·소개·추천·상품메뉴, 동영상썸네일, MP4 여러 개
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_1_gender TEXT DEFAULT 'female';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_2_gender TEXT DEFAULT 'female';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_persona_3_gender TEXT DEFAULT 'female';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_speed NUMERIC(3,2) DEFAULT 1.0;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_volume NUMERIC(3,2) DEFAULT 1.0;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_emotion TEXT DEFAULT 'calm';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_cartesia_emotions JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_start_sound_url TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_end_sound_url TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_time_options JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_advisor_video_urls JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_advisor_video_urls_1 JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_advisor_video_urls_2 JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS multi_advisor_video_urls_3 JSONB DEFAULT '[]';
COMMENT ON COLUMN contents.multi_persona_1_gender IS '다자형: 페르소나 1 성별 female|male';
COMMENT ON COLUMN contents.multi_persona_2_gender IS '다자형: 페르소나 2 성별';
COMMENT ON COLUMN contents.multi_persona_3_gender IS '다자형: 페르소나 3 성별';
COMMENT ON COLUMN contents.multi_advisor_video_urls IS '다자형: (레거시) 상담사 동영상 URL 배열';
COMMENT ON COLUMN contents.multi_advisor_video_urls_1 IS '다자형: 페르소나 1 상담사 동영상 URL 배열';
COMMENT ON COLUMN contents.multi_advisor_video_urls_2 IS '다자형: 페르소나 2 상담사 동영상 URL 배열';
COMMENT ON COLUMN contents.multi_advisor_video_urls_3 IS '다자형: 페르소나 3 상담사 동영상 URL 배열';
COMMENT ON COLUMN contents.multi_time_options IS '다자형: 시간 상품 (default/extension/charge)';
