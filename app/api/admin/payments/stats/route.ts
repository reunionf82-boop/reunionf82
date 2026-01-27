import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import {
  getKSTTodayStart,
  getKSTTodayEnd,
  getKSTDateStart,
  getKSTDateEnd,
  toKSTDateString,
  getKSTHour,
  getKSTDayOfWeek
} from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 결제 통계 조회 API
 * GET /api/admin/payments/stats
 * 
 * 쿼리 파라미터:
 * - period: 'day' | 'week' | 'month' | 'year' | 'all' (기본값: 'all')
 * - startDate: YYYY-MM-DD (선택)
 * - endDate: YYYY-MM-DD (선택)
 * - viewMode: 'daily' | 'hourly' | 'weekly' (기본값: 'daily')
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient()
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'all'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const viewMode = searchParams.get('viewMode') || 'daily'

    // 날짜 필터 생성
    let query = supabase
      .from('payments')
      .select('*')
      .eq('status', 'success')

    // 커스텀 기간 또는 startDate/endDate가 제공된 경우 (KST 기준)
    if (startDate && endDate) {
      const kstStart = getKSTDateStart(startDate)
      const kstEnd = getKSTDateEnd(endDate)
      query = query
        .gte('completed_at', kstStart)
        .lte('completed_at', kstEnd)
    } else if (period === 'day') {
      // 오늘 날짜만 (KST 기준)
      const todayStart = getKSTTodayStart()
      const todayEnd = getKSTTodayEnd()
      query = query.gte('completed_at', todayStart).lte('completed_at', todayEnd)
    } else if (period === 'week') {
      // 오늘 기준 이전 7일 (오늘 포함, KST 기준)
      const todayEnd = getKSTTodayEnd()
      const now = new Date()
      const kstOffset = 9 * 60 * 60 * 1000
      const kstNow = new Date(now.getTime() + kstOffset)
      const weekAgoKST = new Date(Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        kstNow.getUTCDate() - 6,
        0, 0, 0, 0
      ))
      const weekAgo = new Date(weekAgoKST.getTime() - kstOffset).toISOString()
      query = query.gte('completed_at', weekAgo).lte('completed_at', todayEnd)
    } else if (period === 'month') {
      // 이번 달만 (KST 기준)
      const now = new Date()
      const kstOffset = 9 * 60 * 60 * 1000
      const kstNow = new Date(now.getTime() + kstOffset)
      const firstDayOfMonth = new Date(Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth(),
        1, 0, 0, 0, 0
      ))
      const lastDayOfMonth = new Date(Date.UTC(
        kstNow.getUTCFullYear(),
        kstNow.getUTCMonth() + 1,
        0, 23, 59, 59, 999
      ))
      const firstDayUTC = new Date(firstDayOfMonth.getTime() - kstOffset).toISOString()
      const lastDayUTC = new Date(lastDayOfMonth.getTime() - kstOffset).toISOString()
      query = query.gte('completed_at', firstDayUTC).lte('completed_at', lastDayUTC)
    } else if (period === 'year') {
      // 이번 해만 (KST 기준)
      const now = new Date()
      const kstOffset = 9 * 60 * 60 * 1000
      const kstNow = new Date(now.getTime() + kstOffset)
      const firstDayOfYear = new Date(Date.UTC(
        kstNow.getUTCFullYear(),
        0, 1, 0, 0, 0, 0
      ))
      const lastDayOfYear = new Date(Date.UTC(
        kstNow.getUTCFullYear(),
        11, 31, 23, 59, 59, 999
      ))
      const firstDayUTC = new Date(firstDayOfYear.getTime() - kstOffset).toISOString()
      const lastDayUTC = new Date(lastDayOfYear.getTime() - kstOffset).toISOString()
      query = query.gte('completed_at', firstDayUTC).lte('completed_at', lastDayUTC)
    }

    const { data: payments, error: paymentsError } = await query
      .order('completed_at', { ascending: false })

      if (paymentsError) {
        throw paymentsError
      }

      // 통계 계산
      const totalAmount = payments.reduce((sum, p) => sum + (p.pay || 0), 0)
      const totalCount = payments.length
      const cardCount = payments.filter(p => p.payment_type === 'card').length
      const mobileCount = payments.filter(p => p.payment_type === 'mobile').length
      const maleCount = payments.filter(p => p.gender === 'male').length
      const femaleCount = payments.filter(p => p.gender === 'female').length

      // 일별 통계 (KST 기준)
      const dailyStats: { [key: string]: { date: string; amount: number; count: number } } = {}
      payments.forEach(p => {
        if (p.completed_at) {
          const date = toKSTDateString(new Date(p.completed_at))
          if (!dailyStats[date]) {
            dailyStats[date] = { date, amount: 0, count: 0 }
          }
          dailyStats[date].amount += p.pay || 0
          dailyStats[date].count += 1
        }
      })

      // 시간대별 통계 (KST 기준)
      const hourlyStats: { [key: number]: { hour: number; amount: number; count: number } } = {}
      payments.forEach(p => {
        if (p.completed_at) {
          const date = new Date(p.completed_at)
          const hour = getKSTHour(date)
          if (!hourlyStats[hour]) {
            hourlyStats[hour] = { hour, amount: 0, count: 0 }
          }
          hourlyStats[hour].amount += p.pay || 0
          hourlyStats[hour].count += 1
        }
      })

      // 요일별 통계 (KST 기준)
      const weeklyStats: { [key: number]: { weekday: number; weekdayName: string; amount: number; count: number } } = {}
      const weekdayNames = ['일', '월', '화', '수', '목', '금', '토']
      payments.forEach(p => {
        if (p.completed_at) {
          const date = new Date(p.completed_at)
          const weekday = getKSTDayOfWeek(date)
          if (!weeklyStats[weekday]) {
            weeklyStats[weekday] = { weekday, weekdayName: weekdayNames[weekday], amount: 0, count: 0 }
          }
          weeklyStats[weekday].amount += p.pay || 0
          weeklyStats[weekday].count += 1
        }
      })

      // 결제 타입별 남녀 통계
      const cardPayments = payments.filter(p => p.payment_type === 'card')
      const mobilePayments = payments.filter(p => p.payment_type === 'mobile')
      const cardMaleCount = cardPayments.filter(p => p.gender === 'male').length
      const cardFemaleCount = cardPayments.filter(p => p.gender === 'female').length
      const mobileMaleCount = mobilePayments.filter(p => p.gender === 'male').length
      const mobileFemaleCount = mobilePayments.filter(p => p.gender === 'female').length

      // 컨텐츠별 통계
      const contentStats: { [key: number]: { content_id: number; content_name: string; amount: number; count: number } } = {}
      payments.forEach(p => {
        if (p.content_id) {
          if (!contentStats[p.content_id]) {
            contentStats[p.content_id] = {
              content_id: p.content_id,
              content_name: p.name || '알 수 없음',
              amount: 0,
              count: 0
            }
          }
          contentStats[p.content_id].amount += p.pay || 0
          contentStats[p.content_id].count += 1
        }
      })

      // 컨텐츠 이름 가져오기
      const contentIds = Object.keys(contentStats).map(Number)
      if (contentIds.length > 0) {
        const { data: contents } = await supabase
          .from('contents')
          .select('id, content_name')
          .in('id', contentIds)

        if (contents) {
          contents.forEach(c => {
            if (contentStats[c.id]) {
              contentStats[c.id].content_name = c.content_name || contentStats[c.id].content_name
            }
          })
        }
      }

    return NextResponse.json({
      success: true,
      data: {
        total: {
          amount: totalAmount,
          count: totalCount,
          cardCount,
          mobileCount,
          maleCount,
          femaleCount
        },
        daily: Object.values(dailyStats).sort((a, b) => b.date.localeCompare(a.date)),
        hourly: Object.values(hourlyStats).sort((a, b) => a.hour - b.hour),
        weekly: Object.values(weeklyStats).sort((a, b) => a.weekday - b.weekday),
        byContent: Object.values(contentStats).sort((a, b) => b.amount - a.amount),
        byPaymentType: {
          card: {
            count: cardCount,
            amount: payments.filter(p => p.payment_type === 'card').reduce((sum, p) => sum + (p.pay || 0), 0),
            maleCount: cardMaleCount,
            femaleCount: cardFemaleCount
          },
          mobile: {
            count: mobileCount,
            amount: payments.filter(p => p.payment_type === 'mobile').reduce((sum, p) => sum + (p.pay || 0), 0),
            maleCount: mobileMaleCount,
            femaleCount: mobileFemaleCount
          }
        }
      }
    })
  } catch (error: any) {

    return NextResponse.json(
      { success: false, error: error.message || '결제 통계 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
