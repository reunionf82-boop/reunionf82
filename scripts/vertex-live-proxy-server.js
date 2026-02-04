/* eslint-disable no-console */
const WebSocket = require('ws')
const { Server: WebSocketServer } = WebSocket
const { GoogleGenAI } = require('@google/genai')

const PORT = Number(process.env.VERTEX_LIVE_PROXY_PORT || 4001)
const PROJECT = String(process.env.GOOGLE_CLOUD_PROJECT || '').trim()
const LOCATION = String(process.env.GOOGLE_CLOUD_LOCATION || 'us-central1').trim()

if (!PROJECT) {
  console.error('GOOGLE_CLOUD_PROJECT 환경 변수가 필요합니다.')
  process.exit(1)
}

const ai = new GoogleGenAI({
  vertexai: true,
  project: PROJECT,
  location: LOCATION,
})

const wss = new WebSocketServer({ port: PORT })

const normalizeConfig = (cfg) => {
  const responseModalities = Array.isArray(cfg?.responseModalities)
    ? cfg.responseModalities
    : ['AUDIO']
  return { ...cfg, responseModalities }
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
      } catch {
        // ignore
      }
    },
    onerror: (e) => {
      send({ type: 'error', message: e?.message || 'Live 오류' })
    },
    onclose: () => {
      connected = false
      send({ type: 'error', message: 'Live 연결 종료' })
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
        const config = normalizeConfig(parsed.config || {})
        liveSession = await ai.live.connect({ model, config, callbacks })
        return
      }
      if (parsed.type === 'audio' && connected && liveSession) {
        const mimeType = parsed.mimeType || 'audio/pcm;rate=16000'
        liveSession.sendRealtimeInput({
          audio: { data: parsed.data, mimeType },
        })
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
