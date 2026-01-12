'use client'

import { useState, useEffect, useRef } from 'react'

interface PaymentStats {
  total: {
    amount: number
    count: number
    cardCount: number
    mobileCount: number
    maleCount?: number
    femaleCount?: number
  }
  daily: Array<{
    date: string
    amount: number
    count: number
  }>
  hourly?: Array<{
    hour: number
    amount: number
    count: number
  }>
  weekly?: Array<{
    weekday: number
    weekdayName: string
    amount: number
    count: number
  }>
  byContent: Array<{
    content_id: number
    content_name: string
    amount: number
    count: number
  }>
  byPaymentType: {
    card: {
      count: number
      amount: number
      maleCount?: number
      femaleCount?: number
    }
    mobile: {
      count: number
      amount: number
      maleCount?: number
      femaleCount?: number
    }
  }
}

interface PaymentStatsDashboardProps {
  isOpen: boolean
  onClose: () => void
}

export default function PaymentStatsDashboard({ isOpen, onClose }: PaymentStatsDashboardProps) {
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year' | 'all' | 'custom'>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [viewMode, setViewMode] = useState<'daily' | 'hourly' | 'weekly'>('daily')
  const [error, setError] = useState<string | null>(null)
  const startDateInputRef = useRef<HTMLInputElement>(null)
  const endDateInputRef = useRef<HTMLInputElement>(null)

  const loadStats = async () => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/admin/payments/stats?period=${period}&viewMode=${viewMode}`
      if (period === 'custom' && startDate && endDate) {
        url += `&startDate=${startDate}&endDate=${endDate}`
      }
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error('결제 통계 조회 실패')
      }
      const result = await response.json()
      if (result.success) {
        setStats(result.data)
      } else {
        throw new Error(result.error || '결제 통계 조회 실패')
      }
    } catch (err: any) {
      setError(err.message || '결제 통계를 불러오는 중 오류가 발생했습니다.')
      console.error('[결제 통계 조회] 오류:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      // 커스텀 기간이 아닐 때만 자동 로드
      // 커스텀 기간은 조회 버튼을 눌러야 로드됨
      if (period !== 'custom') {
        loadStats()
      }
    }
  }, [isOpen, period, viewMode])

  // 커스텀 기간에서 startDate나 endDate가 변경되어도 자동 로드하지 않음 (조회 버튼 필요)

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const weekdays = ['일', '월', '화', '수', '목', '금', '토']
    const weekday = weekdays[date.getDay()]
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}(${weekday})`
  }

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
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border border-gray-700">
        {/* 헤더 */}
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-5 rounded-t-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-white">결제 통계 대시보드</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg p-2 transition-colors duration-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* 기간 선택 */}
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
            {/* 커스텀 기간 선택 (달력) */}
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

        {/* 내용 */}
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
              {/* 전체 통계 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
                  <div className="text-sm text-gray-400 mb-2">💰 총 결제 금액</div>
                  <div className="text-3xl font-bold text-white">{formatCurrency(stats.total.amount)}</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
                  <div className="text-sm text-gray-400 mb-2">📊 총 결제 건수</div>
                  <div className="text-3xl font-bold text-white">{stats.total.count.toLocaleString()}건</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
                  <div className="text-sm text-gray-400 mb-2">💳 카드 결제</div>
                  <div className="text-3xl font-bold text-white">{stats.total.cardCount.toLocaleString()}건</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 hover:border-gray-600 transition-colors">
                  <div className="text-sm text-gray-400 mb-2">📱 휴대폰 결제</div>
                  <div className="text-3xl font-bold text-white">{stats.total.mobileCount.toLocaleString()}건</div>
                </div>
              </div>

              {/* 결제 타입별 통계 */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <h3 className="text-xl font-bold text-white mb-5">결제 타입별 통계</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                    <div className="text-gray-400 text-sm mb-2 font-medium">💳 카드 결제</div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {formatCurrency(stats.byPaymentType.card.amount)}
                    </div>
                    <div className="text-gray-400 text-sm mb-3">
                      {stats.byPaymentType.card.count}건
                    </div>
                    {(stats.byPaymentType.card.maleCount !== undefined || stats.byPaymentType.card.femaleCount !== undefined) && (
                      <div className="mb-3 text-xs text-gray-400">
                        <div className="flex items-center gap-2 mb-1">
                          <span>👨 남성:</span>
                          <span className="text-white font-medium">
                            {stats.byPaymentType.card.maleCount || 0}건
                            {stats.byPaymentType.card.count > 0 && (
                              <span className="text-gray-400 ml-1">
                                ({Math.round(((stats.byPaymentType.card.maleCount || 0) / stats.byPaymentType.card.count) * 100)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>👩 여성:</span>
                          <span className="text-white font-medium">
                            {stats.byPaymentType.card.femaleCount || 0}건
                            {stats.byPaymentType.card.count > 0 && (
                              <span className="text-gray-400 ml-1">
                                ({Math.round(((stats.byPaymentType.card.femaleCount || 0) / stats.byPaymentType.card.count) * 100)}%)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${stats.total.count > 0 ? (stats.byPaymentType.card.count / stats.total.count) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                  <div className="bg-gray-900 border border-gray-700 rounded-lg p-5">
                    <div className="text-gray-400 text-sm mb-2 font-medium">📱 휴대폰 결제</div>
                    <div className="text-2xl font-bold text-white mb-1">
                      {formatCurrency(stats.byPaymentType.mobile.amount)}
                    </div>
                    <div className="text-gray-400 text-sm mb-3">
                      {stats.byPaymentType.mobile.count}건
                    </div>
                    {(stats.byPaymentType.mobile.maleCount !== undefined || stats.byPaymentType.mobile.femaleCount !== undefined) && (
                      <div className="mb-3 text-xs text-gray-400">
                        <div className="flex items-center gap-2 mb-1">
                          <span>👨 남성:</span>
                          <span className="text-white font-medium">
                            {stats.byPaymentType.mobile.maleCount || 0}건
                            {stats.byPaymentType.mobile.count > 0 && (
                              <span className="text-gray-400 ml-1">
                                ({Math.round(((stats.byPaymentType.mobile.maleCount || 0) / stats.byPaymentType.mobile.count) * 100)}%)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span>👩 여성:</span>
                          <span className="text-white font-medium">
                            {stats.byPaymentType.mobile.femaleCount || 0}건
                            {stats.byPaymentType.mobile.count > 0 && (
                              <span className="text-gray-400 ml-1">
                                ({Math.round(((stats.byPaymentType.mobile.femaleCount || 0) / stats.byPaymentType.mobile.count) * 100)}%)
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{
                          width: `${stats.total.count > 0 ? (stats.byPaymentType.mobile.count / stats.total.count) * 100 : 0}%`
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 결제 추이 (일별/시간대별/요일별) */}
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xl font-bold text-white">
                    {viewMode === 'daily' ? '일별 결제 추이' : viewMode === 'hourly' ? '시간대별 결제 추이' : '요일별 결제 추이'}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setViewMode('daily')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'daily'
                          ? 'bg-pink-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      일별
                    </button>
                    <button
                      onClick={() => setViewMode('hourly')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'hourly'
                          ? 'bg-pink-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      시간대별
                    </button>
                    <button
                      onClick={() => setViewMode('weekly')}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'weekly'
                          ? 'bg-pink-500 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      요일별
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {viewMode === 'daily' && stats.daily.length > 0 && (
                    <>
                      {[...stats.daily].sort((a, b) => b.date.localeCompare(a.date)).map((day, index) => {
                        const maxAmount = Math.max(...stats.daily.map(d => d.amount))
                        return (
                          <div key={index} className="flex items-center gap-4">
                            <div className="w-44 text-gray-300 text-sm font-medium">{formatDate(day.date)}</div>
                            <div className="flex-1 relative">
                              <div className="h-6 bg-gray-700 rounded-full overflow-hidden flex items-center border border-gray-600">
                                <div
                                  className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                                  style={{ width: `${maxAmount > 0 ? (day.amount / maxAmount) * 100 : 0}%` }}
                                >
                                  {day.amount > 0 && (
                                    <span className="text-white text-xs font-semibold">
                                      {formatCurrency(day.amount)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="w-24 text-right">
                              <div className="text-white font-semibold text-sm">{day.count}건</div>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {viewMode === 'hourly' && stats.hourly && stats.hourly.length > 0 && (
                    <>
                      {stats.hourly.map((hour, index) => {
                        const maxAmount = Math.max(...stats.hourly!.map(h => h.amount))
                        return (
                          <div key={index} className="flex items-center gap-4">
                            <div className="w-24 text-gray-300 text-sm font-medium">{hour.hour}시</div>
                            <div className="flex-1 relative">
                              <div className="h-6 bg-gray-700 rounded-full overflow-hidden flex items-center border border-gray-600">
                                <div
                                  className="h-full bg-blue-500 rounded-full flex items-center justify-end pl-2 pr-2 transition-all duration-500"
                                  style={{ 
                                    width: `${maxAmount > 0 ? (hour.amount / maxAmount) * 100 : 0}%`,
                                    minWidth: hour.amount > 0 ? '120px' : '0px'
                                  }}
                                >
                                  {hour.amount > 0 && (
                                    <span className="text-white text-xs font-semibold whitespace-nowrap">
                                      {formatCurrency(hour.amount)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="w-24 text-right">
                              <div className="text-white font-semibold text-sm">{hour.count}건</div>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {viewMode === 'weekly' && stats.weekly && stats.weekly.length > 0 && (
                    <>
                      {stats.weekly.map((week, index) => {
                        const maxAmount = Math.max(...stats.weekly!.map(w => w.amount))
                        return (
                          <div key={index} className="flex items-center gap-4">
                            <div className="w-24 text-gray-300 text-sm font-medium">{week.weekdayName}</div>
                            <div className="flex-1 relative">
                              <div className="h-6 bg-gray-700 rounded-full overflow-hidden flex items-center border border-gray-600">
                                <div
                                  className="h-full bg-blue-500 rounded-full flex items-center justify-end pr-2 transition-all duration-500"
                                  style={{ width: `${maxAmount > 0 ? (week.amount / maxAmount) * 100 : 0}%` }}
                                >
                                  {week.amount > 0 && (
                                    <span className="text-white text-xs font-semibold">
                                      {formatCurrency(week.amount)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="w-24 text-right">
                              <div className="text-white font-semibold text-sm">{week.count}건</div>
                            </div>
                          </div>
                        )
                      })}
                    </>
                  )}
                  {((viewMode === 'daily' && stats.daily.length === 0) ||
                    (viewMode === 'hourly' && (!stats.hourly || stats.hourly.length === 0)) ||
                    (viewMode === 'weekly' && (!stats.weekly || stats.weekly.length === 0))) && (
                    <div className="text-center text-gray-400 py-8">
                      선택한 기간에 결제 데이터가 없습니다.
                    </div>
                  )}
                </div>
              </div>

              {/* 컨텐츠별 통계 */}
              {stats.byContent.length > 0 && (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-5">컨텐츠별 결제 통계</h3>
                  <div className="space-y-3">
                    {stats.byContent.map((content, index) => {
                      const maxAmount = Math.max(...stats.byContent.map(c => c.amount))
                      return (
                        <div key={index} className="flex items-center gap-4">
                          <div className="w-48 text-gray-300 text-sm font-medium line-clamp-2" title={content.content_name}>
                            {content.content_name}
                          </div>
                          <div className="flex-1 relative">
                            <div className="h-10 bg-gray-700 rounded-full overflow-hidden flex items-center border border-gray-600">
                              <div
                                className="h-full bg-emerald-500 rounded-full flex items-center justify-end pr-3 transition-all duration-500"
                                style={{ width: `${maxAmount > 0 ? (content.amount / maxAmount) * 100 : 0}%` }}
                              >
                                {content.amount > 0 && (
                                  <span className="text-white text-base font-bold">
                                    {formatCurrency(content.amount)}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="w-24 text-right">
                            <div className="text-white font-semibold">{content.count}건</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {((viewMode === 'daily' && stats.daily.length === 0) ||
                (viewMode === 'hourly' && (!stats.hourly || stats.hourly.length === 0)) ||
                (viewMode === 'weekly' && (!stats.weekly || stats.weekly.length === 0))) &&
                stats.byContent.length === 0 && (
                <div className="text-center text-gray-400 py-12 bg-gray-800 border border-gray-700 rounded-lg">
                  선택한 기간에 결제 데이터가 없습니다.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
