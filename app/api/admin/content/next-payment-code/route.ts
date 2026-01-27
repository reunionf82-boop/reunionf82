import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 서버 사이드에서만 서비스 롤 키 사용
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다. .env.local 파일에 SUPABASE_SERVICE_ROLE_KEY를 설정하세요.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

/**
 * 다음 결제 코드 조회 API
 * GET /api/admin/content/next-payment-code
 * 
 * DB에서 최대 결제 코드를 찾아서 +1한 값을 반환
 */
export async function GET(request: NextRequest) {
  try {
    // 관리자 인증 확인
    const cookieStore = await request.cookies
    const session = cookieStore.get('admin_session')

    if (session?.value !== 'authenticated') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { status: 401 }
      )
    }

    const supabase = getSupabaseClient()

    // 기존 컨텐츠의 모든 payment_code를 가져와서 Set으로 변환 (빠른 조회를 위해)
    const { data: existingCodes, error } = await supabase
      .from('contents')
      .select('payment_code')
      .not('payment_code', 'is', null)

    if (error) {
      return NextResponse.json(
        { error: error.message || '결제 코드를 조회하는데 실패했습니다.' },
        { status: 500 }
      )
    }

    // 존재하는 payment_code를 Set으로 변환 (빠른 조회를 위해)
    const existingCodeSet = new Set<string>()
    if (existingCodes && existingCodes.length > 0) {
      existingCodes.forEach(item => {
        if (item.payment_code) {
          const code = String(item.payment_code).trim()
          // 1000-9999 범위의 코드만 고려
          const num = parseInt(code, 10)
          if (!isNaN(num) && num >= 1000 && num <= 9999) {
            existingCodeSet.add(code.padStart(4, '0')) // 4자리로 정규화
          }
        }
      })
    }

    // 1001부터 순차적으로 증가하면서 DB에 없는 첫 번째 값 찾기
    let nextCode = 1001
    while (nextCode <= 9999) {
      const codeStr = String(nextCode).padStart(4, '0')
      if (!existingCodeSet.has(codeStr)) {
        // 이 코드가 DB에 없으므로 사용 가능
        break
      }
      nextCode++
    }

    // 9999를 넘으면 에러 발생 (VARCHAR(4) 제한)
    if (nextCode > 9999) {
      return NextResponse.json(
        { error: '결제 코드가 최대값(9999)을 초과했습니다. 관리자에게 문의하세요.' },
        { status: 500 }
      )
    }

    // 4자리로 포맷팅 (예: 1001, 1002, ...)
    const nextPaymentCode = String(nextCode).padStart(4, '0')

    return NextResponse.json({
      success: true,
      nextPaymentCode,
      nextCode
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '결제 코드를 조회하는 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
