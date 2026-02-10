import { GoogleGenerativeAI } from '@google/generative-ai'
import type { SupabaseClient } from '@supabase/supabase-js'

export type VoiceMessage = { role: string; text: string }

export type VoiceSummaryResult = {
  corePoints: string[]
  keyDates: Array<{ description: string; date: string }>
  /** 요약 생성 시점의 한국 시간(기준일). 오늘 날짜 해석용 */
  referenceDateKST?: string
  referenceTimeKST?: string
}

const MODEL = 'gemini-2.0-flash'
const KST = 'Asia/Seoul'

/** 한국 시간(KST) 기준 오늘 날짜 YYYY-MM-DD */
export function getKSTDateString(): string {
  const now = new Date()
  const y = new Intl.DateTimeFormat('en-CA', { timeZone: KST, year: 'numeric' }).format(now)
  const m = new Intl.DateTimeFormat('en-CA', { timeZone: KST, month: '2-digit' }).format(now)
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: KST, day: '2-digit' }).format(now)
  return `${y}-${m}-${d}`
}

/** 한국 시간(KST) 기준 현재 시각 사람이 읽기 쉬운 문자열 (예: 2025년 2월 5일 14시 30분) */
export function getKSTReadableNow(): string {
  const now = new Date()
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

/** 휴대폰 번호에서 숫자만 추출 (같은 사람 식별용) */
export function normalizePhoneForVoice(phone: string): string {
  if (!phone || typeof phone !== 'string') return ''
  return phone.replace(/\D/g, '')
}

/** 요약 시 제외할 주제(이미 이전 상담에서 안부로 물어본 항목). LLM이 corePoints/keyDates에 넣지 않음 */
export type SummarizeOptions = {
  /** 이미 안부로 물어본 주제/일정 문장 목록. 이와 동일·유사한 내용은 추출하지 말 것 */
  excludeAlreadyAsked?: string[]
}

/**
 * 같은 전화번호·같은 content 기준으로 이미 안부로 물어본 항목의 실제 문장 목록을 반환.
 * 요약 LLM 호출 전에 excludeAlreadyAsked로 넘겨 중복 추출을 막을 때 사용.
 */
export async function getAlreadyAskedSummaryTexts(
  supabase: SupabaseClient,
  phoneNorm: string,
  contentId?: number | null
): Promise<string[]> {
  const result: string[] = []
  if (!phoneNorm) return result
  let query = supabase
    .from('voice_conversation_summaries')
    .select('id, summary_json')
    .eq('phone_normalized', phoneNorm)
    .order('created_at', { ascending: false })
    .limit(20)
  if (contentId != null && Number.isFinite(contentId)) {
    query = query.or(`content_id.eq.${contentId},content_id.is.null`)
  }
  const { data: pastSummaries } = await query
  if (!Array.isArray(pastSummaries) || pastSummaries.length === 0) return result
  const summaryIds = pastSummaries.map((s: { id: number }) => s.id)
  const summaryById = new Map(
    pastSummaries.map((s: { id: number; summary_json: unknown }) => [s.id, s.summary_json])
  )
  const { data: askedRows } = await supabase
    .from('voice_summary_asked')
    .select('summary_id, item_ref')
    .in('summary_id', summaryIds)
  const added = new Set<string>()
  for (const row of askedRows || []) {
    const ref = String((row as { item_ref: string }).item_ref).trim()
    const sid = Number((row as { summary_id: number }).summary_id)
    const json = summaryById.get(sid) as
      | { corePoints?: string[]; keyDates?: Array<{ description?: string; date?: string }> }
      | undefined
    if (!json || added.has(ref)) continue
    const parts = ref.split('_')
    if (parts.length < 3) continue
    const type = parts[1]
    const idx = parseInt(parts[2], 10)
    if (!Number.isFinite(idx) || idx < 0) continue
    if (type === 'point') {
      const arr = Array.isArray(json.corePoints) ? json.corePoints : []
      const text = arr[idx] ? String(arr[idx]).trim() : ''
      if (text) {
        result.push(text)
        added.add(ref)
      }
    } else if (type === 'date') {
      const arr = Array.isArray(json.keyDates) ? json.keyDates : []
      const item = arr[idx]
      const desc =
        item && typeof item === 'object' && item !== null && 'description' in item
          ? String((item as { description?: string }).description ?? '').trim()
          : ''
      const dateStr =
        item && typeof item === 'object' && item !== null && 'date' in item
          ? String((item as { date?: string }).date ?? '').trim()
          : ''
      const text = dateStr ? `${desc} (${dateStr})` : desc
      if (text) {
        result.push(text)
        added.add(ref)
      }
    }
  }
  return result
}

/**
 * 음성 상담 대화 내용에서 핵심 포인트와 주요 일정을 LLM으로 추출.
 * 재접속 시 AI가 "그때 면접 보러 간다고 했던건 어떻게 됐나요?" 식으로 안부 물어보기 위한 데이터.
 * 실패 시 빈 배열 반환.
 * @param options.excludeAlreadyAsked - 이미 이전 상담에서 안부로 물어본 항목; LLM이 이 주제들은 corePoints/keyDates에 포함하지 않음
 */
export async function summarizeVoiceConversation(
  messages: VoiceMessage[],
  options?: SummarizeOptions
): Promise<VoiceSummaryResult> {
  const empty: VoiceSummaryResult = { corePoints: [], keyDates: [] }
  if (!Array.isArray(messages) || messages.length === 0) return empty

  const apiKey = process.env.NEXT_PUBLIC_JEMINAI_API_URL
  if (!apiKey) return empty

  const dialogue = messages
    .map((m) => {
      const who = m.role === 'user' ? '내담자' : '상담사'
      return `${who}: ${String(m.text ?? '').trim()}`
    })
    .filter((line) => line.length > 2)
    .join('\n')

  if (dialogue.length < 10) return empty

  const todayKST = getKSTDateString()
  const nowKSTReadable = getKSTReadableNow()
  const excludeList = options?.excludeAlreadyAsked?.filter((s) => typeof s === 'string' && String(s).trim().length > 0) ?? []
  const excludeRule =
    excludeList.length > 0
      ? `
4. [중요] 이미 물어본 주제 제외: 아래 항목들은 이전 상담에서 이미 안부로 물어본 내용입니다. 이번 대화에서 해당 주제에 대한 "결과/답변"만 있고 새로운 일정·계획이 없으면 corePoints와 keyDates에 넣지 마세요. 동일·유사한 주제를 다시 추출하지 마세요.
제외할 주제 목록:
${excludeList.map((t) => `- ${t}`).join('\n')}`
      : ''

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: MODEL })

    const prompt = `다음은 음성 상담 대화 기록입니다. 아래 규칙에 맞게 JSON만 출력하세요.

기준 시각 (한국 시간): ${nowKSTReadable}. 오늘 날짜는 ${todayKST}입니다.

규칙:
1. corePoints: 내담자가 말한 것 중 "다음에 할 일", "고민", "계획", "관계/사건" 등 나중에 상담사가 안부를 물을 수 있는 핵심 포인트를 짧은 문장으로 1~5개 추출. 예: "면접 보러 감", "촬영 예정", "과제 접수"
2. keyDates: 날짜/시기가 언급된 일정만. description(무슨 일), date(YYYY-MM-DD 형식)로 객체 배열. 없으면 []
   - 반드시 기준 시각(오늘)을 사용해 날짜를 계산할 것.
   - "내일", "모레", "3일 뒤", "일주일 뒤", "다음 주 월요일" 등 상대 표현 → 오늘(${todayKST}) 기준으로 정확한 YYYY-MM-DD 계산.
   - "촬영", "면접", "과제 접수" 등이 "모레", "내일" 등과 함께 언급되면 반드시 keyDates에 넣을 것.
   - "3월 6일", "12월 25일" 등 월·일만 있으면 → 올해(기준일 연도)로 간주해 YYYY-MM-DD로 기록.
   - 날짜를 전혀 알 수 없으면 date는 빈 문자열 "".
3. 출력은 반드시 다음 JSON 형식만 한 줄로. 다른 설명 없이.
{"corePoints":["문장1","문장2"],"keyDates":[{"description":"설명","date":"2025-02-10"}]}
${excludeRule}

대화:
${dialogue}`

    const result = await model.generateContent(prompt)
    const rawText = result.response.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText || typeof rawText !== 'string') return empty

    // 마크다운 코드블록 제거 후 JSON 추출 (다른 설명이 있어도 첫 번째 { ... } 사용)
    let text = rawText.trim()
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) text = codeBlockMatch[1].trim()
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) return empty
    const jsonStr = text.slice(start, end + 1)

    let parsed: VoiceSummaryResult
    try {
      parsed = JSON.parse(jsonStr) as VoiceSummaryResult
    } catch {
      // trailing comma 등 보정 시도
      try {
        parsed = JSON.parse(jsonStr.replace(/,(\s*[}\]])/g, '$1')) as VoiceSummaryResult
      } catch {
        return empty
      }
    }
    if (!parsed || typeof parsed !== 'object') return empty

    const corePoints = Array.isArray(parsed.corePoints)
      ? parsed.corePoints.filter((s) => typeof s === 'string' && String(s).trim().length > 0).map((s) => String(s).trim())
      : []

    // keyDates: description은 문자열 필수, date는 문자열/숫자/null 등 모두 허용 후 문자열로 정규화
    const keyDates: Array<{ description: string; date: string }> = []
    if (Array.isArray(parsed.keyDates)) {
      for (const d of parsed.keyDates) {
        if (!d || typeof d !== 'object') continue
        const dAny = d as Record<string, unknown>
        const desc = (dAny.description ?? dAny.desc ?? dAny.event ?? '') as string
        if (typeof desc !== 'string' || !desc.trim()) continue
        let dateStr = ''
        const dateVal = dAny.date
        if (dateVal != null) {
          if (typeof dateVal === 'number') {
            const s = String(dateVal)
            if (s.length === 8) dateStr = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
            else dateStr = s
          } else {
            dateStr = String(dateVal).trim()
          }
        }
        keyDates.push({ description: desc.trim(), date: dateStr })
      }
    }

    return {
      corePoints,
      keyDates,
      referenceDateKST: todayKST,
      referenceTimeKST: nowKSTReadable,
    }
  } catch {
    return empty
  }
}
