# Supabase CLI 설치 가이드 (Windows)

## 문제
`npm install -g supabase` 명령어가 작동하지 않습니다.
Supabase CLI는 npm 전역 설치를 지원하지 않습니다.

## 해결 방법

### 방법 1: Scoop 사용 (권장)

1. **Scoop 설치** (아직 설치하지 않은 경우)
   ```powershell
   # PowerShell을 관리자 권한으로 실행
   Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
   irm get.scoop.sh | iex
   ```

2. **Supabase CLI 설치**
   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

3. **설치 확인**
   ```powershell
   supabase --version
   ```

### 방법 2: Chocolatey 사용

1. **Chocolatey 설치** (아직 설치하지 않은 경우)
   - https://chocolatey.org/install 접속
   - 설치 스크립트 실행

2. **Supabase CLI 설치**
   ```powershell
   choco install supabase
   ```

### 방법 3: 수동 다운로드

1. **바이너리 다운로드**
   - https://github.com/supabase/cli/releases 접속
   - 최신 Windows 버전 다운로드 (예: `supabase_windows_amd64.zip`)

2. **압축 해제 및 PATH 추가**
   - 압축 해제
   - `supabase.exe`를 시스템 PATH에 추가하거나 프로젝트 폴더에 복사

3. **설치 확인**
   ```powershell
   .\supabase.exe --version
   ```

## 설치 후

1. **PowerShell 재시작** (PATH 업데이트 반영)

2. **Supabase CLI 로그인**
   ```powershell
   supabase login
   ```

3. **마이그레이션 스크립트 실행**
   ```powershell
   .\scripts\migrate-supabase.ps1 -OldProjectRef "기존-ref" -NewProjectRef "새-ref"
   ```

## 대안: Supabase CLI 없이 마이그레이션

Supabase CLI 없이도 마이그레이션할 수 있습니다:

1. **Supabase 대시보드에서 SQL 추출**
   - SQL Editor에서 테이블 정의 복사
   - `docs/SQL_EDITOR_MIGRATION.md` 참고

2. **수동으로 SQL 실행**
   - 새 프로젝트 SQL Editor에서 SQL 실행

3. **RLS 정책 적용**
   - `supabase-rls-policies-simple.sql` 실행

## 참고

- Supabase CLI 공식 문서: https://supabase.com/docs/guides/cli
- GitHub 릴리스: https://github.com/supabase/cli/releases















