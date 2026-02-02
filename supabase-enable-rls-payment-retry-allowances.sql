-- Supabase Security Advisor: public.payment_retry_allowances RLS 활성화
-- 이 테이블은 서버 API(allow-retry, payment/status)에서만 접근하며 서비스 롤을 사용하므로 RLS를 우회합니다.
-- RLS 활성화 시 anon/authenticated 직접 접근은 차단되고, Security Advisor 오류가 해소됩니다.

ALTER TABLE IF EXISTS public.payment_retry_allowances ENABLE ROW LEVEL SECURITY;

-- anon/authenticated 직접 접근 금지 정책 (Security Advisor "RLS Enabled No Policy" 제안 해소)
-- 서버 API는 서비스 롤(service_role)로 접근하므로 RLS를 우회하여 정상 동작합니다.
DROP POLICY IF EXISTS "payment_retry_allowances_no_public_access" ON public.payment_retry_allowances;
DROP POLICY IF EXISTS "payment_retry_allowances_no_authenticated_access" ON public.payment_retry_allowances;
CREATE POLICY "payment_retry_allowances_no_public_access"
  ON public.payment_retry_allowances
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY "payment_retry_allowances_no_authenticated_access"
  ON public.payment_retry_allowances
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
