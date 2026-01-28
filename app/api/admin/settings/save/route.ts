import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import crypto from 'crypto'

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
    const { model, speaker, fortune_view_mode, use_sequential_fortune, tts_provider, typecast_voice_id, home_html, dev_unlock_password, dev_unlock_duration_minutes, dev_unlock_hide_enabled } = body

    // 기존 레코드 조회
    const { data: existingRows, error: existingError } = await supabase
      .from('app_settings')
      .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune, selected_tts_provider, selected_typecast_voice_id, home_html, dev_unlock_password_hash, dev_unlock_duration_minutes, dev_unlock_hide_enabled')
      .eq('id', 1)
      // ✅ id=1 행이 중복이어도 single-coercion 에러를 피하기 위해 배열로 받고 첫 행만 사용
      .limit(1)

    if (existingError) {
      throw existingError
    }
    
    const existing = Array.isArray(existingRows) ? existingRows[0] : null

    // 업데이트할 데이터 준비
    const updateData: {
      updated_at: string
      selected_model?: string
      selected_speaker?: string
      fortune_view_mode?: string
      use_sequential_fortune?: boolean
      selected_tts_provider?: string
      selected_typecast_voice_id?: string
      home_html?: string
      dev_unlock_password_hash?: string | null
      dev_unlock_duration_minutes?: number | null
      dev_unlock_hide_enabled?: boolean
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

    // tts_provider 업데이트 (naver|typecast)
    if (tts_provider !== undefined && tts_provider !== null) {
      updateData.selected_tts_provider = String(tts_provider).trim() === 'typecast' ? 'typecast' : 'naver'
    } else if (existing) {
      updateData.selected_tts_provider = (existing as any).selected_tts_provider || 'naver'
    } else {
      updateData.selected_tts_provider = 'naver'
    }

    // typecast_voice_id 업데이트 (빈값 허용)
    if (typecast_voice_id !== undefined && typecast_voice_id !== null) {
      updateData.selected_typecast_voice_id = String(typecast_voice_id).trim()
    } else if (existing) {
      updateData.selected_typecast_voice_id = (existing as any).selected_typecast_voice_id || ''
    } else {
      updateData.selected_typecast_voice_id = ''
    }

    // home_html 업데이트 (빈값 허용)
    if (home_html !== undefined && home_html !== null) {
      updateData.home_html = String(home_html)
    } else if (existing) {
      updateData.home_html = String((existing as any).home_html || '')
    } else {
      updateData.home_html = ''
    }

    if (dev_unlock_password !== undefined) {
      const rawPassword = String(dev_unlock_password || '').trim()
      if (rawPassword === '') {
        updateData.dev_unlock_password_hash = null
      } else {
        updateData.dev_unlock_password_hash = crypto
          .createHash('sha256')
          .update(rawPassword)
          .digest('hex')
      }
    } else if (existing) {
      updateData.dev_unlock_password_hash = (existing as any).dev_unlock_password_hash || null
    } else {
      updateData.dev_unlock_password_hash = null
    }

    if (dev_unlock_duration_minutes !== undefined) {
      const rawMinutes = parseInt(String(dev_unlock_duration_minutes), 10)
      if (Number.isFinite(rawMinutes) && rawMinutes > 0) {
        updateData.dev_unlock_duration_minutes = rawMinutes
      } else {
        updateData.dev_unlock_duration_minutes = null
      }
    } else if (existing) {
      updateData.dev_unlock_duration_minutes = (existing as any).dev_unlock_duration_minutes ?? null
    } else {
      updateData.dev_unlock_duration_minutes = null
    }

    if (dev_unlock_hide_enabled !== undefined) {
      updateData.dev_unlock_hide_enabled = Boolean(dev_unlock_hide_enabled)
    } else if (existing) {
      updateData.dev_unlock_hide_enabled = Boolean((existing as any).dev_unlock_hide_enabled)
    } else {
      updateData.dev_unlock_hide_enabled = false
    }

    let savedData: any = null

    if (existing) {
      // 업데이트
      const { data: updatedData, error: updateError } = await supabase
        .from('app_settings')
        .update(updateData)
        .eq('id', 1)
        .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune, selected_tts_provider, selected_typecast_voice_id, home_html, dev_unlock_password_hash, dev_unlock_duration_minutes, dev_unlock_hide_enabled')
      
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
        .select('id, selected_model, selected_speaker, fortune_view_mode, use_sequential_fortune, selected_tts_provider, selected_typecast_voice_id, home_html, dev_unlock_password_hash, dev_unlock_duration_minutes, dev_unlock_hide_enabled')
      
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
      use_sequential_fortune: (savedData as any).use_sequential_fortune ?? updateData.use_sequential_fortune ?? false,
      tts_provider: (savedData as any).selected_tts_provider || updateData.selected_tts_provider || 'naver',
      typecast_voice_id: (savedData as any).selected_typecast_voice_id || updateData.selected_typecast_voice_id || '',
      home_html: String((savedData as any).home_html || updateData.home_html || ''),
      dev_unlock_password_set: Boolean((savedData as any).dev_unlock_password_hash || updateData.dev_unlock_password_hash),
      dev_unlock_duration_minutes: (savedData as any).dev_unlock_duration_minutes ?? updateData.dev_unlock_duration_minutes ?? null,
      dev_unlock_hide_enabled: Boolean((savedData as any).dev_unlock_hide_enabled ?? updateData.dev_unlock_hide_enabled),
    })
  } catch (error: any) {

    const errorMessage = error?.message || error?.code || '설정을 저장하는데 실패했습니다.'
    const msgLower = String(error?.message || '').toLowerCase()
    let errorHint = ''
    if (error?.code === '42703' || msgLower.includes('column') || msgLower.includes('does not exist')) {
      if (msgLower.includes('use_sequential_fortune')) {
        errorHint = ' (DB 컬럼이 없을 수 있습니다. supabase-add-use-sequential-fortune-column.sql을 실행해주세요.)'
      } else if (msgLower.includes('fortune_view_mode')) {
        errorHint = ' (DB 컬럼이 없을 수 있습니다. supabase-add-fortune-view-mode.sql을 실행해주세요.)'
      } else if (msgLower.includes('home_html')) {
        errorHint = ' (DB 컬럼이 없을 수 있습니다. supabase-add-home-html.sql을 실행해주세요.)'
      } else {
        errorHint = ' (DB 컬럼이 없을 수 있습니다. 관련 supabase-add-*.sql을 확인해주세요.)'
      }
    }
    return NextResponse.json(
      { error: errorMessage + errorHint, details: errorMessage, hint: errorHint.replace(/^\s*/, '') },
      { status: 500 }
    )
  }
}
