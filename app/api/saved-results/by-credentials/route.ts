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

    // user_credentials에서 만료되지 않은 모든 레코드 조회
    const { data: credentials, error: credentialsError } = await supabase
      .from('user_credentials')
      .select('saved_id, encrypted_phone, encrypted_password')
      .gt('expires_at', new Date().toISOString()) // 만료되지 않은 것만
      .order('created_at', { ascending: false })

    if (credentialsError) {
      return NextResponse.json(
        { success: false, error: '인증 정보 조회에 실패했습니다.', details: credentialsError.message },
        { status: 500 }
      )
    }

    // 복호화하여 일치하는 항목 찾기
    const matchingSavedIds: number[] = []
    const seenSavedIds = new Set<number>() // 중복 제거용
    
    for (const cred of credentials || []) {
      if (!cred.saved_id || seenSavedIds.has(cred.saved_id)) continue
      
      try {
        const decryptedPhone = decrypt(cred.encrypted_phone)
        const decryptedPassword = decrypt(cred.encrypted_password)
        
        if (decryptedPhone === phone && decryptedPassword === password) {
          matchingSavedIds.push(cred.saved_id)
          seenSavedIds.add(cred.saved_id)
        }
      } catch (decryptError) {
        // 복호화 실패 시 건너뛰기
        continue
      }
    }

    if (matchingSavedIds.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    // saved_results에서 해당 saved_id들의 결과 조회 (최근 6개월)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const { data: savedResults, error: resultsError } = await supabase
      .from('saved_results')
      .select('*')
      .in('id', matchingSavedIds)
      .gte('saved_at', sixMonthsAgo.toISOString())
      .order('saved_at', { ascending: false })

    if (resultsError) {
      return NextResponse.json(
        { success: false, error: '저장된 결과 조회에 실패했습니다.', details: resultsError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: savedResults || []
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
