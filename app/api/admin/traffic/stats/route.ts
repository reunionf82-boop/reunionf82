import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { toKSTDateString } from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type ViewMode = 'daily' | 'weekly' | 'monthly'

const ALLOWED_PAGES = ['home', 'form']

const parseDayParts = (dayStr: string) => {
  const [year, month, day] = dayStr.split('-').map(Number)
  return { year, month, day }
}

const addDays = (dayStr: string, delta: number) => {
  const { year, month, day } = parseDayParts(dayStr)
  const date = new Date(Date.UTC(year, month - 1, day + delta))
  return date.toISOString().slice(0, 10)
}

const getWeekStartDate = (dayStr: string) => {
  const { year, month, day } = parseDayParts(dayStr)
  const date = new Date(Date.UTC(year, month - 1, day))
  const weekday = date.getUTCDay()
  const diff = (weekday + 6) % 7
  return addDays(dayStr, -diff)
}

const getMonthKey = (dayStr: string) => {
  const { year, month } = parseDayParts(dayStr)
  return `${year}-${String(month).padStart(2, '0')}`
}

const normalizeViewMode = (value: string | null): ViewMode => {
  if (value === 'weekly' || value === 'monthly') return value
  return 'daily'
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient()
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'all'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const viewMode = normalizeViewMode(searchParams.get('viewMode'))

    const today = toKSTDateString(new Date())
    let rangeStart: string | null = null
    let rangeEnd: string | null = null

    if (startDate && endDate) {
      rangeStart = startDate
      rangeEnd = endDate
    } else if (period === 'day') {
      rangeStart = today
      rangeEnd = today
    } else if (period === 'week') {
      rangeEnd = today
      rangeStart = addDays(today, -6)
    } else if (period === 'month') {
      const { year, month } = parseDayParts(today)
      rangeStart = `${year}-${String(month).padStart(2, '0')}-01`
      const nextMonth = month === 12 ? 1 : month + 1
      const nextMonthYear = month === 12 ? year + 1 : year
      const monthStart = new Date(Date.UTC(year, month - 1, 1))
      const nextMonthStart = new Date(Date.UTC(nextMonthYear, nextMonth - 1, 1))
      const lastDay = Math.round((nextMonthStart.getTime() - monthStart.getTime()) / (24 * 60 * 60 * 1000))
      rangeEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else if (period === 'year') {
      const { year } = parseDayParts(today)
      rangeStart = `${year}-01-01`
      rangeEnd = `${year}-12-31`
    }

    let pageViewsQuery = supabase
      .from('daily_page_views')
      .select('day,page,view_count')
      .in('page', ALLOWED_PAGES)

    let uniqueViewsQuery = supabase
      .from('daily_unique_page_views')
      .select('day,page')
      .in('page', ALLOWED_PAGES)

    if (rangeStart && rangeEnd) {
      pageViewsQuery = pageViewsQuery.gte('day', rangeStart).lte('day', rangeEnd)
      uniqueViewsQuery = uniqueViewsQuery.gte('day', rangeStart).lte('day', rangeEnd)
    }

    const [{ data: pageViews, error: pageViewsError }, { data: uniqueViews, error: uniqueViewsError }] = await Promise.all([
      pageViewsQuery,
      uniqueViewsQuery,
    ])

    if (pageViewsError) {
      throw pageViewsError
    }
    if (uniqueViewsError) {
      throw uniqueViewsError
    }

    const seriesMap: Record<string, { bucket: string; views: number; unique: number }> = {}
    const byPageViews: Record<string, number> = { home: 0, form: 0 }
    const byPageUnique: Record<string, number> = { home: 0, form: 0 }

    const getBucket = (dayStr: string) => {
      if (viewMode === 'weekly') return getWeekStartDate(dayStr)
      if (viewMode === 'monthly') return getMonthKey(dayStr)
      return dayStr
    }

    let totalViews = 0
    pageViews?.forEach((row: any) => {
      const dayStr = row.day as string
      const page = row.page as string
      const count = Number(row.view_count) || 0
      totalViews += count
      if (byPageViews[page] !== undefined) {
        byPageViews[page] += count
      }
      const bucket = getBucket(dayStr)
      if (!seriesMap[bucket]) {
        seriesMap[bucket] = { bucket, views: 0, unique: 0 }
      }
      seriesMap[bucket].views += count
    })

    let totalUnique = 0
    uniqueViews?.forEach((row: any) => {
      const dayStr = row.day as string
      const page = row.page as string
      totalUnique += 1
      if (byPageUnique[page] !== undefined) {
        byPageUnique[page] += 1
      }
      const bucket = getBucket(dayStr)
      if (!seriesMap[bucket]) {
        seriesMap[bucket] = { bucket, views: 0, unique: 0 }
      }
      seriesMap[bucket].unique += 1
    })

    const series = Object.values(seriesMap).sort((a, b) => a.bucket.localeCompare(b.bucket))

    return NextResponse.json({
      success: true,
      data: {
        total: {
          views: totalViews,
          unique: totalUnique,
        },
        byPage: {
          home: { views: byPageViews.home, unique: byPageUnique.home },
          form: { views: byPageViews.form, unique: byPageUnique.form },
        },
        series,
        viewMode,
        range: rangeStart && rangeEnd ? { start: rangeStart, end: rangeEnd } : null,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '유입 통계 조회 실패' },
      { status: 500 }
    )
  }
}
