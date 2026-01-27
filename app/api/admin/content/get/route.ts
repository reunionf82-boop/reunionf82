import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 서버 사이드에서만 서비스 롤 키 사용
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다.')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

export async function POST(req: NextRequest) {
  try {
    // 관리자 인증 확인
    const cookieStore = await req.cookies
    const session = cookieStore.get('admin_session')

    if (session?.value !== 'authenticated') {
      return NextResponse.json(
        { error: '관리자 권한이 필요합니다.' },
        { 
          status: 401,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    const body = await req.json().catch(() => ({}))
    const { id } = body

    if (!id) {
      return NextResponse.json(
        { error: '컨텐츠 ID가 필요합니다.' },
        { 
          status: 400,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }

    const supabase = getSupabaseClient()
    
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      return NextResponse.json(
        { error: error.message || '컨텐츠를 가져오는데 실패했습니다.' },
        { 
          status: 500,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }
    
    if (!data) {
      return NextResponse.json(
        { error: '컨텐츠를 찾을 수 없습니다.' },
        { 
          status: 404,
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        }
      )
    }
    
    // menu_items와 preview_thumbnails가 JSONB 문자열인 경우 파싱
    if (data.menu_items && typeof data.menu_items === 'string') {
      try {
        data.menu_items = JSON.parse(data.menu_items)
      } catch (e) {
        data.menu_items = []
      }
    }
    
    // preview_thumbnails 파싱
    if (data.preview_thumbnails) {
      if (typeof data.preview_thumbnails === 'string') {
        try {
          data.preview_thumbnails = JSON.parse(data.preview_thumbnails)
        } catch (e) {
          data.preview_thumbnails = []
        }
      }
      if (!Array.isArray(data.preview_thumbnails)) {
        data.preview_thumbnails = []
      }
    } else {
      data.preview_thumbnails = []
    }
    
    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '컨텐츠를 가져오는 중 오류가 발생했습니다.' },
      { 
        status: 500,
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    )
  }
}
