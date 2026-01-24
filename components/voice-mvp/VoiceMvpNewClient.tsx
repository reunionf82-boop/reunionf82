'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type CalendarType = 'solar' | 'lunar' | 'lunar-leap'
type Gender = 'male' | 'female'
type Mode = 'saju' | 'fortune' | 'gunghap' | 'reunion' | 'shinjeom'

type BirthForm = {
  name: string
  gender: Gender
  year: string
  month: string
  day: string
  calendarType: CalendarType
  birthHour: string
}

const emptyBirth = (): BirthForm => ({
  name: '',
  gender: 'female',
  year: '',
  month: '',
  day: '',
  calendarType: 'solar',
  birthHour: '',
})

export default function VoiceMvpNewClient() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [mode, setMode] = useState<Mode>('saju')
  const [self, setSelf] = useState<BirthForm>(() => emptyBirth())
  const [partner, setPartner] = useState<BirthForm>(() => emptyBirth())
  const [situation, setSituation] = useState('')
  const [saving, setSaving] = useState(false)
  const didHydrateRef = useRef(false)

  const STORAGE_KEY = 'voice_mvp:new_form:v1'
  const canSubmit = useMemo(() => {
    const basicOk = self.name.trim() && self.year && self.month && self.day
    if (!basicOk) return false
    if (mode === 'gunghap') {
      return !!(partner.name.trim() && partner.year && partner.month && partner.day)
    }
    return true
  }, [mode, self, partner])

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

  // ✅ localStorage에서 마지막 입력값 복원 (매번 입력하지 않게)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) {
        didHydrateRef.current = true
        return
      }
      const parsed = JSON.parse(raw) as any
      const nextMode = parsed?.mode
      const nextSelf = parsed?.self
      const nextPartner = parsed?.partner
      const nextSituation = parsed?.situation

      if (nextMode && ['saju', 'fortune', 'gunghap', 'reunion', 'shinjeom'].includes(nextMode)) {
        setMode(nextMode)
      }
      if (nextSelf && typeof nextSelf === 'object') {
        setSelf((prev) => ({ ...prev, ...nextSelf }))
      }
      if (nextPartner && typeof nextPartner === 'object') {
        setPartner((prev) => ({ ...prev, ...nextPartner }))
      }
      if (typeof nextSituation === 'string') {
        setSituation(nextSituation)
      }
    } catch {
      // ignore
    } finally {
      didHydrateRef.current = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ✅ 입력값 변경 시 localStorage에 자동 저장
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!didHydrateRef.current) return
    try {
      const payload = {
        mode,
        self,
        partner,
        situation,
        saved_at: Date.now(),
      }
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // ignore
    }
  }, [mode, self, partner, situation])

  const createSession = async () => {
    if (!canSubmit || saving) return
    setSaving(true)
    try {
      const payload: any = {
        mode,
        self: {
          name: self.name.trim(),
          gender: self.gender,
          year: Number(self.year),
          month: Number(self.month),
          day: Number(self.day),
          calendarType: self.calendarType,
          birthHour: self.birthHour.trim() || null,
        },
        situation: situation.trim(),
      }
      if (mode === 'gunghap') {
        payload.partner = {
          name: partner.name.trim(),
          gender: partner.gender,
          year: Number(partner.year),
          month: Number(partner.month),
          day: Number(partner.day),
          calendarType: partner.calendarType,
          birthHour: partner.birthHour.trim() || null,
        }
      }

      const res = await fetch('/api/voice-mvp/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({} as any))
      if (!res.ok || !data?.success) {
        alert(`세션 생성 실패: ${data?.error || `HTTP ${res.status}`}`)
        return
      }
      // ✅ 새창(새 탭)으로 세션 화면 열기
      if (typeof window !== 'undefined') {
        window.open(`/voice-mvp/session/${data.session_id}`, '_blank', 'noopener,noreferrer')
      }
    } finally {
      setSaving(false)
    }
  }

  if (authenticated === null) {
    return <div className="min-h-screen flex items-center justify-center text-gray-500">인증 확인 중...</div>
  }
  if (authenticated === false) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="w-full bg-white border-b-2 border-pink-500">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 h-14 flex items-center justify-between">
          <a href="/" className="text-2xl font-bold tracking-tight text-pink-600">
            jeuniOn
          </a>
          <a
            href="/admin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-gray-700 hover:text-pink-600 transition-colors"
          >
            어드민
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">실시간 음성상담 MVP (내부 테스트)</h1>

        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="font-semibold text-gray-900 mb-3">상담 유형</div>
          <div className="flex gap-2">
            {(['saju', 'fortune', 'gunghap', 'reunion', 'shinjeom'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                  mode === m ? 'bg-pink-600 text-white border-pink-600' : 'bg-white text-gray-700 border-gray-300 hover:border-pink-400'
                }`}
              >
                {m === 'saju'
                  ? '사주'
                  : m === 'fortune'
                  ? '운세'
                  : m === 'gunghap'
                  ? '궁합'
                  : m === 'reunion'
                  ? '재회'
                  : '신점'}
              </button>
            ))}
          </div>
        </div>

        <BirthSection title="본인 정보" value={self} onChange={setSelf} />

        {mode === 'gunghap' && <BirthSection title="상대(파트너) 정보" value={partner} onChange={setPartner} />}

        {mode === 'reunion' && (
          <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
            <div className="font-semibold text-gray-900 mb-2">상황(선택)</div>
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              className="w-full min-h-[120px] border border-gray-300 rounded-lg p-3 text-sm"
              placeholder="재회 상황을 간단히 적어주세요 (내부 테스트용)"
            />
          </div>
        )}

        <button
          type="button"
          disabled={!canSubmit || saving}
          onClick={createSession}
          className={`w-full py-3 rounded-xl font-bold transition-colors ${
            !canSubmit || saving ? 'bg-gray-200 text-gray-500' : 'bg-pink-600 hover:bg-pink-700 text-white'
          }`}
        >
          {saving ? '세션 생성 중...' : '세션 만들고 입장'}
        </button>
      </main>
    </div>
  )
}

function BirthSection({
  title,
  value,
  onChange,
}: {
  title: string
  value: BirthForm
  onChange: (next: BirthForm) => void
}) {
  const set = (patch: Partial<BirthForm>) => onChange({ ...value, ...patch })
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
      <div className="font-semibold text-gray-900 mb-4">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="이름" value={value.name} onChange={(v) => set({ name: v })} placeholder="이름" />
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-1">성별</div>
          <select
            value={value.gender}
            onChange={(e) => set({ gender: e.target.value as Gender })}
            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
          >
            <option value="female">여자</option>
            <option value="male">남자</option>
          </select>
        </div>
        <Field label="생년" value={value.year} onChange={(v) => set({ year: v })} placeholder="예: 1994" />
        <Field label="월" value={value.month} onChange={(v) => set({ month: v })} placeholder="예: 7" />
        <Field label="일" value={value.day} onChange={(v) => set({ day: v })} placeholder="예: 11" />
        <div>
          <div className="text-sm font-semibold text-gray-700 mb-1">양/음력</div>
          <select
            value={value.calendarType}
            onChange={(e) => set({ calendarType: e.target.value as CalendarType })}
            className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
          >
            <option value="solar">양력</option>
            <option value="lunar">음력</option>
            <option value="lunar-leap">음력(윤달)</option>
          </select>
        </div>
        <Field
          label="태어난 시(선택)"
          value={value.birthHour}
          onChange={(v) => set({ birthHour: v })}
          placeholder="예: 子 또는 13"
        />
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <div className="text-sm font-semibold text-gray-700 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
        placeholder={placeholder}
      />
    </div>
  )
}

