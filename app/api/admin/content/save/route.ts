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

  }
}

