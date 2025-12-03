import { supabase } from './supabase'

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
  menu_items?: Array<{ id: number; value: string; thumbnail?: string }>
  is_new?: boolean
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
  // menu_items를 JSONB 형식으로 변환
  const { menu_items, ...restData } = contentData
  const dataToSave = {
    ...restData,
    menu_items: menu_items ? JSON.stringify(menu_items) : null,
    updated_at: new Date().toISOString(),
  }

  if (contentData.id) {
    // 업데이트
    const { data, error } = await supabase
      .from('contents')
      .update(dataToSave)
      .eq('id', contentData.id)
      .select()
      .single()
    
    if (error) {
      console.error('Supabase 업데이트 에러:', error)
      console.error('저장하려는 데이터:', dataToSave)
      throw new Error(`저장에 실패했습니다: ${error.message}`)
    }
    return data
  } else {
    // 새로 생성
    const { data, error } = await supabase
      .from('contents')
      .insert({
        ...dataToSave,
        created_at: new Date().toISOString(),
      })
      .select()
      .single()
    
    if (error) {
      console.error('Supabase 삽입 에러:', error)
      console.error('저장하려는 데이터:', dataToSave)
      throw new Error(`저장에 실패했습니다: ${error.message}`)
    }
    return data
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

// 썸네일 업로드 (파일명 자동 생성)
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

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
  const filePath = fileName // thumbnails/ 접두사 제거 (버킷 이름이 thumbnails이므로)

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('thumbnails')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false
    })

  if (uploadError) {
    console.error('Supabase 업로드 에러:', uploadError)
    // 더 구체적인 에러 메시지 제공
    if (uploadError.message.includes('Bucket not found')) {
      throw new Error('thumbnails 버킷이 존재하지 않습니다. Supabase Storage에서 버킷을 생성해주세요.')
    } else if (uploadError.message.includes('new row violates row-level security') || 
               uploadError.message.includes('permission denied') ||
               uploadError.message.includes('row-level security')) {
      throw new Error('Storage 권한이 없습니다.\n\nSupabase 대시보드 → Storage → thumbnails → Policies에서 다음 정책을 추가하세요:\n\nCREATE POLICY "Allow public uploads"\nON storage.objects FOR INSERT\nTO public\nWITH CHECK (bucket_id = \'thumbnails\');')
    } else if (uploadError.message.includes('duplicate')) {
      throw new Error('이미 같은 이름의 파일이 존재합니다.')
    }
    throw new Error(uploadError.message || '파일 업로드에 실패했습니다.')
  }

  const { data: urlData } = supabase.storage
    .from('thumbnails')
    .getPublicUrl(filePath)

  if (!urlData?.publicUrl) {
    throw new Error('업로드된 파일의 URL을 가져올 수 없습니다.')
  }

  return urlData.publicUrl
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

