/**
 * Deepgram + Claude + Cartesia 한 턴 처리
 * POST body: { contentId, sessionId, audioBase64?, transcript?, conversationHistory? }
 * - audioBase64 있으면 Deepgram STT → 사용자 발화 텍스트
 * - transcript 있으면 그대로 사용 (오디오 생략 시)
 * - Claude에 대화 이력 + 사용자 발화 전달 → 응답 텍스트
 * - Cartesia TTS: tts_mode 'batch' → REST 한 번, 'streaming' → WebSocket 2~3단어 청크, NDJSON 스트림 반환
 * 반환: batch → { userTranscript, assistantText, audioBase64 } / streaming → NDJSON stream (type:audio base64, type:done assistantText)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import WebSocket from 'ws'

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'
const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes'
const CARTESIA_WS_URL = 'wss://api.cartesia.ai/tts/websocket'
const CARTESIA_VERSION = '2025-04-16'

/** Cartesia 스트리밍: 쉼표/2~3단어 단위로 잘라 첫 소리 빨리 (제미나이급 티키타카). 공백 유지. */
function chunkTextForTts(text: string, wordsPerChunk = 2): string[] {
  const t = text.trim()
  if (!t) return []
  // 쉼표·마침표에서 먼저 끊어서 첫 청크를 더 작게 만듦
  const parts: string[] = []
  const splitRe = /([,，.。!?]\s*)/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = splitRe.exec(t)) !== null) {
    const segment = t.slice(lastIndex, m.index + m[0].length).trim()
    if (segment) parts.push(segment)
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < t.length) {
    const segment = t.slice(lastIndex).trim()
    if (segment) parts.push(segment)
  }
  const chunks: string[] = []
  if (parts.length === 0) {
    const words = t.split(/\s+/)
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const slice = words.slice(i, i + wordsPerChunk).join(' ')
      chunks.push(i === 0 ? slice : ' ' + slice)
    }
    return chunks
  }
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]
    const words = part.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const slice = words.slice(i, i + wordsPerChunk).join(' ')
      chunks.push(chunks.length === 0 ? slice : ' ' + slice)
    }
  }
  return chunks
}

const CARTESIA_SAMPLE_RATE = 24000
const CARTESIA_NUM_CHANNELS = 1
const CARTESIA_BITS = 16

/** 맞장구: 유저 말 끝 → 클로드 본문 전에 Cartesia에 먼저 재생해 클로드 생성 시간을 벌고, 곧바로 반응하는 느낌을 줌 */
const DCC_FILLER_PHRASES = [
  // 1. 생각과 정리를 암시하는 멘트 (가장 무난함)
  '음... 잠시만요.',
  '아, 잠시만요.',
  '네, 잠깐만 기다려주세요.',
  '음... 조금만요.',
  '네, 잠시만 생각할게요.',
  '어떤 의미인지 잠시 정리해 볼게요.',
  '방금 하신 말씀을 잠깐 정리해 볼까요.',
  '음, 제 생각을 조금 가다듬어 볼게요.',
  '어떻게 말씀드릴지 잠깐 고민해 볼게요.',
  '네, 차분히 한 번 정리해 보겠습니다.',
  '음... 어떤 방향이 좋을지 잠시 볼게요.',
  '방금 주신 이야기를 잠시 되짚어 볼게요.',
  '네, 속으로 잠깐만 정리해 보겠습니다.',
  '잠시만요, 생각을 조금 모아볼게요.',
  '음, 이 부분은 잠시 고민이 필요하네요.',
  '어떻게 풀어가면 좋을지 잠깐 짚어볼게요.',
  '네, 찬찬히 한 번 생각해 보겠습니다.',
  '잠시만요, 머릿속으로 조금 그려볼게요.',
  '음, 방금 하신 말씀 잠시 새겨볼게요.',
  '어떤 맥락인지 잠깐만 살펴볼게요.',
  // 2. 상황 파악과 확인을 암시하는 멘트 (전문가 느낌)
  '제가 한 번 찬찬히 들여다볼게요.',
  '네, 그 부분 잠시만 확인해 볼게요.',
  '잠시만요, 조금 더 깊이 살펴볼게요.',
  '자, 어디 한 번 천천히 살펴볼까요.',
  '음, 이 상황을 잠시만 짚고 넘어갈게요.',
  '네, 조금만 더 자세히 들여다보겠습니다.',
  '잠시만요, 찬찬히 한 번 읽어내 볼게요.',
  '음, 어떤 상황인지 잠깐만 훑어볼게요.',
  '자, 잠시만 집중해서 살펴볼게요.',
  '네, 제가 한 번 조심스럽게 살펴볼게요.',
  '잠시만요, 이 부분을 조금 더 파악해 볼게요.',
  '음, 잠시만요. 조금 더 들여다보고 싶네요.',
  '네, 잠깐만 시간을 두고 살펴볼게요.',
  '자, 천천히 한 번 풀어볼까요.',
  '잠시만요, 조금 더 확실히 짚어볼게요.',
  '네, 잠깐만 살펴볼게요.',
  '음... 잠깐만 짚어볼게요.',
  '네, 잠시 머물러 볼게요.',
  '아, 조금만 기다려 주시겠어요?',
  '아... 네, 잠시만요.',
]

/** 맞장구 재생 예상 길이(ms). 이 시간 + 1초 후에 본문 TTS 시작 */
const DCC_FILLER_DURATION_MS = 2500

/** PCM 버퍼 → WAV base64 (청크마다 헤더 붙이면 틱틱 소리 나서, 버퍼 모아서 한 번만 씀) */
function pcmBufferToWavBase64(pcm: Buffer, sampleRate = CARTESIA_SAMPLE_RATE, numChannels = CARTESIA_NUM_CHANNELS, bitsPerSample = CARTESIA_BITS): string {
  if (pcm.length === 0) return ''
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm]).toString('base64')
}

/** 단일 PCM base64 → WAV base64 (batch/fallback용) */
function pcmBase64ToWavBase64(pcmBase64: string, sampleRate = CARTESIA_SAMPLE_RATE, numChannels = CARTESIA_NUM_CHANNELS, bitsPerSample = CARTESIA_BITS): string {
  return pcmBufferToWavBase64(Buffer.from(pcmBase64, 'base64'), sampleRate, numChannels, bitsPerSample)
}

/** 스트리밍 시 이 바이트 이상 모아서 한 PCM 청크 전송 (0.1초) */
const STREAMING_PCM_FLUSH_BYTES = Math.floor((CARTESIA_SAMPLE_RATE * (CARTESIA_BITS / 8) * CARTESIA_NUM_CHANNELS) * 0.1)

type ConversationMessage = { role: 'user' | 'assistant'; content: string }

const sessionHistory = new Map<string, ConversationMessage[]>()

function getOrCreateHistory(sessionId: string): ConversationMessage[] {
  let h = sessionHistory.get(sessionId)
  if (!h) {
    h = []
    sessionHistory.set(sessionId, h)
  }
  return h
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { contentId, sessionId, audioBase64, transcript: userTranscriptOverride, conversationHistory: clientHistory, userName: bodyUserName } = body as {
      contentId?: number
      sessionId?: string
      audioBase64?: string
      transcript?: string
      conversationHistory?: ConversationMessage[]
      userName?: string
    }

    if (!contentId || !sessionId) {
      return NextResponse.json({ success: false, error: 'contentId, sessionId 필요' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    const { data: content, error: contentError } = await supabase
      .from('contents')
      .select('voice_cartesia_config, voice_persona_prompt, voice_counselor_name, voice_initial_greet_prompt')
      .eq('id', contentId)
      .single()

    if (contentError || !content) {
      return NextResponse.json({ success: false, error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 })
    }

    let cartesiaConfig: {
      voice_id?: string
      speed?: number
      volume?: number
      /** TTS 기본 감정 (단일, generation_config.emotion). 없으면 emotions[0] 사용 */
      emotion?: string
      emotions?: string[]
      tts_mode?: 'batch' | 'streaming'
    } = {}
    try {
      const raw = (content as any).voice_cartesia_config
      if (raw) {
        cartesiaConfig = typeof raw === 'string' ? JSON.parse(raw) : raw
      }
    } catch {
      /* ignore */
    }

    const voiceId = cartesiaConfig.voice_id || '304fdbd8-65e6-40d6-ab78-f9d18b9efdf9'
    const speed = Math.max(0.6, Math.min(1.5, cartesiaConfig.speed ?? 1))
    const volume = Math.max(0.5, Math.min(2, cartesiaConfig.volume ?? 1))
    const emotions = Array.isArray(cartesiaConfig.emotions) && cartesiaConfig.emotions.length > 0
      ? cartesiaConfig.emotions
      : ['calm', 'content', 'sympathetic']
    const primaryEmotion = (cartesiaConfig.emotion && cartesiaConfig.emotion.trim()) || emotions[0] || 'calm'
    const ttsMode = cartesiaConfig.tts_mode === 'streaming' ? 'streaming' : 'batch'

    let userTranscript = userTranscriptOverride
    if (userTranscript == null && audioBase64) {
      const deepgramKey = process.env.DEEPGRAM_API_KEY
      if (!deepgramKey) {
        return NextResponse.json({ success: false, error: 'DEEPGRAM_API_KEY 미설정' }, { status: 500 })
      }
      const audioBuf = Buffer.from(audioBase64, 'base64')
      // 배치(한 번에 오디오 전송) 요청에서는 endpointing/interim_results 미지원 → 생략
      const res = await fetch(
        `${DEEPGRAM_URL}?model=nova-3&language=ko&smart_format=true&region=ko`,
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${deepgramKey}`,
            'Content-Type': 'audio/wav',
          },
          body: audioBuf,
        }
      )
      if (!res.ok) {
        const errText = await res.text()
        return NextResponse.json({ success: false, error: 'Deepgram STT 실패: ' + errText }, { status: 502 })
      }
      const dg = await res.json()
      userTranscript = dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
    }

    if (!userTranscript || typeof userTranscript !== 'string' || !userTranscript.trim()) {
      // 무음/인식 실패 시 400 대신 no-op 반환 (클라이언트가 끊기지 않도록)
      if (ttsMode === 'streaming') {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'userTranscript', text: '' }) + '\n'))
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', assistantText: '' }) + '\n'))
            controller.close()
          },
        })
        return new NextResponse(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
          },
        })
      }
      return NextResponse.json({ success: true, userTranscript: '', assistantText: '', audioBase64: '' })
    }

    const history = clientHistory && Array.isArray(clientHistory) ? clientHistory : getOrCreateHistory(sessionId)
    const persona = String((content as any).voice_persona_prompt || '').trim()
    const counselorName = String((content as any).voice_counselor_name || '').trim()
    const initialGreetPromptRaw = String((content as any).voice_initial_greet_prompt || '').trim()
    const userName = typeof bodyUserName === 'string' ? bodyUserName.trim() : ''
    const initialGreetPrompt = initialGreetPromptRaw.replace(/\{\{userName\}\}/g, userName)
    const specialTags = emotions.filter((e) => typeof e === 'string' && e.startsWith('[') && e.endsWith(']'))
    const emotionHint = `\n[음성 톤] ${primaryEmotion}.${specialTags.length > 0 ? ` [TTS 연출] 필요 시 답변에 ${specialTags.join(', ')} 를 넣으면 TTS가 웃음·공감 등을 표현합니다. 자연스럽게 1~2곳만 사용하세요.` : ''}`

    const lengthRule = persona
      ? `- 답변 분량과 말투는 위 [페르소나]를 따르세요. 신점·공수 등이라면 '모든 걸 아는 것처럼' 구체적으로 풀어서 말하고, 지침에 적힌 7단계·인과관계·비방 등을 자연스럽게 이어가세요. 단답형이 아닌, 페르소나에 맞는 충분한 말을 하세요.`
      : `- 최대한 짧고 명확하게, 한두 문장 단위로 대답해 줘. 긴 설명은 나눠서 말해도 돼.`
    // 티키타카: 첫 단어를 즉시 뱉어 TTS가 빨리 시작되도록 (제미나이급 꼼수)
    const firstWordRule = `- 모든 답변은 반드시 "네," "아," "음," "그렇군요," "그래요," 중 하나로 시작한 뒤 본론을 말하세요.`
    const emotionTagRule = `- 답변에 특수 태그(TTS 연출)를 자연스럽게 포함하세요. 태그는 반드시 대괄호로 감싸서 사용합니다.
- TTS 연출용 특수 태그: [laughter], [sigh], [gasp], [um], [uh], [hmm], [clears throat], [cough]. 아래 [TTS 연출]에 안내된 것만 사용하세요.
- 과하지 않게 1~2곳만 사용하고, 문장 앞이나 중간에 배치하세요.`
    const systemPrompt = `당신은 한국어로 대답하는 음성 상담사입니다.
${persona ? `[페르소나]\n${persona}\n` : ''}
${counselorName ? `상담사 이름: ${counselorName}. 자신을 이 이름으로 소개하고 대화하세요.\n` : ''}
${lengthRule}
${firstWordRule}
${emotionTagRule}
- 답변은 음성으로 읽기 좋게, 자연스러운 구어체로 작성하세요.
- 필요한 경우 감정이나 웃음을 담아 말할 수 있습니다.${emotionHint}`

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })
    }

    // [시작] = 상담 입장 시 AI가 먼저 인사하도록 지시 (페르소나 + 초대 인사 지침 준수, 분량은 지침대로)
    const isStartTurn = userTranscript.trim() === '[시작]'
    const userMessage = isStartTurn
      ? (initialGreetPrompt
          ? `[상담 시작] 사용자가 방금 입장했습니다. 아래 [초대 인사 지침]을 반드시 따르세요. 지침에 분량(예: 약 20초)이나 첫방문/재방문 구분이 있으면 그에 맞춰 말하세요.\n[초대 인사 지침]\n${initialGreetPrompt}`
          : '[상담 시작] 사용자가 방금 입장했습니다. 짧고 친절하게 한 문장으로만 먼저 인사해 주세요.')
      : userTranscript

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const claudeBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      cache_control: { type: 'ephemeral' as const },
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(claudeBody),
    })

    if (!claudeRes.ok) {
      const errText = await claudeRes.text()
      return NextResponse.json({ success: false, error: 'Claude API 실패: ' + errText }, { status: 502 })
    }

    const cartesiaKey = process.env.CARTESIA_API_KEY
    if (!cartesiaKey) {
      return NextResponse.json({ success: false, error: 'CARTESIA_API_KEY 미설정' }, { status: 500 })
    }

    let assistantText = ''
    const streamBody = claudeRes.body
    if (!streamBody) {
      return NextResponse.json({ success: false, error: 'Claude 스트림 없음' }, { status: 502 })
    }
    // ── 스트리밍: Claude 토큰 → Cartesia WS 즉시 전송 (진짜 티키타카) ──
    if (ttsMode === 'streaming') {
      const contextId = `dcc-${sessionId}-${Date.now()}`
      const encoder = new TextEncoder()
      const basePayload = {
        model_id: 'sonic-3',
        voice: { mode: 'id' as const, id: voiceId },
        language: 'ko',
        generation_config: { speed, volume, emotion: primaryEmotion },
        output_format: { container: 'raw' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
        context_id: contextId,
        max_buffer_delay_ms: 1200,
      }

      const extractChunk = (text: string) => {
        if (!text) return { chunk: '', rest: '' }
        const leadTrim = text.length - text.trimStart().length
        const trimmed = text.trimStart()
        if (!trimmed) return { chunk: '', rest: text }
        const punctIdx = trimmed.search(/[,，.。!?]/)
        if (punctIdx >= 0) {
          const end = leadTrim + punctIdx + 1
          return { chunk: text.slice(0, end), rest: text.slice(end) }
        }
        if (trimmed.length >= 12) {
          const spaceAt = trimmed.indexOf(' ', 11)
          if (spaceAt >= 0) {
            const end = leadTrim + spaceAt + 1
            return { chunk: text.slice(0, end), rest: text.slice(end) }
          }
        }
        return { chunk: '', rest: text }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'userTranscript', text: userTranscript.trim() }) + '\n'))
          /** 스트리밍: 클라이언트 AudioStreamer가 raw PCM만 받으므로 base64는 PCM 그대로, format 명시 */
          const enqueueAudio = (pcmBuffer: Buffer) => {
            if (!pcmBuffer || pcmBuffer.length === 0) return
            try {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'audio' as const,
                base64: pcmBuffer.toString('base64'),
                format: 'pcm_s16le' as const,
                sampleRate: CARTESIA_SAMPLE_RATE,
              }) + '\n'))
            } catch (_) {}
          }
          const finish = () => {
            try {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', assistantText }) + '\n'))
              controller.close()
            } catch (_) {}
          }
          let finished = false
          const resolveOnce = () => {
            if (finished) return
            finished = true
            if (pcmBuffer.length > 0) {
              enqueueAudio(pcmBuffer)
              pcmBuffer = Buffer.alloc(0)
            }
            finish()
          }

          const ws = new WebSocket(CARTESIA_WS_URL, {
            headers: {
              'Cartesia-Version': CARTESIA_VERSION,
              Authorization: `Bearer ${cartesiaKey}`,
            },
          })

          let wsOpen = false
          const pendingSends: string[] = []
          const sendCartesia = (transcript: string, isFinal: boolean) => {
            const payload = { ...basePayload, transcript, continue: !isFinal }
            const msg = JSON.stringify(payload)
            if (!wsOpen) pendingSends.push(msg)
            else ws.send(msg)
          }
          let fillerSentAt: number | null = null
          if (!isStartTurn) {
            const filler = DCC_FILLER_PHRASES[Math.floor(Math.random() * DCC_FILLER_PHRASES.length)]
            sendCartesia(filler, false)
            // ws.on('open')에서 실제 전송 시점 기록 → 본문 TTS는 맞장구 끝 + 1초 후 시작
          }

          ws.on('open', () => {
            wsOpen = true
            if (pendingSends.length > 0) fillerSentAt = Date.now()
            for (const msg of pendingSends) ws.send(msg)
            pendingSends.length = 0
          })

          let pcmBuffer = Buffer.alloc(0)
          const flushPcm = () => {
            if (pcmBuffer.length > 0) {
              enqueueAudio(pcmBuffer)
              pcmBuffer = Buffer.alloc(0)
            }
          }
          const pushPcm = (pcm: Buffer) => {
            if (pcm.length === 0) return
            pcmBuffer = Buffer.concat([pcmBuffer, pcm])
            while (pcmBuffer.length >= STREAMING_PCM_FLUSH_BYTES) {
              const toFlush = pcmBuffer.subarray(0, STREAMING_PCM_FLUSH_BYTES)
              pcmBuffer = pcmBuffer.subarray(STREAMING_PCM_FLUSH_BYTES)
              enqueueAudio(Buffer.from(toFlush))
            }
          }
          ws.on('message', (raw: Buffer | string) => {
            const text = typeof raw === 'string' ? raw : raw.toString('utf-8')
            try {
              const msg = JSON.parse(text) as { type?: string; data?: string; done?: boolean }
              if (msg.type === 'chunk' && typeof msg.data === 'string') {
                const pcm = Buffer.from(msg.data, 'base64')
                if (pcm.length > 0) pushPcm(pcm)
                flushPcm()
                return
              }
              if (msg.type === 'done') {
                flushPcm()
                ws.close()
                resolveOnce()
                return
              }
            } catch {
              if (Buffer.isBuffer(raw) && raw.length > 0) pushPcm(raw)
            }
          })
          ws.on('error', () => resolveOnce())
          ws.on('close', () => resolveOnce())
          setTimeout(() => {
            if (ws.readyState !== ws.CLOSED && ws.readyState !== ws.CLOSING) ws.close()
            resolveOnce()
          }, 60000)

          ;(async () => {
            const reader = streamBody.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let pendingText = ''
            let sentAny = false
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
                  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
                    assistantText += parsed.delta.text
                    pendingText += parsed.delta.text
                    for (;;) {
                      const { chunk, rest } = extractChunk(pendingText)
                      if (!chunk) break
                      pendingText = rest
                      const trimmed = chunk.trim()
                      if (!trimmed) continue
                      // 맞장구 말이 끝나고 1초 뒤에 본문 TTS 시작
                      if (fillerSentAt !== null) {
                        const wait = fillerSentAt + DCC_FILLER_DURATION_MS + 1000 - Date.now()
                        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait))
                        fillerSentAt = null
                      }
                      const toSend = sentAny ? ` ${trimmed}` : trimmed
                      sentAny = true
                      sendCartesia(toSend, false)
                    }
                  }
                } catch {
                  /* ignore */
                }
              }
            }
            const finalText = pendingText.trim()
            if (finalText) {
              const toSend = sentAny ? ` ${finalText}` : finalText
              sendCartesia(toSend, true)
            } else {
              sendCartesia('', true)
            }
            assistantText = assistantText.trim()
            if (assistantText) {
              history.push({ role: 'user', content: userTranscript })
              history.push({ role: 'assistant', content: assistantText })
              if (history.length > 50) history.splice(0, history.length - 50)
            }
          })().catch(() => resolveOnce())
        },
      })

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store',
        },
      })
    }

    const reader = streamBody.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
              assistantText += parsed.delta.text
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    assistantText = assistantText.trim()

    if (!assistantText) {
      return NextResponse.json({ success: false, error: 'Claude 응답이 비어 있습니다.' }, { status: 502 })
    }

    history.push({ role: 'user', content: userTranscript })
    history.push({ role: 'assistant', content: assistantText })
    if (history.length > 50) history.splice(0, history.length - 50)

    const ttsBody = {
      model_id: 'sonic-3',
      transcript: assistantText,
      voice: { mode: 'id', id: voiceId },
      language: 'ko',
      generation_config: {
        speed,
        volume,
        emotion: primaryEmotion,
      },
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: CARTESIA_SAMPLE_RATE },
    }

    const cartesiaRes = await fetch(CARTESIA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cartesia-Version': CARTESIA_VERSION,
        Authorization: `Bearer ${cartesiaKey}`,
      },
      body: JSON.stringify(ttsBody),
    })

    if (!cartesiaRes.ok) {
      const errText = await cartesiaRes.text()
      return NextResponse.json({ success: false, error: 'Cartesia TTS 실패: ' + errText }, { status: 502 })
    }

    const audioArrayBuffer = await cartesiaRes.arrayBuffer()
    const audioBase64Out = Buffer.from(audioArrayBuffer).toString('base64')

    return NextResponse.json({
      success: true,
      userTranscript: userTranscript.trim(),
      assistantText,
      audioBase64: audioBase64Out,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
