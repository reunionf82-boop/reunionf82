import { cookies } from 'next/headers'

export async function assertAdminSession(): Promise<void> {
  const cookieStore = await cookies()
  const session = cookieStore.get('admin_session')
  if (session?.value !== 'authenticated') {
    throw new Error('Unauthorized')
  }
}

export function isVoiceMvpEnabled(): boolean {
  return String(process.env.VOICE_MVP_ENABLED || '').toLowerCase() === 'true'
}

