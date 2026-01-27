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