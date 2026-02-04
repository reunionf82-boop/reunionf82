import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type ClientInitMessage = {
  type: 'init'
  model?: string
  config?: Record<string, unknown>
}

type ClientAudioMessage = {
  type: 'audio'
  data: string
  mimeType?: string
}

type ClientMessage = ClientInitMessage | ClientAudioMessage | { type: 'disconnect' } | { type: 'ping' }

const encoder = new TextEncoder()

const base64UrlEncode = (data: ArrayBuffer | Uint8Array) => {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const pemToArrayBuffer = (pem: string) => {
  const clean = pem.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

const getAccessToken = async () => {
  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON') || ''
  const rawB64 = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_JSON_B64') || ''
  if (!raw && !rawB64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON(_B64) 환경 변수가 필요합니다.')
  }
  const jsonText = rawB64 ? atob(rawB64) : raw
  const sa = JSON.parse(jsonText)
  const now = Math.floor(Date.now() / 1000)
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claim = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      })
    )
  )
  const unsigned = `${header}.${claim}`
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(unsigned))
  const jwt = `${unsigned}.${base64UrlEncode(signature)}`

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`토큰 발급 실패: ${res.status} ${text}`)
  }
  const data = await res.json()
  return data.access_token as string
}

const buildVertexWsUrl = (model: string) => {
  const override = Deno.env.get('VERTEX_LIVE_WS_URL')
  if (override) return override
  const project = Deno.env.get('GOOGLE_CLOUD_PROJECT') || ''
  const location = Deno.env.get('GOOGLE_CLOUD_LOCATION') || 'us-central1'
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT 환경 변수가 필요합니다.')
  const safeModel = model.replace(/^models\//, '')
  return `wss://${location}-aiplatform.googleapis.com/v1beta1/projects/${project}/locations/${location}/publishers/google/models/${safeModel}:bidiGenerateContent`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders, status: 200 })
  }

  const upgrade = req.headers.get('upgrade') || ''
  if (upgrade.toLowerCase() !== 'websocket') {
    return new Response('WebSocket only', { status: 426, headers: corsHeaders })
  }

  const { socket, response } = Deno.upgradeWebSocket(req)
  socket.onopen = async () => {
    try {
      const accessToken = await getAccessToken()
      const model = Deno.env.get('VERTEX_LIVE_MODEL') || 'gemini-live-2.5-flash-native-audio'
      const wsUrl = buildVertexWsUrl(model)
      const wsWithToken = `${wsUrl}?access_token=${encodeURIComponent(accessToken)}`
      const vertexSocket = new WebSocket(wsWithToken)

      let initSent = false
      vertexSocket.onopen = () => {
        try {
          socket.send(JSON.stringify({ type: 'text', text: 'vertex_open' }))
        } catch {
          // ignore
        }
      }

      vertexSocket.onmessage = (ev) => {
        try {
          socket.send(String(ev.data))
        } catch {
          // ignore
        }
      }

      vertexSocket.onclose = (ev) => {
        try {
          socket.send(JSON.stringify({ type: 'error', message: `vertex_close:${ev.code}` }))
        } catch {
          // ignore
        }
        try {
          socket.close()
        } catch {
          // ignore
        }
      }

      vertexSocket.onerror = (ev) => {
        try {
          socket.send(JSON.stringify({ type: 'error', message: 'vertex_error' }))
        } catch {
          // ignore
        }
        try {
          socket.close()
        } catch {
          // ignore
        }
      }

      socket.onmessage = (event) => {
        try {
          const raw = String(event.data || '')
          const msg = JSON.parse(raw) as ClientMessage
          if (msg.type === 'ping') {
            socket.send(JSON.stringify({ type: 'text', text: 'pong' }))
            return
          }
          if (msg.type === 'init') {
            const initPayload = {
              setup: {
                model: msg.model || model,
                config: msg.config || {},
              },
            }
            vertexSocket.send(JSON.stringify(initPayload))
            initSent = true
            return
          }
          if (msg.type === 'audio') {
            if (!initSent) return
            const payload = {
              realtimeInput: {
                mediaChunks: [
                  {
                    mimeType: msg.mimeType || 'audio/pcm;rate=16000',
                    data: msg.data,
                  },
                ],
              },
            }
            vertexSocket.send(JSON.stringify(payload))
            return
          }
          if (msg.type === 'disconnect') {
            vertexSocket.close()
            socket.close()
          }
        } catch {
          // ignore
        }
      }

      socket.onclose = () => {
        try {
          vertexSocket.close()
        } catch {
          // ignore
        }
      }
    } catch (e: any) {
      try {
        socket.send(JSON.stringify({ type: 'error', message: e?.message || '프록시 초기화 실패' }))
      } catch {
        // ignore
      }
      try {
        socket.close()
      } catch {
        // ignore
      }
    }
  }

  return response
})
