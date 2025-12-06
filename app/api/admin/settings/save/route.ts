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

    // 먼저 레코드가 있는지 확인
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id')
      .eq('id', 1)
      .single()

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (model) {
      updateData.selected_model = model
      console.log('모델 저장:', model)
    }
    
    if (speaker) {
      updateData.selected_speaker = speaker
      console.log('화자 저장:', speaker)
    }

    if (existing) {
      // 업데이트
      const { error } = await supabase
        .from('app_settings')
        .update(updateData)
        .eq('id', 1)
      
      if (error) {
        console.error('설정 업데이트 에러:', error)
        throw error
      }
    } else {
      // 새로 생성
      const { error } = await supabase
        .from('app_settings')
        .insert({
          id: 1,
          ...updateData
        })
      
      if (error) {
        console.error('설정 생성 에러:', error)
        throw error
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('설정 저장 에러:', error)
    return NextResponse.json(
      { error: error.message || '설정을 저장하는데 실패했습니다.' },
      { status: 500 }
    )
  }
}

