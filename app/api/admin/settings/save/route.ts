import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// 서버 사이드에서만 서비스 롤 키 사용
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다.')
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
    // 인증 확인
    const authCookie = req.cookies.get('admin_session')
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabaseClient()
    const { model, speaker } = await req.json()

    console.log('=== 설정 저장 API ===')
    console.log('받은 데이터 - model:', model, 'speaker:', speaker)

    // 먼저 레코드가 있는지 확인
    const { data: existing, error: existingError } = await supabase
      .from('app_settings')
      .select('selected_model, selected_speaker')
      .eq('id', 1)
      .single()

    console.log('=== 기존 데이터 조회 ===')
    console.log('existingError:', existingError)
    console.log('기존 데이터:', existing)
    console.log('기존 selected_model:', existing?.selected_model)
    console.log('기존 selected_speaker:', existing?.selected_speaker)

    // 기존 값 유지하면서 업데이트할 값만 변경
    const updateData: any = {
      updated_at: new Date().toISOString(),
      selected_model: model !== undefined ? model : (existing?.selected_model || 'gemini-2.5-flash'),
      selected_speaker: speaker !== undefined ? speaker : (existing?.selected_speaker || 'nara')
    }

    console.log('저장할 데이터:', updateData)

    let savedData: any = null

    if (existing) {
      // 업데이트
      console.log('기존 레코드 업데이트:', updateData)
      const { data: updatedData, error } = await supabase
        .from('app_settings')
        .update(updateData)
        .eq('id', 1)
        .select('selected_model, selected_speaker')
      
      if (error) {
        console.error('설정 업데이트 에러:', error)
        console.error('에러 상세:', JSON.stringify(error, null, 2))
        throw error
      }
      
      console.log('업데이트 완료, 반환된 데이터:', updatedData)
      
      // 업데이트된 데이터가 없으면 에러
      if (!updatedData || updatedData.length === 0) {
        console.error('업데이트된 데이터가 없습니다!')
        throw new Error('업데이트된 데이터를 가져올 수 없습니다.')
      }
      
      savedData = updatedData[0]
      console.log('업데이트된 첫 번째 레코드:', savedData)
    } else {
      // 새로 생성
      console.log('새 레코드 생성:', { id: 1, ...updateData })
      const { data: insertedData, error } = await supabase
        .from('app_settings')
        .insert({
          id: 1,
          ...updateData
        })
        .select('selected_model, selected_speaker')
      
      if (error) {
        console.error('설정 생성 에러:', error)
        throw error
      }
      
      console.log('생성 완료, 반환된 데이터:', insertedData)
      
      if (!insertedData || insertedData.length === 0) {
        console.error('생성된 데이터가 없습니다!')
        throw new Error('생성된 데이터를 가져올 수 없습니다.')
      }
      
      savedData = insertedData[0]
      console.log('생성된 첫 번째 레코드:', savedData)
    }

    // 저장된 데이터를 직접 반환 (추가 조회 없이)
    console.log('저장 완료 - 반환할 데이터:', savedData)
    return NextResponse.json({ 
      success: true,
      model: savedData?.selected_model || updateData.selected_model,
      speaker: savedData?.selected_speaker || updateData.selected_speaker
    })
  } catch (error: any) {
    console.error('설정 저장 에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 저장하는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

