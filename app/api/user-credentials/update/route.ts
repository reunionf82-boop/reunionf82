import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const { requestKey, savedId } = body

    if (!requestKey || !savedId) {
      return NextResponse.json(
        { error: 'requestKey와 savedId는 필수입니다.' },
        { status: 400 }
      )
    }

    const normalizedRequestKey = String(requestKey).trim()
    const savedIdNumber =
      typeof savedId === 'number' ? savedId : parseInt(String(savedId), 10)

    if (!normalizedRequestKey) {
      return NextResponse.json({ error: 'requestKey가 비어있습니다.' }, { status: 400 })
    }

    if (!Number.isFinite(savedIdNumber)) {
      return NextResponse.json(
        { error: 'savedId가 유효한 숫자가 아닙니다.', details: String(savedId) },
        { status: 400 }
      )
    }

    console.log('[user-credentials/update] 요청:', {
      requestKey: normalizedRequestKey,
      savedId: savedIdNumber
    })

    // request_key로 user_credentials 찾아서 saved_id 업데이트
    // - expires_at 조건으로 인해 업데이트가 누락되는 케이스를 방지하기 위해, request_key 기준으로 일괄 업데이트합니다.
    // - saved_id가 이미 있는 행은 덮어쓰지 않도록 NULL인 행만 업데이트합니다.
    // 먼저 해당 request_key의 기존 데이터 확인
    const { data: existingData, error: checkError } = await supabase
      .from('user_credentials')
      .select('id, request_key, saved_id, created_at, expires_at')
      .eq('request_key', normalizedRequestKey)
    
    console.log('[user-credentials/update] 기존 데이터 확인:', {
      requestKey: normalizedRequestKey,
      existingCount: existingData?.length || 0,
      existingData: existingData
    })
    
    // saved_id가 NULL인 행만 업데이트하거나, 모든 행을 업데이트 (saved_id가 이미 설정된 경우도 덮어쓰기)
    // 먼저 saved_id가 NULL인 행만 업데이트 시도
    let { data, error } = await supabase
      .from('user_credentials')
      .update({ saved_id: savedIdNumber })
      .eq('request_key', normalizedRequestKey)
      .is('saved_id', null)
      .select('id, request_key, saved_id, created_at, expires_at')

    // saved_id가 NULL인 행이 없으면, 모든 행을 업데이트 (이미 saved_id가 설정된 경우도 덮어쓰기)
    if (!data || data.length === 0) {
      console.log('[user-credentials/update] saved_id가 NULL인 행이 없음, 모든 행 업데이트 시도')
      const updateResult = await supabase
        .from('user_credentials')
        .update({ saved_id: savedIdNumber })
        .eq('request_key', normalizedRequestKey)
        .select('id, request_key, saved_id, created_at, expires_at')
      
      data = updateResult.data
      error = updateResult.error
    }

    if (error) {
      return NextResponse.json(
        { error: '인증 정보 업데이트에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    if (!data || data.length === 0) {
      console.log('[user-credentials/update] 업데이트 대상 없음:', {
        requestKey: normalizedRequestKey,
        savedId: savedIdNumber,
        existingData: existingData
      })
      return NextResponse.json(
        {
          error: '업데이트할 인증 정보를 찾을 수 없습니다. (requestKey 매칭 실패)',
          details: { requestKey: normalizedRequestKey, savedId: savedIdNumber }
        },
        { status: 404 }
      )
    }

    console.log('[user-credentials/update] 업데이트 성공:', {
      updatedCount: data.length,
      ids: data.map((r) => r.id)
    })

    return NextResponse.json({
      success: true,
      updated: data
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
