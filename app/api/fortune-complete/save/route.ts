import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'
import { buildStyledFortuneHtml } from '@/lib/fortune-save-style'

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

/** 점사 스트림이 서버에서 완료되었을 때 호출. temp_requests에서 payload 로드 후 저장 후 삭제. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { requestKey, html: rawHtml } = body

    if (!requestKey || rawHtml == null) {
      return NextResponse.json(
        { error: 'requestKey와 html은 필수입니다.' },
        { status: 400 }
      )
    }

    const normalizedRequestKey = String(requestKey).trim()
    if (!normalizedRequestKey) {
      return NextResponse.json({ error: 'requestKey가 비어있습니다.' }, { status: 400 })
    }

    const { data: row, error: fetchError } = await supabase
      .from('temp_requests')
      .select('payload')
      .eq('id', normalizedRequestKey)
      .single()

    if (fetchError || !row?.payload) {
      return NextResponse.json(
        { error: '임시 요청 데이터를 찾을 수 없거나 만료되었습니다.', details: fetchError?.message },
        { status: 404 }
      )
    }

    const payload = row.payload as {
      requestData?: unknown
      content?: Record<string, any>
      startTime?: number
      model?: string
      userName?: string
    }
    const content = payload.content ?? null
    const startTime = payload.startTime ?? null
    const model = payload.model || 'gemini-3-flash-preview'
    const userName = payload.userName ?? null

    const title = content?.content_name || '재회 결과'
    const htmlWithFont = buildStyledFortuneHtml(content, String(rawHtml), startTime)

    let processingTime: string = '0:00'
    if (startTime) {
      const elapsed = Date.now() - startTime
      const mins = Math.floor(elapsed / 60000)
      const secs = Math.floor((elapsed % 60000) / 1000)
      processingTime = `${mins}:${secs.toString().padStart(2, '0')}`
    }

    const savedAtKST = getKSTNow()
    const insertData: Record<string, any> = {
      title,
      html: htmlWithFont,
      content,
      model,
      processing_time: processingTime,
      user_name: userName,
      saved_at: savedAtKST,
      created_at: savedAtKST,
    }
    const fortuneContentId = content?.id
    if (fortuneContentId != null) insertData.content_id = Number(fortuneContentId)

    const { data: inserted, error: insertError } = await supabase
      .from('saved_results')
      .insert(insertData)
      .select('id')
      .single()

    if (insertError) {
      return NextResponse.json(
        { error: '결과 저장에 실패했습니다.', details: insertError.message },
        { status: 500 }
      )
    }

    const savedId = inserted?.id
    if (savedId == null) {
      return NextResponse.json(
        { error: '저장 후 ID를 확인할 수 없습니다.' },
        { status: 500 }
      )
    }

    await supabase
      .from('user_credentials')
      .update({ saved_id: savedId })
      .eq('request_key', normalizedRequestKey)

    await supabase
      .from('payments')
      .update({
        saved_id: savedId,
        fortune_status: 'completed',
        updated_at: savedAtKST
      })
      .eq('request_key', normalizedRequestKey)

    await supabase
      .from('temp_requests')
      .delete()
      .eq('id', normalizedRequestKey)

    return NextResponse.json({ success: true, savedId })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error?.message },
      { status: 500 }
    )
  }
}
