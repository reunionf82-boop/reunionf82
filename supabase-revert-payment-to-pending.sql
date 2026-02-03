-- 개발/테스트용: success로 바뀐 결제를 다시 pending으로 되돌리기
-- ⚠️ 개발 DB에서만 사용하세요. 프로덕션에서는 사용하지 마세요.

-- DB만 바꿔도 브라우저 화면은 그대로일 수 있음: 폼은 URL(confirmedOid)과 sessionStorage 기준으로
-- "결제 확인됨"을 보여줍니다. 다시 pending인 것처럼 보이게 하려면 confirmedOid 없이 /form 접속하거나,
-- sessionStorage(payment_confirmed_oid 등)를 지우거나, 시크릿 창에서 /form 으로 접속하세요.

-- 1) Supabase Table Editor → payments → 해당 건의 oid(또는 전화번호/이름) 확인
-- 2) 아래 중 하나만 주석 해제하고, 값을 넣은 뒤 SQL Editor에서 실행

-- (A) 주문번호(oid)로 되돌리기 — oid 를 알 때
-- UPDATE public.payments SET status = 'pending', completed_at = NULL, updated_at = NOW() WHERE oid = '여기에oid';

-- (B) 전화번호로 최근 success 1건 되돌리기 — 숫자만 넣기 (예: 01012345678)
-- UPDATE public.payments SET status = 'pending', completed_at = NULL, updated_at = NOW()
-- WHERE id = (SELECT id FROM public.payments WHERE status = 'success' AND phone_number LIKE '%01012345678%' ORDER BY created_at DESC LIMIT 1);

-- (C) 이름(user_name)으로 최근 success 1건 되돌리기
-- UPDATE public.payments SET status = 'pending', completed_at = NULL, updated_at = NOW()
-- WHERE id = (SELECT id FROM public.payments WHERE status = 'success' AND user_name = '김동관' ORDER BY created_at DESC LIMIT 1);

-- 김동관 결제 1건 pending으로 되돌리기 (바로 실행용)
UPDATE public.payments
SET status = 'pending', completed_at = NULL, updated_at = NOW()
WHERE id = (
  SELECT id FROM public.payments
  WHERE status = 'success' AND user_name = '김동관'
  ORDER BY created_at DESC
  LIMIT 1
);
