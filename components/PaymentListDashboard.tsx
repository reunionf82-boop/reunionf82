'use client'

import { useState, useEffect } from 'react'

interface PaymentItem {
  id: number
  oid: string
  content_id: number
  content_name: string
  payment_code: string
  name: string
  pay: number
  payment_type: string
  user_name: string | null
  phone_number: string | null
  password: string | null
  gender: string | null
  status: string
  calendar_type: string | null
  birth_year: number | null
  birth_month: number | null
  birth_day: number | null
  birth_hour: string | null
  created_at: string
  completed_at: string | null
  updated_at: string | null
  request_key: string | null
  saved_id: number | null
  fortune_status: string | null
  fortune_failure_reason: string | null
  payment_failure_reason: string | null
  replay_available: boolean
}

interface PaymentListDashboardProps {
  isOpen: boolean
  onClose: () => void
}

const CALENDAR_LABEL: Record<string, string> = {
  solar: '양력',
  lunar: '음력',
  'lunar-leap': '음력(윤)'
}

/** 결제 상태별 뱃지 스타일 */
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    success: { label: '완료', className: 'bg-emerald-600/80 text-white' },
    pending: { label: '대기', className: 'bg-amber-600/80 text-white' },
    failed: { label: '실패', className: 'bg-red-600/80 text-white' }
  }
  const t = map[status] || { label: status, className: 'bg-gray-600 text-gray-200' }
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${t.className}`}>{t.label}</span>
}

/** 점사 상태별 뱃지 스타일 */
function FortuneStatusBadge({ status, reason }: { status: string | null; reason?: string | null }) {
  if (!status) return <span className="text-gray-500">-</span>
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: '대기', className: 'bg-gray-600 text-gray-200' },
    completed: { label: '정상 완료', className: 'bg-emerald-600/80 text-white' },
    failed: { label: '점사 실패', className: 'bg-red-600/80 text-white' },
    interrupted: { label: '점사 중단', className: 'bg-amber-600/80 text-white' }
  }
  const t = map[status] || { label: status, className: 'bg-gray-600 text-gray-200' }
  const hasReason = (reason || '').trim().length > 0
  return (
    <span title={hasReason ? reason || undefined : undefined} className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${t.className}`}>
      {t.label}{hasReason ? ' ⓘ' : ''}
    </span>
  )
}

/** 다시보기 뱃지 */
function ReplayBadge({ available, savedId }: { available: boolean; savedId: number | null }) {
  if (available) return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-emerald-600/80 text-white">가능</span>
  if (savedId) return <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-600 text-gray-300">만료</span>
  return <span className="text-gray-500">-</span>
}

export default function PaymentListDashboard({ isOpen, onClose }: PaymentListDashboardProps) {
  const [items, setItems] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all' | 'custom'>('week')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedItem, setSelectedItem] = useState<PaymentItem | null>(null)

  const loadList = async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/admin/payments/list?period=${period}`
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`
      }
      const res = await fetch(url)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error || '목록 조회 실패')
      }
      if (data.success && Array.isArray(data.data)) {
        setItems(data.data)
      } else {
        setItems([])
      }
    } catch (e: any) {
      setError(e?.message || '목록을 불러오지 못했습니다.')
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && period !== 'custom') {
      loadList()
    }
  }, [isOpen, period])

  const formatDate = (iso: string | null) => {
    if (!iso) return '-'
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  /**
   * 점사 상태 기본 라벨 (목록 테이블용)
   */
  const fortuneStatusLabel = (s: string | null) => {
    if (!s) return '-'
    const map: Record<string, string> = {
      pending: '대기',
      completed: '정상 완료',
      failed: '점사 실패',
      interrupted: '점사 중단'
    }
    return map[s] || s
  }

  /**
   * 고객 상세 - 점사 상태 구체 메시지 (실패/중단 시 원인 포함)
   * - null → '-'
   * - pending → '대기'
   * - completed → '정상 완료'
   * - failed + 원인 있음 → '점사 실패: [원인 텍스트]'
   * - failed + 원인 없음 → '점사 실패 (원인 없음)'
   * - interrupted + 원인 있음 → '점사 중단: [원인 텍스트]'
   * - interrupted + 원인 없음 → '점사 중단 (원인 없음)'
   */
  const fortuneStatusDetailMessage = (item: PaymentItem): string => {
    const s = item.fortune_status
    if (!s) return '-'
    const base = fortuneStatusLabel(s)
    if (s === 'failed' || s === 'interrupted') {
      const reason = (item.fortune_failure_reason || '').trim()
      return reason ? `${base}: ${reason}` : `${base} (원인 없음)`
    }
    return base
  }

  /**
   * 고객 상세 - 다시보기 표시 메시지 (replay_available, saved_id 기준)
   * - replay_available === true → '가능' (user_credentials 만료 전)
   * - saved_id 있으나 만료 → '만료'
   * - saved_id 없음(점사 미완료/미저장) → '-'
   */
  const replayLabel = (item: PaymentItem) =>
    item.replay_available ? '가능' : (item.saved_id ? '만료' : '-')

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { pending: '대기', success: '완료', failed: '실패' }
    return map[s] || s
  }

  /** 요약: 총 건수, 완료, 대기, 점사 실패/중단 */
  const summary = {
    total: items.length,
    success: items.filter((p) => p.status === 'success').length,
    pending: items.filter((p) => p.status === 'pending').length,
    fortuneIssue: items.filter((p) => p.fortune_status === 'failed' || p.fortune_status === 'interrupted').length
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-gray-700">
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-4 rounded-t-xl flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">결제 현황 · 고객 정보</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadList()}
              disabled={loading}
              className="flex items-center gap-1.5 text-gray-300 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              title="목록 다시 불러오기"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              리트라이
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg p-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 기간 선택 */}
        <div className="p-4 border-b border-gray-700 flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month' | 'year' | 'all' | 'custom')}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          >
            <option value="day">오늘</option>
            <option value="week">최근 7일</option>
            <option value="month">이번 달</option>
            <option value="year">이번 해</option>
            <option value="all">전체</option>
            <option value="custom">기간 지정</option>
          </select>
          {period === 'custom' && (
            <>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </>
          )}
          <button
            onClick={loadList}
            disabled={period === 'custom' && (!startDate || !endDate)}
            className="bg-pink-600 hover:bg-pink-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-lg"
          >
            조회
          </button>
        </div>

        {/* 요약 카드: 한눈에 건수 파악 */}
        {!loading && items.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-700 flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-sm">총</span>
              <span className="text-white font-semibold">{summary.total}건</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status="success" />
              <span className="text-white font-medium">{summary.success}건</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status="pending" />
              <span className="text-white font-medium">{summary.pending}건</span>
            </div>
            {summary.fortuneIssue > 0 && (
              <div className="flex items-center gap-2">
                <FortuneStatusBadge status="failed" />
                <span className="text-amber-300 font-medium">{summary.fortuneIssue}건</span>
              </div>
            )}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4 flex gap-4">
          <div className="flex-1 min-w-0">
            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg mb-4 flex items-center justify-between gap-3 flex-wrap">
                <span>{error}</span>
                <button
                  onClick={() => loadList()}
                  disabled={loading}
                  className="shrink-0 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
                >
                  리트라이
                </button>
              </div>
            )}
            {loading ? (
              <div className="text-gray-400 py-8 text-center">로딩 중...</div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-700">
                <table className="w-full text-sm text-left">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-700 bg-gray-800/80">
                      <th className="py-3 px-3">결제 시각</th>
                      <th className="py-3 px-3">결제 상태</th>
                      <th className="py-3 px-3">점사 상태</th>
                      <th className="py-3 px-3">다시보기</th>
                      <th className="py-3 px-3">고객명</th>
                      <th className="py-3 px-3">컨텐츠</th>
                      <th className="py-3 px-3 text-right">금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => (
                      <tr
                        key={p.id}
                        onClick={() => setSelectedItem(p)}
                        className={`border-b border-gray-700/80 cursor-pointer transition-colors ${selectedItem?.id === p.id ? 'bg-pink-900/20' : 'hover:bg-gray-800/60'}`}
                      >
                        <td className="py-2.5 px-3 text-white whitespace-nowrap">{formatDate(p.completed_at || p.created_at)}</td>
                        <td className="py-2.5 px-3"><StatusBadge status={p.status} /></td>
                        <td className="py-2.5 px-3">
                          <span title={p.fortune_status === 'failed' || p.fortune_status === 'interrupted' ? fortuneStatusDetailMessage(p) : undefined}>
                            <FortuneStatusBadge status={p.fortune_status} reason={p.fortune_failure_reason} />
                          </span>
                        </td>
                        <td className="py-2.5 px-3"><ReplayBadge available={p.replay_available} savedId={p.saved_id} /></td>
                        <td className="py-2.5 px-3 text-white font-medium">{p.user_name || '-'}</td>
                        <td className="py-2.5 px-3 text-gray-300 truncate max-w-[140px]" title={p.content_name || ''}>{p.content_name || '-'}</td>
                        <td className="py-2.5 px-3 text-gray-300 text-right">{p.pay != null ? p.pay.toLocaleString() : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {items.length === 0 && !loading && <p className="text-gray-500 py-8 text-center">결제 내역이 없습니다.</p>}
              </div>
            )}
          </div>

          {/* 고객 상세 패널: 섹션 구분으로 직관적 확인 */}
          {selectedItem && (
            <div className="w-96 flex-shrink-0 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden h-fit max-h-[calc(90vh-12rem)] overflow-y-auto">
              <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between z-10">
                <h3 className="font-semibold text-white">고객 상세</h3>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-white rounded p-1"
                  aria-label="닫기"
                >
                  ×
                </button>
              </div>
              <div className="p-4 space-y-5">
                {/* 결제 정보 */}
                <section>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">결제 정보</h4>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">상태</dt><dd><StatusBadge status={selectedItem.status} /></dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">금액</dt><dd className="text-white">{selectedItem.pay != null ? selectedItem.pay.toLocaleString() + '원' : '-'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">컨텐츠</dt><dd className="text-white truncate text-right" title={selectedItem.content_name || ''}>{selectedItem.content_name || '-'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">결제 시각</dt><dd className="text-gray-300 text-right">{formatDate(selectedItem.completed_at || selectedItem.created_at)}</dd></div>
                    <div><dt className="text-gray-500 mb-0.5">주문번호</dt><dd className="text-gray-400 text-xs break-all">{selectedItem.oid}</dd></div>
                    {selectedItem.payment_failure_reason && (
                      <div><dt className="text-gray-500 mb-0.5">결제 실패 원인</dt><dd className="text-red-300 text-xs break-words">{selectedItem.payment_failure_reason}</dd></div>
                    )}
                  </dl>
                </section>

                {/* 고객 정보 */}
                <section>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">고객 정보</h4>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">이름</dt><dd className="text-white">{selectedItem.user_name ?? '-'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">성별</dt><dd className="text-white">{selectedItem.gender === 'male' ? '남' : selectedItem.gender === 'female' ? '여' : '-'}</dd></div>
                    <div>
                      <dt className="text-gray-500 mb-0.5">생년월일</dt>
                      <dd className="text-white">
                        {selectedItem.birth_year != null && selectedItem.birth_month != null && selectedItem.birth_day != null
                          ? `${selectedItem.birth_year}년 ${selectedItem.birth_month}월 ${selectedItem.birth_day}일 (${CALENDAR_LABEL[selectedItem.calendar_type || ''] || selectedItem.calendar_type || '양력'})`
                          : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">태어난 시</dt><dd className="text-white">{selectedItem.birth_hour ?? '-'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">휴대폰</dt><dd className="text-white break-all text-right">{selectedItem.phone_number ?? '-'}</dd></div>
                    <div className="flex justify-between gap-2"><dt className="text-gray-500 shrink-0">비밀번호</dt><dd className="text-white font-mono">{selectedItem.password ?? '-'}</dd></div>
                  </dl>
                </section>

                {/* 점사 · 다시보기 */}
                <section>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">점사 · 다시보기</h4>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between items-center gap-2">
                      <dt className="text-gray-500 shrink-0">점사 상태</dt>
                      <dd>
                        <span title={fortuneStatusDetailMessage(selectedItem)}>
                          <FortuneStatusBadge status={selectedItem.fortune_status} reason={selectedItem.fortune_failure_reason} />
                        </span>
                      </dd>
                    </div>
                    {(selectedItem.fortune_status === 'failed' || selectedItem.fortune_status === 'interrupted') && (selectedItem.fortune_failure_reason || '').trim() && (
                      <div><dt className="text-gray-500 mb-0.5">원인</dt><dd className="text-amber-300 text-xs break-words">{selectedItem.fortune_failure_reason}</dd></div>
                    )}
                    <div className="flex justify-between items-center gap-2"><dt className="text-gray-500 shrink-0">다시보기</dt><dd><ReplayBadge available={selectedItem.replay_available} savedId={selectedItem.saved_id} /></dd></div>
                  </dl>
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
