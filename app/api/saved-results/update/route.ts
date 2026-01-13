import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, title, html, content, model, processingTime, userName } = body

    if (!id) {
      return NextResponse.json({ error: 'id는 필수입니다.' }, { status: 400 })
    }
    if (!title || !html) {
      return NextResponse.json(
        { error: '제목과 HTML 내용은 필수입니다.' },
        { status: 400 }
      )
    }

    const idNum = typeof id === 'number' ? id : parseInt(String(id), 10)
    if (!Number.isFinite(idNum)) {
      return NextResponse.json({ error: 'id가 유효한 숫자가 아닙니다.' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('saved_results')
      .update({
        title,
        html,
        content: content || null,
        model: model || 'gemini-3-flash-preview',
        processing_time: processingTime || null,
        user_name: userName || null,
        updated_at: getKSTNow() // KST 기준으로 저장
      })
      .eq('id', idNum)
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: '저장된 결과 업데이트에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    // DB에 저장된 UTC 시간을 한국 시간(KST, UTC+9)으로 변환하여 포맷팅
    const savedDateUTC = new Date(data.saved_at)
    
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
    const savedAtKSTFormatted = `${year}. ${month}. ${day}. ${hour}:${minute}:${second}`

    return NextResponse.json(
      {
        success: true,
        data: {
          id: data.id.toString(),
          title: data.title,
          html: data.html,
          savedAt: savedAtKSTFormatted,
          savedAtISO: data.saved_at,
          content: data.content,
          model: data.model,
          processingTime: data.processing_time,
          userName: data.user_name,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

