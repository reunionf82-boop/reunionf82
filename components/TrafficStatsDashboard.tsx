'use client'

import { useEffect, useRef, useState } from 'react'

interface TrafficStats {
  total: {
    views: number
    unique: number
  }
  byPage: {
    home: { views: number; unique: number }
    form: { views: number; unique: number }
  }
  bySource?: {
    portal: { views: number; unique: number }
    meta: { views: number; unique: number }
    direct: { views: number; unique: number }
  }
  series: Array<{
    bucket: string
    views: number
    unique: number
  }>
  viewMode: 'daily' | 'weekly' | 'monthly'
  range: { start: string; end: string } | null
}

interface TrafficStatsDashboardProps {
  isOpen: boolean
  onClose: () => void
}

export default function TrafficStatsDashboard({ isOpen, onClose }: TrafficStatsDashboardProps) {
  const [stats, setStats] = useState<TrafficStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all' | 'custom'>('all')
  const [viewMode, setViewMode] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const startDateInputRef = useRef<HTMLInputElement>(null)
  const endDateInputRef = useRef<HTMLInputElement>(null)

  const loadStats = async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/admin/traffic/stats?period=${period}&viewMode=${viewMode}`
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`
      }
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('유입 통계 조회 실패')
      }
      const result = await response.json()
      if (result.success) {
        setStats(result.data)
      } else {
        throw new Error(result.error || '유입 통계 조회 실패')
      }
    } catch (err: any) {
      setError(err.message || '유입 통계를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      if (period !== 'custom') {
        loadStats()
      }
    }
  }, [isOpen, period, viewMode])

  const handlePeriodChange = (newPeriod: 'day' | 'week' | 'month' | 'year' | 'all' | 'custom') => {
    setPeriod(newPeriod)
    if (newPeriod !== 'custom') {
      setStartDate('')
      setEndDate('')
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border border-gray-700">
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-5 rounded-t-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">유입 통계 대시보드</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => loadStats()}
                disabled={loading || (period === 'custom' && (!startDate || !endDate))}
                className="text-gray-400 hover:text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg p-2 transition-colors duration-200 flex items-center gap-1.5"
                title="새로고침"
              >
                <svg className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm font-medium">리프레시</span>
              </button>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg p-2 transition-colors duration-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={period}
              onChange={(e) => handlePeriodChange(e.target.value as any)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 cursor-pointer"
            >
              <option value="day" className="bg-gray-800 text-white">오늘</option>
              <option value="week" className="bg-gray-800 text-white">최근 7일</option>
              <option value="month" className="bg-gray-800 text-white">이번 달</option>
              <option value="year" className="bg-gray-800 text-white">이번 해</option>
              <option value="all" className="bg-gray-800 text-white">전체</option>
              <option value="custom" className="bg-gray-800 text-white">기간 지정</option>
            </select>
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as any)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 cursor-pointer"
            >
              <option value="daily" className="bg-gray-800 text-white">일별</option>
              <option value="weekly" className="bg-gray-800 text-white">주별</option>
              <option value="monthly" className="bg-gray-800 text-white">월별</option>
            </select>
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <input
                    ref={startDateInputRef}
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 pr-10 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (startDateInputRef.current) {
                        if (typeof startDateInputRef.current.showPicker === 'function') {
                          startDateInputRef.current.showPicker()
                        } else {
                          startDateInputRef.current.click()
                        }
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white cursor-pointer pointer-events-auto z-10 text-lg"
                  >
                    📅
                  </button>
                </div>
                <span className="text-gray-400">~</span>
                <div className="relative">
                  <input
                    ref={endDateInputRef}
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 pr-10 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (endDateInputRef.current) {
                        if (typeof endDateInputRef.current.showPicker === 'function') {
                          endDateInputRef.current.showPicker()
                        } else {
                          endDateInputRef.current.click()
                        }
                      }
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-white cursor-pointer pointer-events-auto z-10 text-lg"
                  >
                    📅
                  </button>
                </div>
                <button
                  onClick={loadStats}
                  disabled={!startDate || !endDate}
                  className="bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-lg transition-colors duration-200 text-sm"
                >
                  조회
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-gray-900">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-400">로딩 중...</div>
            </div>
          ) : error ? (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-3 rounded-lg">
              {error}
            </div>
          ) : stats ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                  <div className="text-gray-400 text-sm mb-2">총 유입수</div>
                  <div className="text-2xl font-bold text-white">{stats.total.views.toLocaleString()}</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                  <div className="text-gray-400 text-sm mb-2">유니크 유입수</div>
                  <div className="text-2xl font-bold text-white">{stats.total.unique.toLocaleString()}</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                  <div className="text-gray-400 text-sm mb-2">홈 유입</div>
                  <div className="text-xl font-bold text-white">{stats.byPage.home.views.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-1">유니크 {stats.byPage.home.unique.toLocaleString()}</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                  <div className="text-gray-400 text-sm mb-2">폼 유입</div>
                  <div className="text-xl font-bold text-white">{stats.byPage.form.views.toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-1">유니크 {stats.byPage.form.unique.toLocaleString()}</div>
                </div>
              </div>

              {stats.bySource && (() => {
                const total = stats.bySource.portal.views + stats.bySource.meta.views + stats.bySource.direct.views
                const pPortal = total > 0 ? (stats.bySource.portal.views / total) * 100 : 0
                const pMeta = total > 0 ? (stats.bySource.meta.views / total) * 100 : 0
                const pDirect = total > 0 ? (stats.bySource.direct.views / total) * 100 : 0
                const pieStyle = total > 0
                  ? {
                      background: `conic-gradient(
                        #fbbf24 0% ${pPortal}%,
                        #60a5fa ${pPortal}% ${pPortal + pMeta}%,
                        #9ca3af ${pPortal + pMeta}% 100%
                      )`,
                    }
                  : undefined
                return (
                  <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                    <div className="text-white font-semibold mb-3">유입 경로</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                        <div className="text-amber-300 text-sm font-medium mb-1">포춘82 포털</div>
                        <div className="text-lg font-bold text-white">{stats.bySource.portal.views.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">유니크 {stats.bySource.portal.unique.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                        <div className="text-blue-300 text-sm font-medium mb-1">메타 광고</div>
                        <div className="text-lg font-bold text-white">{stats.bySource.meta.views.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">유니크 {stats.bySource.meta.unique.toLocaleString()}</div>
                      </div>
                      <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600">
                        <div className="text-gray-300 text-sm font-medium mb-1">기타 / 직접</div>
                        <div className="text-lg font-bold text-white">{stats.bySource.direct.views.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">유니크 {stats.bySource.direct.unique.toLocaleString()}</div>
                      </div>
                    </div>
                    {/* 유입 비율 원형 그래프 */}
                    <div className="mt-5 pt-5 border-t border-gray-700 flex flex-col sm:flex-row items-center gap-6">
                      <div className="flex-shrink-0 w-44 h-44 rounded-full border-2 border-gray-600 overflow-hidden bg-gray-700" style={pieStyle}>
                        {total === 0 && (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-gray-500 text-sm">데이터 없음</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 grid grid-cols-3 gap-3 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-amber-400 flex-shrink-0" aria-hidden />
                          <span className="text-gray-300 text-sm">포춘82 포털 <strong className="text-white">{pPortal.toFixed(1)}%</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-blue-400 flex-shrink-0" aria-hidden />
                          <span className="text-gray-300 text-sm">메타 광고 <strong className="text-white">{pMeta.toFixed(1)}%</strong></span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full bg-gray-400 flex-shrink-0" aria-hidden />
                          <span className="text-gray-300 text-sm">기타/직접 <strong className="text-white">{pDirect.toFixed(1)}%</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

              <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <div className="text-white font-semibold mb-4">
                  {viewMode === 'daily' ? '일별' : viewMode === 'weekly' ? '주별' : '월별'} 유입 추이
                </div>
                {stats.series.length === 0 ? (
                  <div className="text-gray-400 text-sm">데이터가 없습니다.</div>
                ) : (
                  <div className="space-y-2">
                    {stats.series.map((item) => (
                      <div key={item.bucket} className="flex items-center gap-3 text-sm">
                        <div className="w-28 text-gray-300">{item.bucket}</div>
                        <div className="flex-1 text-gray-200">
                          유입 {item.views.toLocaleString()} / 유니크 {item.unique.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-gray-400">통계를 불러오지 못했습니다.</div>
          )}
        </div>
      </div>
    </div>
  )
}
