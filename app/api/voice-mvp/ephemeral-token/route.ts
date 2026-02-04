import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI, Modality } from '@google/genai'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function normalizeModel(model: string | undefined) {
  const raw = String(model || '').trim()
  const cleaned = raw.replace(/^models\//, '')
  return cleaned || 'gemini-2.5-flash-native-audio-preview-12-2025'
}

export async function POST(req: NextRequest) {
  if (!isVoiceMvpEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }
  try {
    await assertAdminSession()
    const body = await req.json().catch(() => ({} as any))
    const model = normalizeModel(body?.model)

    const now = Date.now()
    const expireTime = new Date(now + 30 * 60 * 1000).toISOString()
    const newSessionExpireTime = new Date(now + 60 * 1000).toISOString()

    const apiKey = String(process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_JEMINAI_API_URL || '').trim()
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    // Ephemeral token은 Gemini Developer API 전용
    const client = new GoogleGenAI({
      apiKey,
      vertexai: false,
    })
    const token: any = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model,
          config: {
            responseModalities: [Modality.AUDIO],
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    })

    return NextResponse.json({
      success: true,
      token: token?.name,
      model,
      expiresAt: expireTime,
    })
  } catch (e: any) {
    const message = e?.message || '토큰 발급 실패'
    const code = e?.code || e?.status || e?.response?.status
    const details = e?.response?.data || e?.details
    return NextResponse.json(
      { error: code ? `${message} (code ${code})` : message, details },
      { status: 500 }
    )
  }
}
