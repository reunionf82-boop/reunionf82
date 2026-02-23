/**
 * Cartesia 보이스 미리듣기
 * POST body: { voiceId, text?, speed?, volume? }
 * 반환: { success: true, audioBase64 } 또는 { success: false, error }
 */

import { NextRequest, NextResponse } from 'next/server'

const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes'
const CARTESIA_VERSION = '2024-11-13'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as {
      voiceId?: string
      text?: string
      speed?: number
      volume?: number
    }
    const voiceId = body.voiceId?.trim() || '304fdbd8-65e6-40d6-ab78-f9d18b9efdf9'
    const text = body.text?.trim() || '안녕하세요, 이 보이스로 말할 수 있어요.'
    const speed = Math.max(0.6, Math.min(1.5, body.speed ?? 1))
    const volume = Math.max(0.5, Math.min(2, body.volume ?? 1))

    const key = process.env.CARTESIA_API_KEY
    if (!key) {
      return NextResponse.json({ success: false, error: 'CARTESIA_API_KEY 미설정' }, { status: 500 })
    }

    const res = await fetch(CARTESIA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cartesia-Version': CARTESIA_VERSION,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model_id: 'sonic-3',
        transcript: text,
        voice: { mode: 'id', id: voiceId },
        language: 'ko',
        generation_config: { speed, volume, emotion: 'calm' },
        output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: 24000 },
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ success: false, error: 'TTS 실패: ' + errText }, { status: 502 })
    }

    const buf = await res.arrayBuffer()
    const audioBase64 = Buffer.from(buf).toString('base64')
    return NextResponse.json({ success: true, audioBase64 })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
