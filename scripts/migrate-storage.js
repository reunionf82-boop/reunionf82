/**
 * Supabase Storage 마이그레이션 스크립트
 * 
 * 사용법:
 * node scripts/migrate-storage.js
 * 
 * 환경 변수 필요 (.env.local):
 * - OLD_SUPABASE_URL
 * - OLD_SUPABASE_SERVICE_KEY
 * - NEW_SUPABASE_URL
 * - NEW_SUPABASE_SERVICE_KEY
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const OLD_SUPABASE_URL = process.env.OLD_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const OLD_SUPABASE_KEY = process.env.OLD_SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const NEW_SUPABASE_URL = process.env.NEW_SUPABASE_URL
const NEW_SUPABASE_KEY = process.env.NEW_SUPABASE_SERVICE_KEY

if (!OLD_SUPABASE_URL || !OLD_SUPABASE_KEY) {
  console.error('❌ 기존 Supabase 연결 정보가 없습니다.')
  console.error('환경 변수 설정: OLD_SUPABASE_URL, OLD_SUPABASE_SERVICE_KEY')
  process.exit(1)
}

if (!NEW_SUPABASE_URL || !NEW_SUPABASE_KEY) {
  console.error('❌ 새 Supabase 연결 정보가 없습니다.')
  console.error('환경 변수 설정: NEW_SUPABASE_URL, NEW_SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const oldSupabase = createClient(OLD_SUPABASE_URL, OLD_SUPABASE_KEY)
const newSupabase = createClient(NEW_SUPABASE_URL, NEW_SUPABASE_KEY)

/**
 * Storage 버킷의 모든 파일을 재귀적으로 가져오기
 */
async function listAllFiles(supabase, bucketName, folder = '') {
  const files = []
  
  async function listRecursive(currentFolder) {
    const { data, error } = await supabase.storage
      .from(bucketName)
      .list(currentFolder, {
        limit: 1000,
        sortBy: { column: 'name', order: 'asc' }
      })

    if (error) {
      console.error(`❌ 파일 목록 조회 실패 (${currentFolder}):`, error.message)
      return
    }

    if (!data) return

    for (const item of data) {
      const fullPath = currentFolder ? `${currentFolder}/${item.name}` : item.name
      
      if (item.id === null) {
        // 폴더인 경우 재귀적으로 탐색
        await listRecursive(fullPath)
      } else {
        // 파일인 경우
        files.push({
          name: item.name,
          path: fullPath,
          size: item.metadata?.size,
          mimetype: item.metadata?.mimetype,
          updated_at: item.updated_at
        })
      }
    }
  }

  await listRecursive(folder)
  return files
}

/**
 * Storage 버킷 마이그레이션
 */
async function migrateStorageBucket(bucketName) {
  console.log(`\n📦 버킷 마이그레이션 시작: ${bucketName}`)
  console.log('=' .repeat(60))

  // 1. 새 버킷이 존재하는지 확인, 없으면 생성
  const { data: buckets, error: bucketsError } = await newSupabase.storage.listBuckets()
  
  if (bucketsError) {
    console.error('❌ 버킷 목록 조회 실패:', bucketsError.message)
    return false
  }

  const bucketExists = buckets.some(b => b.name === bucketName)
  
  if (!bucketExists) {
    console.log(`⚠️  새 프로젝트에 버킷 '${bucketName}'이 없습니다.`)
    console.log(`   Supabase 대시보드에서 버킷을 먼저 생성하세요.`)
    return false
  }

  // 2. 기존 버킷에서 파일 목록 가져오기
  console.log('📋 파일 목록 조회 중...')
  const files = await listAllFiles(oldSupabase, bucketName)
  
  if (files.length === 0) {
    console.log('✅ 마이그레이션할 파일이 없습니다.')
    return true
  }

  console.log(`📊 총 ${files.length}개 파일 발견`)

  // 3. 각 파일 복사
  let successCount = 0
  let failCount = 0

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const progress = `[${i + 1}/${files.length}]`

    try {
      // 파일 다운로드
      const { data: fileData, error: downloadError } = await oldSupabase.storage
        .from(bucketName)
        .download(file.path)

      if (downloadError) {
        console.error(`${progress} ❌ 다운로드 실패: ${file.path}`, downloadError.message)
        failCount++
        continue
      }

      // ArrayBuffer를 Blob으로 변환
      const blob = new Blob([fileData], { type: file.mimetype || 'application/octet-stream' })

      // 새 버킷에 업로드
      const { error: uploadError } = await newSupabase.storage
        .from(bucketName)
        .upload(file.path, blob, {
          contentType: file.mimetype,
          upsert: true,
          cacheControl: '3600'
        })

      if (uploadError) {
        console.error(`${progress} ❌ 업로드 실패: ${file.path}`, uploadError.message)
        failCount++
      } else {
        console.log(`${progress} ✅ ${file.path} (${(file.size / 1024).toFixed(2)} KB)`)
        successCount++
      }
    } catch (error) {
      console.error(`${progress} ❌ 오류: ${file.path}`, error.message)
      failCount++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`✅ 성공: ${successCount}개`)
  console.log(`❌ 실패: ${failCount}개`)
  console.log(`📊 총계: ${files.length}개`)

  return failCount === 0
}

/**
 * 메인 실행 함수
 */
async function main() {
  console.log('🚀 Supabase Storage 마이그레이션 시작')
  console.log('기존 프로젝트:', OLD_SUPABASE_URL)
  console.log('새 프로젝트:', NEW_SUPABASE_URL)
  console.log('')

  // 마이그레이션할 버킷 목록
  const bucketsToMigrate = ['thumbnails'] // 필요에 따라 수정

  for (const bucketName of bucketsToMigrate) {
    const success = await migrateStorageBucket(bucketName)
    if (!success) {
      console.log(`\n⚠️  버킷 '${bucketName}' 마이그레이션에 문제가 있습니다.`)
    }
  }

  console.log('\n✅ Storage 마이그레이션 완료!')
}

main().catch(console.error)








