import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'

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

export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const body = await req.json()
    const { id, menu_items, preview_thumbnails, ...restData } = body

    const dataToSave = {
      ...restData,
      menu_items: menu_items ? JSON.stringify(menu_items) : null,
      preview_thumbnails: preview_thumbnails ? (Array.isArray(preview_thumbnails) ? JSON.stringify(preview_thumbnails) : preview_thumbnails) : '[]',
      updated_at: getKSTNow(), // KST 기준으로 저장
    }

    if (id) {
      // 업데이트
      // payment_code는 변경 불가 (이미 설정된 경우 유지)
      if (dataToSave.payment_code === undefined || dataToSave.payment_code === null) {
        // payment_code가 전달되지 않은 경우 기존 값 유지
        delete dataToSave.payment_code
      }
      
      const { data, error } = await supabase
        .from('contents')
        .update(dataToSave)
        .eq('id', id)
        .select()

      if (error) {
        return NextResponse.json(
          { error: `저장에 실패했습니다: ${error.message}` },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: '저장에 실패했습니다: 업데이트 결과를 가져올 수 없습니다.' },
          { status: 500 }
        )
      }

      // menu_items와 preview_thumbnails 파싱
      const result = data[0]
      if (result.menu_items && typeof result.menu_items === 'string') {
        try {
          result.menu_items = JSON.parse(result.menu_items)
        } catch (e) {
          result.menu_items = []
        }
      }
      // preview_thumbnails 파싱
      if (result.preview_thumbnails) {
        if (typeof result.preview_thumbnails === 'string') {
          try {
            result.preview_thumbnails = JSON.parse(result.preview_thumbnails)
          } catch (e) {
            result.preview_thumbnails = []
          }
        }
        if (!Array.isArray(result.preview_thumbnails)) {
          result.preview_thumbnails = []
        }
      } else {
        result.preview_thumbnails = []
      }

      return NextResponse.json({ data: result })
    } else {
      // 새로 생성 - id 필드 제거 (자동 생성되도록)
      const { id: _, ...dataWithoutId } = dataToSave
      
      // payment_code 자동 부여 (없는 경우에만)
      if (!dataWithoutId.payment_code || dataWithoutId.payment_code === '') {
        // 기존 컨텐츠의 모든 payment_code를 가져와서 숫자로 변환 후 최대값 찾기
        // (문자열 정렬 대신 숫자 비교로 정확한 최대값 찾기)
        const { data: existingCodes } = await supabase
          .from('contents')
          .select('payment_code')
          .not('payment_code', 'is', null)
        
        let nextCode = 1001 // 기본 시작 코드 (1001부터 시작)
        
        if (existingCodes && existingCodes.length > 0) {
          // 모든 payment_code를 숫자로 변환하고 최대값 찾기
          const codeNumbers = existingCodes
            .map(item => {
              const code = item.payment_code
              if (!code) return null
              const num = parseInt(String(code).trim(), 10)
              return isNaN(num) ? null : num
            })
            .filter((num): num is number => num !== null && num >= 1000 && num <= 9999)
          
          if (codeNumbers.length > 0) {
            const maxCode = Math.max(...codeNumbers)
            nextCode = maxCode + 1
          }
        }
        
        // 9999를 넘으면 에러 발생 (VARCHAR(4) 제한)
        if (nextCode > 9999) {
          return NextResponse.json(
            { error: '저장에 실패했습니다: 결제 코드가 최대값(9999)을 초과했습니다. 관리자에게 문의하세요.' },
            { status: 500 }
          )
        }
        
        // 4자리로 포맷팅 (예: 1001, 1002, ...)
        dataWithoutId.payment_code = String(nextCode).padStart(4, '0')
      } else {
        // 클라이언트에서 payment_code를 전송한 경우, 4글자 제한 검증
        const paymentCodeStr = String(dataWithoutId.payment_code).trim()
        if (paymentCodeStr.length > 4) {
          return NextResponse.json(
            { error: '저장에 실패했습니다: 결제 코드는 4글자 이하여야 합니다.' },
            { status: 400 }
          )
        }
        // 4글자 이하로 제한
        dataWithoutId.payment_code = paymentCodeStr.substring(0, 4)
      }
      
      const { data, error } = await supabase
        .from('contents')
        .insert({
          ...dataWithoutId,
          created_at: getKSTNow(), // KST 기준으로 저장
        })
        .select()

      if (error) {
        return NextResponse.json(
          { error: `저장에 실패했습니다: ${error.message}` },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: '저장에 실패했습니다: 생성 결과를 가져올 수 없습니다.' },
          { status: 500 }
        )
      }

      // menu_items와 preview_thumbnails 파싱
      const result = data[0]
      if (result.menu_items && typeof result.menu_items === 'string') {
        try {
          result.menu_items = JSON.parse(result.menu_items)
        } catch (e) {
          result.menu_items = []
        }
      }
      // preview_thumbnails 파싱
      if (result.preview_thumbnails) {
        if (typeof result.preview_thumbnails === 'string') {
          try {
            result.preview_thumbnails = JSON.parse(result.preview_thumbnails)
          } catch (e) {
            result.preview_thumbnails = []
          }
        }
        if (!Array.isArray(result.preview_thumbnails)) {
          result.preview_thumbnails = []
        }
      } else {
        result.preview_thumbnails = []
      }

      return NextResponse.json({ data: result })
    }
  } catch (error: any) {
    const errorMessage = error?.message || '저장 중 오류가 발생했습니다.'
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    )
  }
}

