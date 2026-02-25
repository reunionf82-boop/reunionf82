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

export async function prepareIOSVoiceForResult(): Promise<void> {
  if (!isIOS() || typeof window === 'undefined') return
  const Win = window as Window & {
    __voicePrimedContext?: AudioContext
    __voicePrimedRecorderContext?: AudioContext
    __voicePrimedStream?: MediaStream
  }
  try {
    if (navigator.mediaDevices?.getUserMedia) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // 트랙 끄지 않음 → result 페이지에서 그대로 사용 (거기서는 제스처 없어 팝업 안 뜸)
      Win.__voicePrimedStream = stream
    }
  } catch {
    /* 권한 거부 등 무시 */
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
