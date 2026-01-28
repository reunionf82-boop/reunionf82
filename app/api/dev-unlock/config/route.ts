import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function GET(_: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('dev_unlock_duration_minutes, dev_unlock_hide_enabled')
      .eq('id', 1)
      .limit(1)

    if (error) {
      return NextResponse.json(
        { error: '설정을 불러오는데 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }

    const row = Array.isArray(data) ? data[0] : null
    const minutes = Number((row as any)?.dev_unlock_duration_minutes || 60)
    const hideEnabled = Boolean((row as any)?.dev_unlock_hide_enabled)
    return NextResponse.json({
      success: true,
      dev_unlock_duration_minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 60,
      dev_unlock_hide_enabled: hideEnabled
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
