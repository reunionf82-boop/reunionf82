-- VOC 보상(캐시 충전) 시 기존 잔액에 더하기(원자적 증가)
-- Supabase SQL Editor에서 실행 후 grant-time API 사용

CREATE OR REPLACE FUNCTION voice_balance_add_wan(p_content_id int, p_phone text, p_add_wan int)
RETURNS TABLE(new_balance_wan int)
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO voice_balance (content_id, phone, balance_wan, updated_at)
  VALUES (p_content_id, p_phone, GREATEST(0, p_add_wan), now())
  ON CONFLICT (content_id, phone) DO UPDATE SET
    balance_wan = voice_balance.balance_wan + GREATEST(0, p_add_wan),
    updated_at = now()
  RETURNING voice_balance.balance_wan AS new_balance_wan;
$$;

COMMENT ON FUNCTION voice_balance_add_wan(int, text, int) IS 'VOC 보상: 기존 잔액에 p_add_wan원을 더함. 새 행이면 balance_wan = p_add_wan, 기존 행이면 balance_wan += p_add_wan.';
