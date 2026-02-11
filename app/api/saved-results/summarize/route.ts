import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function stripHtml(html: string): string {
  if (!html || typeof html !== 'string') return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\*\*/g, '')
    .trim()
}

/** 지정 글자수를 넘기면 문장이 끝나는 위치에서 자르기 (문장 중간에서 끊지 않음) */
function truncateAtSentenceEnd(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text
  const slice = text.slice(0, maxChars)
  const minAcceptable = Math.floor(maxChars * 0.4)
  let lastEnd = -1
  for (const end of ['.', '。', '!', '?']) {
    const i = slice.lastIndexOf(end)
    if (i >= 0) {
      const pos = i + end.length
      if (pos > lastEnd) lastEnd = pos
    }
  }
  // 한글 문장 끝(다., 요., 네요. 등)에서 자르기
  for (const suffix of ['다.', '요.', '네요.', '습니다.', '죠.']) {
    const i = slice.lastIndexOf(suffix)
    if (i >= 0) {
      const pos = i + suffix.length
      if (pos > lastEnd) lastEnd = pos
    }
  }
  if (lastEnd >= minAcceptable) return text.slice(0, lastEnd).trim()
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace >= minAcceptable) return slice.slice(0, lastSpace).trim()
  return slice.trim()
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = body?.id != null ? Number(body.id) : NaN
    if (!Number.isFinite(id) || id < 1) {
      return NextResponse.json({ error: '유효한 저장 결과 id가 필요합니다.' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 저장 결과 조회 (점사형만 요약, 음성형 제외) — user_name으로 요약 시작문에 사용
    const { data: row, error: rowError } = await supabase
      .from('saved_results')
      .select('id, html, result_type, content_id, content, user_name')
      .eq('id', id)
      .single()

    if (rowError || !row) {
      return NextResponse.json({ error: '저장된 결과를 찾을 수 없습니다.' }, { status: 404 })
    }
    if ((row as any).result_type === 'voice') {
      return NextResponse.json({ error: '음성형 결과는 요약 대상이 아닙니다.' }, { status: 400 })
    }

    const html = (row as any).html || ''
    const plainText = stripHtml(html)
    if (plainText.length < 50) {
      return NextResponse.json({ error: '요약할 점사 내용이 너무 짧습니다.' }, { status: 400 })
    }

    // 요약 글자수: 컨텐츠별만 사용. 0이면 요약 비활성화. null/미설정이면 기본 500
    const contentId = (row as any).content_id ?? (typeof (row as any).content === 'object' && (row as any).content?.id != null ? Number((row as any).content.id) : null)
    let maxChars = 500
    if (contentId != null && Number.isFinite(contentId)) {
      const { data: contentRow } = await supabase
        .from('contents')
        .select('summary_max_chars')
        .eq('id', contentId)
        .maybeSingle()
      const contentMax = (contentRow as any)?.summary_max_chars
      if (typeof contentMax === 'number') {
        if (contentMax === 0) {
          return NextResponse.json({ error: '이 컨텐츠는 점사 요약이 비활성화되어 있습니다.' }, { status: 400 })
        }
        if (contentMax > 0) maxChars = Math.min(2000, contentMax)
      }
    }

    const apiKey = process.env.NEXT_PUBLIC_JEMINAI_API_URL
    if (!apiKey) {
      return NextResponse.json({ error: 'LLM API가 설정되지 않았습니다.' }, { status: 500 })
    }

    // 점사 요약은 항상 gemini-2.0-flash 사용 (Google API 모델 ID)
    const SUMMARY_MODEL = 'gemini-2.0-flash'

    const genAI = new GoogleGenerativeAI(apiKey)
    // 2000자 한글 요약을 끝까지 받기 위해 토큰 여유 (한글 1자≈1~2토큰)
    const model = genAI.getGenerativeModel({
      model: SUMMARY_MODEL,
      generationConfig: {
        temperature: 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    })

    const userName = (row as any)?.user_name != null ? String((row as any).user_name).trim() : ''
    const displayName = userName || '당신'

    const prompt = `다음 점사(사주/운세) 전문 내용을 요약해주세요.
규칙:
1. 반드시 ${maxChars}자 이내로 요약할 것. 마지막 문장을 반드시 완결할 것(문장 중간에서 끊지 말 것).
2. 한국어로만 작성할 것.
3. 요약문은 반드시 "${displayName}님의 점사 요약은 다음과 같습니다."로 시작한 뒤, 곧바로 본문으로 이어갈 것. "이별은 단순한 실패가 아닌..." 같은 요약 내용으로 이어지면 됨.
4. "이 점사는 이별을 겪은 갑오일주 남성을 위한 재회설계서입니다"처럼 제3자를 소개하는 문장은 사용하지 말 것.
5. 제목·접두어 없이 요약문만 출력할 것.
6. 존댓말을 사용할 것.

점사 내용:
${plainText.slice(0, 25000)}

요약:`

    const result = await model.generateContent(prompt)
    const response = result.response
    const candidate = response.candidates?.[0]
    if (!candidate?.content?.parts?.[0]?.text) {
      return NextResponse.json({ error: '요약 생성에 실패했습니다.' }, { status: 500 })
    }
    let summary = String(candidate.content.parts[0].text).trim()
    // 어드민 설정(maxChars)보다 약간 많아도 문장이 완결되면 잘리지 않게: 허용 오차 내는 그대로 저장
    const overflowAllowance = 400
    if (summary.length > maxChars + overflowAllowance) {
      summary = truncateAtSentenceEnd(summary, maxChars + overflowAllowance)
    }

    // DB에 요약 저장
    const { error: updateError } = await supabase
      .from('saved_results')
      .update({ fortune_summary: summary })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: '요약 저장에 실패했습니다.', summary }, { status: 500 })
    }

    return NextResponse.json({ success: true, summary })
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || '요약 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
