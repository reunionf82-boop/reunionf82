/**
 * Vendored (trimmed) from Google live-api-web-console (Apache-2.0).
 * This manages the GenAI Live websocket session via @google/genai.
 */

import {
  GoogleGenAI,
  type LiveCallbacks,
  type LiveClientToolResponse,
  type LiveConnectConfig,
  type LiveServerContent,
  type LiveServerMessage,
  type LiveServerToolCall,
  type LiveServerToolCallCancellation,
  type Part,
  type Session,
  type Content,
} from '@google/genai'

import { EventEmitter } from 'eventemitter3'
import { difference } from 'lodash'
import type { LiveClientOptions, StreamingLog } from './types'
import { base64ToArrayBuffer } from './utils'

export interface LiveClientEventTypes {
  audio: (data: ArrayBuffer) => void
  close: (event: CloseEvent) => void
  content: (data: LiveServerContent | { modelTurn: Content }) => void
  error: (error: ErrorEvent) => void
  interrupted: () => void
  log: (log: StreamingLog) => void
  open: () => void
  setupcomplete: () => void
  toolcall: (toolCall: LiveServerToolCall) => void
  toolcallcancellation: (toolcallCancellation: LiveServerToolCallCancellation) => void
  turncomplete: () => void
}

export class GenAILiveClient extends EventEmitter<LiveClientEventTypes> {
  protected client: GoogleGenAI

  private _status: 'connected' | 'disconnected' | 'connecting' = 'disconnected'
  public get status() {
    return this._status
  }

  private _session: Session | null = null
  public get session() {
    return this._session
  }

  private _model: string | null = null
  public get model() {
    return this._model
  }

  protected config: LiveConnectConfig | null = null
  public getConfig() {
    return { ...(this.config || {}) }
  }

  constructor(options: LiveClientOptions) {
    super()
    this.client = new GoogleGenAI(options)
    this.send = this.send.bind(this)
    this.onopen = this.onopen.bind(this)
    this.onerror = this.onerror.bind(this)
    this.onclose = this.onclose.bind(this)
    this.onmessage = this.onmessage.bind(this)
  }

  protected log(type: string, message: StreamingLog['message']) {
    const log: StreamingLog = { date: new Date(), type, message }
    this.emit('log', log)
  }

  async connect(model: string, config: LiveConnectConfig): Promise<boolean> {
    if (this._status === 'connected' || this._status === 'connecting') return false
    this._status = 'connecting'
    this.config = config
    this._model = model

    const callbacks: LiveCallbacks = {
      onopen: this.onopen,
      onmessage: this.onmessage,
      onerror: this.onerror,
      onclose: this.onclose,
    }

    try {
      this._session = await this.client.live.connect({ model, config, callbacks })
    } catch (e) {
      this._status = 'disconnected'
      return false
    }

    this._status = 'connected'
    return true
  }

  public disconnect() {
    if (!this.session) return false
    this.session?.close()
    this._session = null
    this._status = 'disconnected'
    this.log('client.close', 'Disconnected')
    return true
  }

  protected onopen() {
    this.log('client.open', 'Connected')
    this.emit('open')
  }

  protected onerror(e: ErrorEvent) {
    this.log('server.error', e.message)
    this.emit('error', e)
  }

  protected onclose(e: CloseEvent) {
    this.log('server.close', `disconnected ${e.reason ? `with reason: ${e.reason}` : ``}`)
    this.emit('close', e)
  }

  protected async onmessage(message: LiveServerMessage) {
    if ((message as any).setupComplete) {
      this.log('server.send', 'setupComplete')
      this.emit('setupcomplete')
      return
    }
    if ((message as any).toolCall) {
      this.log('server.toolCall', message as any)
      this.emit('toolcall', (message as any).toolCall)
      return
    }
    if ((message as any).toolCallCancellation) {
      this.log('server.toolCallCancellation', message as any)
      this.emit('toolcallcancellation', (message as any).toolCallCancellation)
      return
    }

    if ((message as any).serverContent) {
      const serverContent = (message as any).serverContent
      if ('interrupted' in serverContent) {
        this.log('server.content', 'interrupted')
        this.emit('interrupted')
        return
      }
      if ('turnComplete' in serverContent) {
        this.log('server.content', 'turnComplete')
        this.emit('turncomplete')
      }

      if ('modelTurn' in serverContent) {
        let parts: Part[] = serverContent.modelTurn?.parts || []

        const audioParts = parts.filter((p) => (p as any).inlineData && (p as any).inlineData.mimeType?.startsWith('audio/pcm'))
        const base64s = audioParts.map((p) => (p as any).inlineData?.data)
        const otherParts = difference(parts as any, audioParts as any) as Part[]

        base64s.forEach((b64) => {
          if (b64) {
            const data = base64ToArrayBuffer(b64)
            this.emit('audio', data)
            this.log('server.audio', `buffer (${data.byteLength})`)
          }
        })
        if (!otherParts.length) return

        parts = otherParts
        const content: { modelTurn: Content } = { modelTurn: { parts } as any }
        this.emit('content', content)
        this.log('server.content', message as any)
        return
      }
    }
  }

  sendRealtimeInput(chunks: Array<{ mimeType: string; data: string }>) {
    let hasAudio = false
    let hasVideo = false
    for (const ch of chunks) {
      this.session?.sendRealtimeInput({ media: ch as any })
      if (ch.mimeType.includes('audio')) hasAudio = true
      if (ch.mimeType.includes('image')) hasVideo = true
      if (hasAudio && hasVideo) break
    }
    const message = hasAudio && hasVideo ? 'audio + video' : hasAudio ? 'audio' : hasVideo ? 'video' : 'unknown'
    this.log('client.realtimeInput', message)
  }

  sendToolResponse(toolResponse: LiveClientToolResponse) {
    if (toolResponse.functionResponses && toolResponse.functionResponses.length) {
      this.session?.sendToolResponse({ functionResponses: toolResponse.functionResponses })
      this.log('client.toolResponse', toolResponse)
    }
  }

  send(parts: Part | Part[], turnComplete: boolean = true) {
    this.session?.sendClientContent({ turns: Array.isArray(parts) ? parts : [parts], turnComplete } as any)
    this.log('client.send', { turns: Array.isArray(parts) ? parts : [parts], turnComplete })
  }
}

