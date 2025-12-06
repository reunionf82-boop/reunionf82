import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const authCookie = req.cookies.get('admin_session')
    if (!authCookie || authCookie.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getAdminSupabaseClient()
    const body = await req.json()
    const { model, speaker } = body

    console.log('=== 설정 저장 요청 ===')
    console.log('Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('Service Key 존재:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    console.log('Service Key 길이:', process.env.SUPABASE_SERVICE_ROLE_KEY?.length)
    console.log('받은 데이터 - model:', model, 'speaker:', speaker)

    // 기존 레코드 조회
    const { data: existing, error: existingError } = await supabase
      .from('app_settings')
      .select('id, selected_model, selected_speaker')
      .eq('id', 1)
      .maybeSingle()

    if (existingError) {
      console.error('기존 데이터 조회 에러:', existingError)
      throw existingError
    }

    console.log('기존 데이터:', existing)

    // 업데이트할 데이터 준비
    const updateData: {
      updated_at: string
      selected_model?: string
      selected_speaker?: string
    } = {
      updated_at: new Date().toISOString()
    }

    // model이 제공되면 업데이트
    if (model !== undefined && model !== null) {
      updateData.selected_model = String(model).trim()
    } else if (existing) {
      // model이 제공되지 않으면 기존 값 유지
      updateData.selected_model = existing.selected_model || 'gemini-2.5-flash'
    } else {
      // 레코드가 없고 model도 없으면 기본값
      updateData.selected_model = 'gemini-2.5-flash'
    }

    // speaker가 제공되면 업데이트
    if (speaker !== undefined && speaker !== null) {
      updateData.selected_speaker = String(speaker).trim()
    } else if (existing) {
      // speaker가 제공되지 않으면 기존 값 유지
      updateData.selected_speaker = existing.selected_speaker || 'nara'
    } else {
      // 레코드가 없고 speaker도 없으면 기본값
      updateData.selected_speaker = 'nara'
    }

    console.log('저장할 데이터:', updateData)

    let savedData: any = null

    if (existing) {
      // 업데이트
      console.log('기존 레코드 업데이트')
      const { data: updatedData, error: updateError } = await supabase
        .from('app_settings')
        .update(updateData)
        .eq('id', 1)
        .select('id, selected_model, selected_speaker')
      
      if (updateError) {
        console.error('업데이트 에러:', updateError)
        throw updateError
      }
      
      if (!updatedData || updatedData.length === 0) {
        throw new Error('업데이트된 데이터를 가져올 수 없습니다.')
      }
      
      savedData = updatedData[0]
      console.log('업데이트 완료 (반환된 데이터):', savedData)
      
      // 실제로 DB에 저장되었는지 확인하기 위해 다시 조회 (약간의 지연 후)
      await new Promise(resolve => setTimeout(resolve, 200))
      
      const { data: verifyData, error: verifyError } = await supabase
        .from('app_settings')
        .select('id, selected_model, selected_speaker, updated_at')
        .eq('id', 1)
        .single()
      
      if (verifyError) {
        console.error('저장 확인 조회 에러:', verifyError)
      } else {
        console.log('=== 저장 확인: DB에서 다시 조회한 값 ===')
        console.log('verifyData 전체:', JSON.stringify(verifyData, null, 2))
        console.log('저장한 값:', updateData.selected_model, updateData.selected_speaker)
        console.log('DB에 저장된 값:', verifyData?.selected_model, verifyData?.selected_speaker)
        console.log('저장한 updated_at:', updateData.updated_at)
        console.log('DB의 updated_at:', verifyData?.updated_at)
        console.log('저장 성공 여부:', 
          verifyData?.selected_model === updateData.selected_model && 
          verifyData?.selected_speaker === updateData.selected_speaker
        )
        
        // 저장 확인 데이터를 savedData에 포함 (실제 DB 값 사용)
        if (verifyData) {
          savedData = verifyData
          console.log('✅ 재조회한 실제 DB 데이터로 savedData 업데이트:', savedData)
        } else {
          console.error('❌ verifyData가 null입니다!')
        }
      }
    } else {
      // 새로 생성
      console.log('새 레코드 생성')
      const { data: insertedData, error: insertError } = await supabase
        .from('app_settings')
        .insert({
          id: 1,
          ...updateData
        })
        .select('id, selected_model, selected_speaker')
      
      if (insertError) {
        console.error('생성 에러:', insertError)
        throw insertError
      }
      
      if (!insertedData || insertedData.length === 0) {
        throw new Error('생성된 데이터를 가져올 수 없습니다.')
      }
      
      savedData = insertedData[0]
      console.log('생성 완료:', savedData)
      
      // 실제로 DB에 저장되었는지 확인하기 위해 다시 조회
      const { data: verifyData, error: verifyError } = await supabase
        .from('app_settings')
        .select('id, selected_model, selected_speaker')
        .eq('id', 1)
        .single()
      
      if (verifyError) {
        console.error('저장 확인 조회 에러:', verifyError)
      } else {
        console.log('=== 저장 확인: DB에서 다시 조회한 값 ===')
        console.log('verifyData:', verifyData)
        console.log('저장한 값:', updateData.selected_model, updateData.selected_speaker)
        console.log('DB에 저장된 값:', verifyData?.selected_model, verifyData?.selected_speaker)
      }
    }

    // 저장된 데이터를 직접 반환
    const response = {
      success: true,
      model: savedData.selected_model || updateData.selected_model,
      speaker: savedData.selected_speaker || updateData.selected_speaker,
      // 디버깅용: 저장 확인 정보 포함
      _debug: {
        savedData: savedData,
        updateData: updateData,
        existing: existing
      }
    }

    console.log('=== 저장 완료, 반환할 응답 ===')
    console.log('response:', JSON.stringify(response, null, 2))

    return NextResponse.json(response)
  } catch (error: any) {
    console.error('=== 설정 저장 에러 ===')
    console.error('에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 저장하는데 실패했습니다.' },
      { status: 500 }
    )
  }
}
