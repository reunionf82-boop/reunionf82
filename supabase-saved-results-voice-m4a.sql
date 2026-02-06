-- saved_results: iOS Safari 재생용 M4A URL (WebM 원본은 voice_audio_url 유지)
ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS voice_audio_url_m4a TEXT;
COMMENT ON COLUMN saved_results.voice_audio_url_m4a IS '음성형: iOS 재생용 M4A 변환본 URL (원본 WebM은 voice_audio_url)';
