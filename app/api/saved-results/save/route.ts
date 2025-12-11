import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
    const { title, html, content, model, processingTime, userName } = body

    if (!title || !html) {
      return NextResponse.json(
        { error: '제목과 HTML 내용은 필수입니다.' },
        { status: 400 }
      )
    }

    // 저장된 결과를 Supabase에 저장
    const { data, error } = await supabase
      .from('saved_results')
      .insert({
        title,
        html,
        content: content || null,
        model: model || 'gemini-2.5-flash',
        processing_time: processingTime || null,
        user_name: userName || null,
        saved_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error('저장된 결과 저장 실패:', error)
      return NextResponse.json(
        { error: '저장된 결과 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id.toString(),
        title: data.title,
        html: data.html,
        savedAt: new Date(data.saved_at).toLocaleString('ko-KR'),
        savedAtISO: data.saved_at, // 12시간 경과 여부 확인용 원본 날짜
        content: data.content,
        model: data.model,
        processingTime: data.processing_time,
        userName: data.user_name
      }
    })
  } catch (error: any) {
    console.error('저장된 결과 저장 API 오류:', error)
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}










