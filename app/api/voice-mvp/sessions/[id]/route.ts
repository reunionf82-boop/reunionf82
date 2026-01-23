import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  if (!isVoiceMvpEnabled()) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  try {
    await assertAdminSession()
    const sessionId = params.id
    const supabase = getAdminSupabaseClient()

    const { data: sessionRows, error: sessionError } = await supabase
      .from('voice_mvp_sessions')
      .select('*')
      .eq('id', sessionId)
      .limit(1)

    if (sessionError) throw sessionError
    const session = Array.isArray(sessionRows) ? sessionRows[0] : null
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { data: messages, error: msgError } = await supabase
      .from('voice_mvp_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(200)

    if (msgError) throw msgError

    const { data: events, error: evError } = await supabase
      .from('voice_mvp_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .limit(300)

    if (evError) throw evError

    return NextResponse.json({ success: true, session, messages: messages || [], events: events || [] })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

