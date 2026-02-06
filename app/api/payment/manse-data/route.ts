import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/**
 * 만세력 표시용 생년월일 조회 (모바일 등 sessionStorage 없을 때 fallback)
 * GET /api/payment/manse-data?oid=...
 * - 결제 완료된 건만 조회
 * - 반환: birth_year, birth_month, birth_day, birth_hour, gender, calendar_type, user_name
 */
export async function GET(request: NextRequest) {
  try {
    const oid = request.nextUrl.searchParams.get('oid')
    if (!oid || !String(oid).trim()) {
      return NextResponse.json({ success: false, error: '주문번호가 없습니다.' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('payments')
      .select('status, birth_year, birth_month, birth_day, birth_hour, gender, calendar_type, user_name')
      .eq('oid', String(oid).trim())
      .single()

    if (error || !data) {
      return NextResponse.json({ success: false, error: '결제 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const status = (data as any).status === 'pending' ? 'pending' : 'success'
    if (status !== 'success') {
      return NextResponse.json({ success: false, error: '결제가 완료된 건만 조회할 수 있습니다.' }, { status: 403 })
    }

    const year = (data as any).birth_year != null ? Number((data as any).birth_year) : null
    const month = (data as any).birth_month != null ? Number((data as any).birth_month) : null
    const day = (data as any).birth_day != null ? Number((data as any).birth_day) : null
    if (year == null || month == null || day == null) {
      return NextResponse.json({ success: false, error: '생년월일 정보가 없습니다.' }, { status: 404 })
    }

    const headers = new Headers()
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')

    return NextResponse.json(
      {
        success: true,
        data: {
          birthYear: year,
          birthMonth: month,
          birthDay: day,
          birthHour: (data as any).birth_hour || null,
          gender: (data as any).gender === 'female' ? 'female' : 'male',
          calendarType: (data as any).calendar_type || 'solar',
          userName: (data as any).user_name || '',
        },
      },
      { headers }
    )
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || '서버 오류' }, { status: 500 })
  }
}
