import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isVoiceMvpEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }
  try {
    await assertAdminSession()
    const supabase = getAdminSupabaseClient()
    const { data: rows, error } = await supabase
      .from('voice_mvp_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) throw error
    const row = Array.isArray(rows) ? rows[0] : null
    return NextResponse.json({ success: true, data: row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  if (!isVoiceMvpEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }
  try {
    await assertAdminSession()
    const body = await req.json().catch(() => ({} as any))
    const supabase = getAdminSupabaseClient()

    // always update latest row (or insert if none)
    const { data: rows, error: selectError } = await supabase
      .from('voice_mvp_config')
      .select('id')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (selectError) throw selectError
    const existingId = Array.isArray(rows) && rows[0]?.id ? rows[0].id : null

    const updateData = {
      base_model: typeof body.base_model === 'string' ? body.base_model : undefined,
      voice_gender: typeof body.voice_gender === 'string' ? body.voice_gender : undefined,
      voice_style: typeof body.voice_style === 'string' ? body.voice_style : undefined,
      voice_name_female: typeof body.voice_name_female === 'string' ? body.voice_name_female : undefined,
      voice_name_male: typeof body.voice_name_male === 'string' ? body.voice_name_male : undefined,
      persona_saju: typeof body.persona_saju === 'string' ? body.persona_saju : undefined,
      persona_fortune: typeof body.persona_fortune === 'string' ? body.persona_fortune : undefined,
      persona_gunghap: typeof body.persona_gunghap === 'string' ? body.persona_gunghap : undefined,
      persona_reunion: typeof body.persona_reunion === 'string' ? body.persona_reunion : undefined,
      updated_at: new Date().toISOString(),
    }

    if (existingId) {
      const { data, error } = await supabase
        .from('voice_mvp_config')
        .update(updateData)
        .eq('id', existingId)
        .select('*')
        .limit(1)

      if (error) throw error
      return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] : data })
    }

    const { data, error } = await supabase
      .from('voice_mvp_config')
      .insert({
        base_model: updateData.base_model ?? 'gemini-2.0-flash-001',
        voice_gender: updateData.voice_gender ?? 'female',
        voice_style: updateData.voice_style ?? 'calm',
        voice_name_female: updateData.voice_name_female ?? 'Aoede',
        voice_name_male: updateData.voice_name_male ?? 'Fenrir',
        persona_saju: updateData.persona_saju ?? null,
        persona_fortune: updateData.persona_fortune ?? null,
        persona_gunghap: updateData.persona_gunghap ?? null,
        persona_reunion: updateData.persona_reunion ?? null,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .limit(1)

    if (error) throw error
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] : data })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

