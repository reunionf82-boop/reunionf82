import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizePhoneForVoice } from '@/lib/voice-summary'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

/**
 * 음성 상담 접속 시: 같은 전화번호·같은 content의 과거 요약 중 아직 안부로 안 물어본 항목을 조회.
 * 반환: promptAddition (AI 인사 직후 자연스럽게 안부 물어볼 문장들), itemRefs (저장 시 전달해 이미 물어본 것으로 기록)
 * POST body: { phone: string, content_id?: number }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const phone = body?.phone != null ? String(body.phone).trim() : ''
    const contentId = body?.content_id != null ? Number(body.content_id) : null

    const phoneNorm = normalizePhoneForVoice(phone)
    if (!phoneNorm) {
      return NextResponse.json({ success: true, promptAddition: '', itemRefs: [] })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let query = supabase
      .from('voice_conversation_summaries')
      .select('id, summary_json, created_at')
      .eq('phone_normalized', phoneNorm)
      .order('created_at', { ascending: false })
      .limit(20)

    if (contentId != null && Number.isFinite(contentId)) {
      query = query.or(`content_id.eq.${contentId},content_id.is.null`)
    }

    const { data: summaries, error } = await query

    if (error || !summaries?.length) {
      return NextResponse.json({ success: true, promptAddition: '', itemRefs: [] })
    }

    const { data: askedRows } = await supabase
      .from('voice_summary_asked')
      .select('item_ref')
      .in('summary_id', summaries.map((s: any) => s.id))

    const askedRefs = new Set<string>()
    ;(askedRows || []).forEach((r: any) => askedRefs.add(String(r.item_ref)))

    type Item = { summaryId: number; type: 'point' | 'date'; index: number; text: string }
    const items: Item[] = []
    for (const s of summaries) {
      const j = (s as any).summary_json || {}
      const points = Array.isArray(j.corePoints) ? j.corePoints : []
      const dates = Array.isArray(j.keyDates) ? j.keyDates : []
      points.forEach((t: string, i: number) => {
        const ref = `${s.id}_point_${i}`
        if (!askedRefs.has(ref)) items.push({ summaryId: s.id, type: 'point', index: i, text: String(t).trim() })
      })
      dates.forEach((d: { description?: string; date?: string }, i: number) => {
        const ref = `${s.id}_date_${i}`
        if (!askedRefs.has(ref)) {
          const desc = d?.description ? String(d.description).trim() : ''
          const dateStr = d?.date ? String(d.date).trim() : ''
          const text = dateStr ? `${desc} (${dateStr})` : desc
          if (text) items.push({ summaryId: s.id, type: 'date', index: i, text })
        }
      })
    }

    if (items.length === 0) {
      return NextResponse.json({ success: true, promptAddition: '', itemRefs: [] })
    }

    const pick = items.slice(0, 5)
    const promptLines = pick.map(
      (it) =>
        `- "${it.text}"에 대해 안부를 물어보세요. 예: "참, 그때 ${it.text}라고 하셨는데 어떻게 됐나요?" 또는 "그분과 통화하기로 하셨는데 잘 되셨나요?" 등 자연스럽게 한 가지만 골라 말하세요.`
    )
    const promptAddition = `\n\n[이번 상담에서 반드시 할 일] 최초 인사가 끝난 뒤, 아래 주제 중 하나를 자연스럽게 안부로 물어보세요. 한 가지만 물어보면 됩니다.\n${promptLines.join('\n')}`

    const itemRefs = pick.map((it) => `${it.summaryId}_${it.type}_${it.index}`)

    return NextResponse.json({ success: true, promptAddition, itemRefs })
  } catch (e: any) {
    return NextResponse.json({ success: true, promptAddition: '', itemRefs: [] })
  }
}
