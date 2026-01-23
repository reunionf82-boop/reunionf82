import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'

function getGeminiApiKey(): string {
  // Reuse existing env if present; do NOT modify existing service behavior.
  return (
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.NEXT_PUBLIC_JEMINAI_API_URL || // legacy variable used in existing code
    ''
  )
}

function decideModel(cfg: any, session: any) {
  const base =
    String(session?.routing_config_snapshot?.base_model || '').trim() ||
    String(cfg?.base_model || '').trim() ||
    'gemini-2.0-flash-001'
  return { model: base }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isVoiceMvpEnabled()) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  try {
    await assertAdminSession()
    const apiKey = getGeminiApiKey()
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })

    const sessionId = params.id
    const body = await req.json().catch(() => ({} as any))
    const userText = String(body?.text || '').trim()
    const userSeconds = Number.isFinite(Number(body?.seconds)) ? Number(body.seconds) : undefined
    if (!userText) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const supabase = getAdminSupabaseClient()
    const { data: sessionRows, error: sessionError } = await supabase
      .from('voice_mvp_sessions')
      .select('*')
      .eq('id', sessionId)
      .limit(1)

    if (sessionError) throw sessionError
    const session = Array.isArray(sessionRows) ? sessionRows[0] : null
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Load config (latest)
    const { data: cfgRows } = await supabase
      .from('voice_mvp_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)
    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : null

    const decision = decideModel(cfg, session)

    // Gather recent transcript for context
    const { data: recentMsgs } = await supabase
      .from('voice_mvp_messages')
      .select('role, text')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(20)

    const transcript = (recentMsgs || [])
      .reverse()
      .map((m: any) => `${m.role === 'user' ? '사용자' : m.role === 'assistant' ? '상담사' : m.role}: ${String(m.text || '')}`)
      .join('\n')

    const mode = String(session.mode || '')
    const persona =
      (session?.routing_config_snapshot?.personas &&
        typeof session.routing_config_snapshot.personas?.[mode] === 'string' &&
        String(session.routing_config_snapshot.personas?.[mode] || '').trim()) ||
      (cfg
        ? String(
            mode === 'saju'
              ? cfg.persona_saju || ''
              : mode === 'fortune'
              ? (cfg as any).persona_fortune || ''
              : mode === 'gunghap'
              ? cfg.persona_gunghap || ''
              : cfg.persona_reunion || ''
          ).trim()
        : '')
    const voiceStyle =
      (session?.routing_config_snapshot?.voice_style && String(session.routing_config_snapshot.voice_style).trim()) ||
      (cfg?.voice_style && String(cfg.voice_style).trim()) ||
      'calm'
    const styleLine =
      voiceStyle === 'bright'
        ? '말투는 밝고 경쾌하게.'
        : voiceStyle === 'firm'
        ? '말투는 단호하고 명확하게.'
        : voiceStyle === 'empathetic'
        ? '말투는 공감적으로(감정 인정→현실 조언 순서로).'
        : voiceStyle === 'warm'
        ? '말투는 다정하고 따뜻하게.'
        : '말투는 차분하고 안정감 있게.'
    const manseSelfText = String(session?.manse_self?.manse_text || '').slice(0, 4000)
    const mansePartnerText = String(session?.manse_partner?.manse_text || '').slice(0, 3000)
    const situation = String(session.situation || '').slice(0, 1500)

    const systemPrompt = `당신은 한국어로 대답하는 "실시간 음성 상담사"입니다.
- 아래 [페르소나]를 최우선으로 따르세요.

[페르소나]
${persona || '(미설정)'}

- ${styleLine}
- 상담 종류: ${mode}
- 목표: 사용자가 선택한 상담 종류(사주/궁합/재회)에 맞춰, 공감 + 구체적 조언 + 다음 질문 1개를 제공합니다.
- 금지: 과도한 단정, 비방, 혐오, 폭력 조장.
- 출력: 6~12문장, 말투는 자연스럽게. 마지막에 질문 1개로 마무리.
`

    const contextBlock = `### 만세력(본인)
${manseSelfText || '(없음)'}

### 만세력(상대/파트너)
${mode === 'gunghap' ? mansePartnerText || '(없음)' : '(해당 없음)'}

### 상황(재회형이면 중요)
${mode === 'reunion' ? situation || '(없음)' : '(해당 없음)'}

### 직전 대화(요약용)
${transcript || '(첫 대화)'}
`

    const start = Date.now()
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: decision.model,
      generationConfig: {
        temperature: 0.4,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    })

    // Store user message
    await supabase.from('voice_mvp_messages').insert({
      session_id: sessionId,
      role: 'user',
      text: userText,
    })

    await supabase.from('voice_mvp_events').insert({
      session_id: sessionId,
      type: 'route_decision',
      payload: { ...decision, seconds: userSeconds },
    })

    let assistantText = ''
    let usedModel = decision.model
    const res = await model.generateContent([systemPrompt, contextBlock, `사용자 발화: ${userText}`])
    assistantText = String(res?.response?.text?.() || '').trim()

    const latency = Date.now() - start
    if (!assistantText) assistantText = '죄송해요, 지금은 답변을 생성하지 못했어요. 한 번만 다시 말씀해주실래요?'

    await supabase.from('voice_mvp_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      text: assistantText,
      model_used: usedModel,
      latency_ms: latency,
    })

    return NextResponse.json({
      success: true,
      text: assistantText,
      model_used: usedModel,
      latency_ms: latency,
      routing: decision,
    })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

