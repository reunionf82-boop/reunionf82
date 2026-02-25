/**
 * iOS Safari: getUserMedia·AudioContext는 사용자 제스처 컨텍스트에서만 동작.
 * 폼 페이지에서 "바로이용하기"·"무료시작"·"잔여금액으로 상담" 버튼 클릭 시
 * (사용자 제스처) 이 함수를 호출해 마이크 권한·오디오 컨텍스트를 준비하고,
 * result/voice 페이지에서 재사용할 수 있도록 window에 보관.
 */

const DCC_PCM_SAMPLE_RATE = 24000
const RECORDER_SAMPLE_RATE = 16000

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

/** iOS 음성: 클릭과 같은 동기 콜스택에서 호출해야 팝업이 뜸. 반환된 프로미스를 나중에 finishIOSVoicePrepare에 넘겨 await */
export function startIOSVoicePrepare(): Promise<MediaStream> | null {
  if (!isIOS() || typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) return null
  return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
}

/** startIOSVoicePrepare()로 받은 프로미스를 await한 뒤 스트림·컨텍스트를 window에 보관 */
export async function finishIOSVoicePrepare(micPromise: Promise<MediaStream> | null): Promise<void> {
  if (!micPromise || typeof window === 'undefined') return
  const Win = window as Window & {
    __voicePrimedContext?: AudioContext
    __voicePrimedRecorderContext?: AudioContext
    __voicePrimedStream?: MediaStream
  }
  try {
    const stream = await micPromise
    Win.__voicePrimedStream = stream
  } catch {
    /* 권한 거부 등 */
  }
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Win.__voicePrimedContext && AudioCtx) {
      const ctx = new AudioCtx({ sampleRate: DCC_PCM_SAMPLE_RATE })
      await ctx.resume()
      Win.__voicePrimedContext = ctx
    }
    if (!Win.__voicePrimedRecorderContext && AudioCtx) {
      const ctx = new AudioCtx({ sampleRate: RECORDER_SAMPLE_RATE })
      await ctx.resume()
      Win.__voicePrimedRecorderContext = ctx
    }
  } catch {
    /* ignore */
  }
}

/** 기존: 한 번에 준비 (동기 콜스택에서 start + finish 호출하는 편이 iOS에서 더 잘 뜸) */
export async function prepareIOSVoiceForResult(): Promise<void> {
  const p = startIOSVoicePrepare()
  await finishIOSVoicePrepare(p)
}
