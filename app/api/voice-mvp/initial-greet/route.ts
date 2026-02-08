import { NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'

/** 재회 결과 페이지 음성 상담용. 어드민 인증 없이 최신 initial_greet_prompt, resumed_greet_prompt만 반환 */
export async function GET() {
  if (!isVoiceMvpEnabled()) {
    return NextResponse.json({ initial: null, resumed: null })
  }
  try {
    const supabase = getAdminSupabaseClient()
    const { data: rows, error } = await supabase
      .from('voice_mvp_config')
      .select('initial_greet_prompt, resumed_greet_prompt')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) throw error
    const row = Array.isArray(rows) ? rows[0] : null
    return NextResponse.json({
      initial: typeof row?.initial_greet_prompt === 'string' ? row.initial_greet_prompt : null,
      resumed: typeof row?.resumed_greet_prompt === 'string' ? row.resumed_greet_prompt : null,
    })
  } catch {
    return NextResponse.json({ initial: null, resumed: null })
  }
}
