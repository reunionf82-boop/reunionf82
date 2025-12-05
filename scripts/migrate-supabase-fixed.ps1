# Supabase 전체 마이그레이션 스크립트 (PowerShell)
# 사용법: .\scripts\migrate-supabase.ps1 -OldProjectRef "old-ref" -NewProjectRef "new-ref"

param(
    [Parameter(Mandatory=$true)]
    [string]$OldProjectRef,
    
    [Parameter(Mandatory=$true)]
    [string]$NewProjectRef,
    
    [string]$OutputDir = "migration-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
)

Write-Host "🚀 Supabase 전체 마이그레이션 시작..." -ForegroundColor Cyan
Write-Host ""

# 출력 디렉토리 생성
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Write-Host "📁 출력 디렉토리: $OutputDir" -ForegroundColor Cyan
Write-Host ""

# Supabase CLI 확인
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCmd) {
    Write-Host "❌ Supabase CLI가 설치되지 않았습니다." -ForegroundColor Red
    Write-Host "설치: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# 구분선 함수
function Write-Separator {
    param([string]$Color = "Cyan")
    Write-Host ("=" * 60) -ForegroundColor $Color
}

# 1단계: 기존 프로젝트에서 덤프 생성
Write-Separator -Color Cyan
Write-Host "1단계: 기존 프로젝트에서 덤프 생성" -ForegroundColor Yellow
Write-Separator -Color Cyan

Write-Host "기존 프로젝트 연결 중: $OldProjectRef" -ForegroundColor Cyan
supabase link --project-ref $OldProjectRef

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ 프로젝트 연결 실패" -ForegroundColor Red
    exit 1
}

Write-Host "전체 덤프 생성 중..." -ForegroundColor Cyan
supabase db dump | Out-File -FilePath "$OutputDir\full-dump.sql" -Encoding UTF8

Write-Host "스키마만 추출 중..." -ForegroundColor Cyan
supabase db dump --schema-only | Out-File -FilePath "$OutputDir\schema-only.sql" -Encoding UTF8

Write-Host "데이터만 추출 중..." -ForegroundColor Cyan
supabase db dump --data-only | Out-File -FilePath "$OutputDir\data-only.sql" -Encoding UTF8

Write-Host "✅ 덤프 생성 완료" -ForegroundColor Green
Write-Host ""

# 2단계: RLS 정책 추출을 위한 SQL 생성
Write-Separator -Color Cyan
Write-Host "2단계: RLS 정책 추출 SQL 생성" -ForegroundColor Yellow
Write-Separator -Color Cyan

$rlsSQL = @"
-- RLS 정책 추출 쿼리
-- 이 쿼리를 기존 프로젝트의 SQL Editor에서 실행하세요

SELECT
  'CREATE POLICY "' || policyname || '" ON ' || tablename || 
  ' FOR ' || cmd || 
  ' TO ' || array_to_string(roles, ', ') ||
  CASE 
    WHEN qual IS NOT NULL THEN ' USING (' || qual || ')'
    ELSE ''
  END ||
  CASE 
    WHEN with_check IS NOT NULL THEN ' WITH CHECK (' || with_check || ')'
    ELSE ''
  END || ';' as policy_sql
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
"@

$rlsSQL | Out-File -FilePath "$OutputDir\rls-policies-query.sql" -Encoding UTF8
Write-Host "✅ RLS 정책 추출 쿼리 생성 완료: $OutputDir\rls-policies-query.sql" -ForegroundColor Green
Write-Host ""

# 3단계: 인덱스 추출을 위한 SQL 생성
Write-Separator -Color Cyan
Write-Host "3단계: 인덱스 추출 SQL 생성" -ForegroundColor Yellow
Write-Separator -Color Cyan

$indexSQL = @"
-- 인덱스 추출 쿼리
-- 이 쿼리를 기존 프로젝트의 SQL Editor에서 실행하세요

SELECT indexdef || ';' as index_sql
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
"@

$indexSQL | Out-File -FilePath "$OutputDir\indexes-query.sql" -Encoding UTF8
Write-Host "✅ 인덱스 추출 쿼리 생성 완료: $OutputDir\indexes-query.sql" -ForegroundColor Green
Write-Host ""

# 4단계: 마이그레이션 가이드 생성
Write-Separator -Color Cyan
Write-Host "4단계: 마이그레이션 가이드 생성" -ForegroundColor Yellow
Write-Separator -Color Cyan

$guide = @"
# Supabase 마이그레이션 가이드

## 생성된 파일
- full-dump.sql: 전체 덤프 (스키마 + 데이터)
- schema-only.sql: 스키마만
- data-only.sql: 데이터만
- rls-policies-query.sql: RLS 정책 추출 쿼리
- indexes-query.sql: 인덱스 추출 쿼리

## 마이그레이션 단계

### 1. 새 프로젝트 생성
- Supabase 대시보드에서 새 리전에 프로젝트 생성
- 프로젝트 참조 ID: $NewProjectRef

### 2. 스키마 복원
1. 새 프로젝트의 SQL Editor 접속
2. schema-only.sql 파일 내용 복사
3. 실행

### 3. RLS 정책 추출 및 복원
1. 기존 프로젝트 SQL Editor에서 rls-policies-query.sql 실행
2. 결과를 복사하여 새 프로젝트 SQL Editor에서 실행

### 4. 인덱스 추출 및 복원
1. 기존 프로젝트 SQL Editor에서 indexes-query.sql 실행
2. 결과를 복사하여 새 프로젝트 SQL Editor에서 실행

### 5. 데이터 복원
1. 새 프로젝트 SQL Editor에서 data-only.sql 실행
2. 또는 full-dump.sql 사용 (스키마 포함)

### 6. Storage 마이그레이션
- Storage 버킷은 수동으로 마이그레이션 필요
- scripts/migrate-storage.js 스크립트 사용 가능

### 7. 환경 변수 업데이트
.env.local 파일 수정:
NEXT_PUBLIC_SUPABASE_URL=https://$NewProjectRef.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=새-프로젝트-키

### 8. 검증
- 테이블 개수 확인
- 데이터 개수 확인
- RLS 정책 확인
- 애플리케이션 테스트
"@

$guide | Out-File -FilePath "$OutputDir\MIGRATION_GUIDE.md" -Encoding UTF8
Write-Host "✅ 마이그레이션 가이드 생성 완료: $OutputDir\MIGRATION_GUIDE.md" -ForegroundColor Green
Write-Host ""

# 완료 메시지
Write-Separator -Color Green
Write-Host "✅ 마이그레이션 준비 완료!" -ForegroundColor Green
Write-Separator -Color Green
Write-Host ""
Write-Host "📋 다음 단계:" -ForegroundColor Cyan
Write-Host "   1. $OutputDir 폴더의 파일들을 확인하세요" -ForegroundColor White
Write-Host "   2. 새 리전에 Supabase 프로젝트를 생성하세요" -ForegroundColor White
Write-Host "   3. MIGRATION_GUIDE.md 파일의 단계를 따라하세요" -ForegroundColor White
Write-Host ""
Write-Host "⚠️  주의사항:" -ForegroundColor Yellow
Write-Host "   - 마이그레이션 전 반드시 백업을 확인하세요" -ForegroundColor White
Write-Host "   - 새 프로젝트에 복원 후 검증 완료 전까지 기존 프로젝트를 유지하세요" -ForegroundColor White
Write-Host ""

