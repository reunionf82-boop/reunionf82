import { NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 점사/음성 완료 건수를 반환합니다.
 * GET ?type=voice → saved_results_voice 건수 (음성형 폼 "OO명이 이용하셨습니다")
 * GET ?type=fortune 또는 생략 → saved_results 건수 (점사형 폼)
 */
export async function GET(request: Request) {
  try {
    const supabase = getAdminSupabaseClient()
    const url = request.url ? new URL(request.url) : null
    const type = url?.searchParams?.get('type') ?? 'fortune'

    if (type === 'voice') {
      const { count, error } = await supabase
        .from('saved_results_voice')
        .select('*', { count: 'exact', head: true })
      if (error) {
        console.error('[stats/completed-count] voice', error.message)
        return NextResponse.json({ total_count: 0 })
      }
      return NextResponse.json({ total_count: count ?? 0 })
    }

    const { count, error } = await supabase
      .from('saved_results')
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.error('[stats/completed-count] fortune', error.message)
      return NextResponse.json({ total_count: 0 })
    }
    return NextResponse.json({ total_count: count ?? 0 })
  } catch (e) {
    console.error('[stats/completed-count]', e)
    return NextResponse.json({ total_count: 0 })
  }
}
