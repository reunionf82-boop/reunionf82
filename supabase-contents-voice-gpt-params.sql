-- contents: GPT Realtime 전용 파라미터
-- temperature: 0.6 ~ 1.2 (기본 0.8). 낮을수록 일관성/집중, 높을수록 창의성/다양성.
ALTER TABLE contents ADD COLUMN IF NOT EXISTS voice_temperature NUMERIC DEFAULT 0.8;
COMMENT ON COLUMN contents.voice_temperature IS '음성형(GPT): Temperature (0.6~1.2). 낮을수록 차분/정확, 높을수록 감정/다양.';
