/* eslint-disable no-console */
const path = require('path')
const fs = require('fs')

// 개발 로컬 실행 시 .env.local 로드 (dotenv 패키지 없이)
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    content.split('\n').forEach((line) => {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (m) {
        const key = m[1]
        const val = m[2].replace(/^["']|["']$/g, '').trim()
        if (!process.env[key]) process.env[key] = val
      }
    })
  }
} catch (e) { /* ignore */ }

const WebSocket = require('ws')
const { Server: WebSocketServer } = WebSocket
const { GoogleGenAI } = require('@google/genai')

const PORT = Number(process.env.VERTEX_LIVE_PROXY_PORT || 4001)
const PROJECT = String(process.env.GOOGLE_CLOUD_PROJECT || '').trim()
const LOCATION = String(process.env.GOOGLE_CLOUD_LOCATION || 'asia-northeast3').trim()

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
  let connected = false

  const send = (payload) => {
    try {
      ws.send(JSON.stringify(payload))
    } catch {
      // ignore
    }
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

  ws.on('message', async (raw) => {
    try {
      const parsed = JSON.parse(String(raw || '{}'))
      if (parsed.type === 'ping') {
        send({ type: 'text', text: 'pong' })
        return
      }
      if (parsed.type === 'init') {
        const model = String(parsed.model || '').replace(/^models\//, '')
        const region = String(parsed.region || '').trim() || LOCATION
        console.log('[vertex-live-proxy] init model=%s region=%s', model, region)
        try {
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
          console.log('[vertex-live-proxy] Vertex connect OK')
        } catch (err) {
          console.error('[vertex-live-proxy] Vertex connect error:', err?.message || err)
          send({ type: 'error', message: err?.message || 'Vertex 연결 실패' })
        }
        return
      }
      if (parsed.type === 'audio' && connected && liveSession) {
        const mimeType = parsed.mimeType || 'audio/pcm;rate=16000'
        liveSession.sendRealtimeInput({
          audio: { data: parsed.data, mimeType },
        })
        return
      }
      // 텍스트 메시지 → Gemini Live sendClientContent (AI가 먼저 말하도록 트리거)
      if (parsed.type === 'text' && connected && liveSession) {
        console.log('[vertex-live-proxy] sendClientContent text:', parsed.text?.slice(0, 80))
        liveSession.sendClientContent({ turns: [{ role: 'user', parts: [{ text: parsed.text }] }], turnComplete: true })
        return
      }
      if (parsed.type === 'disconnect') {
        ws.close()
      }
    } catch (e) {
      send({ type: 'error', message: e?.message || '메시지 처리 실패' })
    }
  })

  ws.on('close', () => {
    try {
      liveSession?.close?.()
    } catch {
      // ignore
    }
  })
})

console.log(`[vertex-live-proxy] ws server listening on :${PORT}`)
