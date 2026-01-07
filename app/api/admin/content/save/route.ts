import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 서버 사이드에서만 서비스 롤 키 사용
function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 서비스 롤 키가 설정되지 않았습니다. .env.local 파일에 SUPABASE_SERVICE_ROLE_KEY를 설정하세요.')
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
    const supabase = getSupabaseClient()
    const body = await req.json()
    const { id, menu_items, preview_thumbnails, ...restData } = body

    const dataToSave = {
      ...restData,
      menu_items: menu_items ? JSON.stringify(menu_items) : null,
      preview_thumbnails: preview_thumbnails ? (Array.isArray(preview_thumbnails) ? JSON.stringify(preview_thumbnails) : preview_thumbnails) : '[]',
      updated_at: new Date().toISOString(),
    }


    if (id) {
      // 업데이트
      const { data, error } = await supabase
        .from('contents')
        .update(dataToSave)
        .eq('id', id)
        .select()

      if (error) {
        return NextResponse.json(
          { error: `저장에 실패했습니다: ${error.message}` },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: '저장에 실패했습니다: 업데이트 결과를 가져올 수 없습니다.' },
          { status: 500 }
        )
      }

      // menu_items와 preview_thumbnails 파싱
      const result = data[0]
      if (result.menu_items && typeof result.menu_items === 'string') {
        try {
          result.menu_items = JSON.parse(result.menu_items)
        } catch (e) {
          result.menu_items = []
        }
      }
      // preview_thumbnails 파싱
      if (result.preview_thumbnails) {
        if (typeof result.preview_thumbnails === 'string') {
          try {
            result.preview_thumbnails = JSON.parse(result.preview_thumbnails)
          } catch (e) {
            result.preview_thumbnails = []
          }
        }
        if (!Array.isArray(result.preview_thumbnails)) {
          result.preview_thumbnails = []
        }
      } else {
        result.preview_thumbnails = []
      }

      return NextResponse.json({ data: result })
    } else {
      // 새로 생성 - id 필드 제거 (자동 생성되도록)
      const { id: _, ...dataWithoutId } = dataToSave
      const { data, error } = await supabase
        .from('contents')
        .insert({
          ...dataWithoutId,
          created_at: new Date().toISOString(),
        })
        .select()

      if (error) {
        return NextResponse.json(
          { error: `저장에 실패했습니다: ${error.message}` },
          { status: 500 }
        )
      }

      if (!data || data.length === 0) {
        return NextResponse.json(
          { error: '저장에 실패했습니다: 생성 결과를 가져올 수 없습니다.' },
          { status: 500 }
        )
      }

      // menu_items와 preview_thumbnails 파싱
      const result = data[0]
      if (result.menu_items && typeof result.menu_items === 'string') {
        try {
          result.menu_items = JSON.parse(result.menu_items)
        } catch (e) {
          result.menu_items = []
        }
      }
      // preview_thumbnails 파싱
      if (result.preview_thumbnails) {
        if (typeof result.preview_thumbnails === 'string') {
          try {
            result.preview_thumbnails = JSON.parse(result.preview_thumbnails)
          } catch (e) {
            result.preview_thumbnails = []
          }
        }
        if (!Array.isArray(result.preview_thumbnails)) {
          result.preview_thumbnails = []
        }
      } else {
        result.preview_thumbnails = []
      }

      return NextResponse.json({ data: result })
    }
  } catch (error: any) {
    const errorMessage = error?.message || '저장 중 오류가 발생했습니다.'
    return NextResponse.json(
      { error: errorMessage },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        }
      }
    )
  }
}

