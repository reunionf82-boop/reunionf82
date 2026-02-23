/**
 * Vendored from Google live-api-web-console (Apache-2.0).
 */

import { audioContext } from './utils'
import AudioRecordingWorklet from './worklets/audio-processing'
import VolMeterWorket from './worklets/vol-meter'
import { createWorketFromSrc } from './audioworklet-registry'
import EventEmitter from 'eventemitter3'

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

/** 스피커 에코가 마이크로 들어가 VAD/자가중단 방지 (제미나이 권장). useVoiceResult 등에서도 동일 적용용 export */
export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: false,
}

export class AudioRecorder extends EventEmitter {
  stream: MediaStream | undefined
  audioContext: AudioContext | undefined
  source: MediaStreamAudioSourceNode | undefined
  recording: boolean = false
  recordingWorklet: AudioWorkletNode | undefined
  vuWorklet: AudioWorkletNode | undefined

  private starting: Promise<void> | null = null

  constructor(public sampleRate = 16000) {
    super()
  }

  /**
   * @param existingStream 사용자 제스처 직후 취득한 스트림 (iOS: 한 번 허용 후 재사용으로 팝업 감소)
   * @param existingContext iOS: 제스처 직후 동기 생성한 녹음용 AudioContext
   */
  async start(existingStream?: MediaStream, existingContext?: AudioContext) {
    if (existingStream) {
      const track = existingStream.getAudioTracks()[0]
      if (track?.readyState === 'ended') {
        this.stream = undefined
      } else {
        this.stream = existingStream
        if (track) track.enabled = true
        this.audioContext = existingContext ?? (await import('./utils').then((m) => m.audioContext({ sampleRate: this.sampleRate })))
        this.source = this.audioContext!.createMediaStreamSource(this.stream)
      }
    }
    if (!navigator.mediaDevices?.getUserMedia && !this.stream) {
      throw new Error('Could not request user media')
    }

    this.starting = new Promise(async (resolve) => {
      const audioOpt = { audio: AUDIO_CONSTRAINTS }
      if (!this.stream) {
        this.stream = await navigator.mediaDevices!.getUserMedia(audioOpt)
      } else {
        const track = this.stream.getAudioTracks()[0]
        if (track?.readyState === 'ended') {
          this.stream = await navigator.mediaDevices!.getUserMedia(audioOpt)
        }
      }
      if (!this.audioContext || !this.source) {
        this.audioContext = await audioContext({ sampleRate: this.sampleRate })
        this.source = this.audioContext.createMediaStreamSource(this.stream!)
      }
      await this.audioContext.resume()

      const workletName = 'audio-recorder-worklet'
      const src = createWorketFromSrc(workletName, AudioRecordingWorklet)
      await this.audioContext.audioWorklet.addModule(src)
      this.recordingWorklet = new AudioWorkletNode(this.audioContext, workletName)

      this.recordingWorklet.port.onmessage = async (ev: MessageEvent) => {
        const arrayBuffer = (ev.data as any)?.data?.int16arrayBuffer
        if (arrayBuffer) {
          const arrayBufferString = arrayBufferToBase64(arrayBuffer)
          this.emit('data', arrayBufferString)
        }
      }
      this.source.connect(this.recordingWorklet)

      // vu meter worklet
      const vuWorkletName = 'vu-meter'
      await this.audioContext.audioWorklet.addModule(createWorketFromSrc(vuWorkletName, VolMeterWorket))
      this.vuWorklet = new AudioWorkletNode(this.audioContext, vuWorkletName)
      this.vuWorklet.port.onmessage = (ev: MessageEvent) => {
        this.emit('volume', (ev.data as any).volume)
      }

      this.source.connect(this.vuWorklet)
      this.recording = true
      resolve()
      this.starting = null
    })
  }

  /** @param keepStreamForReuse true면 트랙/컨텍스트 유지 → 다음 start() 시 재사용 (iOS 마이크 팝업 감소) */
  stop(keepStreamForReuse = false) {
    const handleStop = () => {
      this.source?.disconnect()
      this.recordingWorklet = undefined
      this.vuWorklet = undefined
      if (!keepStreamForReuse) {
        if (this.stream) {
          this.stream.getTracks().forEach((t) => t.stop())
          this.stream = undefined
        }
        this.audioContext?.close().catch(() => {})
        this.audioContext = undefined
        this.source = undefined
      }
    }
    if (this.starting) {
      this.starting.then(handleStop)
      return
    }
    handleStop()
  }
}

