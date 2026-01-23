import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import VoiceMvpAdminClient from '@/components/voice-mvp/admin/VoiceMvpAdminClient'

export default async function VoiceMvpAdminPage() {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  if (session?.value !== 'authenticated') {
    redirect('/admin/login')
  }
  return <VoiceMvpAdminClient />
}

