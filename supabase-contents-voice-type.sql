-- contents 테이블: 음성형(애기동자 음성상담) 컨텐츠 지원
-- content_type: 'fortune' | 'voice'
-- 음성형 전용 필드 추가

ALTER TABLE contents ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'fortune';
COMMENT ON COLUMN contents.content_type IS 'fortune=점사형, voice=음성형';

-- 음성대화모델 (예: gemini-live-2.5-flash-native-audio)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_model TEXT;
COMMENT ON COLUMN contents.voice_model IS '음성형: 음성대화 모델 ID';

-- 애기동자 상담사 등록 (mp4 URL)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_advisor_video_url TEXT;
COMMENT ON COLUMN contents.voice_advisor_video_url IS '음성형: 상담사 소개 영상 mp4 URL';

-- 음성 성별: male | female
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_gender TEXT;
COMMENT ON COLUMN contents.voice_gender IS '음성형: 음성 성별';

-- 음성 말투: calm | bright | firm | empathetic | warm (admin/voice-mvp 동일)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_style TEXT;
COMMENT ON COLUMN contents.voice_style IS '음성형: 말투';

-- 음성 성향 (동일 옵션)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_tendency TEXT;
COMMENT ON COLUMN contents.voice_tendency IS '음성형: 성향';

-- 페르소나 프롬프트
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_persona_prompt TEXT;
COMMENT ON COLUMN contents.voice_persona_prompt IS '음성형: 페르소나/시스템 프롬프트';

-- 음성 상담 최초 인사 (접속 시 AI에 주입). {{userName}} 치환
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_initial_greet_prompt TEXT;
COMMENT ON COLUMN contents.voice_initial_greet_prompt IS '음성형: 첫 상담 시 접속 후 AI 최초 인사 지시문';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_resumed_greet_prompt TEXT;
COMMENT ON COLUMN contents.voice_resumed_greet_prompt IS '음성형: 재접속 시 AI 인사 지시문';

-- 시작소리 mp3 URL
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_start_sound_url TEXT;
COMMENT ON COLUMN contents.voice_start_sound_url IS '음성형: 시작 시 재생 mp3 URL';

-- 대화중 방울 소리 mp3 URL
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_bubble_sound_url TEXT;
COMMENT ON COLUMN contents.voice_bubble_sound_url IS '음성형: 대화 중 방울 소리 mp3 URL';

-- 대화중 방울 소리 발현 확률 (0~100)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_bubble_sound_probability_pct INTEGER;
COMMENT ON COLUMN contents.voice_bubble_sound_probability_pct IS '음성형: 방울 소리 발현 확률 %';

-- 보이스 이름 (Puck, Charon, Fenrir, Aoede, Kore 등)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_name TEXT;
COMMENT ON COLUMN contents.voice_name IS '음성형: Gemini 보이스 이름';

-- 시간 상품 옵션 (JSONB 배열) [{minutes:5, price:3000, label:"5분"}, ...]
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_time_options JSONB;
COMMENT ON COLUMN contents.voice_time_options IS '음성형: 시간 상품 옵션 [{minutes, price, label}, ...]';

-- 상담사명 (예: 별님아씨)
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_counselor_name TEXT;
COMMENT ON COLUMN contents.voice_counselor_name IS '음성형: 상담사 표시명 (예: 별님아씨)';
