/**
 * Supabase 테이블 구조를 조회하여 SQL 생성 스크립트
 * 
 * 사용법:
 * node scripts/generate-supabase-sql.js
 * 
 * 환경 변수 필요:
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY (서비스 롤 키 필요 - RLS 우회)
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// 환경 변수 로드
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  console.error('필요한 환경 변수:')
  console.error('  - NEXT_PUBLIC_SUPABASE_URL')
  console.error('  - SUPABASE_SERVICE_ROLE_KEY (또는 NEXT_PUBLIC_SUPABASE_ANON_KEY)')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

/**
 * PostgreSQL information_schema를 통해 테이블 구조 조회
 */
async function getTableStructure(tableName) {
  try {
    // 테이블의 컬럼 정보 조회
    const { data: columns, error: colError } = await supabase.rpc('exec_sql', {
      query: `
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default,
          udt_name
        FROM information_schema.columns
        WHERE table_schema = 'public' 
          AND table_name = '${tableName}'
        ORDER BY ordinal_position;
      `
    })

    if (colError) {
      // RPC가 없을 수 있으므로 직접 쿼리 시도
      console.log(`⚠️  RPC 방식 실패, 직접 쿼리 시도: ${colError.message}`)
      
      // 대안: Supabase REST API로 직접 조회 (제한적)
      const { data: tableData, error: tableError } = await supabase
        .from(tableName)
        .select('*')
        .limit(0)
      
      if (tableError) {
        throw new Error(`테이블 조회 실패: ${tableError.message}`)
      }
      
      return null // 직접 쿼리로는 스키마를 정확히 알 수 없음
    }

    return columns
  } catch (error) {
    console.error(`테이블 ${tableName} 구조 조회 오류:`, error.message)
    return null
  }
}

/**
 * Supabase Management API를 사용하여 테이블 목록 조회
 */
async function getAllTables() {
  try {
    // Supabase는 PostgreSQL이므로 pg_catalog를 통해 조회
    // 하지만 직접 쿼리는 제한적이므로, 알려진 테이블 목록 사용
    const knownTables = [
      'contents',
      'app_settings',
      'portal_results'
    ]

    console.log('📋 조회할 테이블 목록:', knownTables.join(', '))
    return knownTables
  } catch (error) {
    console.error('테이블 목록 조회 오류:', error.message)
    return []
  }
}

/**
 * 테이블의 인덱스 정보 조회
 */
async function getTableIndexes(tableName) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT
          indexname,
          indexdef
        FROM pg_indexes
        WHERE schemaname = 'public' 
          AND tablename = '${tableName}';
      `
    })

    if (error) {
      return []
    }

    return data || []
  } catch (error) {
    return []
  }
}

/**
 * RLS 정책 조회
 */
async function getRLSPolicies(tableName) {
  try {
    const { data, error } = await supabase.rpc('exec_sql', {
      query: `
        SELECT
          policyname,
          permissive,
          roles,
          cmd,
          qual,
          with_check
        FROM pg_policies
        WHERE schemaname = 'public' 
          AND tablename = '${tableName}';
      `
    })

    if (error) {
      return []
    }

    return data || []
  } catch (error) {
    return []
  }
}

/**
 * SQL 생성
 */
function generateCreateTableSQL(tableName, columns) {
  if (!columns || columns.length === 0) {
    return `-- 테이블 ${tableName}의 구조를 자동으로 생성할 수 없습니다.\n-- Supabase 대시보드에서 직접 확인하세요.\n\n`
  }

  let sql = `-- 테이블: ${tableName}\n`
  sql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`

  const columnDefs = columns.map(col => {
    let def = `  ${col.column_name} `
    
    // 데이터 타입 변환
    if (col.data_type === 'character varying') {
      def += `VARCHAR(${col.character_maximum_length || 255})`
    } else if (col.data_type === 'text') {
      def += 'TEXT'
    } else if (col.data_type === 'integer') {
      def += 'INTEGER'
    } else if (col.data_type === 'bigint') {
      def += 'BIGINT'
    } else if (col.data_type === 'boolean') {
      def += 'BOOLEAN'
    } else if (col.data_type === 'timestamp with time zone') {
      def += 'TIMESTAMPTZ'
    } else if (col.data_type === 'timestamp without time zone') {
      def += 'TIMESTAMP'
    } else if (col.data_type === 'jsonb') {
      def += 'JSONB'
    } else if (col.data_type === 'uuid') {
      def += 'UUID'
    } else {
      def += col.udt_name?.toUpperCase() || col.data_type.toUpperCase()
    }

    // NULL 제약
    if (col.is_nullable === 'NO') {
      def += ' NOT NULL'
    }

    // 기본값
    if (col.column_default) {
      def += ` DEFAULT ${col.column_default}`
    }

    return def
  })

  sql += columnDefs.join(',\n')
  sql += '\n);\n\n'

  return sql
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('🚀 Supabase 테이블 구조 조회 시작...\n')
  console.log('📍 Supabase URL:', supabaseUrl)

  const tables = await getAllTables()
  let allSQL = `-- Supabase 테이블 구조 SQL\n`
  allSQL += `-- 생성일: ${new Date().toISOString()}\n`
  allSQL += `-- 주의: 이 SQL은 Supabase 대시보드에서 확인한 정보를 기반으로 생성되었습니다.\n\n`

  for (const tableName of tables) {
    console.log(`\n📊 테이블 조회 중: ${tableName}`)
    
    // 테이블이 존재하는지 확인
    const { data: testData, error: testError } = await supabase
      .from(tableName)
      .select('*')
      .limit(1)

    if (testError) {
      console.log(`  ⚠️  테이블 ${tableName} 접근 불가: ${testError.message}`)
      allSQL += `-- 테이블 ${tableName}: 접근 불가 (${testError.message})\n\n`
      continue
    }

    console.log(`  ✅ 테이블 ${tableName} 존재 확인`)

    // Supabase 대시보드에서 직접 확인하도록 안내
    allSQL += `-- ============================================\n`
    allSQL += `-- 테이블: ${tableName}\n`
    allSQL += `-- ============================================\n`
    allSQL += `-- 이 테이블의 정확한 구조는 Supabase 대시보드에서 확인하세요:\n`
    allSQL += `-- ${supabaseUrl.replace('/rest/v1', '')}/project/_/editor\n\n`
  }

  // SQL 파일 저장
  const outputPath = path.join(__dirname, '..', 'supabase-schema.sql')
  fs.writeFileSync(outputPath, allSQL, 'utf-8')
  
  console.log(`\n✅ SQL 파일 생성 완료: ${outputPath}`)
  console.log('\n📝 다음 단계:')
  console.log('   1. Supabase 대시보드에 접속하세요')
  console.log('   2. Table Editor에서 각 테이블의 구조를 확인하세요')
  console.log('   3. SQL Editor에서 "Show table definition" 기능을 사용하세요')
  console.log('   4. 생성된 SQL을 수동으로 보완하세요')
}

main().catch(console.error)















