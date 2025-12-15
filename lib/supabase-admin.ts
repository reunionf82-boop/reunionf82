import { createClient } from '@supabase/supabase-js'

// 관리자 페이지용 Supabase 클라이언트 (서비스 롤 키 사용)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    'Supabase 환경 변수가 설정되지 않았습니다.\n' +
    '.env.local 파일을 생성하고 다음 변수를 설정하세요:\n' +
    'NEXT_PUBLIC_SUPABASE_URL=your_supabase_url\n' +
    'SUPABASE_SERVICE_ROLE_KEY=your_service_role_key (또는 NEXT_PUBLIC_SUPABASE_ANON_KEY)'
  )
}

// 서비스 롤 키를 사용하여 RLS 우회
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export interface ContentData {
  id?: number
  role_prompt?: string
  restrictions?: string
  content_type?: 'saju' | 'gonghap'
  content_name?: string
  thumbnail_url?: string
  price?: string
  summary?: string
  introduction?: string
  recommendation?: string
  menu_subtitle?: string
  interpretation_tool?: string
  subtitle_char_count?: number
  menu_font_size?: number
  subtitle_font_size?: number
  body_font_size?: number
  font_face?: string // 웹폰트 CSS (@font-face)
  menu_items?: Array<{ id: number; value: string; thumbnail?: string }>
  is_new?: boolean
  tts_speaker?: string // TTS 화자 (nara, jinho, mijin, nhajun, ndain)
  created_at?: string
  updated_at?: string
}

// 컨텐츠 목록 가져오기
export async function getContents() {
  const { data, error } = await supabase
    .from('contents')
    .select('*')
    .order('id', { ascending: false })
  
  if (error) {
    console.error('Supabase 목록 조회 에러:', error)
    throw error
  }
  
  // menu_items가 JSONB 문자열인 경우 파싱
  if (data) {
    data.forEach((item: any) => {
      if (item.menu_items && typeof item.menu_items === 'string') {
        try {
          item.menu_items = JSON.parse(item.menu_items)
        } catch (e) {
          console.error('menu_items 파싱 에러:', e)
          item.menu_items = []
        }
      }
    })
  }
  
  return data
}

// 컨텐츠 가져오기 (ID로)
export async function getContentById(id: number) {
  const { data, error } = await supabase
    .from('contents')
    .select('*')
    .eq('id', id)
    .single()
  
  if (error) {
    console.error('Supabase 조회 에러:', error)
    throw error
  }
  
  // menu_items가 JSONB 문자열인 경우 파싱
  if (data && data.menu_items && typeof data.menu_items === 'string') {
    try {
      data.menu_items = JSON.parse(data.menu_items)
    } catch (e) {
      console.error('menu_items 파싱 에러:', e)
      data.menu_items = []
    }
  }
  
  return data
}

// 컨텐츠 저장/업데이트
export async function saveContent(contentData: ContentData) {
  console.log('=== Supabase: 컨텐츠 저장/업데이트 ===');
  console.log('contentData.id:', contentData.id);
  console.log('contentData.tts_speaker:', contentData.tts_speaker);
  
  // menu_items를 JSONB 형식으로 변환
  const { menu_items, ...restData } = contentData
  const dataToSave = {
    ...restData,
    menu_items: menu_items ? JSON.stringify(menu_items) : null,
    updated_at: new Date().toISOString(),
  }
  
  console.log('저장할 dataToSave.tts_speaker:', dataToSave.tts_speaker);

  if (contentData.id) {
    // 업데이트
    console.log('업데이트 모드: id =', contentData.id);
    const { data, error } = await supabase
      .from('contents')
      .update(dataToSave)
      .eq('id', contentData.id)
      .select()
    
    if (error) {
      console.error('Supabase 업데이트 에러:', error)
      console.error('저장하려는 데이터:', dataToSave)
      throw new Error(`저장에 실패했습니다: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      console.error('업데이트 결과가 없습니다. RLS 정책을 확인하세요.')
      throw new Error('저장에 실패했습니다: 업데이트 결과를 가져올 수 없습니다. RLS 정책을 확인하세요.')
    }
    
    const result = data[0]
    console.log('업데이트 완료, 반환된 data.tts_speaker:', result?.tts_speaker);
    console.log('==============================');
    return result
  } else {
    // 새로 생성
    console.log('생성 모드');
    const { data, error } = await supabase
      .from('contents')
      .insert({
        ...dataToSave,
        created_at: new Date().toISOString(),
      })
      .select()
    
    if (error) {
      console.error('Supabase 삽입 에러:', error)
      console.error('저장하려는 데이터:', dataToSave)
      throw new Error(`저장에 실패했습니다: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      console.error('생성 결과가 없습니다. RLS 정책을 확인하세요.')
      throw new Error('저장에 실패했습니다: 생성 결과를 가져올 수 없습니다. RLS 정책을 확인하세요.')
    }
    
    const result = data[0]
    console.log('생성 완료, 반환된 data.tts_speaker:', result?.tts_speaker);
    console.log('==============================');
    return result
  }
}

// 컨텐츠 삭제
export async function deleteContent(id: number) {
  const { error } = await supabase
    .from('contents')
    .delete()
    .eq('id', id)
  
  if (error) throw error
}

// 썸네일 이미지 업로드
export async function uploadThumbnail(file: File, contentId: number) {
  const fileExt = file.name.split('.').pop()
  const fileName = `${contentId}-${Date.now()}.${fileExt}`
  const filePath = `thumbnails/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('thumbnails')
    .upload(filePath, file)

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('thumbnails')
    .getPublicUrl(filePath)

  return data.publicUrl
}

// 썸네일 이미지 목록 가져오기
export async function getThumbnails() {
  const { data, error } = await supabase.storage
    .from('thumbnails')
    .list('', {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' },
    })

  if (error) throw error
  return data
}

// 썸네일 URL 가져오기
export function getThumbnailUrl(fileName: string) {
  const { data } = supabase.storage
    .from('thumbnails')
    .getPublicUrl(fileName)
  return data.publicUrl
}

// 썸네일 삭제
export async function deleteThumbnail(filePath: string) {
  // filePath에서 thumbnails/ 접두사 제거
  const fileName = filePath.replace(/^thumbnails\//, '')
  const { error } = await supabase.storage
    .from('thumbnails')
    .remove([fileName])
  
  if (error) {
    console.error('Supabase 삭제 에러:', error)
    if (error.message.includes('new row violates row-level security') || 
        error.message.includes('permission denied') ||
        error.message.includes('row-level security')) {
      throw new Error('Storage 삭제 권한이 없습니다.\n\nSupabase 대시보드 → Storage → thumbnails → Policies에서 다음 정책을 추가하세요:\n\nCREATE POLICY "Allow public deletes"\nON storage.objects FOR DELETE\nTO public\nUSING (bucket_id = \'thumbnails\');')
    }
    throw error
  }
}

// 썸네일 업로드 (API 라우트를 통해 서버 사이드에서 업로드)
export async function uploadThumbnailFile(file: File) {
  // 파일 크기 제한 (10MB)
  const maxSize = 10 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error('파일 크기는 10MB를 초과할 수 없습니다.')
  }

  // 파일 확장자 확인
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    throw new Error('지원하는 이미지 형식: JPEG, PNG, GIF, WebP')
  }

  // API 라우트를 통해 업로드 (서버 사이드에서 서비스 롤 키 사용)
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/admin/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '업로드에 실패했습니다.' }))
    throw new Error(errorData.error || '파일 업로드에 실패했습니다.')
  }

  const data = await response.json()
  return data.url
}

// 모델 설정 가져오기
export async function getSelectedModel(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('selected_model')
      .eq('id', 1)
      .single()
    
    if (error) {
      // 테이블이 없거나 레코드가 없으면 기본값 반환
      console.log('모델 설정 조회 실패, 기본값 사용:', error.message)
      return 'gemini-2.5-flash'
    }
    
    return data?.selected_model || 'gemini-2.5-flash'
  } catch (e) {
    console.error('모델 설정 조회 에러:', e)
    return 'gemini-2.5-flash'
  }
}

// 모델 설정 저장
export async function saveSelectedModel(model: string) {
  try {
    // 먼저 레코드가 있는지 확인
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id')
      .eq('id', 1)
      .single()
    
    if (existing) {
      // 업데이트
      const { error } = await supabase
        .from('app_settings')
        .update({ 
          selected_model: model,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
      
      if (error) {
        console.error('모델 설정 업데이트 에러:', error)
        throw error
      }
    } else {
      // 새로 생성
      const { error } = await supabase
        .from('app_settings')
        .insert({
          id: 1,
          selected_model: model,
          updated_at: new Date().toISOString()
        })
      
      if (error) {
        console.error('모델 설정 생성 에러:', error)
        throw error
      }
    }
    
    return true
  } catch (e) {
    console.error('모델 설정 저장 에러:', e)
    throw e
  }
}

// 화자 설정 가져오기
export async function getSelectedSpeaker(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('selected_speaker')
      .eq('id', 1)
      .single()
    
    if (error) {
      // 테이블이 없거나 레코드가 없으면 기본값 반환
      console.log('화자 설정 조회 실패, 기본값 사용:', error.message)
      return 'nara'
    }
    
    return data?.selected_speaker || 'nara'
  } catch (e) {
    console.error('화자 설정 조회 에러:', e)
    return 'nara'
  }
}

// 화자 설정 저장
export async function saveSelectedSpeaker(speaker: string) {
  try {
    // 먼저 레코드가 있는지 확인
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id')
      .eq('id', 1)
      .single()
    
    if (existing) {
      // 업데이트
      const { error } = await supabase
        .from('app_settings')
        .update({ 
          selected_speaker: speaker,
          updated_at: new Date().toISOString()
        })
        .eq('id', 1)
      
      if (error) {
        console.error('화자 설정 업데이트 에러:', error)
        throw error
      }
    } else {
      // 새로 생성
      const { error } = await supabase
        .from('app_settings')
        .insert({
          id: 1,
          selected_speaker: speaker,
          updated_at: new Date().toISOString()
        })
      
      if (error) {
        console.error('화자 설정 생성 에러:', error)
        throw error
      }
    }
    
    return true
  } catch (e) {
    console.error('화자 설정 저장 에러:', e)
    throw e
  }
}

// 점사 모드 조회 (batch | realtime)
export async function getFortuneViewMode(): Promise<'batch' | 'realtime'> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('fortune_view_mode')
      .eq('id', 1)
      .single()

    if (error) {
      console.log('점사 모드 조회 실패, 기본값 사용:', error.message)
      return 'batch'
    }

    const mode = (data as any)?.fortune_view_mode
    return mode === 'realtime' ? 'realtime' : 'batch'
  } catch (e) {
    console.error('점사 모드 조회 에러:', e)
    return 'batch'
  }
}

// 점사 모드 저장
export async function saveFortuneViewMode(mode: 'batch' | 'realtime') {
  try {
    const { data: existing } = await supabase
      .from('app_settings')
      .select('id')
      .eq('id', 1)
      .single()

    const payload = {
      fortune_view_mode: mode,
      updated_at: new Date().toISOString()
    }

    if (existing) {
      const { error } = await supabase
        .from('app_settings')
        .update(payload)
        .eq('id', 1)

      if (error) {
        console.error('점사 모드 업데이트 에러:', error)
        throw error
      }
    } else {
      const { error } = await supabase
        .from('app_settings')
        .insert({ id: 1, ...payload })

      if (error) {
        console.error('점사 모드 생성 에러:', error)
        throw error
      }
    }

    return true
  } catch (e) {
    console.error('점사 모드 저장 에러:', e)
    throw e
  }
}


