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
    console.log('Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : '없음')
    console.log('Supabase Service Key:', supabaseServiceKey ? `${supabaseServiceKey.substring(0, 20)}...` : '없음')
    console.log('환경:', process.env.NODE_ENV || 'unknown')
    
    // 저장된 결과 목록 조회 (최신순, 제한 없음)
    // 먼저 count만 조회하여 실제 레코드 수 확인
    const { count: totalCount } = await supabase
      .from('saved_results')
      .select('*', { count: 'exact', head: true })
    
    console.log('=== DB 실제 레코드 수 (count only):', totalCount)
    
    // 전체 데이터 조회 (명시적으로 limit 제거)
    const { data, error, count } = await supabase
      .from('saved_results')
      .select('*', { count: 'exact' })
      .order('saved_at', { ascending: false })
      .limit(1000) // Supabase 기본 limit은 1000개이지만 명시적으로 설정
    
    console.log('Supabase 쿼리 결과 - count:', count)
    console.log('Supabase 쿼리 결과 - data 길이:', data?.length || 0)
    console.log('Supabase 쿼리 결과 - count와 data 길이 불일치:', count !== (data?.length || 0))
    console.log('Supabase 쿼리 결과 - data가 null인가?', data === null)
    console.log('Supabase 쿼리 결과 - data가 undefined인가?', data === undefined)
    console.log('Supabase 쿼리 결과 - data 타입:', typeof data)
    console.log('Supabase 쿼리 결과 - Array.isArray(data):', Array.isArray(data))

    if (error) {
      console.error('저장된 결과 목록 조회 실패:', error)
      console.error('에러 상세:', JSON.stringify(error, null, 2))
      return NextResponse.json(
        { success: false, error: '저장된 결과 목록 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }
    
    console.log('Supabase 쿼리 성공 - 실제 반환된 데이터 개수:', data?.length || 0)
    console.log('Supabase 쿼리 성공 - count와 data 길이 비교:', { count, dataLength: data?.length || 0 })
    console.log('Supabase 쿼리 성공 - totalCount와 count 비교:', { totalCount, count, dataLength: data?.length || 0 })
    
    // count와 실제 반환된 데이터가 다른 경우 경고
    if (count && count !== (data?.length || 0)) {
      console.warn(`⚠️ 경고: count(${count})와 실제 반환된 데이터(${data?.length || 0})가 다릅니다!`)
    }
    if (totalCount && totalCount !== (data?.length || 0)) {
      console.warn(`⚠️ 경고: totalCount(${totalCount})와 실제 반환된 데이터(${data?.length || 0})가 다릅니다!`)
    }
    
    // 모든 데이터의 ID와 saved_at 로그
    if (data && Array.isArray(data)) {
      console.log('=== 조회된 모든 저장된 결과 ===')
      data.forEach((item: any, index: number) => {
        console.log(`[${index + 1}] ID: ${item.id}, saved_at: ${item.saved_at}, title: ${item.title?.substring(0, 30) || '제목 없음'}`)
      })
    } else {
      console.log('=== data가 배열이 아님 ===')
      console.log('data:', data)
    }

    console.log('저장된 결과 개수:', data?.length || 0)
    console.log('저장된 결과 ID 목록:', data?.map((item: any) => item.id) || [])
    console.log('저장된 결과 원본 데이터 샘플:', data?.[0] ? {
      id: data[0].id,
      title: data[0].title,
      saved_at: data[0].saved_at,
      created_at: data[0].created_at,
      updated_at: data[0].updated_at
    } : '데이터 없음')

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







