/**
 * Vendored from Google live-api-web-console (Apache-2.0).
 * Minimal subset for our MVP.
 */

export type GetAudioContextOptions = AudioContextOptions & {
  id?: string
}

const map: Map<string, AudioContext> = new Map()

export const audioContext: (options?: GetAudioContextOptions) => Promise<AudioContext> = (() => {
  let didInteract: Promise<void> | null = null
  const ensureInteract = () => {
    if (didInteract || typeof window === 'undefined') return didInteract
    didInteract = new Promise((res) => {
      const handler = () => res()
      window.addEventListener('pointerdown', handler, { once: true })
      window.addEventListener('keydown', handler, { once: true })
    })
    return didInteract
  }

  return async (options?: GetAudioContextOptions) => {
    if (typeof window === 'undefined') {
      throw new Error('AudioContext is only available in the browser')
    }
    try {
      const a = new Audio()
      a.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      await a.play()
      if (options?.id && map.has(options.id)) {
        const ctx = map.get(options.id)
        if (ctx) return ctx
      }
      const ctx = new AudioContext(options)
      if (options?.id) map.set(options.id, ctx)
      return ctx
    } catch {
      const wait = ensureInteract()
      if (wait) await wait
      if (options?.id && map.has(options.id)) {
        const ctx = map.get(options.id)
        if (ctx) return ctx
      }
      const ctx = new AudioContext(options)
      if (options?.id) map.set(options.id, ctx)
      return ctx
    }
  }
})()

export function base64ToArrayBuffer(base64: string) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

