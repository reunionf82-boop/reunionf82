import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Next.js 캐싱 방지 설정 (프로덕션 환경에서 항상 최신 데이터 가져오기)
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

export async function GET(request: NextRequest) {
  try {
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { success: false, error: 'Supabase 환경 변수가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const idParam = searchParams.get('id')
    if (idParam) {
      const parsedId = parseInt(idParam, 10)
      if (!Number.isFinite(parsedId)) {
        return NextResponse.json(
          { success: false, error: '유효하지 않은 결과 ID입니다.' },
          { status: 400 }
        )
      }

      let data: any = null
      const { data: fortuneRow, error: fortuneError } = await supabase
        .from('saved_results')
        .select('*')
        .eq('id', parsedId)
        .maybeSingle()
      if (fortuneError) {
        return NextResponse.json(
          { success: false, error: '저장된 결과 조회에 실패했습니다.', details: fortuneError.message },
          { status: 500 }
        )
      }
      if (fortuneRow) {
        data = fortuneRow
      } else {
        const { data: voiceRow, error: voiceError } = await supabase
          .from('saved_results_voice')
          .select('*')
          .eq('id', parsedId)
          .maybeSingle()
        if (voiceError) {
          return NextResponse.json(
            { success: false, error: '저장된 결과 조회에 실패했습니다.', details: voiceError.message },
            { status: 500 }
          )
        }
        if (voiceRow) {
          data = { ...voiceRow, result_type: 'voice' }
        }
      }

      if (!data) {
        return NextResponse.json(
          { success: false, error: '저장된 결과를 찾을 수 없습니다.' },
          { status: 404 }
        )
      }

      // 음성형일 때 content_id로 어드민 컨텐츠의 상담사명 조회
      let voice_counselor_name: string | null = null
      if (data.content_id) {
        const { data: contentRow } = await supabase
          .from('contents')
          .select('voice_counselor_name')
          .eq('id', data.content_id)
          .maybeSingle()
        voice_counselor_name = contentRow?.voice_counselor_name ?? null
      }

      const savedDateUTC = new Date(data.saved_at)
      const kstOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }
      const formatter = new Intl.DateTimeFormat('en-US', kstOptions)
      const parts = formatter.formatToParts(savedDateUTC)
      const year = parts.find(p => p.type === 'year')?.value || ''
      const month = parts.find(p => p.type === 'month')?.value || ''
      const day = parts.find(p => p.type === 'day')?.value || ''
      const hour = parts.find(p => p.type === 'hour')?.value || ''
      const minute = parts.find(p => p.type === 'minute')?.value || ''
      const second = parts.find(p => p.type === 'second')?.value || ''
      const savedAtKST = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`

      return NextResponse.json(
        {
          success: true,
          data: {
            id: data.id.toString(),
            title: data.title,
            html: data.html,
            savedAt: savedAtKST,
            savedAtISO: data.saved_at,
            content: data.content,
            model: data.model,
            processingTime: data.processing_time,
            userName: data.user_name,
            pdf_generated: data.pdf_generated || false,
            // 음성형 필드
            result_type: data.result_type || 'fortune',
            voice_messages: data.voice_messages || null,
            voice_audio_url: data.voice_audio_url || null,
            voice_audio_url_m4a: data.voice_audio_url_m4a || null,
            voice_duration_seconds: data.voice_duration_seconds || null,
            content_id: data.content_id || null,
            voice_counselor_name: voice_counselor_name || null,
            fortune_summary: data.fortune_summary ?? null,
          }
        },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          }
        }
      )
    }

    // 저장된 결과 목록 조회 (최신순, 제한 없음)
    // 먼저 count만 조회하여 실제 레코드 수 확인
    const { count: totalCount } = await supabase
      .from('saved_results')
      .select('*', { count: 'exact', head: true })

    // 전체 데이터 조회 (명시적으로 limit 제거)
    const { data, error, count } = await supabase
      .from('saved_results')
      .select('*', { count: 'exact' })
      .order('saved_at', { ascending: false })
      .limit(1000) // Supabase 기본 limit은 1000개이지만 명시적으로 설정

    if (error) {
      return NextResponse.json(
        { success: false, error: '저장된 결과 목록 조회에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // count와 실제 반환된 데이터가 다른 경우 경고
    if (count && count !== (data?.length || 0)) {
    }
    if (totalCount && totalCount !== (data?.length || 0)) {
    }
    
    // 모든 데이터의 ID와 saved_at 로그
    if (data && Array.isArray(data)) {
      data.forEach((item: any, index: number) => {
      })
      
      // 누락된 레코드가 있는 경우 추가 정보
      if (totalCount && totalCount > data.length) {
      }
    } else {
    }

    // 데이터 형식 변환
    const results = (data || []).map((item: any) => {
      // DB에 저장된 UTC 시간을 한국 시간(KST, UTC+9)으로 변환하여 포맷팅
      const savedDateUTC = new Date(item.saved_at)
      
      // 한국 시간으로 변환
      const kstOptions: Intl.DateTimeFormatOptions = {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }
      const formatter = new Intl.DateTimeFormat('en-US', kstOptions)
      const parts = formatter.formatToParts(savedDateUTC)
      
      const year = parts.find(p => p.type === 'year')?.value || ''
      const month = parts.find(p => p.type === 'month')?.value || ''
      const day = parts.find(p => p.type === 'day')?.value || ''
      const hour = parts.find(p => p.type === 'hour')?.value || ''
      const minute = parts.find(p => p.type === 'minute')?.value || ''
      const second = parts.find(p => p.type === 'second')?.value || ''
      const savedAtKST = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`
      
      const result: Record<string, unknown> = {
        id: item.id.toString(),
        title: item.title,
        html: item.html,
        savedAt: savedAtKST,
        savedAtISO: item.saved_at,
        content: item.content,
        model: item.model,
        processingTime: item.processing_time,
        userName: item.user_name,
        pdf_generated: item.pdf_generated || false,
      }
      if (item.result_type === 'voice' || item.voice_audio_url != null) {
        result.voice_audio_url = item.voice_audio_url || null
        result.voice_audio_url_m4a = item.voice_audio_url_m4a || null
        result.voice_duration_seconds = item.voice_duration_seconds ?? null
        result.voice_messages = item.voice_messages ?? null
        result.content_id = item.content_id ?? null
      }
      if (item.voice_pay_amount != null) result.voice_pay_amount = item.voice_pay_amount
      return result
    })

    // 캐싱 방지 헤더 설정 (프로덕션 환경에서 브라우저/CDN 캐싱 방지)
    return NextResponse.json(
      {
        success: true,
        data: results
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        }
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

