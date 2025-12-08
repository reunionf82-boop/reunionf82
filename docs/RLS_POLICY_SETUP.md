# Supabase RLS 정책 설정 가이드

## 문제
Security Advisor에서 다음 에러가 표시됩니다:
- `public.app_settings`: RLS Disabled in Public
- `public.portal_results`: RLS Disabled in Public

## 해결 방법

### 방법 1: 간단한 정책 적용 (권장)

1. **Supabase SQL Editor 접속**
   - 새 프로젝트의 SQL Editor 열기

2. **SQL 파일 실행**
   - `supabase-rls-policies-simple.sql` 파일 내용을 복사
   - SQL Editor에 붙여넣기
   - 실행 (Run)

3. **결과 확인**
   - Security Advisor 새로고침
   - 에러가 사라졌는지 확인

### 방법 2: 상세한 정책 적용

`supabase-rls-policies.sql` 파일을 사용하면 더 세밀한 제어가 가능합니다.

## 정책 설명

### app_settings 테이블
- **읽기**: 모든 사용자 허용 (공개 설정)
- **쓰기**: 인증된 사용자 허용
- **참고**: 서버 사이드에서 서비스 롤 키를 사용하면 RLS를 우회합니다

### portal_results 테이블
- **옵션 1**: JWT 기반 인증 사용 시
  - 사용자는 자신의 데이터만 접근 가능
  - `auth.uid() = user_id` 조건 사용
  
- **옵션 2**: 서비스 롤 키 사용 시 (현재 적용됨)
  - 서비스 롤 키는 RLS를 우회
  - Security Advisor 경고 해결용 정책 추가

- **옵션 3**: 완전 공개 (개발/테스트용, 비권장)

## 현재 적용된 정책 확인

```sql
SELECT 
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('app_settings', 'portal_results');
```

## 문제 해결

### 정책이 적용되지 않는 경우

1. **RLS가 활성화되었는지 확인**
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE schemaname = 'public' 
     AND tablename IN ('app_settings', 'portal_results');
   ```
   - `rowsecurity`가 `true`여야 합니다

2. **정책 삭제 후 재생성**
   ```sql
   -- 기존 정책 삭제
   DROP POLICY IF EXISTS "policy_name" ON public.table_name;
   
   -- 새 정책 생성
   -- supabase-rls-policies-simple.sql 실행
   ```

### 서비스 롤 키 사용 시

서비스 롤 키를 사용하는 경우 RLS 정책이 적용되지 않습니다. 
이는 정상 동작이며, Security Advisor 경고를 해결하기 위해 `service_role` 정책을 추가했습니다.

## 다음 단계

1. ✅ RLS 정책 적용 완료
2. ✅ Security Advisor 에러 해결 확인
3. ✅ 애플리케이션 테스트
4. ✅ 데이터 접근 권한 확인







