import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'

/** 전화번호 정규화 (하이픈·공백 제거) */
function normalizePhone(phone: string): string {
  return (phone || '').replace(/[-\s]/g, '')
}

/**
 * 일주일(7일) 안에 같은 컨텐츠로 같은 고객(이름+전화번호)이 결제(또는 관리자 생성)한 이력이 있는지 조회
 * POST /api/payment/recent-duplicate
 *
 * 요청 본문: { contentId: number, userName: string, phoneNumber: string }
 * 응답: { success: true, hasRecent: boolean, completedAt?: string } (completedAt은 KST ISO 문자열)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contentId, userName, phoneNumber } = body

    if (contentId == null || contentId === '') {
      return NextResponse.json(
        { success: false, error: 'contentId가 필요합니다.' },
        { status: 400 }
      )
    }
    const cid = Number(contentId)
    if (Number.isNaN(cid)) {
      return NextResponse.json(
        { success: false, error: 'contentId는 숫자여야 합니다.' },
        { status: 400 }
      )
    }

    const name = typeof userName === 'string' ? userName.trim() : ''
    const phone = typeof phoneNumber === 'string' ? phoneNumber.trim() : ''
    if (!name || !phone) {
      return NextResponse.json(
        { success: false, error: 'userName과 phoneNumber는 필수입니다.' },
        { status: 400 }
      )
    }

    const normalizedPhone = normalizePhone(phone)
    if (!normalizedPhone) {
      return NextResponse.json(
        { success: false, error: '유효한 전화번호를 입력해주세요.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    // 일주일 이내 success 건만 조회 (completed_at 우선, 없으면 created_at)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const since = sevenDaysAgo.toISOString()

    const { data: rows, error } = await supabase
      .from('payments')
      .select('id, user_name, phone_number, completed_at, created_at')
      .eq('content_id', cid)
      .eq('status', 'success')
      .gte('created_at', since)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .limit(50)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || '조회에 실패했습니다.' },
        { status: 500 }
      )
    }

    // completed_at이 7일 이내인 것만 유지 (created_at만으로 걸렸을 수 있음)
    const filtered = (rows || []).filter((row: any) => {
      const at = row.completed_at || row.created_at
      if (!at) return false
      return new Date(at) >= sevenDaysAgo
    })

    // 이름 + 전화번호(정규화) 일치하는 최신 1건
    let recent: { completed_at: string | null; created_at: string } | null = null
    for (const row of filtered) {
      const rowName = (row.user_name || '').trim()
      const rowPhone = normalizePhone((row.phone_number || '').trim())
      if (rowName === name && rowPhone === normalizedPhone) {
        recent = {
          completed_at: row.completed_at || null,
          created_at: row.created_at
        }
        break
      }
    }

    const completedAt = recent
      ? (recent.completed_at || recent.created_at)
      : undefined

    return NextResponse.json({
      success: true,
      hasRecent: !!recent,
      completedAt: completedAt || undefined
    })
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || '서버 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
