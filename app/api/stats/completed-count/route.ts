import { NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 점사 완료 건수 (saved_results 테이블 전체 건수)를 반환합니다.
 * 프론트 "000명이 이용하셨습니다" 표시용.
 */
export async function GET() {
  try {
    const supabase = getAdminSupabaseClient()
    const { count, error } = await supabase
      .from('saved_results')
      .select('*', { count: 'exact', head: true })

    if (error) {
      console.error('[stats/completed-count]', error.message)
      return NextResponse.json({ total_count: 0 })
    }

    return NextResponse.json({ total_count: count ?? 0 })
  } catch (e) {
    console.error('[stats/completed-count]', e)
    return NextResponse.json({ total_count: 0 })
  }
}
