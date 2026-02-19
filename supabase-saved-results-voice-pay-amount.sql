-- saved_results 테이블에 음성 상담 유료/무료 구분용 컬럼 추가 (설백야에는 유료만 표시)

ALTER TABLE saved_results ADD COLUMN IF NOT EXISTS voice_pay_amount INTEGER;
COMMENT ON COLUMN saved_results.voice_pay_amount IS '음성형: 결제 금액(원). 0=무료, null=점사형 또는 미설정';
