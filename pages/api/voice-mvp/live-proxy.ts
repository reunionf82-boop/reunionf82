import type { NextApiRequest, NextApiResponse } from 'next'
import WebSocket, { WebSocketServer } from 'ws'
import { GoogleGenAI } from '@google/genai'
import { Modality, type LiveCallbacks, type LiveConnectConfig, type LiveServerMessage, type Part } from '@google/genai'

type WsWithSession = {
  send: (data: string) => void
  close: () => void
  on: (event: 'message' | 'close' | 'error', cb: (arg: any) => void) => void
}

type ClientInitMessage = {
  type: 'init'
  model: string
  config: LiveConnectConfig
}

type ClientAudioMessage = {
  type: 'audio'
  data: string // base64
  mimeType?: string
}

type ClientMessage = ClientInitMessage | ClientAudioMessage | { type: 'disconnect' } | { type: 'ping' }

type AnyServerMessage = {
  type: 'audio' | 'text' | 'interrupted' | 'error' | 'ready'
  data?: string
  text?: string
  message?: string
}

export const config = {
  api: {
    bodyParser: false,
  },
}

const getVertexClient = () => {
  const project = String(process.env.GOOGLE_CLOUD_PROJECT || '').trim()
  const location = String(process.env.GOOGLE_CLOUD_LOCATION || 'asia-northeast3').trim()
  if (!project) {
    throw new Error('GOOGLE_CLOUD_PROJECT가 설정되지 않았습니다.')
  }
  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
  })
}

const normalizeConfig = (cfg: LiveConnectConfig): LiveConnectConfig => {
  const responseModalities = Array.isArray(cfg?.responseModalities)
    ? cfg.responseModalities
    : [Modality.AUDIO]
  return {
    ...cfg,
    responseModalities,
  }
}

const partsFromMessage = (msg: LiveServerMessage): Part[] => {
  const turn = msg?.serverContent?.modelTurn
  if (turn?.parts) return turn.parts as Part[]
  return []
}

const inlineDataToBase64 = (data: any): string | null => {
  if (!data) return null
  if (typeof data === 'string') return data
  if (data instanceof Uint8Array) {
    return Buffer.from(data).toString('base64')
  }
  if (Buffer.isBuffer(data)) {
    return data.toString('base64')
  }
  return null
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const socket = res.socket as any
    if (!socket?.server) {
      res.status(500).end('No socket server available')
      return
    }

    const server = socket.server as any
    console.log('[live-proxy] http init', req.method, req.url, 'hasWss:', !!server.wss)
    if (!server.wss) {
      const wss = new WebSocketServer({ noServer: true })
      server.wss = wss

      server.on('upgrade', (request: any, socket: any, head: any) => {
        if (!request.url?.startsWith('/api/voice-mvp/live-proxy')) return
        console.log('[live-proxy] upgrade', request.url)
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request)
        })
      })

      wss.on('connection', async (ws: WsWithSession) => {
        console.log('[live-proxy] ws connection opened')
        let liveSession: any = null
        let connected = false
        let connectTimeout: NodeJS.Timeout | null = null
        let initTimeout: NodeJS.Timeout | null = null
        let initReceived = false

        const send = (payload: AnyServerMessage) => {
          try {
            ws.send(JSON.stringify(payload))
          } catch {
            // ignore
          }
        }
        // immediate hello to confirm server->client path
        send({ type: 'text', text: 'server_hello' })

        const callbacks: LiveCallbacks = {
          onopen: () => {
            connected = true
            if (connectTimeout) {
              clearTimeout(connectTimeout)
              connectTimeout = null
            }
            console.log('[live-proxy] live session opened')
            send({ type: 'ready' })
          },
          onmessage: (msg: LiveServerMessage) => {
            const parts = partsFromMessage(msg)
            const texts: string[] = []
            for (const part of parts) {
              if (typeof (part as any)?.text === 'string') {
                texts.push(String((part as any).text))
              }
              const inlineData = (part as any)?.inlineData?.data
              const b64 = inlineDataToBase64(inlineData)
              if (b64) {
                send({ type: 'audio', data: b64 })
              }
            }
            if (texts.length > 0) {
              send({ type: 'text', text: texts.join('\n') })
            }
            if ((msg as any)?.serverContent?.interrupted) {
              send({ type: 'interrupted' })
            }
          },
          onerror: (e: any) => {
            console.error('[live-proxy] live session error', e)
            send({ type: 'error', message: e?.message || 'Live 오류' })
          },
          onclose: () => {
            connected = false
            console.log('[live-proxy] live session closed')
            send({ type: 'error', message: 'Live 연결 종료' })
          },
        }

        initTimeout = setTimeout(() => {
          if (!initReceived) {
            console.error('[live-proxy] init timeout (no init message)')
            try {
              ws.close()
            } catch {
              // ignore
            }
          }
        }, 3000)

        ws.on('message', async (raw: any) => {
          try {
            const rawText = String(raw || '')
            console.log('[live-proxy] ws message', rawText.slice(0, 200))
            const parsed = JSON.parse(rawText || '{}') as ClientMessage
            if (parsed.type === 'ping') {
              send({ type: 'text', text: 'pong' })
              return
            }
            if (parsed.type === 'init') {
              console.log('[live-proxy] init received')
              initReceived = true
              if (initTimeout) {
                clearTimeout(initTimeout)
                initTimeout = null
              }
              const client = getVertexClient()
              const model = String(parsed.model || '').replace(/^models\//, '')
              const config = normalizeConfig(parsed.config || {})
              try {
                const sysParts = (config as any)?.systemInstruction?.parts
                const sysLen = sysParts?.[0]?.text ? String(sysParts[0].text).length : 0
                console.log('[live-proxy] live.connect start', {
                  model,
                  responseModalities: config?.responseModalities,
                  hasSystemInstruction: !!(config as any)?.systemInstruction,
                  systemInstructionLen: sysLen,
                })
                liveSession = await client.live.connect({ model, config, callbacks })
                console.log('[live-proxy] live.connect resolved')
                if (!connected) {
                  connectTimeout = setTimeout(() => {
                    console.error('[live-proxy] live connect timeout')
                    send({ type: 'error', message: 'Live 연결 타임아웃' })
                    try {
                      ws.close()
                    } catch {
                      // ignore
                    }
                  }, 8000)
                }
              } catch (e: any) {
                console.error('[live-proxy] live.connect error', e)
                send({ type: 'error', message: e?.message || 'Live 연결 실패' })
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
            if (parsed.type === 'disconnect') {
              ws.close()
            }
          } catch (e: any) {
            console.error('[live-proxy] client message error', e)
            send({ type: 'error', message: e?.message || '메시지 처리 실패' })
          }
        })

        ws.on('close', (code?: number, reason?: Buffer) => {
          const reasonText = reason ? reason.toString() : ''
          console.log('[live-proxy] ws connection closed', {
            code: typeof code === 'number' ? code : null,
            reason: reasonText,
            initReceived,
            connected,
          })
          if (connectTimeout) {
            clearTimeout(connectTimeout)
            connectTimeout = null
          }
          if (initTimeout) {
            clearTimeout(initTimeout)
            initTimeout = null
          }
          try {
            liveSession?.close?.()
          } catch {
            // ignore
          }
        })
        ws.on('error', (e: any) => {
          console.error('[live-proxy] ws error', e)
        })
      })
    }

    res.status(200).end()
  } catch (e: any) {
    console.error('[live-proxy] init error', e)
    res.status(500).end(e?.message || 'live-proxy init error')
  }
}
