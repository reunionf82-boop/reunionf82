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

/** 긴 답변(75초+) 시 서버 함수 타임아웃 방지. 30초 끊김 시 프록시 유휴 타임아웃은 NDJSON keepalive로 완화 */
export const maxDuration = 300

const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'
const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes'
const CARTESIA_WS_URL = 'wss://api.cartesia.ai/tts/websocket'
const CARTESIA_VERSION = '2025-04-16'

function isRetryableDeepgramError(status: number, _body: string): boolean {
  return status === 408 || status === 429 || status === 503 || status === 504
}

function isRetryableClaudeError(status: number, body: string): boolean {
  if (status === 429 || status === 503 || status === 504) return true
  try {
    const o = JSON.parse(body) as { error?: { type?: string } }
    return o?.error?.type === 'rate_limit_error' || o?.error?.type === 'overloaded_error'
  } catch {
    return false
  }
}

const DEEPGRAM_RETRY_MAX = 2
const DEEPGRAM_RETRY_DELAYS_MS = [1000, 2000]
/** Deepgram 요청 타임아웃(ms). nova-3 사용 */
const DEEPGRAM_FETCH_TIMEOUT_MS = 15000
const CLAUDE_RETRY_MAX = 2
const CLAUDE_RETRY_DELAYS_MS = [2000, 5000]
/** Claude 입력 토큰 절약·rate_limit 예방: 대화 이력 최근 N턴(1턴=user+assistant 2메시지)만 사용 */
const CLAUDE_HISTORY_MAX_MESSAGES = 40
/** 시스템 컨텍스트(만세력 등) 최대 길이. 초과 시 잘라서 rate_limit 예방 */
const CONTEXT_BLOCK_MAX_CHARS = 6000

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

/** 스트리밍 시 이 바이트 이상 모아서 한 PCM 청크 전송. 자주 보낼수록 끊김 감소 (0.08초) */
const STREAMING_PCM_FLUSH_BYTES = Math.floor((CARTESIA_SAMPLE_RATE * (CARTESIA_BITS / 8) * CARTESIA_NUM_CHANNELS) * 0.08)

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
    const { contentId, sessionId, audioBase64, transcript: userTranscriptOverride, conversationHistory: clientHistory, userName: bodyUserName, contextText: bodyContextText } = body as {
      contentId?: number
      sessionId?: string
      audioBase64?: string
      transcript?: string
      conversationHistory?: ConversationMessage[]
      userName?: string
      /** 클라이언트에서 구성한 컨텍스트(KST·내담자 정보·만세력 등). 무료속성 아닐 때 주입 */
      contextText?: string
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
    /** Speed: 어드민 voice_cartesia_config.speed 슬라이더와 연결. 미설정 시 1 */
    const speed = Math.max(0.6, Math.min(1.5, cartesiaConfig.speed ?? 1))
    const volume = Math.max(0.5, Math.min(2, cartesiaConfig.volume ?? 1))
    const emotions = Array.isArray(cartesiaConfig.emotions) && cartesiaConfig.emotions.length > 0
      ? cartesiaConfig.emotions
      : ['calm', 'content', 'sympathetic']
    const primaryEmotion = (cartesiaConfig.emotion && cartesiaConfig.emotion.trim()) || emotions[0] || 'calm'
    const ttsMode = cartesiaConfig.tts_mode === 'streaming' ? 'streaming' : 'batch'

    /** 침묵깨기: 클라이언트가 지정한 문장만 캐릭터 목소리로 TTS (STT/Claude 생략) */
    const silenceBreakText = (body as { silenceBreakText?: string }).silenceBreakText
    if (typeof silenceBreakText === 'string' && silenceBreakText.trim()) {
      const assistantText = silenceBreakText.trim()
      const cartesiaKey = process.env.CARTESIA_API_KEY
      if (!cartesiaKey) {
        return NextResponse.json({ success: false, error: 'CARTESIA_API_KEY 미설정' }, { status: 500 })
      }
      if (ttsMode === 'streaming') {
        const encoder = new TextEncoder()
        const contextId = `dcc-sb-${sessionId}-${Date.now()}`
        const basePayload = {
          model_id: 'sonic-3',
          voice: { mode: 'id' as const, id: voiceId },
          language: 'ko',
          generation_config: { speed, volume, emotion: primaryEmotion },
          output_format: { container: 'raw' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
          context_id: contextId,
          max_buffer_delay_ms: 1500,
        }
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'userTranscript', text: '' }) + '\n'))
            const enqueueAudio = (pcmBuffer: Buffer) => {
              if (!pcmBuffer?.length) return
              try {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'audio' as const,
                  base64: pcmBuffer.toString('base64'),
                  format: 'pcm_s16le' as const,
                  sampleRate: CARTESIA_SAMPLE_RATE,
                }) + '\n'))
              } catch (_) {}
            }
            let pcmBuffer = Buffer.alloc(0)
            const flushPcm = () => {
              if (pcmBuffer.length > 0) {
                enqueueAudio(pcmBuffer)
                pcmBuffer = Buffer.alloc(0)
              }
            }
            const pushPcm = (pcm: Buffer) => {
              if (!pcm?.length) return
              pcmBuffer = Buffer.concat([pcmBuffer, pcm])
              while (pcmBuffer.length >= STREAMING_PCM_FLUSH_BYTES) {
                const toFlush = pcmBuffer.subarray(0, STREAMING_PCM_FLUSH_BYTES)
                pcmBuffer = pcmBuffer.subarray(STREAMING_PCM_FLUSH_BYTES)
                enqueueAudio(Buffer.from(toFlush))
              }
            }
            const finish = () => {
              try {
                flushPcm()
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', assistantText }) + '\n'))
                controller.close()
              } catch (_) {}
            }
            const ws = new WebSocket(CARTESIA_WS_URL, {
              headers: {
                'Cartesia-Version': CARTESIA_VERSION,
                Authorization: `Bearer ${cartesiaKey}`,
              },
            })
            ws.on('open', () => {
              ws.send(JSON.stringify({ ...basePayload, transcript: assistantText, continue: false }))
            })
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
                  finish()
                }
              } catch {
                if (Buffer.isBuffer(raw) && raw.length > 0) pushPcm(raw)
              }
            })
            ws.on('error', () => finish())
            ws.on('close', () => finish())
            setTimeout(() => {
              if (ws.readyState !== ws.CLOSED && ws.readyState !== ws.CLOSING) ws.close()
              finish()
            }, 60000)
          },
        })
        return new NextResponse(stream, {
          headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
        })
      }
      const ttsBody = {
        model_id: 'sonic-3',
        transcript: assistantText,
        voice: { mode: 'id' as const, id: voiceId },
        language: 'ko',
        generation_config: { speed, volume, emotion: primaryEmotion },
        output_format: { container: 'wav' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
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
        userTranscript: '',
        assistantText,
        audioBase64: audioBase64Out,
      })
    }

    let userTranscript = userTranscriptOverride
    if (userTranscript == null && audioBase64) {
      const deepgramKey = process.env.DEEPGRAM_API_KEY
      if (!deepgramKey) {
        return NextResponse.json({ success: false, error: 'DEEPGRAM_API_KEY 미설정' }, { status: 500 })
      }
      const audioBuf = Buffer.from(audioBase64, 'base64')
      let lastBody = ''
      for (let attempt = 0; attempt <= DEEPGRAM_RETRY_MAX; attempt++) {
        if (attempt > 0) {
          const delay = DEEPGRAM_RETRY_DELAYS_MS[attempt - 1] ?? 2000
          await new Promise((r) => setTimeout(r, delay))
        }
        const ac = new AbortController()
        const timeoutId = setTimeout(() => ac.abort(), DEEPGRAM_FETCH_TIMEOUT_MS)
        let res: Response
        try {
          res = await fetch(
            `${DEEPGRAM_URL}?model=nova-3&language=ko`,
            {
              method: 'POST',
              headers: {
                Authorization: `Token ${deepgramKey}`,
                'Content-Type': 'audio/wav',
              },
              body: audioBuf,
              signal: ac.signal,
            }
          )
        } catch (e) {
          clearTimeout(timeoutId)
          lastBody = (e instanceof Error && e.name === 'AbortError') ? 'Request timeout' : String(e)
          if (attempt === DEEPGRAM_RETRY_MAX) {
            return NextResponse.json(
              { success: false, error: '음성 인식이 일시적으로 지연되었습니다. 잠시 후 다시 말씀해 주세요.' },
              { status: 502 }
            )
          }
          continue
        }
        clearTimeout(timeoutId)
        lastBody = await res.text()
        if (res.ok) {
          try {
            const dg = JSON.parse(lastBody) as { results?: { channels?: { alternatives?: { transcript?: string }[] }[] } }
            userTranscript = dg?.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
          } catch (parseErr) {
            userTranscript = ''
          }
          break
        }
        if (attempt === DEEPGRAM_RETRY_MAX || !isRetryableDeepgramError(res.status, lastBody)) {
          const userMessage = isRetryableDeepgramError(res.status, lastBody)
            ? '음성 인식이 일시적으로 지연되었습니다. 잠시 후 다시 말씀해 주세요.'
            : '음성 인식을 처리하지 못했습니다. 다시 말씀해 주세요.'
          return NextResponse.json({ success: false, error: userMessage }, { status: 502 })
        }
      }
    }

    if (userTranscript?.trim()) {
      console.log('[dcc-turn] STT(Deepgram):', userTranscript.trim().slice(0, 100) + (userTranscript.length > 100 ? '...' : ''))
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

    const rawHistory = clientHistory && Array.isArray(clientHistory) ? clientHistory : getOrCreateHistory(sessionId)
    const history = rawHistory.slice(-CLAUDE_HISTORY_MAX_MESSAGES)
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
    const rawContext = typeof bodyContextText === 'string' ? bodyContextText.trim() : ''
    const contextBlock = rawContext
      ? `\n\n${rawContext.length <= CONTEXT_BLOCK_MAX_CHARS ? rawContext : rawContext.slice(0, CONTEXT_BLOCK_MAX_CHARS) + '\n(이하 생략)'}`
      : ''
    const systemPrompt = `당신은 한국어로 대답하는 음성 상담사입니다.
${persona ? `[페르소나]\n${persona}\n` : ''}
${counselorName ? `상담사 이름: ${counselorName}. 자신을 이 이름으로 소개하고 대화하세요.\n` : ''}
${lengthRule}
${firstWordRule}
${emotionTagRule}
- 답변은 음성으로 읽기 좋게, 자연스러운 구어체로 작성하세요.
- 필요한 경우 감정이나 웃음을 담아 말할 수 있습니다.${emotionHint}${contextBlock}`

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })
    }

    // [시작] = 상담 입장 시 AI가 먼저 인사하도록 지시 (페르소나 + 초대 인사 지침 준수, 분량은 지침대로)
    const isStartTurn = userTranscript.trim() === '[시작]'
    const userMessage = isStartTurn
      ? (initialGreetPrompt
          ? `[상담 시작] 사용자가 방금 입장했습니다. 아래 [초대 인사 지침]을 반드시 따르세요. 지침에 분량(예: 약 20초)이나 첫방문/재방문 구분이 있으면 그에 맞춰 말하세요. 분량이 적혀 있으면 그 길이를 넘지 말고 그 안에서 마무리하세요.\n[초대 인사 지침]\n${initialGreetPrompt}`
          : '[상담 시작] 사용자가 방금 입장했습니다. 짧고 친절하게 한 문장으로만 먼저 인사해 주세요.')
      : userTranscript

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const claudeBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 8192, // 초대 인사·긴 답변 시 중간 잘림 방지. 제미나이 권장 2048+ (256/512면 말하다 뚝 끊김)
      stream: true,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      cache_control: { type: 'ephemeral' as const, ttl: '5m' as const },
    }

    let claudeRes: Response | null = null
    for (let attempt = 0; attempt <= CLAUDE_RETRY_MAX; attempt++) {
      if (attempt > 0) {
        const delay = CLAUDE_RETRY_DELAYS_MS[attempt - 1] ?? 2000
        await new Promise((r) => setTimeout(r, delay))
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      })
      if (res.ok) {
        claudeRes = res
        break
      }
      const errBody = await res.text()
      if (attempt === CLAUDE_RETRY_MAX || !isRetryableClaudeError(res.status, errBody)) {
        const userMessage = isRetryableClaudeError(res.status, errBody)
          ? '상담 응답이 바쁩니다. 잠시 후 다시 말씀해 주세요.'
          : '상담 응답을 처리하지 못했습니다. 다시 말씀해 주세요.'
        return NextResponse.json({ success: false, error: userMessage }, { status: 502 })
      }
    }
    if (!claudeRes) {
      return NextResponse.json({ success: false, error: '상담 응답을 처리하지 못했습니다. 다시 말씀해 주세요.' }, { status: 502 })
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
      const encoder = new TextEncoder()
      /** 연결마다 context_id를 새로 씀(재연결 시에도) */
      const basePayloadNoContext = {
        model_id: 'sonic-3' as const,
        voice: { mode: 'id' as const, id: voiceId },
        language: 'ko' as const,
        generation_config: { speed, volume, emotion: primaryEmotion },
        output_format: { container: 'raw' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
        max_buffer_delay_ms: 1500,
      }

      /** 청크당 최대 길이. 너무 긴 한 덩어리는 Cartesia/연결 불안정 원인될 수 있어 분할 */
      const MAX_CHUNK_CHARS = 280
      const extractChunk = (text: string) => {
        if (!text) return { chunk: '', rest: '' }
        const leadTrim = text.length - text.trimStart().length
        const trimmed = text.trimStart()
        if (!trimmed) return { chunk: '', rest: text }
        const punctIdx = trimmed.search(/[,，.。!?]/)
        if (punctIdx >= 0) {
          const len = punctIdx + 1
          const end = leadTrim + (len <= MAX_CHUNK_CHARS ? len : MAX_CHUNK_CHARS)
          return { chunk: text.slice(0, end), rest: text.slice(end) }
        }
        if (trimmed.length >= 12) {
          const spaceAt = trimmed.indexOf(' ', 11)
          if (spaceAt >= 0) {
            const len = spaceAt + 1
            const end = leadTrim + (len <= MAX_CHUNK_CHARS ? len : MAX_CHUNK_CHARS)
            return { chunk: text.slice(0, end), rest: text.slice(end) }
          }
        }
        if (trimmed.length > MAX_CHUNK_CHARS) {
          return { chunk: text.slice(0, leadTrim + MAX_CHUNK_CHARS), rest: text.slice(leadTrim + MAX_CHUNK_CHARS) }
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
          const KEEPALIVE_MS = 15000
          const keepaliveInterval = setInterval(() => {
            if (finished) return
            try {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'keepalive' }) + '\n'))
            } catch (_) {}
          }, KEEPALIVE_MS)
          const resolveOnce = () => {
            if (finished) return
            finished = true
            clearInterval(keepaliveInterval)
            if (pcmBuffer.length > 0) {
              enqueueAudio(pcmBuffer)
              pcmBuffer = Buffer.alloc(0)
            }
            finish()
          }

          let currentContextId = `dcc-${sessionId}-${Date.now()}`
          let currentWs = new WebSocket(CARTESIA_WS_URL, {
            headers: {
              'Cartesia-Version': CARTESIA_VERSION,
              Authorization: `Bearer ${cartesiaKey}`,
            },
          })
          let wsOpen = false
          const pendingSends: string[] = []
          let sentFinalChunk = false
          let reconnecting = false
          let fillerSentAt: number | null = null
          let wsSentCount = 0
          let wsDoneCount = 0

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

          const isAllDone = () => sentFinalChunk && wsDoneCount >= wsSentCount

          const attachWsHandlers = (ws: WebSocket, label: string) => {
            ws.on('message', (raw: Buffer | string) => {
              if (ws !== currentWs) return
              const text = typeof raw === 'string' ? raw : raw.toString('utf-8')
              try {
                const msg = JSON.parse(text) as { type?: string; data?: string }
                if (msg.type === 'chunk' && typeof msg.data === 'string') {
                  const pcm = Buffer.from(msg.data, 'base64')
                  if (pcm.length > 0) pushPcm(pcm)
                  flushPcm()
                  return
                }
                if (msg.type === 'done') {
                  wsDoneCount++
                  flushPcm()
                  if (isAllDone()) {
                    ws.close()
                    // 다음 틱으로 미룸: 같은 배치로 도착한 chunk가 아직 처리 안 됐을 수 있음.
                    // 먼저 모든 chunk를 enqueue한 뒤 스트림을 닫아야 클라이언트 TTS가 끊기지 않음.
                    setImmediate(() => {
                      if (finished) return
                      if (isAllDone()) resolveOnce()
                    })
                  }
                  return
                }
              } catch {
                if (Buffer.isBuffer(raw) && raw.length > 0) pushPcm(raw)
              }
            })
            ws.on('error', () => {
              if (ws !== currentWs) return
              // LLM이 아직 스트리밍 중(sentFinalChunk false)이면 스트림을 닫지 않음.
              // 다음 sendCartesia에서 readyState !== 1이면 재연결 로직이 동작함.
              setImmediate(() => {
                if (!finished && sentFinalChunk) resolveOnce()
              })
            })
            ws.on('close', () => {
              if (ws !== currentWs) return
              wsOpen = false
              // resolveOnce() 호출하지 않음: Cartesia가 모든 done 전에 연결을 끊으면
              // 여기서 종료하면 미전달 오디오가 있는데 클라이언트에 done이 가서 TTS가 끊김.
              // 스트림 종료는 done 핸들러의 isAllDone() 또는 30초 타임아웃에서만 수행.
            })
          }

          const flushPendingSends = (ws: WebSocket) => {
            if (pendingSends.length === 0) return
            fillerSentAt = Date.now()
            try {
              for (const m of pendingSends) {
                ws.send(m)
                wsSentCount++
              }
            } catch (_) {}
            pendingSends.length = 0
          }

          const sendCartesia = (transcript: string, isFinal: boolean) => {
            if (isFinal) sentFinalChunk = true
            const payload = { ...basePayloadNoContext, context_id: currentContextId, transcript, continue: !isFinal }
            const msg = JSON.stringify(payload)
            if (currentWs.readyState !== 1 /* OPEN */) {
              pendingSends.push(msg)
              if (!reconnecting) {
                reconnecting = true
                currentContextId = `dcc-${sessionId}-${Date.now()}`
                wsSentCount = 0
                wsDoneCount = 0
                const newWs = new WebSocket(CARTESIA_WS_URL, {
                  headers: {
                    'Cartesia-Version': CARTESIA_VERSION,
                    Authorization: `Bearer ${cartesiaKey}`,
                  },
                })
                currentWs = newWs
                attachWsHandlers(newWs, '재연결')
                newWs.on('open', () => {
                  wsOpen = true
                  reconnecting = false
                  flushPendingSends(newWs)
                })
              }
              return
            }
            try {
              currentWs.send(msg)
              wsSentCount++
            } catch (_) {}
          }

          const initialWs = currentWs
          attachWsHandlers(initialWs, '초기')
          initialWs.on('open', () => {
            if (currentWs !== initialWs) return
            wsOpen = true
            flushPendingSends(initialWs)
          })
          setTimeout(() => {
            if (currentWs.readyState !== currentWs.CLOSED && currentWs.readyState !== currentWs.CLOSING) currentWs.close()
            resolveOnce()
          }, 300000)

          ;(async () => {
            const reader = streamBody.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let pendingText = ''
            let sentAny = false
            let firstDelta = true
            try {
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
                    const text = parsed.delta.text
                    if (firstDelta) {
                      process.stdout.write('\n[dcc-turn] LLM(실시간) ')
                      firstDelta = false
                    }
                    process.stdout.write(text)
                    assistantText += text
                    pendingText += text
                    for (;;) {
                      const { chunk, rest } = extractChunk(pendingText)
                      if (!chunk) break
                      pendingText = rest
                      const trimmed = chunk.trim()
                      if (!trimmed) continue
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
              sentFinalChunk = true
              try {
                if (currentWs.readyState === 1) {
                  currentWs.send(JSON.stringify({ ...basePayloadNoContext, context_id: currentContextId, transcript: '', continue: false }))
                }
              } catch (_) {}
            }
            assistantText = assistantText.trim()
            if (assistantText) {
              history.push({ role: 'user', content: userTranscript })
              history.push({ role: 'assistant', content: assistantText })
              if (history.length > 50) history.splice(0, history.length - 50)
            }
            if (isAllDone()) {
              setImmediate(() => {
                if (!finished && isAllDone()) resolveOnce()
              })
            } else {
              // 긴 인사·공수는 청크 수가 많아 Cartesia가 모두 처리하기까지 30초를 넘길 수 있음. 90초까지 대기.
              setTimeout(() => {
                if (!finished) {
                  try { if (currentWs.readyState === 1 || currentWs.readyState === 0) currentWs.close() } catch (_) {}
                  setImmediate(() => {
                    if (!finished) resolveOnce()
                  })
                }
              }, 90000)
            }
            } catch (e) {
              // Claude 스트림 read 실패(연결 끊김·클라이언트 abort 등). 즉시 닫지 말고
              // 이미 보낸 청크에 대한 Cartesia 오디오가 나갈 시간을 주고 90초 후 종료.
              console.error('[dcc-turn] Claude 스트림 읽기 중단:', e instanceof Error ? e.message : String(e))
              if (!finished) {
                setTimeout(() => {
                  if (!finished) resolveOnce()
                }, 90000)
              }
            }
          })().catch((err) => {
            console.error('[dcc-turn] async IIFE reject:', err instanceof Error ? err.message : String(err))
            if (!finished) {
              setTimeout(() => {
                if (!finished) resolveOnce()
              }, 90000)
            }
          })
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
    let firstDelta = true
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
              if (firstDelta) {
                process.stdout.write('\n[dcc-turn] LLM(실시간) ')
                firstDelta = false
              }
              const t = parsed.delta.text
              assistantText += t
              process.stdout.write(t)
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
