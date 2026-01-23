import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'
import { buildManseBundle, type BirthInput } from '@/lib/voice-mvp/manse'

export const dynamic = 'force-dynamic'

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 })
}

export async function GET() {
  if (!isVoiceMvpEnabled()) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  try {
    await assertAdminSession()
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('voice_mvp_sessions')
      .select('id, created_at, ended_at, status, mode, profile_self, profile_partner, situation')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) throw error
    return NextResponse.json({ success: true, data: data || [] })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

export async function POST(req: NextRequest) {
  if (!isVoiceMvpEnabled()) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  try {
    await assertAdminSession()
    const body = await req.json().catch(() => ({} as any))

    const mode = String(body?.mode || '').trim()
    if (!['saju', 'fortune', 'gunghap', 'reunion'].includes(mode)) {
      return badRequest('mode must be one of saju|fortune|gunghap|reunion')
    }

    const self = body?.self as Partial<BirthInput>
    if (!self?.name || !self?.gender || !self?.year || !self?.month || !self?.day || !self?.calendarType) {
      return badRequest('self profile is incomplete')
    }

    const profileSelf: BirthInput = {
      name: String(self.name),
      gender: self.gender === 'female' ? 'female' : 'male',
      year: Number(self.year),
      month: Number(self.month),
      day: Number(self.day),
      calendarType: self.calendarType as any,
      birthHour: typeof self.birthHour === 'string' ? self.birthHour : null,
    }

    let profilePartner: BirthInput | null = null
    if (mode === 'gunghap') {
      const partner = body?.partner as Partial<BirthInput>
      if (!partner?.name || !partner?.gender || !partner?.year || !partner?.month || !partner?.day || !partner?.calendarType) {
        return badRequest('partner profile is required for gunghap')
      }
      profilePartner = {
        name: String(partner.name),
        gender: partner.gender === 'female' ? 'female' : 'male',
        year: Number(partner.year),
        month: Number(partner.month),
        day: Number(partner.day),
        calendarType: partner.calendarType as any,
        birthHour: typeof partner.birthHour === 'string' ? partner.birthHour : null,
      }
    }

    const situation = typeof body?.situation === 'string' ? body.situation : ''

    const supabase = getAdminSupabaseClient()
    const { data: cfgRows } = await supabase
      .from('voice_mvp_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)

    const cfg = Array.isArray(cfgRows) ? cfgRows[0] : null
    const routingSnapshot = cfg
      ? {
          base_model: cfg.base_model,
          voice_gender: typeof cfg.voice_gender === 'string' ? cfg.voice_gender : 'female',
          voice_style: typeof cfg.voice_style === 'string' ? cfg.voice_style : 'calm',
          voice_name_female: typeof cfg.voice_name_female === 'string' ? cfg.voice_name_female : 'Aoede',
          voice_name_male: typeof cfg.voice_name_male === 'string' ? cfg.voice_name_male : 'Fenrir',
          personas: {
            saju: typeof cfg.persona_saju === 'string' ? cfg.persona_saju : '',
            fortune: typeof cfg.persona_fortune === 'string' ? cfg.persona_fortune : '',
            gunghap: typeof cfg.persona_gunghap === 'string' ? cfg.persona_gunghap : '',
            reunion: typeof cfg.persona_reunion === 'string' ? cfg.persona_reunion : '',
          },
        }
      : null

    const selfBundle = buildManseBundle(profileSelf)
    const partnerBundle = profilePartner ? buildManseBundle(profilePartner) : null

    const { data: inserted, error } = await supabase
      .from('voice_mvp_sessions')
      .insert({
        status: 'active',
        mode,
        profile_self: profileSelf,
        profile_partner: profilePartner,
        situation,
        manse_self: selfBundle,
        manse_partner: partnerBundle,
        routing_config_snapshot: routingSnapshot,
      })
      .select('id')
      .limit(1)

    if (error) throw error
    const sessionId = Array.isArray(inserted) ? inserted[0]?.id : (inserted as any)?.id
    if (!sessionId) throw new Error('Failed to create session')

    await supabase.from('voice_mvp_events').insert({
      session_id: sessionId,
      type: 'created',
      payload: { mode, hasPartner: !!profilePartner },
    })

    return NextResponse.json({ success: true, session_id: sessionId })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

