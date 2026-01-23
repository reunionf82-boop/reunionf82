import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import VoiceMvpNewClient from '@/components/voice-mvp/VoiceMvpNewClient'
import { isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export default async function VoiceMvpNewPage() {
  if (!isVoiceMvpEnabled()) notFound()

  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  if (session?.value !== 'authenticated') {
    redirect('/admin/login')
  }

  return <VoiceMvpNewClient />
}

