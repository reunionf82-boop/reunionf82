# Supabase 스키마 추출 스크립트 (PowerShell)
# 사용법: .\scripts\export-supabase-schema.ps1

Write-Host "🚀 Supabase 스키마 추출 시작..." -ForegroundColor Cyan

# Supabase CLI 설치 확인
$supabaseCmd = Get-Command supabase -ErrorAction SilentlyContinue
if (-not $supabaseCmd) {
    Write-Host "❌ Supabase CLI가 설치되지 않았습니다." -ForegroundColor Red
    Write-Host "설치 방법: npm install -g supabase" -ForegroundColor Yellow
    exit 1
}

# 프로젝트 참조 ID 확인
$projectRef = $env:SUPABASE_PROJECT_REF
if (-not $projectRef) {
    Write-Host "⚠️  SUPABASE_PROJECT_REF 환경 변수가 설정되지 않았습니다." -ForegroundColor Yellow
    Write-Host "Supabase 대시보드에서 프로젝트 참조 ID를 확인하세요." -ForegroundColor Yellow
    Write-Host "예: `$env:SUPABASE_PROJECT_REF='your-project-ref'" -ForegroundColor Yellow
    exit 1
}

# SQL 파일 출력 경로
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputFile = "supabase-schema-$timestamp.sql"

Write-Host "📋 프로젝트: $projectRef" -ForegroundColor Cyan
Write-Host "📁 출력 파일: $outputFile" -ForegroundColor Cyan
Write-Host ""

# 스키마 추출
Write-Host "스키마 추출 중..." -ForegroundColor Yellow
supabase db dump --project-ref $projectRef --schema public | Out-File -FilePath $outputFile -Encoding UTF8

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 스키마 추출 완료: $outputFile" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 다음 단계:" -ForegroundColor Cyan
    Write-Host "   1. 생성된 SQL 파일을 확인하세요"
    Write-Host "   2. 새 리전의 Supabase 프로젝트에 SQL을 실행하세요"
} else {
    Write-Host "❌ 스키마 추출 실패" -ForegroundColor Red
    exit 1
}




