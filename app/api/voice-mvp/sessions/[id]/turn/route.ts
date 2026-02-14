import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'
import {
  getKoreaContextVars,
  getVisitGuidanceText,
  getSilenceBreakPrompt,
} from '@/lib/voice-mvp/ppoing-rules'

export const dynamic = 'force-dynamic'

function formatProfileLine(p: any, label: string) {
  if (!p || typeof p !== 'object') return `${label}: (없음)`
  const name = String(p.name || '').trim() || '(이름 없음)'
  const genderRaw = String(p.gender || '').trim()
  const gender = genderRaw === 'male' ? '남성' : genderRaw === 'female' ? '여성' : genderRaw ? genderRaw : '(성별 없음)'
  return `${label}: ${name} / ${gender}`
}

/** 현재 한국 시각(Asia/Seoul)을 읽기 쉬운 문자열로 반환. 유저가 시간/날짜 물어볼 때 대답용 */
function getCurrentKoreaTimeString(): string {
  const v = getKoreaContextVars()
  return `${v.dateStr} ${v.weekdayKo}요일 ${v.timeStr}`
}

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
    const triggerSilence = body?.trigger === 'silence'
    const silenceSeconds = Number.isFinite(Number(body?.silence_seconds))
      ? Math.max(2, Math.min(10, Math.floor(Number(body.silence_seconds))))
      : 3
    let userText = String(body?.text || '').trim()
    if (triggerSilence) {
      userText = '__SILENCE_BREAK__'
    }
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

    const { data: eventsRows } = await supabase
      .from('voice_mvp_events')
      .select('type, payload')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(50)
    const createdEvent = (eventsRows || []).find((e: any) => e.type === 'created')
    const visitCountToday = Number(
      (createdEvent as any)?.payload?.visit_count_today ?? 1
    ) || 1

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
              : mode === 'shinjeom'
              ? (cfg as any).persona_shinjeom || ''
              : mode === 'fortune'
              ? (cfg as any).persona_fortune || ''
              : mode === 'gunghap'
              ? cfg.persona_gunghap || ''
              : cfg.persona_reunion || ''
          ).trim()
        : '')
    const voiceStyle =
      (session?.routing_config_snapshot?.voice_presets_by_mode &&
        typeof session.routing_config_snapshot.voice_presets_by_mode?.[mode]?.style === 'string' &&
        String(session.routing_config_snapshot.voice_presets_by_mode?.[mode]?.style || '').trim()) ||
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
    const profileSelfLine = formatProfileLine(session?.profile_self, '본인')
    const profilePartnerLine = formatProfileLine(session?.profile_partner, '상대')
    const selfGenderRaw = String(session?.profile_self?.gender || '').trim()
    const isMale = selfGenderRaw === 'male' || profileSelfLine.includes('남성')
    const honorificLine = isMale
      ? '내담자 성별: 남성. 반드시 오빠 또는 삼촌으로 호칭할 것. 언니/이모 사용 금지.'
      : '내담자 성별: 여성. 반드시 언니 또는 이모로 호칭할 것. 오빠/삼촌 사용 금지.'

    const systemPrompt = `당신은 한국어로 대답하는 "실시간 음성 상담사"입니다.
- 아래 [페르소나]를 최우선으로 따르세요.

[페르소나]
${persona || '(미설정)'}

- ${styleLine}
- 상담 종류: ${mode}
- 목표: 사용자가 선택한 상담 종류(사주/신점/운세/궁합/재회)에 맞춰, 공감 + 구체적 조언 + 다음 질문 1개를 제공합니다.
- 금지: 과도한 단정, 비방, 혐오, 폭력 조장.
- 출력: 6~12문장, 말투는 자연스럽게. 마지막에 질문 1개로 마무리.
`

    const koreaTime = getCurrentKoreaTimeString()
    const koreaVars = getKoreaContextVars()
    const visitGuidance = getVisitGuidanceText(visitCountToday)
    const isShinjeom = mode === 'shinjeom'

    const dynamicVarsBlock = isShinjeom
      ? `
### 상황 변수(오프닝/답변에 자연스럽게 반영)
- 현재: ${koreaTime}
- 요일: ${koreaVars.weekdayKo}요일${koreaVars.isMonday ? ' (월요일이라 조상님 발걸음이 무거워)' : ''}${koreaVars.isFriday ? ' (불금이라 연애 귀신들이 들떴네!)' : ''}
- 시간대: ${koreaVars.timeSlotHint}
${koreaVars.isFullMoon ? '- 오늘 달이 밝아서 점사가 더 잘 보여!' : ''}
${koreaVars.isHoliday ? '- 명절이라 조상님들이 다들 바쁘셔.' : ''}
### 방문 빈도(오늘 ${visitCountToday}번째 방문)
- 입구 테마: ${visitGuidance.openingTheme} - ${visitGuidance.openingHint}
- 출구 테마: ${visitGuidance.closingTheme} - ${visitGuidance.closingHint}
`
      : ''

    const contextBlock = `### 호칭 규칙(필수)
${honorificLine}

### 현재 시각(한국 표준시 KST, UTC+9) — 아래 값을 그대로 사용
${koreaTime}
- UTC 아님. "지금 몇 시?" "오늘 며칠?" 등 시간/날짜 질문 시 반드시 위 시각만 사용. 예: "지금 한국 시각 ${koreaVars.timeStr}이야." 또는 "오늘 ${koreaVars.dateStr} ${koreaVars.weekdayKo}요일이야."
${dynamicVarsBlock}
### 만세력(본인)
${profileSelfLine}
${manseSelfText || '(없음)'}

### 만세력(상대/파트너)
${mode === 'gunghap' ? `${profilePartnerLine}\n${mansePartnerText || '(없음)'}` : '(해당 없음)'}

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

    // Store user message (silence break의 경우 시스템 이벤트로 기록하지 않음 - 대화 흐름에 불필요)
    if (!triggerSilence) {
      await supabase.from('voice_mvp_messages').insert({
        session_id: sessionId,
        role: 'user',
        text: userText,
      })
    }

    await supabase.from('voice_mvp_events').insert({
      session_id: sessionId,
      type: 'route_decision',
      payload: { ...decision, seconds: userSeconds },
    })

    let assistantText = ''
    let usedModel = decision.model
    const userInputBlock =
      triggerSilence
        ? getSilenceBreakPrompt(silenceSeconds) +
          '\n\n위 지침대로 지금 사용자에게 말을 걸어주세요. 1~2문장만 출력하세요.'
        : `사용자 발화: ${userText}`
    const res = await model.generateContent([systemPrompt, contextBlock, userInputBlock])
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

