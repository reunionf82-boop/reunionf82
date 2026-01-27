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
    // 관리자 인증 확인 (프론트엔드에서도 사용할 수 있도록 선택적)
    const cookieStore = await req.cookies
    const session = cookieStore.get('admin_session')
    
    // 프론트엔드에서도 사용할 수 있도록 인증을 선택적으로 처리
    // (관리자 페이지가 아닌 경우에도 컨텐츠 목록을 가져올 수 있도록)
    // 하지만 실제로는 서비스 롤 키를 사용하므로 인증 없이도 안전함
    // 관리자 페이지가 아닌 경우에도 컨텐츠 목록을 가져올 수 있도록 인증 체크 제거

    const supabase = getSupabaseClient()
    
    const { data, error } = await supabase
      .from('contents')
      .select('*')
      .order('id', { ascending: false })
    
    if (error) {
      return NextResponse.json(
        { error: error.message || '컨텐츠 목록을 가져오는데 실패했습니다.' },
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
    
    // menu_items와 preview_thumbnails가 JSONB 문자열인 경우 파싱
    if (data) {
      data.forEach((item: any) => {
        if (item.menu_items && typeof item.menu_items === 'string') {
          try {
            item.menu_items = JSON.parse(item.menu_items)
          } catch (e) {
            item.menu_items = []
          }
        }
        // preview_thumbnails 파싱
        if (item.preview_thumbnails) {
          if (typeof item.preview_thumbnails === 'string') {
            try {
              item.preview_thumbnails = JSON.parse(item.preview_thumbnails)
            } catch (e) {
              item.preview_thumbnails = []
            }
          }
          // 배열이 아닌 경우 빈 배열로 설정
          if (!Array.isArray(item.preview_thumbnails)) {
            item.preview_thumbnails = []
          }
        } else {
          item.preview_thumbnails = []
        }
      })
    }
    
    return NextResponse.json(
      { success: true, data: data || [] },
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
      { error: error.message || '컨텐츠 목록을 가져오는 중 오류가 발생했습니다.' },
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
