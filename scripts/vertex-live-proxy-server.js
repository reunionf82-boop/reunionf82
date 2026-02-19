/* eslint-disable no-console */
const path = require('path')
const fs = require('fs')

// .env 로드 (로컬: .env.local, 프로덕션: .env.local 또는 .env)
function loadEnvFile(filename) {
  const envPath = path.join(__dirname, '..', filename)
  if (!fs.existsSync(envPath)) return
  try {
    const content = fs.readFileSync(envPath, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    content.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const idx = trimmed.indexOf('=')
      if (idx <= 0) return
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (key && !process.env[key]) process.env[key] = val
    })
  } catch (e) {
    console.warn('[vertex-live-proxy] loadEnv', filename, e?.message)
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const WebSocket = require('ws')
const { Server: WebSocketServer } = WebSocket
const { GoogleGenAI } = require('@google/genai')

const PORT = Number(process.env.VERTEX_LIVE_PROXY_PORT || 4001)
const PROJECT = String(process.env.GOOGLE_CLOUD_PROJECT || '').trim()
const LOCATION = String(process.env.GOOGLE_CLOUD_LOCATION || 'asia-northeast3').trim()

const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim()
const XAI_API_KEY = String(process.env.XAI_API_KEY || '').trim()
const HUME_API_KEY = String(process.env.HUME_API_KEY || '').trim()
const HUME_SECRET_KEY = String(process.env.HUME_SECRET_KEY || '').trim()

if (!OPENAI_API_KEY) console.warn('[vertex-live-proxy] OPENAI_API_KEY 없음')
if (!XAI_API_KEY) console.warn('[vertex-live-proxy] XAI_API_KEY 없음')
if (!HUME_API_KEY || !HUME_SECRET_KEY) console.warn('[vertex-live-proxy] HUME_API_KEY/SECRET_KEY 없음')

function isGptModel(m) {
  return /^gpt/i.test(String(m || '').trim())
}
function isGrokModel(m) {
  return /^grok/i.test(String(m || '').trim())
}
function isHumeModel(m) {
  return /^hume/i.test(String(m || '').trim()) || /^evi/i.test(String(m || '').trim())
}

function mapToOpenAiModel(m) {
  const s = String(m || '').trim().toLowerCase()
  if (s === 'gpt-realtime' || s === 'gpt-4o-realtime') return 'gpt-4o-realtime-preview-2024-12-17'
  if (s.startsWith('gpt-4o-realtime-preview')) return m
  return 'gpt-4o-realtime-preview-2024-12-17'
}
const OPENAI_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse', 'cedar', 'marin']
const XAI_VOICES = ['ara', 'rex', 'eve', 'sal', 'gork', 'leo']

function mapVoiceToOpenAi(v) {
  const s = String(v || '').trim().toLowerCase()
  if (OPENAI_VOICES.includes(s)) return s
  if (['fenrir', 'puck'].includes(s)) return 'cedar'
  if (['aoede', 'charon', 'kore'].includes(s)) return 'marin'
  return 'cedar'
}

function mapVoiceToXai(v) {
  const s = String(v || '').trim().toLowerCase()
  if (XAI_VOICES.includes(s)) return s
  return 'ara'
}

// Hume Access Token 생성 (Basic Auth로 /oauth2-cc/token 호출)
async function getHumeAccessToken() {
  // 키 확인 로그
  const hasKey = !!HUME_API_KEY
  const hasSecret = !!HUME_SECRET_KEY
  console.log(`[vertex-live-proxy] Hume Key check: API_KEY=${hasKey ? 'OK' : 'MISSING'}, SECRET=${hasSecret ? 'OK' : 'MISSING'}`)
  
  if (!HUME_API_KEY || !HUME_SECRET_KEY) {
    console.error('[vertex-live-proxy] Hume Keys are missing in process.env')
    return null
  }

  try {
    const auth = Buffer.from(`${HUME_API_KEY}:${HUME_SECRET_KEY}`).toString('base64')
    console.log('[vertex-live-proxy] Fetching Hume token...')
    
    // 공식 문서: https://api.hume.ai/oauth2-cc/token (v0 경로 아님)
    const res = await fetch('https://api.hume.ai/oauth2-cc/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${auth}`,
      },
      body: 'grant_type=client_credentials',
    })

    const rawText = await res.text()
    const bodyLen = rawText ? rawText.length : 0
    console.log(`[vertex-live-proxy] Hume Token response: ${res.status} ${res.statusText}, body length=${bodyLen}`)

    if (!res.ok) {
      console.error(`[vertex-live-proxy] Hume Token API Error: ${res.status} ${res.statusText}`, rawText.slice(0, 300))
      return null
    }

    if (!rawText || bodyLen === 0) {
      console.error('[vertex-live-proxy] Hume Token Error: 응답 본문이 비어 있음 (status 200). Hume 계정/키 또는 엔드포인트 확인 필요.')
      return null
    }

    let data
    try {
      data = JSON.parse(rawText)
    } catch (parseErr) {
      console.error('[vertex-live-proxy] Hume Token Error: JSON 파싱 실패. body length=', bodyLen, 'raw:', rawText.slice(0, 300))
      return null
    }
    if (!data?.access_token) {
      console.error('[vertex-live-proxy] Hume Token Error: access_token 없음. response:', rawText.slice(0, 200))
      return null
    }
    console.log('[vertex-live-proxy] Hume Token received')
    return data.access_token
  } catch (e) {
    console.error('[vertex-live-proxy] Hume Token Fetch Exception:', e.message)
    if (e.cause) console.error('Cause:', e.cause)
    return null
  }
}

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT 환경 변수가 필요합니다.')
  process.exit(1)
}

// 기본 리전(연결별로 init.region 으로 덮어쓸 수 있음, Multi-region Failover용)
const wss = new WebSocketServer({ port: PORT })

const normalizeConfig = (cfg) => {
  const responseModalities = Array.isArray(cfg?.responseModalities)
    ? cfg.responseModalities
    : ['AUDIO']
  return {
    ...cfg,
    responseModalities,
    // AI가 먼저 말하도록 (실서버 포함)
    proactivity: cfg?.proactivity ?? { proactiveAudio: true },
    // 세션 수명 연장: 압축 없으면 오디오 전용도 약 10~15분 제한. 슬라이딩 윈도우로 연장.
    contextWindowCompression: cfg?.contextWindowCompression ?? { slidingWindow: {} },
    // 약 10분마다 서버가 연결을 끊을 수 있음. 재개 토큰을 받아 재연결 시 컨텍스트 유지.
    sessionResumption: cfg?.sessionResumption ?? {},
    // 음성 전사 활성화 (AI 출력 + 사용자 입력 모두 텍스트로 전사)
    outputAudioTranscription: cfg?.outputAudioTranscription ?? {},
    inputAudioTranscription: cfg?.inputAudioTranscription ?? {},
  }
}

wss.on('connection', (ws) => {
  let liveSession = null
  let openAiWs = null
  let humeWs = null
  let upstreamMode = 'gemini' // 'gemini' | 'gpt' | 'xai' | 'hume'
  let connected = false

  const send = (payload) => {
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      // ignore
    }
  }

  // Hume EVI 핸들러
  const handleHumeMessage = (raw) => {
    try {
      const msg = JSON.parse(raw)
      if (msg.type === 'audio_output') {
        send({ type: 'audio', data: msg.data })
      } else if (msg.type === 'user_interruption') {
        send({ type: 'interrupted' })
      } else if (msg.type === 'error') {
        send({ type: 'error', message: msg.message || 'Hume Error' })
      }
    } catch { /* ignore */ }
  }

  const callbacks = {
    onopen: () => {
      connected = true
      send({ type: 'ready' })
    },
    onmessage: (msg) => {
      try {
        // 디버그: serverContent의 모든 키 로깅 (transcription 확인용)
        const sc = msg?.serverContent
        if (sc) {
          const keys = Object.keys(sc).filter(k => k !== 'modelTurn')
          if (keys.length > 0) {
            console.log('[vertex-live-proxy] serverContent keys:', keys.join(', '))
          }
        }
        // 최상위 키 로깅 (serverContent 밖에 transcription이 있는 경우 확인)
        const topKeys = Object.keys(msg || {}).filter(k => k !== 'serverContent' && k !== 'sessionResumptionUpdate')
        if (topKeys.length > 0) {
          console.log('[vertex-live-proxy] top-level msg keys:', topKeys.join(', '))
        }

        // 세션 재개 토큰 전달 (재연결 시 클라이언트가 resumptionHandle 로 보내면 이어서 상담 가능)
        const resumption = msg?.sessionResumptionUpdate
        if (resumption && (resumption.newHandle || resumption.resumable === false)) {
          send({
            type: 'sessionResumptionUpdate',
            newHandle: resumption.newHandle || '',
            resumable: resumption.resumable !== false,
          })
        }
        const turn = msg?.serverContent?.modelTurn
        const parts = turn?.parts || []
        const texts = []
        for (const part of parts) {
          if (typeof part?.text === 'string') texts.push(part.text)
          const inline = part?.inlineData?.data
          if (inline) send({ type: 'audio', data: inline })
        }
        if (texts.length > 0) send({ type: 'text', text: texts.join('\n') })
        if (msg?.serverContent?.interrupted) send({ type: 'interrupted' })

        // AI 출력 음성 전사 (outputAudioTranscription)
        // serverContent 내부 + 최상위 레벨 양쪽 확인
        const outputTranscript = sc?.outputTranscription?.text || msg?.outputTranscription?.text
        if (typeof outputTranscript === 'string' && outputTranscript.trim()) {
          console.log('[vertex-live-proxy] OUTPUT transcript:', outputTranscript.substring(0, 80))
          send({ type: 'transcript', role: 'assistant', text: outputTranscript.trim() })
        }
        // 사용자 입력 음성 전사 (inputAudioTranscription)
        const inputTranscript = sc?.inputTranscription?.text || msg?.inputTranscription?.text
        if (typeof inputTranscript === 'string' && inputTranscript.trim()) {
          console.log('[vertex-live-proxy] INPUT transcript:', inputTranscript.substring(0, 80))
          send({ type: 'transcript', role: 'user', text: inputTranscript.trim() })
        }
      } catch {
        // ignore
      }
    },
    onerror: (e) => {
      console.error('[vertex-live-proxy] Vertex onerror:', e?.message || e?.code || e)
      send({ type: 'error', message: e?.message || 'Live 오류' })
    },
    onclose: (...args) => {
      connected = false
      const [code, reason] = args.length >= 2 ? args : [args[0]?.code, args[0]?.reason]
      console.log('[vertex-live-proxy] Vertex onclose code=%s reason=%s', code, reason)
      send({
        type: 'error',
        message: 'Live 연결 종료',
        code: 'SESSION_END',
        hint: '세션 제한(약 10분) 또는 네트워크로 종료됐을 수 있습니다. 다시 연결해 주세요.',
      })
    },
  }

  ws.on('message', async (message) => {
    try {
      const parsed = JSON.parse(message)
      
      if (parsed.type === 'ping') {
        if (upstreamMode === 'gpt' || upstreamMode === 'xai') {
          // OpenAI/xAI는 ping 없음, 무시
        } else if (upstreamMode === 'hume' && humeWs?.readyState === WebSocket.OPEN) {
          // Hume도 ping 필요 없음
        } else if (liveSession) {
          // Gemini는 별도 ping 없음
        } else {
          send({ type: 'text', text: 'pong' })
        }
        return
      }

      if (parsed.type === 'init') {
        const model = String(parsed.model || '').replace(/^models\//, '')
        const region = String(parsed.region || '').trim() || LOCATION
        console.log('[vertex-live-proxy] init model=%s region=%s', model, region)

        // 1. OpenAI GPT / xAI Grok (호환)
        if (isGptModel(model) || isGrokModel(model)) {
          upstreamMode = isGrokModel(model) ? 'xai' : 'gpt'
          const apiKey = upstreamMode === 'xai' ? XAI_API_KEY : OPENAI_API_KEY
          const baseUrl = upstreamMode === 'xai' ? 'wss://api.x.ai/v1/realtime' : 'wss://api.openai.com/v1/realtime'
          
          if (!apiKey) {
            console.error(`[vertex-live-proxy] ${upstreamMode} API Key missing`)
            send({ type: 'error', message: `${upstreamMode.toUpperCase()}_API_KEY가 설정되지 않았습니다.` })
            return
          }
          const rawConfig = parsed.config || {}
          const sysParts = rawConfig?.systemInstruction?.parts
          const instructions = sysParts?.[0]?.text ? String(sysParts[0].text) : ''
          const geminiVoice = String(rawConfig?.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName || '')
          
          let targetVoice = ''
          if (upstreamMode === 'xai') {
             targetVoice = mapVoiceToXai(geminiVoice)
          } else {
             targetVoice = mapVoiceToOpenAi(geminiVoice)
          }

          // xAI는 grok-beta 사용, GPT는 매핑
          const targetModel = upstreamMode === 'xai' ? 'grok-beta' : mapToOpenAiModel(model) 
          const temperature = rawConfig.temperature != null ? Number(rawConfig.temperature) : 0.8

          const wsUrl = `${baseUrl}?model=${encodeURIComponent(targetModel)}`
          console.log(`[vertex-live-proxy] ${upstreamMode.toUpperCase()} connecting to ${baseUrl} model=${targetModel}`)
          
          try {
            openAiWs = new WebSocket(wsUrl, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'OpenAI-Beta': 'realtime=v1',
              },
            })
          } catch (e) {
            console.error(`[vertex-live-proxy] ${upstreamMode} socket create error:`, e)
            send({ type: 'error', message: e?.message || 'Upstream 연결 실패' })
            return
          }

          openAiWs.on('open', () => {
            console.log(`[vertex-live-proxy] ${upstreamMode} connected!`)
            connected = true
            send({ type: 'ready' })
            try {
              const sessionUpdate = {
                type: 'session.update',
                session: {
                  instructions,
                  voice: targetVoice,
                  modalities: ['text', 'audio'],
                  input_audio_format: 'pcm16',
                  output_audio_format: 'pcm16',
                  turn_detection: { type: 'server_vad', create_response: true, interrupt_response: true },
                  temperature,
                },
              }
              // xAI는 input_audio_transcription 지원 여부 불확실하므로 일단 제외하거나 GPT인 경우만 추가
              if (upstreamMode === 'gpt') {
                sessionUpdate.session.input_audio_transcription = { model: 'gpt-4o-mini-transcribe' }
              }
              
              openAiWs.send(JSON.stringify(sessionUpdate))
            } catch (e) {
              console.error(`[vertex-live-proxy] ${upstreamMode} session update error:`, e)
              send({ type: 'error', message: e?.message || 'Session 설정 실패' })
            }
          })
          
          openAiWs.on('message', (raw) => {
            try {
              const evt = JSON.parse(String(raw || '{}'))
              if (evt.type === 'error') {
                console.error(`[vertex-live-proxy] ${upstreamMode} API Error:`, JSON.stringify(evt))
                send({ type: 'error', message: evt.error?.message || 'Upstream API 오류' })
                return
              }
              
              const t = String(evt?.type || '')
              if (t === 'response.audio.delta' && evt?.delta) send({ type: 'audio', data: evt.delta })
              else if (t === 'response.output_text.delta' && evt?.delta?.trim()) send({ type: 'text', text: evt.delta })
              else if (t === 'input_audio_buffer.speech_started') send({ type: 'interrupted' })
              else if (t === 'response.done') {
                // 응답 완료 시 로그
                // console.log(`[vertex-live-proxy] ${upstreamMode} response done`)
              }
            } catch { /* ignore */ }
          })
          
          openAiWs.on('error', (e) => {
            console.error(`[vertex-live-proxy] ${upstreamMode} ws error:`, e)
            send({ type: 'error', message: e?.message || 'Upstream 오류' })
          })
          
          openAiWs.on('close', (code, reason) => { 
            console.log(`[vertex-live-proxy] ${upstreamMode} closed: ${code} ${reason}`)
            connected = false
            send({ type: 'error', message: 'Upstream 연결 종료' }) 
          })
          return
        }

        // 2. Hume EVI
        if (isHumeModel(model)) {
          upstreamMode = 'hume'
          const token = await getHumeAccessToken()
          if (!token) {
            console.error('[vertex-live-proxy] Hume Token failed')
            send({ type: 'error', message: 'Hume Access Token 발급 실패 (키 확인 필요)' })
            return
          }
          const rawConfig = parsed.config || {}
          // 클라이언트에서 config.humeConfigId로 보냈는지 확인. 
          // normalizeConfig가 호출되기 전이므로 rawConfig 사용
          // useVoiceResult.ts에서 init 메시지에 config: { humeConfigId: ... } 로 보내고 있음.
          const configId = rawConfig?.humeConfigId 
          
          if (!configId) {
            console.error('[vertex-live-proxy] Hume Config ID missing')
            send({ type: 'error', message: 'Hume Configuration ID가 필요합니다.' })
            return
          }

          // PCM 입력: session_settings를 URL 쿼리로 전달 (API 스키마: audio.encoding 필수). 메시지로 보내면 파싱 오류 나는 경우 대비
          const audioParams = new URLSearchParams({
            access_token: token,
            config_id: configId,
            verbose_transcription: 'true',
            'session_settings[audio][encoding]': 'linear16',
            'session_settings[audio][sample_rate]': '16000',
            'session_settings[audio][channels]': '1',
          })
          const wsUrl = `wss://api.hume.ai/v0/evi/chat?${audioParams.toString()}`
          console.log('[vertex-live-proxy] Hume connecting... ConfigID:', configId)
          
          try {
            humeWs = new WebSocket(wsUrl)
          } catch (e) {
            console.error('[vertex-live-proxy] Hume socket create error:', e)
            send({ type: 'error', message: e?.message || 'Hume 연결 실패' })
            return
          }

          humeWs.on('open', () => {
            console.log('[vertex-live-proxy] Hume connected!')
            connected = true
            send({ type: 'ready' })
          })
          
          humeWs.on('message', (data) => {
            // Hume raw data parsing
             try {
               const text = String(data)
               // console.log('[vertex-live-proxy] Hume raw msg:', text.substring(0, 100))
               handleHumeMessage(text)
             } catch(e) {
               console.error('[vertex-live-proxy] Hume message parse error:', e)
             }
          })
          
          humeWs.on('error', (e) => {
            console.error('[vertex-live-proxy] Hume ws error:', e)
            send({ type: 'error', message: e?.message || 'Hume 오류' })
          })
          
          humeWs.on('close', (code, reason) => { 
            console.log(`[vertex-live-proxy] Hume closed: ${code} ${reason}`)
            connected = false
            send({ type: 'error', message: 'Hume 연결 종료' }) 
          })
          return
        }

        // 3. Google Gemini (기존)
        try {
          console.log('[vertex-live-proxy] Gemini connecting... Model:', model)
          const aiClient = new GoogleGenAI({
            vertexai: true,
            project: PROJECT,
            location: region,
          })
          const rawConfig = parsed.config || {}
          const config = normalizeConfig(rawConfig)
          if (String(parsed.resumptionHandle || '').trim()) {
            config.sessionResumption = { ...config.sessionResumption, handle: String(parsed.resumptionHandle).trim() }
          }
          
          liveSession = await aiClient.live.connect({ model, config, callbacks })
          console.log('[vertex-live-proxy] Gemini connected OK')
        } catch (err) {
          console.error('[vertex-live-proxy] Gemini connect error:', err?.message || err)
          send({ type: 'error', message: err?.message || 'Vertex 연결 실패' })
        }
        return
      }

      // 오디오 데이터 전달
      if (parsed.type === 'audio') {
        if (upstreamMode === 'gpt' || upstreamMode === 'xai') {
          if (openAiWs?.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: parsed.data }))
          }
        } else if (upstreamMode === 'hume') {
          if (humeWs?.readyState === WebSocket.OPEN) {
            humeWs.send(JSON.stringify({ type: 'audio_input', data: parsed.data }))
          }
        } else {
          liveSession?.send({ mimeType: 'audio/pcm;rate=24000', data: parsed.data })
        }
        return
      }

      // 텍스트/명령어 전달 (필요 시)
      if (parsed.type === 'text') {
        if (upstreamMode === 'gpt' || upstreamMode === 'xai') {
          if (openAiWs?.readyState === WebSocket.OPEN) {
            openAiWs.send(JSON.stringify({
              type: 'conversation.item.create',
              item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: parsed.text }] },
            }))
            openAiWs.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text', 'audio'] } }))
          }
        } else if (upstreamMode === 'hume') {
          // Hume text input (if needed)
        } else {
          liveSession?.sendClientContent({ turns: [{ role: 'user', parts: [{ text: parsed.text }] }], turnComplete: true })
        }
        return
      }

      if (parsed.type === 'disconnect') {
        ws.close()
      }
    } catch (e) {
      console.error('[vertex-live-proxy] message error:', e)
    }
  })

  ws.on('close', () => {
    console.log('[vertex-live-proxy] client closed')
    liveSession?.close()
    openAiWs?.close()
    humeWs?.close()
  })
})

console.log(`[vertex-live-proxy] ws server listening on :${PORT}`)
console.log('[vertex-live-proxy] GPT 모델 사용 시 이 서버를 쓰세요. .env.local에 NEXT_PUBLIC_VERTEX_LIVE_PROXY_URL=http://localhost:' + PORT + ' 추가 후 npm run vertex-proxy 실행')
