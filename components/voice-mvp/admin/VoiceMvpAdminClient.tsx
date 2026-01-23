'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Config = {
  base_model: string
  voice_gender?: 'female' | 'male'
  voice_style?: 'calm' | 'bright' | 'firm' | 'empathetic' | 'warm'
  voice_name_female?: string
  voice_name_male?: string
  persona_saju?: string
  persona_fortune?: string
  persona_gunghap?: string
  persona_reunion?: string
}

export default function VoiceMvpAdminClient() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [enabled, setEnabled] = useState<boolean>(false)
  const [config, setConfig] = useState<Config>({
    base_model: 'gemini-2.0-flash-001',
    voice_gender: 'female',
    voice_style: 'calm',
    voice_name_female: 'Aoede',
    voice_name_male: 'Fenrir',
    persona_saju: '',
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
        if (cfg?.success && cfg?.data) {
          setConfig({
            base_model: cfg.data.base_model || 'gemini-2.0-flash-001',
            voice_gender: (cfg.data.voice_gender === 'male' ? 'male' : 'female') as any,
            voice_style: (['calm', 'bright', 'firm', 'empathetic', 'warm'].includes(cfg.data.voice_style)
              ? cfg.data.voice_style
              : 'calm') as any,
            voice_name_female: typeof cfg.data.voice_name_female === 'string' && cfg.data.voice_name_female ? cfg.data.voice_name_female : 'Aoede',
            voice_name_male: typeof cfg.data.voice_name_male === 'string' && cfg.data.voice_name_male ? cfg.data.voice_name_male : 'Fenrir',
            persona_saju: typeof cfg.data.persona_saju === 'string' ? cfg.data.persona_saju : '',
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
        alert(`저장 실패: ${data?.error || `HTTP ${res.status}`}`)
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
                <SelectField
                  label="음성 성별(프리셋)"
                  value={config.voice_gender || 'female'}
                  options={[
                    { value: 'female', label: '여성' },
                    { value: 'male', label: '남성' },
                  ]}
                  onChange={(v) => setConfig((c) => ({ ...c, voice_gender: v as any }))}
                />
                <SelectField
                  label="말투/감정 프리셋"
                  value={config.voice_style || 'calm'}
                  options={[
                    { value: 'calm', label: '차분하게' },
                    { value: 'bright', label: '밝게' },
                    { value: 'firm', label: '단호하게' },
                    { value: 'empathetic', label: '공감적으로' },
                    { value: 'warm', label: '다정하게' },
                  ]}
                  onChange={(v) => setConfig((c) => ({ ...c, voice_style: v as any }))}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <SelectField
                    label="여성 톤"
                    value={config.voice_name_female || 'Aoede'}
                    options={VOICE_NAME_FEMALE_OPTIONS}
                    onChange={(v) => setConfig((c) => ({ ...c, voice_name_female: v }))}
                  />
                  <SelectField
                    label="남성 톤"
                    value={config.voice_name_male || 'Fenrir'}
                    options={VOICE_NAME_MALE_OPTIONS}
                    onChange={(v) => setConfig((c) => ({ ...c, voice_name_male: v }))}
                  />
                </div>

                <div className="pt-2 border-t border-gray-700" />
                <div className="font-semibold text-gray-200">페르소나 (유형별)</div>
                <TextArea
                  label="사주 페르소나"
                  value={config.persona_saju || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_saju: v }))}
                />
                <TextArea
                  label="운세 페르소나"
                  value={config.persona_fortune || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_fortune: v }))}
                />
                <TextArea
                  label="궁합 페르소나"
                  value={config.persona_gunghap || ''}
                  onChange={(v) => setConfig((c) => ({ ...c, persona_gunghap: v }))}
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

const VOICE_NAME_FEMALE_OPTIONS = [
  { value: 'Aoede', label: '차분한 여성 톤' },
  { value: 'Kore', label: '맑은 여성 톤' },
]

const VOICE_NAME_MALE_OPTIONS = [
  { value: 'Fenrir', label: '차분한 남성 톤' },
  { value: 'Charon', label: '중저음 남성 톤' },
]

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

