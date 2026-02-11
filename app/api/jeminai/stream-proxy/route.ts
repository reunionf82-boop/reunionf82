import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 800 // Vercel Pro 최대(초). 800초 초과 시 함수 타임아웃됨

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const cloudwaysUrl = (process.env.NEXT_PUBLIC_CLOUDWAYS_URL || '').trim()

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

function buildRequestBody(requestData: Record<string, any>): Record<string, any> {
  return {
    role_prompt: requestData.role_prompt,
    restrictions: requestData.restrictions,
    menu_subtitles: requestData.menu_subtitles,
    menu_items: requestData.menu_items || [],
    user_info: requestData.user_info,
    partner_info: requestData.partner_info,
    model: requestData.model || 'gemini-3-flash-preview',
    manse_ryeok_table: requestData.manse_ryeok_table,
    manse_ryeok_text: requestData.manse_ryeok_text,
    manse_ryeok_json: requestData.manse_ryeok_json,
    day_gan_info: requestData.day_gan_info,
    isSecondRequest: requestData.isSecondRequest,
    completedSubtitles: requestData.completedSubtitles,
    completedSubtitleIndices: requestData.completedSubtitleIndices,
    previousContext: requestData.previousContext,
    isParallelMode: requestData.isParallelMode,
    currentMenuIndex: requestData.currentMenuIndex,
    totalMenus: requestData.totalMenus,
  }
}

/** 클라이언트가 requestKey로 스트림 요청 시, 서버에서 Cloudways로 요청 후 스트림 전달. 클라이언트 이탈 시에도 스트림 완료 후 저장. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const requestKey = body?.requestKey
    if (!requestKey || typeof requestKey !== 'string' || !requestKey.trim()) {
      return NextResponse.json(
        { error: 'requestKey는 필수입니다.' },
        { status: 400 }
      )
    }

    if (!cloudwaysUrl) {
      return NextResponse.json(
        { error: 'Cloudways URL이 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    const { data: row, error: fetchError } = await supabase
      .from('temp_requests')
      .select('payload')
      .eq('id', requestKey.trim())
      .single()

    if (fetchError || !row?.payload) {
      return NextResponse.json(
        { error: '임시 요청 데이터를 찾을 수 없거나 만료되었습니다.', details: fetchError?.message },
        { status: 404 }
      )
    }

    const payload = row.payload as {
      requestData: Record<string, any>
      content?: unknown
      startTime?: number
      model?: string
      userName?: string
    }
    const requestData = payload.requestData
    if (!requestData) {
      return NextResponse.json(
        { error: 'payload.requestData가 없습니다.' },
        { status: 400 }
      )
    }

    const edgeFunctionUrl = `${cloudwaysUrl}/chat`
    const requestBody = buildRequestBody(requestData)

    // 클라이언트 연결 끊김과 무관하게 Cloudways 스트림만 끝까지 읽기 (signal 미전달)
    const upstreamRes = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      body: JSON.stringify(requestBody),
    })

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text()
      return NextResponse.json(
        { error: '점사 서버 호출 실패', details: errText },
        { status: upstreamRes.status }
      )
    }

    const reader = upstreamRes.body?.getReader()
    if (!reader) {
      return NextResponse.json(
        { error: '스트림을 시작할 수 없습니다.' },
        { status: 502 }
      )
    }

    const decoder = new TextDecoder()
    let buffer = ''

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(': connected\n\n'))
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': ping\n\n'))
          } catch {
            /* ignore */
          }
        }, 10000)
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            // 먼저 클라이언트로 즉시 전달 (파싱 지연으로 뭉침 방지)
            controller.enqueue(value)
            buffer += decoder.decode(value, { stream: true })
          }
          controller.close()
        } catch (e) {
          controller.error(e)
        } finally {
          clearInterval(heartbeat)
          // 스트림 종료 시에만 버퍼 파싱하여 저장용 HTML 추출
          let htmlToSave = ''
          const lines = buffer.split('\n')
          let accumulatedHtml = ''
          for (const line of lines) {
            if (!line.trim() || !line.startsWith('data: ')) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'chunk' && data.text) accumulatedHtml += data.text
              if (data.type === 'done' && data.html) htmlToSave = data.html
            } catch {
              /* ignore */
            }
          }
          if (!htmlToSave) htmlToSave = accumulatedHtml
          if (requestKey && htmlToSave.trim().length > 0) {
            const base = process.env.VERCEL_URL
              ? `https://${process.env.VERCEL_URL}`
              : (process.env.NEXT_PUBLIC_APP_URL || request.nextUrl?.origin || 'http://localhost:3000')
            try {
              await fetch(`${base}/api/fortune-complete/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ requestKey: requestKey.trim(), html: htmlToSave }),
              })
            } catch {
              /* 저장 실패 시 로그만 (클라이언트는 이미 이탈한 상태일 수 있음) */
            }
          }
        }
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '스트림 프록시 오류', details: error?.message },
      { status: 500 }
    )
  }
}
