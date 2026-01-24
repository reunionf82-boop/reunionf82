'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Config = {
  base_model: string
  voice_gender_saju?: 'female' | 'male'
  voice_style_saju?: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voice_name_saju?: string
  voice_gender_shinjeom?: 'female' | 'male'
  voice_style_shinjeom?: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voice_name_shinjeom?: string
  voice_gender_fortune?: 'female' | 'male'
  voice_style_fortune?: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voice_name_fortune?: string
  voice_gender_gunghap?: 'female' | 'male'
  voice_style_gunghap?: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voice_name_gunghap?: string
  voice_gender_reunion?: 'female' | 'male'
  voice_style_reunion?: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voice_name_reunion?: string
  persona_saju?: string
  persona_shinjeom?: string
  persona_fortune?: string
  persona_gunghap?: string
  persona_reunion?: string
}

const DEFAULT_SHINJEOM_PERSONA = `핵심은 "신내림 30일된 애기동자 컨셉으로 해보려교." 입니다.
- 당신은 방금 신내림을 받은 지 30일 정도 된 ‘애기동자’로, 아직 서툴지만 솔직하고 예의 바르게 점사를 봅니다.
- 말투: 공손하고 담백하게. 과장/허세/공포 조장 금지.
- 방식: 사용자의 질문과 상황을 먼저 확인한 뒤, “지금 보이는 기운/흐름”을 짧게 말하고, 현실적인 조언 2~3개를 제시합니다.
- 제한: 의학/법률/투자/정치 등 전문 영역은 단정 금지. 위험/자해/범죄 관련은 거절하고 안전 안내.
- 점사 구성:
  1) 인사 1문장 + 오늘 점사의 초점 1문장
  2) 보이는 흐름(길/흉을 단정하지 말고 ‘경향’으로) 3~5문장
  3) 조심할 것 2개 / 하면 좋은 것 2개(구체 행동)
  4) 마지막에 확인 질문 1개(기간/상대/상황 등)`

export default function VoiceMvpAdminClient() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState<boolean>(false)
  const [supabaseProjectRef, setSupabaseProjectRef] = useState<string>('')
  const [config, setConfig] = useState<Config>({
    base_model: 'gemini-2.0-flash-001',
    voice_gender_saju: 'female',
    voice_style_saju: 'calm',
    voice_name_saju: 'Charon',
    voice_gender_shinjeom: 'female',
    voice_style_shinjeom: 'warm',
    voice_name_shinjeom: 'Aoede',
    voice_gender_fortune: 'female',
    voice_style_fortune: 'bright',
    voice_name_fortune: 'Aoede',
    voice_gender_gunghap: 'female',
    voice_style_gunghap: 'warm',
    voice_name_gunghap: 'Aoede',
    voice_gender_reunion: 'female',
    voice_style_reunion: 'empathetic',
    voice_name_reunion: 'Aoede',
    persona_saju: '',
    persona_shinjeom: '',
    persona_fortune: '',
    persona_gunghap: '',
    persona_reunion: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/admin/auth/check', { cache: 'no-store' })
        const data = await res.json()
        if (data?.authenticated) {
          setAuthenticated(true)
        } else {
          setAuthenticated(false)
          router.push('/admin/login')
        }
      } catch {
        setAuthenticated(false)
        router.push('/admin/login')
      }
    })()
  }, [router])

  const load = async () => {
    setLoading(true)
    try {
      // feature flag is enforced server-side; if disabled these endpoints will 404.
      const cfgRes = await fetch('/api/voice-mvp/config', { cache: 'no-store' })
      if (cfgRes.ok) {
        setEnabled(true)
        const cfg = await cfgRes.json().catch(() => ({} as any))
        setSupabaseProjectRef(String(cfg?.meta?.supabase_project_ref || ''))
        if (cfg?.success && cfg?.data) {
          const shinjeom =
            typeof cfg.data.persona_shinjeom === 'string' && cfg.data.persona_shinjeom.trim()
              ? cfg.data.persona_shinjeom
              : DEFAULT_SHINJEOM_PERSONA
          setConfig({
            base_model: cfg.data.base_model || 'gemini-2.0-flash-001',
            voice_gender_saju: (cfg.data.voice_gender_saju === 'male' ? 'male' : 'female') as any,
            voice_style_saju: (['calm', 'bright', 'firm', 'empathetic', 'warm'].includes(cfg.data.voice_style_saju)
              ? cfg.data.voice_style_saju
              : 'calm') as any,
            voice_name_saju: typeof cfg.data.voice_name_saju === 'string' ? cfg.data.voice_name_saju : 'Charon',
            voice_gender_shinjeom: (cfg.data.voice_gender_shinjeom === 'male' ? 'male' : 'female') as any,
            voice_style_shinjeom: (['calm', 'bright', 'firm', 'empathetic', 'warm'].includes(cfg.data.voice_style_shinjeom)
              ? cfg.data.voice_style_shinjeom
              : 'warm') as any,
            voice_name_shinjeom: typeof cfg.data.voice_name_shinjeom === 'string' ? cfg.data.voice_name_shinjeom : 'Aoede',
            voice_gender_fortune: (cfg.data.voice_gender_fortune === 'male' ? 'male' : 'female') as any,
            voice_style_fortune: (['calm', 'bright', 'firm', 'empathetic', 'warm'].includes(cfg.data.voice_style_fortune)
              ? cfg.data.voice_style_fortune
              : 'bright') as any,
            voice_name_fortune: typeof cfg.data.voice_name_fortune === 'string' ? cfg.data.voice_name_fortune : 'Aoede',
            voice_gender_gunghap: (cfg.data.voice_gender_gunghap === 'male' ? 'male' : 'female') as any,
            voice_style_gunghap: (['calm', 'bright', 'firm', 'empathetic', 'warm'].includes(cfg.data.voice_style_gunghap)
              ? cfg.data.voice_style_gunghap
              : 'warm') as any,
            voice_name_gunghap: typeof cfg.data.voice_name_gunghap === 'string' ? cfg.data.voice_name_gunghap : 'Aoede',
            voice_gender_reunion: (cfg.data.voice_gender_reunion === 'male' ? 'male' : 'female') as any,
            voice_style_reunion: (['calm', 'bright', 'firm', 'empathetic', 'warm'].includes(cfg.data.voice_style_reunion)
              ? cfg.data.voice_style_reunion
              : 'empathetic') as any,
            voice_name_reunion: typeof cfg.data.voice_name_reunion === 'string' ? cfg.data.voice_name_reunion : 'Aoede',
            persona_saju: typeof cfg.data.persona_saju === 'string' ? cfg.data.persona_saju : '',
            persona_shinjeom: shinjeom,
            persona_fortune: typeof cfg.data.persona_fortune === 'string' ? cfg.data.persona_fortune : '',
            persona_gunghap: typeof cfg.data.persona_gunghap === 'string' ? cfg.data.persona_gunghap : '',
            persona_reunion: typeof cfg.data.persona_reunion === 'string' ? cfg.data.persona_reunion : '',
          })
        }
      } else {
        setEnabled(false)
      }

      const listRes = await fetch('/api/voice-mvp/sessions', { cache: 'no-store' })
      if (listRes.ok) {
        const list = await listRes.json().catch(() => ({} as any))
        if (list?.success) setSessions(list.data || [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authenticated) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/voice-mvp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(config),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.success) {
        const extra = data?.action_required ? `\n\n[조치]\n${data.action_required}` : ''
        alert(`저장 실패: ${data?.error || `HTTP ${res.status}`}${extra}`)
        return
      }
      alert('저장 완료')
      await load()
    } finally {
      setSaving(false)
    }
  }

  if (authenticated === null) {
    return <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">인증 확인 중...</div>
  }
  if (authenticated === false) return null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="w-full mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Voice MVP (내부)</h1>
            <p className="text-gray-300 text-sm">기존 재회 서비스와 완전 분리된 테스트 영역</p>
            {supabaseProjectRef ? (
              <p className="text-gray-400 text-xs mt-1">
                연결된 Supabase 프로젝트(ref): <span className="font-mono">{supabaseProjectRef}</span>
              </p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <a
              href="/voice-mvp/new"
              target="_blank"
              rel="noopener noreferrer"
              className={`px-4 py-2 rounded-lg font-semibold ${
                enabled ? 'bg-pink-600 hover:bg-pink-700' : 'bg-gray-700 cursor-not-allowed'
              }`}
              onClick={(e) => {
                if (!enabled) e.preventDefault()
              }}
            >
              새 세션 만들기
            </a>
            <a
              href="/admin"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg font-semibold bg-gray-700 hover:bg-gray-600"
            >
              어드민 홈
            </a>
          </div>
        </div>

        {!enabled && (
          <div className="mb-6 bg-yellow-900/40 border border-yellow-700 rounded-lg p-4 text-yellow-200 text-sm">
            현재 <b>VOICE_MVP_ENABLED</b>가 꺼져있어서(서버에서 404 처리) MVP 기능이 비활성화 상태입니다.
            <br />
            내부 테스트 시에만 환경변수로 켜세요.
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <div className="font-bold mb-4">라우팅 설정</div>
            {loading ? (
              <div className="text-gray-400">로딩 중...</div>
            ) : (
              <div className="space-y-4">
                <Field label="기본 모델(Flash)" value={config.base_model} onChange={(v) => setConfig((c) => ({ ...c, base_model: v }))} />

                <div className="pt-2 border-t border-gray-700" />
                <div className="font-semibold text-gray-200">페르소나 (유형별)</div>
                <PersonaVoiceRow
                  title="사주"
                  gender={config.voice_gender_saju || 'female'}
                  style={config.voice_style_saju || 'calm'}
                  voiceName={config.voice_name_saju || 'Charon'}
                  onGender={(v) => setConfig((c) => ({ ...c, voice_gender_saju: v as any }))}
                  onStyle={(v) => setConfig((c) => ({ ...c, voice_style_saju: v as any }))}
                  onVoiceName={(v) => setConfig((c) => ({ ...c, voice_name_saju: v }))}
                />
                <TextArea
                  label="사주 페르소나"
                  value={config.persona_saju || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_saju: v }))}
                />
                <div className="border-t border-gray-700/70 pt-4" />
                <PersonaVoiceRow
                  title="신점"
                  gender={config.voice_gender_shinjeom || 'female'}
                  style={config.voice_style_shinjeom || 'warm'}
                  voiceName={config.voice_name_shinjeom || 'Aoede'}
                  onGender={(v) => setConfig((c) => ({ ...c, voice_gender_shinjeom: v as any }))}
                  onStyle={(v) => setConfig((c) => ({ ...c, voice_style_shinjeom: v as any }))}
                  onVoiceName={(v) => setConfig((c) => ({ ...c, voice_name_shinjeom: v }))}
                />
                <TextArea
                  label="신점 페르소나"
                  value={config.persona_shinjeom || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_shinjeom: v }))}
                />
                <div className="border-t border-gray-700/70 pt-4" />
                <PersonaVoiceRow
                  title="운세"
                  gender={config.voice_gender_fortune || 'female'}
                  style={config.voice_style_fortune || 'bright'}
                  voiceName={config.voice_name_fortune || 'Aoede'}
                  onGender={(v) => setConfig((c) => ({ ...c, voice_gender_fortune: v as any }))}
                  onStyle={(v) => setConfig((c) => ({ ...c, voice_style_fortune: v as any }))}
                  onVoiceName={(v) => setConfig((c) => ({ ...c, voice_name_fortune: v }))}
                />
                <TextArea
                  label="운세 페르소나"
                  value={config.persona_fortune || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_fortune: v }))}
                />
                <div className="border-t border-gray-700/70 pt-4" />
                <PersonaVoiceRow
                  title="궁합"
                  gender={config.voice_gender_gunghap || 'female'}
                  style={config.voice_style_gunghap || 'warm'}
                  voiceName={config.voice_name_gunghap || 'Aoede'}
                  onGender={(v) => setConfig((c) => ({ ...c, voice_gender_gunghap: v as any }))}
                  onStyle={(v) => setConfig((c) => ({ ...c, voice_style_gunghap: v as any }))}
                  onVoiceName={(v) => setConfig((c) => ({ ...c, voice_name_gunghap: v }))}
                />
                <TextArea
                  label="궁합 페르소나"
                  value={config.persona_gunghap || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_gunghap: v }))}
                />
                <div className="border-t border-gray-700/70 pt-4" />
                <PersonaVoiceRow
                  title="재회"
                  gender={config.voice_gender_reunion || 'female'}
                  style={config.voice_style_reunion || 'empathetic'}
                  voiceName={config.voice_name_reunion || 'Aoede'}
                  onGender={(v) => setConfig((c) => ({ ...c, voice_gender_reunion: v as any }))}
                  onStyle={(v) => setConfig((c) => ({ ...c, voice_style_reunion: v as any }))}
                  onVoiceName={(v) => setConfig((c) => ({ ...c, voice_name_reunion: v }))}
                />
                <TextArea
                  label="재회 페르소나"
                  value={config.persona_reunion || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_reunion: v }))}
                />

                <button
                  type="button"
                  disabled={!enabled || saving}
                  onClick={save}
                  className={`w-full py-2.5 rounded-lg font-bold ${
                    !enabled || saving ? 'bg-gray-700 text-gray-400' : 'bg-pink-600 hover:bg-pink-700'
                  }`}
                >
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <div className="font-bold mb-4">최근 세션</div>
            {loading ? (
              <div className="text-gray-400">로딩 중...</div>
            ) : sessions.length === 0 ? (
              <div className="text-gray-400">세션이 없습니다.</div>
            ) : (
              <div className="space-y-3 max-h-[520px] overflow-y-auto">
                {sessions.map((s) => (
                  <a
                    key={s.id}
                    href={`/voice-mvp/session/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block rounded-lg border px-4 py-3 hover:border-pink-500 transition-colors ${
                      s.status === 'ended' ? 'border-gray-700 text-gray-400' : 'border-gray-600'
                    }`}
                    onClick={(e) => {
                      if (!enabled) e.preventDefault()
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{s.mode}</div>
                      <div className="text-xs text-gray-400">{s.created_at}</div>
                    </div>
                    <div className="text-sm mt-1">
                      {s.profile_self?.name} ({s.profile_self?.gender})
                      {s.profile_partner?.name ? ` ↔ ${s.profile_partner?.name}` : ''}
                    </div>
                    <div className="text-xs mt-1 text-gray-400">status: {s.status}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-200 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white"
      />
    </div>
  )
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-200 mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Available voice names for Google GenAI Live
const VOICE_NAME_OPTIONS = [
  { value: 'Aoede', label: 'Aoede (여성, 밝음)' },
  { value: 'Charon', label: 'Charon (남성, 묵직함)' },
  { value: 'Fenrir', label: 'Fenrir (남성, 부드러움)' },
  { value: 'Kore', label: 'Kore (여성, 차분함)' },
  { value: 'Puck', label: 'Puck (중성, 활발함)' },
]

function PersonaVoiceRow({
  title,
  gender,
  style,
  voiceName,
  onGender,
  onStyle,
  onVoiceName,
}: {
  title: string
  gender: 'female' | 'male'
  style: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voiceName: string
  onGender: (v: string) => void
  onStyle: (v: string) => void
  onVoiceName: (v: string) => void
}) {
  return (
    <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SelectField
          label={`${title} 음성 성별(프리셋)`}
          value={gender}
          options={[
            { value: 'female', label: '여성' },
            { value: 'male', label: '남성' },
          ]}
          onChange={onGender}
        />
        <SelectField
          label={`${title} 말투/감정 프리셋`}
          value={style}
          options={[
            { value: 'calm', label: '차분하게' },
            { value: 'bright', label: '밝게' },
            { value: 'firm', label: '단호하게' },
            { value: 'empathetic', label: '공감적으로' },
            { value: 'warm', label: '다정하게' },
          ]}
          onChange={onStyle}
        />
      </div>
      <SelectField
        label={`${title} 음성 이름`}
        value={voiceName}
        options={VOICE_NAME_OPTIONS}
        onChange={onVoiceName}
      />
    </div>
  )
}

function TextArea({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-200 mb-1">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg p-2.5 text-sm text-white min-h-[120px]"
        placeholder="유형별 상담 페르소나/룰/말투/금칙 등을 적어주세요."
      />
    </div>
  )
}

