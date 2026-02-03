import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import {
  getKSTTodayStart,
  getKSTTodayEnd,
  getKSTDateStart,
  getKSTDateEnd
} from '@/lib/payment-utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 관리자 결제 목록 API (기간별, 결제 상태·점사 상태·다시보기 가능 여부 포함)
 * GET /api/admin/payments/list?period=day|week|month|year|all|custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = getAdminSupabaseClient()
    const searchParams = request.nextUrl.searchParams
    const period = searchParams.get('period') || 'all'
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    let query = supabase
      .from('payments')
      .select(`
        id,
        oid,
        content_id,
        payment_code,
        name,
        pay,
        payment_type,
        user_name,
        phone_number,
        password,
        gender,
        status,
        calendar_type,
        birth_year,
        birth_month,
        birth_day,
        birth_hour,
        created_at,
        completed_at,
        updated_at,
        request_key,
        saved_id,
        fortune_status,
        fortune_failure_reason,
        payment_failure_reason
      `)
      .order('created_at', { ascending: false })

    // 기간 필터 (created_at 기준)
    if (period === 'custom' && startDate && endDate) {
      const kstStart = getKSTDateStart(startDate)
      const kstEnd = getKSTDateEnd(endDate)
      query = supabase
        .from('payments')
        .select(`
          id, oid, content_id, payment_code, name, pay, payment_type,
          user_name, phone_number, password, gender, status, calendar_type,
          birth_year, birth_month, birth_day, birth_hour,
          created_at, completed_at, updated_at,
          request_key, saved_id, fortune_status, fortune_failure_reason, payment_failure_reason
        `)
        .gte('created_at', kstStart)
        .lte('created_at', kstEnd)
        .order('created_at', { ascending: false })
    } else if (period === 'day') {
      const todayStart = getKSTTodayStart()
      const todayEnd = getKSTTodayEnd()
      query = query.gte('created_at', todayStart).lte('created_at', todayEnd)
    } else if (period === 'week') {
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
      query = query.gte('created_at', weekAgo).lte('created_at', todayEnd)
    } else if (period === 'month') {
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
      query = query.gte('created_at', firstDayUTC).lte('created_at', lastDayUTC)
    } else if (period === 'year') {
      const now = new Date()
      const kstOffset = 9 * 60 * 60 * 1000
      const kstNow = new Date(now.getTime() + kstOffset)
      const firstDayOfYear = new Date(Date.UTC(kstNow.getUTCFullYear(), 0, 1, 0, 0, 0, 0))
      const lastDayOfYear = new Date(Date.UTC(kstNow.getUTCFullYear(), 11, 31, 23, 59, 59, 999))
      const firstDayUTC = new Date(firstDayOfYear.getTime() - kstOffset).toISOString()
      const lastDayUTC = new Date(lastDayOfYear.getTime() - kstOffset).toISOString()
      query = query.gte('created_at', firstDayUTC).lte('created_at', lastDayUTC)
    }
    // period === 'all' or else: no date filter

    const { data: payments, error: paymentsError } = await query

    if (paymentsError) {
      throw paymentsError
    }

    const list = payments || []
    const savedIds = Array.from(new Set(list.map((p: any) => p.saved_id).filter(Boolean))) as number[]

    // 다시보기 가능 여부: user_credentials에 saved_id가 있고 expires_at > now
    let replayAvailableSet = new Set<number>()
    if (savedIds.length > 0) {
      const nowIso = new Date().toISOString()
      const { data: creds } = await supabase
        .from('user_credentials')
        .select('saved_id')
        .in('saved_id', savedIds)
        .gt('expires_at', nowIso)
      if (creds) {
        creds.forEach((c: any) => {
          if (c.saved_id) replayAvailableSet.add(Number(c.saved_id))
        })
      }
    }

    // 컨텐츠 이름 매핑
    const contentIds = Array.from(new Set(list.map((p: any) => p.content_id).filter(Boolean))) as number[]
    let contentNames: Record<number, string> = {}
    if (contentIds.length > 0) {
      const { data: contents } = await supabase
        .from('contents')
        .select('id, content_name')
        .in('id', contentIds)
      if (contents) {
        contents.forEach((c: any) => { contentNames[c.id] = c.content_name || '' })
      }
    }

    const items = list.map((p: any) => ({
      id: p.id,
      oid: p.oid,
      content_id: p.content_id,
      content_name: contentNames[p.content_id] || p.name || '',
      payment_code: p.payment_code,
      name: p.name,
      pay: p.pay,
      payment_type: p.payment_type,
      user_name: p.user_name,
      phone_number: p.phone_number,
      password: p.password || null,
      gender: p.gender,
      status: p.status,
      calendar_type: p.calendar_type,
      birth_year: p.birth_year,
      birth_month: p.birth_month,
      birth_day: p.birth_day,
      birth_hour: p.birth_hour,
      created_at: p.created_at,
      completed_at: p.completed_at,
      updated_at: p.updated_at,
      request_key: p.request_key,
      saved_id: p.saved_id,
      fortune_status: p.fortune_status || null,
      fortune_failure_reason: p.fortune_failure_reason || null,
      payment_failure_reason: p.payment_failure_reason || null,
      replay_available: p.saved_id ? replayAvailableSet.has(Number(p.saved_id)) : false
    }))

    return NextResponse.json({ success: true, data: items })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || '결제 목록 조회에 실패했습니다.' },
      { status: 500 }
    )
  }
}
