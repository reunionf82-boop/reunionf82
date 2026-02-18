import { NextResponse } from 'next/server'

/**
 * 디버그용: OPENAI_API_KEY 등 환경 변수 로딩 여부 확인
 * 브라우저에서 GET /api/voice-mvp/check-env 로 확인 가능
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const key = String(process.env.OPENAI_API_KEY || '').trim()
  return NextResponse.json({
    openAiKeySet: !!key,
    openAiKeyPrefix: key ? `${key.slice(0, 12)}...` : null,
    googleProject: !!String(process.env.GOOGLE_CLOUD_PROJECT || '').trim(),
  })
}
