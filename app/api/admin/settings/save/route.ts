import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // 인증 확인 - cookies() 사용 (로그인 API와 동일한 방식)
    const { cookies: cookieStore } = await import('next/headers')
    const cookies = await cookieStore()
    const session = cookies.get('admin_session')
    
    if (!session || session.value !== 'authenticated') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    const supabase = getAdminSupabaseClient()
    const body = await req.json()
    const { model, speaker, fortune_view_mode, use_sequential_fortune } = body

    // 기존 레코드 조회
    const { data: existing, error: existingError } = await supabase
      .from('app_settings')
      .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune')
      .eq('id', 1)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    // 업데이트할 데이터 준비
    const updateData: {
      updated_at: string
      selected_model?: string
      selected_speaker?: string
      fortune_view_mode?: string
      use_sequential_fortune?: boolean
    } = {
      updated_at: new Date().toISOString()
    }

    // model이 제공되면 업데이트
    if (model !== undefined && model !== null) {
      updateData.selected_model = String(model).trim()
    } else if (existing) {
      // model이 제공되지 않으면 기존 값 유지
      updateData.selected_model = existing.selected_model || 'gemini-3-flash-preview'
    } else {
      // 레코드가 없고 model도 없으면 기본값
      updateData.selected_model = 'gemini-3-flash-preview'
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

    // fortune_view_mode 업데이트
    if (fortune_view_mode !== undefined && fortune_view_mode !== null) {
      updateData.fortune_view_mode = String(fortune_view_mode).trim()
    } else if (existing) {
      updateData.fortune_view_mode = (existing as any).fortune_view_mode || 'batch'
    } else {
      updateData.fortune_view_mode = 'batch'
    }

    // use_sequential_fortune 업데이트 (직렬점사=true, 병렬점사=false)
    if (use_sequential_fortune !== undefined && use_sequential_fortune !== null) {
      updateData.use_sequential_fortune = Boolean(use_sequential_fortune)
    } else if (existing) {
      updateData.use_sequential_fortune = (existing as any).use_sequential_fortune ?? false
    } else {
      updateData.use_sequential_fortune = false
    }

    let savedData: any = null

    if (existing) {
      // 업데이트
      const { data: updatedData, error: updateError } = await supabase
        .from('app_settings')
        .update(updateData)
        .eq('id', 1)
        .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune')
      
      if (updateError) {
        throw updateError
      }
      
      if (!updatedData || updatedData.length === 0) {
        throw new Error('업데이트된 데이터를 가져올 수 없습니다.')
      }
      
      savedData = updatedData[0]
    } else {
      // 새로 생성
      const { data: insertedData, error: insertError } = await supabase
        .from('app_settings')
        .insert({
          id: 1,
          ...updateData
        })
        .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune')
      
      if (insertError) {
        throw insertError
      }
      
      if (!insertedData || insertedData.length === 0) {
        throw new Error('생성된 데이터를 가져올 수 없습니다.')
      }
      
      savedData = insertedData[0]
    }

    return NextResponse.json({
      success: true,
      model: savedData.selected_model || updateData.selected_model,
      speaker: savedData.selected_speaker || updateData.selected_speaker,
      fortune_view_mode: (savedData as any).fortune_view_mode || updateData.fortune_view_mode,
      use_sequential_fortune: (savedData as any).use_sequential_fortune ?? updateData.use_sequential_fortune ?? false
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '설정을 저장하는데 실패했습니다.' },
      { status: 500 }
    )
  }
}
