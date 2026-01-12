-- contents 테이블에 payment_code 필드 추가
ALTER TABLE contents 
ADD COLUMN IF NOT EXISTS payment_code VARCHAR(4) UNIQUE;

-- 기존 컨텐츠에 payment_code 자동 부여 (순차적으로 1000부터 시작)
DO $$
DECLARE
  counter INTEGER := 1000;
  content_record RECORD;
BEGIN
  -- payment_code가 NULL인 컨텐츠들을 id 순서대로 정렬하여 순차적으로 부여
  FOR content_record IN 
    SELECT id FROM contents 
    WHERE payment_code IS NULL 
    ORDER BY id ASC
  LOOP
    -- 중복되지 않는 코드 찾기
    WHILE EXISTS (SELECT 1 FROM contents WHERE payment_code = LPAD(counter::TEXT, 4, '0')) LOOP
      counter := counter + 1;
    END LOOP;
    
    UPDATE contents 
    SET payment_code = LPAD(counter::TEXT, 4, '0')
    WHERE id = content_record.id;
    
    counter := counter + 1;
  END LOOP;
END $$;

-- payment_code에 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_contents_payment_code ON contents(payment_code);
