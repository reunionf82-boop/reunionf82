#!/bin/bash

# Supabase 스키마 추출 스크립트
# 사용법: ./scripts/export-supabase-schema.sh

echo "🚀 Supabase 스키마 추출 시작..."

# Supabase CLI 설치 확인
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI가 설치되지 않았습니다."
    echo "설치 방법: npm install -g supabase"
    exit 1
fi

# 프로젝트 연결 확인
if [ -z "$SUPABASE_PROJECT_REF" ]; then
    echo "⚠️  SUPABASE_PROJECT_REF 환경 변수가 설정되지 않았습니다."
    echo "Supabase 대시보드에서 프로젝트 참조 ID를 확인하세요."
    echo "예: export SUPABASE_PROJECT_REF=your-project-ref"
    exit 1
fi

# SQL 파일 출력 경로
OUTPUT_FILE="supabase-schema-$(date +%Y%m%d-%H%M%S).sql"

echo "📋 프로젝트: $SUPABASE_PROJECT_REF"
echo "📁 출력 파일: $OUTPUT_FILE"

# 스키마 추출
supabase db dump --project-ref $SUPABASE_PROJECT_REF --schema public > $OUTPUT_FILE

if [ $? -eq 0 ]; then
    echo "✅ 스키마 추출 완료: $OUTPUT_FILE"
    echo ""
    echo "📝 다음 단계:"
    echo "   1. 생성된 SQL 파일을 확인하세요"
    echo "   2. 새 리전의 Supabase 프로젝트에 SQL을 실행하세요"
else
    echo "❌ 스키마 추출 실패"
    exit 1
fi








