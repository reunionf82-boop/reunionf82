/**
 * Vendored from Google live-api-web-console (Apache-2.0).
 * iOS 16/17+ 대응: mergeChunkSamples로 지글거림 완화, worklet은 destination에 연결하지 않음.
 */

import { createWorketFromSrc, registeredWorklets } from './audioworklet-registry'

/** iOS 등에서 AudioBufferSourceNode 다수 재생 시 크랙 완화용: 이 샘플 수만큼 묶어서 한 번에 재생 */
const DEFAULT_MERGE_CHUNK_SAMPLES = 0
const IOS_MERGE_CHUNK_SAMPLES = 24000 // 24k @ 24kHz = 1초, 재생 횟수 감소로 크랙 완화

/** 재생 시작 전 최소로 쌓아둘 오디오 길이(초). 클로드 생성 지연 시 버퍼 언더런 방지(제미나이 제안) */
const DEFAULT_MIN_BUFFER_DURATION = 0

export class AudioStreamer {
  private sampleRate = 24000
  private bufferSize = 7680
  private initialBufferTime = 0.1
  private minBufferDurationSeconds: number
  private mergeChunkSamples: number
  private audioQueue: Float32Array[] = []
  private isPlaying = false
  private isStreamComplete = false
  private checkInterval: number | null = null
  private scheduledTime = 0
  /** complete() 후 마지막 버퍼 onended가 안 불릴 때(백그라운드 등) 파형 정리 보장 */
  private completeFallbackTimeout: ReturnType<typeof setTimeout> | null = null

  public gainNode: GainNode
  public source: AudioBufferSourceNode
  private endOfQueueAudioSource: AudioBufferSourceNode | null = null
  private extraDestinations: AudioNode[] = []

  public onComplete = () => {}

  constructor(
    public context: AudioContext,
    options?: { bufferSize?: number; initialBufferTime?: number; mergeChunkSamples?: number; minBufferDurationSeconds?: number }
  ) {
    if (options?.bufferSize != null) this.bufferSize = options.bufferSize
    if (options?.initialBufferTime != null) this.initialBufferTime = options.initialBufferTime
    this.minBufferDurationSeconds = options?.minBufferDurationSeconds ?? DEFAULT_MIN_BUFFER_DURATION
    this.mergeChunkSamples = options?.mergeChunkSamples ?? DEFAULT_MERGE_CHUNK_SAMPLES
    this.gainNode = this.context.createGain()
    this.source = this.context.createBufferSource()
    this.gainNode.connect(this.context.destination)
    this.addPCM16 = this.addPCM16.bind(this)
  }

  /** gainNode에 추가 destination 연결 (예: MediaStreamDestination for recording) */
  connectExtraDestination(dest: AudioNode) {
    this.extraDestinations.push(dest)
    this.gainNode.connect(dest)
  }

  async addWorklet<T extends (d: any) => void>(workletName: string, workletSrc: string, handler: T): Promise<this> {
    let workletsRecord = registeredWorklets.get(this.context)
    if (workletsRecord && workletsRecord[workletName]) {
      workletsRecord[workletName].handlers.push(handler as any)
      return Promise.resolve(this)
    }

    if (!workletsRecord) {
      registeredWorklets.set(this.context, {})
      workletsRecord = registeredWorklets.get(this.context)!
    }

    workletsRecord[workletName] = { handlers: [handler as any] }

    const src = createWorketFromSrc(workletName, workletSrc)
    await this.context.audioWorklet.addModule(src)
    const worklet = new AudioWorkletNode(this.context, workletName)
    workletsRecord[workletName].node = worklet

    return this
  }

  /** PCM 16bit Little-Endian → Float32. 엔디안·부호 처리 올바르게 해야 AM 라디오 노이즈가 사라짐 */
  private _processPCM16Chunk(chunk: Uint8Array): Float32Array {
    const numSamples = chunk.length / 2
    const float32Array = new Float32Array(numSamples)
    const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength)

    for (let i = 0; i < numSamples; i++) {
      const s = dataView.getInt16(i * 2, true)
      float32Array[i] = s < 0 ? s / 32768 : s / 32767
    }
    return float32Array
  }

  addPCM16(chunk: Uint8Array) {
    this.isStreamComplete = false
    let processingBuffer = this._processPCM16Chunk(chunk)

    while (processingBuffer.length >= this.bufferSize) {
      const buffer = processingBuffer.slice(0, this.bufferSize)
      this.audioQueue.push(buffer)
      processingBuffer = processingBuffer.slice(this.bufferSize)
    }
    if (processingBuffer.length > 0) {
      this.audioQueue.push(processingBuffer)
    }
    if (!this.isPlaying) {
      if (this.minBufferDurationSeconds > 0) {
        const totalSamples = this.audioQueue.reduce((acc, c) => acc + c.length, 0)
        const totalDurationSec = totalSamples / this.sampleRate
        if (totalDurationSec >= this.minBufferDurationSeconds) {
          this.isPlaying = true
          this.scheduledTime = this.context.currentTime + 0.1
          this.scheduleNextBuffer()
        }
      } else {
        this.isPlaying = true
        this.scheduledTime = this.context.currentTime + this.initialBufferTime
        this.scheduleNextBuffer()
      }
    } else {
      this.scheduleNextBuffer()
    }
  }

  private createAudioBuffer(audioData: Float32Array): AudioBuffer {
    const audioBuffer = this.context.createBuffer(1, audioData.length, this.sampleRate)
    audioBuffer.getChannelData(0).set(audioData)
    return audioBuffer
  }

  private scheduleNextBuffer() {
    const SCHEDULE_AHEAD_TIME = 1.0

    while (this.audioQueue.length > 0 && this.scheduledTime < this.context.currentTime + SCHEDULE_AHEAD_TIME) {
      let audioData: Float32Array
      if (this.mergeChunkSamples > 0) {
        const toMerge: Float32Array[] = []
        let total = 0
        while (this.audioQueue.length > 0 && (total === 0 || total < this.mergeChunkSamples)) {
          const chunk = this.audioQueue.shift()!
          toMerge.push(chunk)
          total += chunk.length
        }
        if (toMerge.length === 1) {
          audioData = toMerge[0]
        } else {
          audioData = new Float32Array(total)
          let offset = 0
          for (const c of toMerge) {
            audioData.set(c, offset)
            offset += c.length
          }
        }
      } else {
        audioData = this.audioQueue.shift()!
      }
      const audioBuffer = this.createAudioBuffer(audioData)
      const source = this.context.createBufferSource()

      if (this.audioQueue.length === 0) {
        if (this.endOfQueueAudioSource) this.endOfQueueAudioSource.onended = null
        this.endOfQueueAudioSource = source
        source.onended = () => {
          if (this.completeFallbackTimeout) {
            clearTimeout(this.completeFallbackTimeout)
            this.completeFallbackTimeout = null
          }
          if (!this.audioQueue.length && this.endOfQueueAudioSource === source) {
            this.endOfQueueAudioSource = null
            this.onComplete()
          }
        }
      }

      source.buffer = audioBuffer
      source.connect(this.gainNode)

      // 볼륨 미터 등: 소스만 worklet에 연결. worklet은 destination에 연결하지 않음
      // (iOS 17 등에서 worklet→destination 이중 출력 시 실제 재생이 안 나오는 현상 방지)
      const worklets = registeredWorklets.get(this.context)
      if (worklets) {
        Object.entries(worklets).forEach(([_, graph]) => {
          const { node, handlers } = graph
          if (node) {
            source.connect(node)
            node.port.onmessage = function (ev: MessageEvent) {
              handlers.forEach((handler) => handler.call(node.port as any, ev))
            }
          }
        })
      }

      const startTime = Math.max(this.scheduledTime, this.context.currentTime)
      source.start(startTime)
      this.scheduledTime = startTime + audioBuffer.duration
    }

    if (this.audioQueue.length === 0) {
      if (this.isStreamComplete) {
        this.isPlaying = false
        if (this.checkInterval) {
          clearInterval(this.checkInterval)
          this.checkInterval = null
        }
      } else {
        if (!this.checkInterval) {
          this.checkInterval = window.setInterval(() => {
            if (this.audioQueue.length > 0) this.scheduleNextBuffer()
          }, 40) as unknown as number
        }
      }
    } else {
      const nextCheckTime = (this.scheduledTime - this.context.currentTime) * 1000
      setTimeout(() => this.scheduleNextBuffer(), Math.max(0, nextCheckTime - 50))
    }
  }

  stop() {
    this.isPlaying = false
    this.isStreamComplete = true
    this.audioQueue = []
    this.scheduledTime = this.context.currentTime
    if (this.completeFallbackTimeout) {
      clearTimeout(this.completeFallbackTimeout)
      this.completeFallbackTimeout = null
    }
    if (this.endOfQueueAudioSource) {
      this.endOfQueueAudioSource.onended = null
      this.endOfQueueAudioSource = null
    }

    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }

    this.gainNode.gain.setValueAtTime(0, this.context.currentTime)
    this.onComplete()
    setTimeout(() => {
      this.gainNode.disconnect()
      this.gainNode = this.context.createGain()
      this.gainNode.connect(this.context.destination)
      for (const dest of this.extraDestinations) {
        try {
          this.gainNode.connect(dest)
        } catch {
          /* ignore */
        }
      }
    }, 200)
  }

  async resume() {
    if (this.context.state === 'suspended') {
      await this.context.resume()
    }
  }

  /** 스트림 종료 신호: 큐가 비면 onComplete 호출. 마지막 버퍼 재생 중이면 onended 또는 2.5초 폴백으로 호출 보장 */
  complete() {
    this.isStreamComplete = true
    if (!this.audioQueue.length && !this.endOfQueueAudioSource) {
      this.isPlaying = false
      this.onComplete()
      return
    }
    // endOfQueueAudioSource가 아직 없어도(아직 마지막 버퍼 스케줄 전) 폴백으로 onComplete 보장 (파형/이퀄 정리)
    if (typeof window !== 'undefined') {
      if (this.completeFallbackTimeout) {
        clearTimeout(this.completeFallbackTimeout)
        this.completeFallbackTimeout = null
      }
      this.completeFallbackTimeout = setTimeout(() => {
        this.completeFallbackTimeout = null
        if (this.endOfQueueAudioSource) {
          this.endOfQueueAudioSource.onended = null
          this.endOfQueueAudioSource = null
        }
        this.isPlaying = false
        this.onComplete()
      }, 2500)
    }
  }

  /**
   * 남은 큐 강제 재생(Flush). EOS 시 minBufferDuration 미만으로 남은 찌꺼기가 재생 안 되는 무한 대기 방지(제미나이 제안).
   * 목표치 무시하고 큐에 있는 오디오를 바로 재생 시작.
   */
  flush() {
    if (this.audioQueue.length === 0) return
    if (!this.isPlaying) {
      this.isPlaying = true
      this.scheduledTime = Math.max(this.scheduledTime, this.context.currentTime) + 0.05
      this.scheduleNextBuffer()
    } else {
      this.scheduleNextBuffer()
    }
  }
}

