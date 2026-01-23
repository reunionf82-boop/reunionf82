import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'
import VoiceMvpSessionClient from '@/components/voice-mvp/VoiceMvpSessionClient'
import VoiceMvpSessionLiveClient from '@/components/voice-mvp/VoiceMvpSessionLiveClient'

export default async function VoiceMvpSessionPage({ params }: { params: { id: string } }) {
  if (!isVoiceMvpEnabled()) notFound()

  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  if (session?.value !== 'authenticated') {
    redirect('/admin/login')
  }

  const engine = String(process.env.VOICE_MVP_AUDIO_ENGINE || 'browser').toLowerCase()
  // engine=genai_live → Google 레퍼런스 기반 오디오 파이프라인
  if (engine === 'genai_live') {
    return <VoiceMvpSessionLiveClient sessionId={params.id} />
  }
  return <VoiceMvpSessionClient sessionId={params.id} />
}

