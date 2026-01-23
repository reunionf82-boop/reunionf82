import { NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'

export async function POST(_: Request, { params }: { params: { id: string } }) {
  if (!isVoiceMvpEnabled()) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  try {
    await assertAdminSession()
    const sessionId = params.id
    const supabase = getAdminSupabaseClient()

    const { error } = await supabase
      .from('voice_mvp_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId)

    if (error) throw error

    await supabase.from('voice_mvp_events').insert({
      session_id: sessionId,
      type: 'ended',
      payload: {},
    })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

