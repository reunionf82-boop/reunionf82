import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/encryption'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// 전화번호 정규화 함수 (하이픈 제거하여 비교)
function normalizePhone(phone: string): string {
  return phone.replace(/[-\s]/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, password } = body

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: '휴대폰 번호와 비밀번호는 필수입니다.' },
        { status: 400 }
      )
    }

    // 전화번호와 비밀번호 정규화 (공백 제거, 앞뒤 공백 제거)
    const normalizedPhone = normalizePhone(phone.trim())
    const normalizedPassword = password.trim()

    if (!normalizedPhone || !normalizedPassword) {
      return NextResponse.json(
        { success: false, error: '휴대폰 번호와 비밀번호는 필수입니다.' },
        { status: 400 }
      )
    }

    // user_credentials에서 만료되지 않은 모든 레코드 조회
    const { data: credentials, error: credentialsError } = await supabase
      .from('user_credentials')
      .select('saved_id, encrypted_phone, encrypted_password')
      .gt('expires_at', new Date().toISOString()) // 만료되지 않은 것만
      .not('saved_id', 'is', null) // saved_id가 null이 아닌 것만

    if (credentialsError) {
      return NextResponse.json(
        { success: false, error: '인증 정보 조회에 실패했습니다.', details: credentialsError.message },
        { status: 500 }
      )
    }

    if (!credentials || credentials.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // 1단계: 전화번호를 기준으로 먼저 필터링 (전화번호가 프라이머리 키 역할)
    // 전화번호가 일치하는 credential만 찾기
    const phoneMatchedCredentials: Array<{ saved_id: number; encrypted_phone: string; encrypted_password: string }> = []
    
    for (const cred of credentials) {
      if (!cred.saved_id) continue
      
      try {
        const decryptedPhone = decrypt(cred.encrypted_phone)
        const normalizedDecryptedPhone = normalizePhone(decryptedPhone.trim())
        
        // 전화번호가 일치하는 credential만 수집 (1단계 필터링)
        if (normalizedDecryptedPhone === normalizedPhone) {
          phoneMatchedCredentials.push({
            saved_id: cred.saved_id,
            encrypted_phone: cred.encrypted_phone,
            encrypted_password: cred.encrypted_password
          })
        }
      } catch (decryptError) {
        // 복호화 실패 시 건너뛰기
        continue
      }
    }
    
    // 전화번호가 일치하는 credential이 없으면 종료
    if (phoneMatchedCredentials.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }
    
    // 2단계: 전화번호가 일치하는 credential 중에서 비밀번호도 일치하는 것만 선택
    const matchingSavedIds = new Set<number>()
    
    for (const cred of phoneMatchedCredentials) {
      try {
        const decryptedPassword = decrypt(cred.encrypted_password)
        const normalizedDecryptedPassword = decryptedPassword.trim()
        
        // 비밀번호가 정확히 일치하는 경우만 추가 (2단계 필터링)
        if (normalizedDecryptedPassword === normalizedPassword) {
          matchingSavedIds.add(cred.saved_id)
        }
      } catch (decryptError) {
        // 복호화 실패 시 건너뛰기
        continue
      }
    }
    
    // Set을 배열로 변환
    const matchingSavedIdsArray = Array.from(matchingSavedIds)

    if (matchingSavedIdsArray.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // saved_results에서 해당 saved_id들의 결과 조회 (최근 6개월)
    // 전화번호와 비밀번호가 정확히 일치하는 credential의 saved_id만 사용
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: savedResults, error: resultsError } = await supabase
      .from('saved_results')
      .select('*')
      .in('id', matchingSavedIdsArray)
      .gte('saved_at', sixMonthsAgo.toISOString())
      .order('saved_at', { ascending: false })

    if (resultsError) {
      return NextResponse.json(
        { success: false, error: '저장된 결과 조회에 실패했습니다.', details: resultsError.message },
        { status: 500 }
      )
    }

    // 최종 검증: 각 결과의 saved_id가 matchingSavedIdsArray에 포함되어 있는지 확인
    // 그리고 해당 saved_id에 대한 credential이 전화번호와 비밀번호 모두 정확히 일치하는지 다시 확인
    const verifiedResults: any[] = []
    
    for (const result of savedResults || []) {
      // saved_id가 matchingSavedIdsArray에 포함되어 있는지 확인
      if (!matchingSavedIdsArray.includes(result.id)) {
        continue // 포함되지 않으면 건너뛰기
      }
      
      // 해당 saved_id에 대한 credential이 전화번호와 비밀번호 모두 정확히 일치하는지 다시 확인
      // phoneMatchedCredentials에서만 확인 (전화번호가 이미 일치하는 것들만)
      let isValid = false
      for (const cred of phoneMatchedCredentials) {
        if (cred.saved_id !== result.id) continue
        
        try {
          const decryptedPassword = decrypt(cred.encrypted_password)
          const normalizedDecryptedPassword = decryptedPassword.trim()
          
          // 전화번호는 이미 일치하므로 비밀번호만 확인
          if (normalizedDecryptedPassword === normalizedPassword) {
            isValid = true
            break
          }
        } catch (decryptError) {
          continue
        }
      }
      
      if (isValid) {
        verifiedResults.push(result)
      }
    }

    return NextResponse.json({
      success: true,
      data: verifiedResults
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
