import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(request: NextRequest) {
  try {
    // API 키 확인 (보안을 위해)
    const authHeader = request.headers.get('authorization')
    const expectedKey = process.env.CLEANUP_API_KEY || 'cleanup-secret-key'
    
    if (authHeader !== `Bearer ${expectedKey}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // 60일 이상 된 saved_results만 삭제. voice_conversation_summaries / voice_summary_asked 는 삭제하지 않음
    // (안부 문맥은 이용내역 만료와 무관하게 유지해, 나중에 접속 시 안 물어본 항목에 대해 안부 가능)
    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
    
    const { data, error } = await supabase
      .from('saved_results')
      .delete()
      .lt('saved_at', sixtyDaysAgo.toISOString())
      .select()

    if (error) {
      return NextResponse.json(
        { error: '삭제 실패', details: error.message },
        { status: 500 }
      )
    }

    const deletedCount = data?.length || 0

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `${deletedCount}개의 오래된 저장된 결과가 삭제되었습니다.`
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}

