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
    
    // 저장된 결과 목록 조회 (최신순, 제한 없음)
    const { data, error } = await supabase
      .from('saved_results')
      .select('*')
      .order('saved_at', { ascending: false })

    if (error) {
      console.error('저장된 결과 목록 조회 실패:', error)
      return NextResponse.json(
        { success: false, error: '저장된 결과 목록 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    console.log('저장된 결과 개수:', data?.length || 0)
    console.log('저장된 결과 ID 목록:', data?.map((item: any) => item.id) || [])

    // 데이터 형식 변환
    const results = (data || []).map((item: any) => {
      // DB에 저장된 한국 시간을 포맷팅하여 표시
      const savedDateKST = new Date(item.saved_at)
      
      // 한국 시간을 포맷팅 (서버 환경과 무관하게 일관된 형식)
      const year = savedDateKST.getUTCFullYear()
      const month = String(savedDateKST.getUTCMonth() + 1).padStart(2, '0')
      const day = String(savedDateKST.getUTCDate()).padStart(2, '0')
      const hour = String(savedDateKST.getUTCHours()).padStart(2, '0')
      const minute = String(savedDateKST.getUTCMinutes()).padStart(2, '0')
      const second = String(savedDateKST.getUTCSeconds()).padStart(2, '0')
      const savedAtKST = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`
      
      const result = {
        id: item.id.toString(),
        title: item.title,
        html: item.html,
        savedAt: savedAtKST,
        savedAtISO: item.saved_at, // 한국 시간으로 저장된 원본 날짜 (12시간/60일 경과 여부 확인용)
        content: item.content,
        model: item.model,
        processingTime: item.processing_time,
        userName: item.user_name
      }
      console.log(`저장된 결과 ${result.id}: saved_at=${item.saved_at}, savedAtISO=${result.savedAtISO}, savedAtKST=${savedAtKST}`)
      return result
    })

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







