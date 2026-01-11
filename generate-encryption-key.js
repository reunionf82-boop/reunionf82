#!/usr/bin/env node

/**
 * 암호화 키 생성 스크립트
 * 
 * 사용법:
 *   node generate-encryption-key.js
 * 
 * 출력된 키를 .env.local 파일의 ENCRYPTION_KEY에 설정하세요.
 */

const crypto = require('crypto')

// 64자 hex 문자열 생성 (32바이트 = 256비트)
const key = crypto.randomBytes(32).toString('hex')

console.log('\n' + '='.repeat(70))
console.log('🔐 암호화 키 생성 완료!')
console.log('='.repeat(70))
console.log('\n생성된 키 (64자 hex 문자열):')
console.log(key)
console.log('\n' + '-'.repeat(70))
console.log('📝 .env.local 파일에 다음을 추가하세요:')
console.log('-'.repeat(70))
console.log(`ENCRYPTION_KEY=${key}`)
console.log('\n' + '='.repeat(70))
console.log('⚠️  보안 주의사항:')
console.log('   - 이 키를 Git에 커밋하지 마세요!')
console.log('   - .env.local은 .gitignore에 포함되어 있어야 합니다.')
console.log('   - 프로덕션 환경에서는 환경 변수로 설정하세요.')
console.log('='.repeat(70) + '\n')
