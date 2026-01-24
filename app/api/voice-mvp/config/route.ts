import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { assertAdminSession, isVoiceMvpEnabled } from '@/lib/voice-mvp/auth'

export const dynamic = 'force-dynamic'

function getSupabaseProjectRef() {
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  try {
    const u = new URL(url)
    const host = u.hostname || ''
    const ref = host.split('.')[0] || ''
    return { url, host, ref }
  } catch {
    return { url, host: '', ref: '' }
  }
}

export async function GET() {
  if (!isVoiceMvpEnabled()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }
  try {
    await assertAdminSession()
    const project = getSupabaseProjectRef()
    const supabase = getAdminSupabaseClient()
    const { data: rows, error } = await supabase
      .from('voice_mvp_config')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (error) throw error
    const row = Array.isArray(rows) ? rows[0] : null
    return NextResponse.json({
      success: true,
      data: row,
      meta: {
        supabase_project_ref: project.ref || null,
        supabase_host: project.host || null,
      },
    })
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
    const project = getSupabaseProjectRef()

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
      voice_gender_saju: typeof body.voice_gender_saju === 'string' ? body.voice_gender_saju : undefined,
      voice_style_saju: typeof body.voice_style_saju === 'string' ? body.voice_style_saju : undefined,
      voice_name_saju: typeof body.voice_name_saju === 'string' ? body.voice_name_saju : undefined,
      speaking_rate_saju: typeof body.speaking_rate_saju === 'number' ? body.speaking_rate_saju : undefined,
      voice_gender_shinjeom: typeof body.voice_gender_shinjeom === 'string' ? body.voice_gender_shinjeom : undefined,
      voice_style_shinjeom: typeof body.voice_style_shinjeom === 'string' ? body.voice_style_shinjeom : undefined,
      voice_name_shinjeom: typeof body.voice_name_shinjeom === 'string' ? body.voice_name_shinjeom : undefined,
      speaking_rate_shinjeom: typeof body.speaking_rate_shinjeom === 'number' ? body.speaking_rate_shinjeom : undefined,
      voice_gender_fortune: typeof body.voice_gender_fortune === 'string' ? body.voice_gender_fortune : undefined,
      voice_style_fortune: typeof body.voice_style_fortune === 'string' ? body.voice_style_fortune : undefined,
      voice_name_fortune: typeof body.voice_name_fortune === 'string' ? body.voice_name_fortune : undefined,
      speaking_rate_fortune: typeof body.speaking_rate_fortune === 'number' ? body.speaking_rate_fortune : undefined,
      voice_gender_gunghap: typeof body.voice_gender_gunghap === 'string' ? body.voice_gender_gunghap : undefined,
      voice_style_gunghap: typeof body.voice_style_gunghap === 'string' ? body.voice_style_gunghap : undefined,
      voice_name_gunghap: typeof body.voice_name_gunghap === 'string' ? body.voice_name_gunghap : undefined,
      speaking_rate_gunghap: typeof body.speaking_rate_gunghap === 'number' ? body.speaking_rate_gunghap : undefined,
      voice_gender_reunion: typeof body.voice_gender_reunion === 'string' ? body.voice_gender_reunion : undefined,
      voice_style_reunion: typeof body.voice_style_reunion === 'string' ? body.voice_style_reunion : undefined,
      voice_name_reunion: typeof body.voice_name_reunion === 'string' ? body.voice_name_reunion : undefined,
      speaking_rate_reunion: typeof body.speaking_rate_reunion === 'number' ? body.speaking_rate_reunion : undefined,
      persona_saju: typeof body.persona_saju === 'string' ? body.persona_saju : undefined,
      persona_shinjeom: typeof body.persona_shinjeom === 'string' ? body.persona_shinjeom : undefined,
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

      if (error) {
        const msg = String((error as any)?.message || '')
        if (msg.includes("schema cache") && msg.includes('persona_shinjeom')) {
          return NextResponse.json(
            {
              error: msg,
              action_required:
                `Supabase API(PostgREST) 스키마 캐시가 갱신되지 않아 'persona_shinjeom' 컬럼을 인식하지 못하고 있습니다.\n\n- 현재 앱이 연결된 프로젝트(ref): ${project.ref || '(unknown)'}\n- 조치: Supabase SQL Editor에서 \`notify pgrst, 'reload schema';\` 실행 후 1~2분 대기하거나, Dashboard에서 API 재시작/스키마 리로드를 수행한 뒤 다시 저장하세요.\n- 가장 흔한 원인: '앱이 붙어있는 프로젝트'와 'SQL을 실행한 프로젝트'가 다른 경우`,
            },
            { status: 409 }
          )
        }
        throw error
      }
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
        voice_gender_saju: updateData.voice_gender_saju ?? 'female',
        voice_style_saju: updateData.voice_style_saju ?? 'calm',
        voice_name_saju: updateData.voice_name_saju ?? 'Charon',
        speaking_rate_saju: updateData.speaking_rate_saju ?? 0.85,
        voice_gender_shinjeom: updateData.voice_gender_shinjeom ?? 'female',
        voice_style_shinjeom: updateData.voice_style_shinjeom ?? 'warm',
        voice_name_shinjeom: updateData.voice_name_shinjeom ?? 'Aoede',
        speaking_rate_shinjeom: updateData.speaking_rate_shinjeom ?? 1.15,
        voice_gender_fortune: updateData.voice_gender_fortune ?? 'female',
        voice_style_fortune: updateData.voice_style_fortune ?? 'bright',
        voice_name_fortune: updateData.voice_name_fortune ?? 'Aoede',
        speaking_rate_fortune: updateData.speaking_rate_fortune ?? 1.15,
        voice_gender_gunghap: updateData.voice_gender_gunghap ?? 'female',
        voice_style_gunghap: updateData.voice_style_gunghap ?? 'warm',
        voice_name_gunghap: updateData.voice_name_gunghap ?? 'Aoede',
        speaking_rate_gunghap: updateData.speaking_rate_gunghap ?? 1.15,
        voice_gender_reunion: updateData.voice_gender_reunion ?? 'female',
        voice_style_reunion: updateData.voice_style_reunion ?? 'empathetic',
        voice_name_reunion: updateData.voice_name_reunion ?? 'Aoede',
        speaking_rate_reunion: updateData.speaking_rate_reunion ?? 0.9,
        persona_saju: updateData.persona_saju ?? null,
        persona_shinjeom: updateData.persona_shinjeom ?? null,
        persona_fortune: updateData.persona_fortune ?? null,
        persona_gunghap: updateData.persona_gunghap ?? null,
        persona_reunion: updateData.persona_reunion ?? null,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .limit(1)

    if (error) {
      const msg = String((error as any)?.message || '')
      if (msg.includes("schema cache") && msg.includes('persona_shinjeom')) {
        return NextResponse.json(
          {
            error: msg,
            action_required:
              `Supabase API(PostgREST) 스키마 캐시가 갱신되지 않아 'persona_shinjeom' 컬럼을 인식하지 못하고 있습니다.\n\n- 현재 앱이 연결된 프로젝트(ref): ${project.ref || '(unknown)'}\n- 조치: Supabase SQL Editor에서 \`notify pgrst, 'reload schema';\` 실행 후 1~2분 대기하거나, Dashboard에서 API 재시작/스키마 리로드를 수행한 뒤 다시 저장하세요.\n- 가장 흔한 원인: '앱이 붙어있는 프로젝트'와 'SQL을 실행한 프로젝트'가 다른 경우`,
          },
          { status: 409 }
        )
      }
      throw error
    }
    return NextResponse.json({ success: true, data: Array.isArray(data) ? data[0] : data })
  } catch (e: any) {
    const msg = e?.message || 'Unauthorized'
    return NextResponse.json({ error: msg }, { status: msg === 'Unauthorized' ? 401 : 500 })
  }
}

