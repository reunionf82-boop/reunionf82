import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getContentById } from '@/lib/supabase-admin'
import { getSilenceBreakPrompt, sanitizeForTts } from '@/lib/voice-mvp/ppoing-rules'

export const dynamic = 'force-dynamic'

function getGeminiApiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const contentId = body?.contentId != null ? Number(body.contentId) : null
    const silenceSeconds = Number.isFinite(Number(body?.silenceSeconds))
      ? Math.max(1, Math.min(10, Math.floor(Number(body.silenceSeconds))))
      : 3

    if (!contentId || isNaN(contentId)) {
      return NextResponse.json({ error: 'contentId is required' }, { status: 400 })
    }

    const apiKey = getGeminiApiKey()
    if (!apiKey) return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 })

    const content = await getContentById(contentId)
    if (!content) return NextResponse.json({ error: 'Content not found' }, { status: 404 })

    const persona = String((content as any).voice_persona_prompt || '').trim()
    const silencePrompt = getSilenceBreakPrompt(silenceSeconds)

    const systemPrompt = persona
      ? `당신은 다음 [페르소나]를 따르는 실시간 음성 상담사입니다.\n\n[페르소나]\n${persona}\n\n${silencePrompt}\n\n위 지침대로 지금 사용자에게 말을 걸어주세요. 1~2문장만 출력하세요.`
      : `${silencePrompt}\n\n위 지침대로 지금 사용자에게 말을 걸어주세요. 1~2문장만 출력하세요.`

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-001',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 256,
      },
    })

    const result = await model.generateContent([systemPrompt, '사용자 발화: __SILENCE_BREAK__'])
    const rawText = String(result?.response?.text?.() || '').trim()
    const text = sanitizeForTts(rawText) || rawText

    if (!text) {
      return NextResponse.json({ success: false, error: 'No response generated' }, { status: 500 })
    }

    return NextResponse.json({ success: true, text })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Silence break failed' }, { status: 500 })
  }
}
