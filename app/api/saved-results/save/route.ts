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

    // 한국 시간(UTC+9)으로 현재 시간 계산하여 저장
    const now = new Date()
    const kstTime = new Date(now.getTime() + (9 * 60 * 60 * 1000)) // UTC+9
    const savedAtKST = kstTime.toISOString()

    // 저장된 결과를 Supabase에 저장 (한국 시간으로 저장)
    const { data, error } = await supabase
      .from('saved_results')
      .insert({
        title,
        html,
        content: content || null,
        model: model || 'gemini-3-flash-preview',
        processing_time: processingTime || null,
        user_name: userName || null,
        saved_at: savedAtKST
      })
      .select()
      .single()

    if (error) {

      return NextResponse.json(
        { error: '저장된 결과 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // 저장된 한국 시간을 포맷팅하여 표시
    const savedDateKST = new Date(data.saved_at)
    
    // 한국 시간을 포맷팅 (서버 환경과 무관하게 일관된 형식)
    const year = savedDateKST.getUTCFullYear()
    const month = String(savedDateKST.getUTCMonth() + 1).padStart(2, '0')
    const day = String(savedDateKST.getUTCDate()).padStart(2, '0')
    const hour = String(savedDateKST.getUTCHours()).padStart(2, '0')
    const minute = String(savedDateKST.getUTCMinutes()).padStart(2, '0')
    const second = String(savedDateKST.getUTCSeconds()).padStart(2, '0')
    const savedAtKSTFormatted = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`

    // 캐싱 방지 헤더 설정 (프로덕션 환경에서 브라우저/CDN 캐싱 방지)
    return NextResponse.json(
      {
        success: true,
        data: {
          id: data.id.toString(),
          title: data.title,
          html: data.html,
          savedAt: savedAtKSTFormatted,
          savedAtISO: data.saved_at, // 한국 시간으로 저장된 원본 날짜 (12시간/60일 경과 여부 확인용)
          content: data.content,
          model: data.model,
          processingTime: data.processing_time,
          userName: data.user_name
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
  } catch (error: any) {

    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

