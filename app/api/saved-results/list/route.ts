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

export async function GET(request: NextRequest) {
  try {
    console.log('=== 저장된 결과 목록 조회 API 호출 ===')
    console.log('Supabase URL:', supabaseUrl ? '설정됨' : '없음')
    console.log('Supabase Service Key:', supabaseServiceKey ? '설정됨' : '없음')
    
    // 저장된 결과 목록 조회 (최신순, 최대 50개)
    const { data, error } = await supabase
      .from('saved_results')
      .select('*')
      .order('saved_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('저장된 결과 목록 조회 실패:', error)
      return NextResponse.json(
        { success: false, error: '저장된 결과 목록 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    console.log('저장된 결과 개수:', data?.length || 0)

    // 데이터 형식 변환
    const results = (data || []).map((item: any) => ({
      id: item.id.toString(),
      title: item.title,
      html: item.html,
      savedAt: new Date(item.saved_at).toLocaleString('ko-KR'),
      content: item.content,
      model: item.model,
      processingTime: item.processing_time,
      userName: item.user_name
    }))

    console.log('변환된 결과 개수:', results.length)
    console.log('=== 저장된 결과 목록 조회 완료 ===')

    return NextResponse.json({
      success: true,
      data: results
    })
  } catch (error: any) {
    console.error('저장된 결과 목록 조회 API 오류:', error)
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}







