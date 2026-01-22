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
  thumbnail_video_url?: string // 컨텐츠명 동영상 썸네일 (WebM 파일명, 확장자 제외)
  price?: string
  summary?: string
  introduction?: string
  recommendation?: string
  menu_composition?: string // 상품 메뉴 구성 HTML
  menu_subtitle?: string
  interpretation_tool?: string
  subtitle_char_count?: number
  detail_menu_char_count?: number
  menu_font_size?: number
  menu_font_bold?: boolean
  subtitle_font_size?: number
  subtitle_font_bold?: boolean
  detail_menu_font_size?: number
  detail_menu_font_bold?: boolean
  body_font_size?: number
  body_font_bold?: boolean
  font_face?: string // 웹폰트 CSS (@font-face) - 하위 호환성
  menu_font_face?: string // 대메뉴 웹폰트 CSS
  subtitle_font_face?: string // 소메뉴 웹폰트 CSS
  detail_menu_font_face?: string // 상세메뉴 웹폰트 CSS
  body_font_face?: string // 본문 웹폰트 CSS
  menu_color?: string // 대메뉴 컬러
  subtitle_color?: string // 소메뉴 컬러
  detail_menu_color?: string // 상세메뉴 컬러
  body_color?: string // 본문 컬러
  menu_items?: Array<{
    id: number
    value: string
    thumbnail?: string // 하위 호환성(이전 저장 구조)
    thumbnail_image_url?: string
    thumbnail_video_url?: string
    subtitles?: Array<{
      id: number
      subtitle: string
      interpretation_tool: string
      thumbnail?: string // 하위 호환성
      thumbnail_image_url?: string
      thumbnail_video_url?: string
      detailMenus?: Array<{
        id: number
        detailMenu: string
        interpretation_tool: string
        thumbnail?: string // 하위 호환성
        thumbnail_image_url?: string
        thumbnail_video_url?: string
      }>
    }>
  }>
  is_new?: boolean
  is_exposed?: boolean
  tts_speaker?: string // TTS 화자 (nara, jinho, mijin, nhajun, ndain)
  tts_provider?: 'naver' | 'typecast' // TTS 제공자
  typecast_voice_id?: string // Typecast voice id (tc_...)
  preview_thumbnails?: string[] // 재회상품 미리보기 썸네일 배열 (최대 3개)
  preview_thumbnails_video?: string[] // 재회상품 미리보기 동영상 썸네일 배열 (WebM 파일명, 확장자 제외)
  book_cover_thumbnail?: string // 북커버 이미지 썸네일 (첫 번째 대제목 전, 9:16 비율)
  book_cover_thumbnail_video?: string // 북커버 동영상 썸네일 (WebM 파일명, 확장자 제외)
  ending_book_cover_thumbnail?: string // 엔딩북커버 이미지 썸네일 (마지막 대제목 밑, 9:16 비율)
  ending_book_cover_thumbnail_video?: string // 엔딩북커버 동영상 썸네일 (WebM 파일명, 확장자 제외)
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
    throw error
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
    throw error
  }
  
  // menu_items와 preview_thumbnails가 JSONB 문자열인 경우 파싱
  if (data) {
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
      // 배열이 아닌 경우 빈 배열로 설정
      if (!Array.isArray(data.preview_thumbnails)) {
        data.preview_thumbnails = []
      }
    } else {
      data.preview_thumbnails = []
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
    
    // 기존 데이터 로드하여 사용되지 않는 썸네일 찾기
    try {
      const { data: existingData } = await supabase
        .from('contents')
        .select('menu_items, thumbnail_url, preview_thumbnails, book_cover_thumbnail, ending_book_cover_thumbnail')
        .eq('id', contentData.id)
        .single()
      
      if (existingData) {
        // 사용되지 않는 썸네일 찾기 및 삭제
        const extractThumbnailUrls = (items: any[]): string[] => {
          const urls: string[] = []
          items?.forEach((item: any) => {
            if (item.thumbnail) urls.push(item.thumbnail)
            if (item.subtitles) {
              item.subtitles.forEach((sub: any) => {
                if (sub.thumbnail) urls.push(sub.thumbnail)
              })
            }
          })
          return urls
        }
        
        // 기존 썸네일 URL 수집
        const existingThumbnails = new Set<string>()
        if (existingData.thumbnail_url) existingThumbnails.add(existingData.thumbnail_url)
        if (existingData.book_cover_thumbnail) existingThumbnails.add(existingData.book_cover_thumbnail)
        if (existingData.ending_book_cover_thumbnail) existingThumbnails.add(existingData.ending_book_cover_thumbnail)
        if (existingData.preview_thumbnails) {
          const previewThumbs = typeof existingData.preview_thumbnails === 'string' 
            ? JSON.parse(existingData.preview_thumbnails) 
            : existingData.preview_thumbnails
          previewThumbs?.forEach((thumb: string) => {
            if (thumb) existingThumbnails.add(thumb)
          })
        }
        if (existingData.menu_items) {
          const existingMenuItems = typeof existingData.menu_items === 'string'
            ? JSON.parse(existingData.menu_items)
            : existingData.menu_items
          extractThumbnailUrls(existingMenuItems || []).forEach(url => existingThumbnails.add(url))
        }
        
        // 새로운 썸네일 URL 수집
        const newThumbnails = new Set<string>()
        if (contentData.thumbnail_url) newThumbnails.add(contentData.thumbnail_url)
        if (contentData.book_cover_thumbnail) newThumbnails.add(contentData.book_cover_thumbnail)
        if (contentData.ending_book_cover_thumbnail) newThumbnails.add(contentData.ending_book_cover_thumbnail)
        if (contentData.preview_thumbnails) {
          contentData.preview_thumbnails.forEach((thumb: string) => {
            if (thumb) newThumbnails.add(thumb)
          })
        }
        if (menu_items) {
          extractThumbnailUrls(menu_items).forEach(url => newThumbnails.add(url))
        }
        
        // 사용되지 않는 썸네일 찾기
        const unusedThumbnails = Array.from(existingThumbnails).filter(url => !newThumbnails.has(url))
        
        // 사용되지 않는 썸네일 삭제
        if (unusedThumbnails.length > 0) {
          for (const thumbnailUrl of unusedThumbnails) {
            try {
              // URL에서 파일 경로 추출
              let filePath = ''
              if (thumbnailUrl.includes('/storage/v1/object/public/thumbnails/')) {
                const parts = thumbnailUrl.split('/storage/v1/object/public/thumbnails/')
                if (parts.length > 1) {
                  filePath = `thumbnails/${parts[1].split('?')[0]}` // 쿼리 파라미터 제거
                }
              } else if (thumbnailUrl.includes('thumbnails/')) {
                const parts = thumbnailUrl.split('thumbnails/')
                if (parts.length > 1) {
                  filePath = `thumbnails/${parts[1].split('?')[0]}`
                }
              }
              
              if (filePath) {
                await deleteThumbnail(filePath)
              }
            } catch (error) {
              // 삭제 실패해도 저장은 계속 진행
            }
          }
        }
      }
    } catch (error) {
      // 기존 데이터 로드 실패해도 저장은 계속 진행
    }
    
    const { data, error } = await supabase
      .from('contents')
      .update(dataToSave)
      .eq('id', contentData.id)
      .select()
    
    if (error) {
      throw new Error(`저장에 실패했습니다: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      throw new Error('저장에 실패했습니다: 업데이트 결과를 가져올 수 없습니다. RLS 정책을 확인하세요.')
    }
    
    const result = data[0]
    return result
  } else {
    // 새로 생성
    const { data, error } = await supabase
      .from('contents')
      .insert({
        ...dataToSave,
        created_at: new Date().toISOString(),
      })
      .select()
    
    if (error) {
      throw new Error(`저장에 실패했습니다: ${error.message}`)
    }
    
    if (!data || data.length === 0) {
      throw new Error('저장에 실패했습니다: 생성 결과를 가져올 수 없습니다. RLS 정책을 확인하세요.')
    }
    
    const result = data[0]
    return result
  }
}

// 컨텐츠 삭제
export async function deleteContent(id: number) {
  // 삭제 전에 모든 썸네일 찾기
  try {
    const { data: contentData } = await supabase
      .from('contents')
      .select('menu_items, thumbnail_url, preview_thumbnails, book_cover_thumbnail, ending_book_cover_thumbnail')
      .eq('id', id)
      .single()
    
    if (contentData) {
      // 모든 썸네일 URL 수집
      const allThumbnails: string[] = []
      
      // 메인 썸네일
      if (contentData.thumbnail_url) allThumbnails.push(contentData.thumbnail_url)
      
      // 북커버 썸네일
      if (contentData.book_cover_thumbnail) allThumbnails.push(contentData.book_cover_thumbnail)
      
      // 엔딩북커버 썸네일
      if (contentData.ending_book_cover_thumbnail) allThumbnails.push(contentData.ending_book_cover_thumbnail)
      
      // 미리보기 썸네일
      if (contentData.preview_thumbnails) {
        const previewThumbs = typeof contentData.preview_thumbnails === 'string'
          ? JSON.parse(contentData.preview_thumbnails)
          : contentData.preview_thumbnails
        if (Array.isArray(previewThumbs)) {
          previewThumbs.forEach((thumb: string) => {
            if (thumb) allThumbnails.push(thumb)
          })
        }
      }
      
      // menu_items의 썸네일
      if (contentData.menu_items) {
        const menuItems = typeof contentData.menu_items === 'string'
          ? JSON.parse(contentData.menu_items)
          : contentData.menu_items
        
        if (Array.isArray(menuItems)) {
          menuItems.forEach((item: any) => {
            // 메뉴 썸네일
            if (item.thumbnail) allThumbnails.push(item.thumbnail)
            
            // 소제목 썸네일
            if (item.subtitles && Array.isArray(item.subtitles)) {
              item.subtitles.forEach((sub: any) => {
                if (sub.thumbnail) allThumbnails.push(sub.thumbnail)
              })
            }
          })
        }
      }
      
      // 모든 썸네일 삭제
      for (const thumbnailUrl of allThumbnails) {
        try {
          // URL에서 파일 경로 추출
          let filePath = ''
          if (thumbnailUrl.includes('/storage/v1/object/public/thumbnails/')) {
            const parts = thumbnailUrl.split('/storage/v1/object/public/thumbnails/')
            if (parts.length > 1) {
              filePath = `thumbnails/${parts[1].split('?')[0]}` // 쿼리 파라미터 제거
            }
          } else if (thumbnailUrl.includes('thumbnails/')) {
            const parts = thumbnailUrl.split('thumbnails/')
            if (parts.length > 1) {
              filePath = `thumbnails/${parts[1].split('?')[0]}` // 쿼리 파라미터 제거
            }
          }
          
          if (filePath) {
            await deleteThumbnail(filePath)
          } else {
          }
        } catch (error) {
          // 삭제 실패해도 레코드 삭제는 계속 진행
        }
      }
    }
  } catch (error) {
    // 썸네일 삭제 실패해도 레코드 삭제는 계속 진행
  }
  
  // 레코드 삭제
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
    if (error.message.includes('new row violates row-level security') || 
        error.message.includes('permission denied') ||
        error.message.includes('row-level security')) {
      throw new Error('Storage 삭제 권한이 없습니다.\n\nSupabase 대시보드 → Storage → thumbnails → Policies에서 다음 정책을 추가하세요:\n\nCREATE POLICY "Allow public deletes"\nON storage.objects FOR DELETE\nTO public\nUSING (bucket_id = \'thumbnails\');')
    }
    throw error
  }
}

// 썸네일 업로드 (API 라우트를 통해 서버 사이드에서 업로드)
export async function uploadThumbnailFile(file: File): Promise<{ url: string; videoBaseName?: string; fileType: 'image' | 'video' }> {
  // 파일 타입 확인 (MIME 타입과 확장자 모두 확인)
  const fileExt = file.name.split('.').pop()?.toLowerCase() || ''
  const isImageByType = file.type.startsWith('image/')
  const isVideoByType = file.type === 'video/webm'
  const isImageByExt = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExt)
  const isVideoByExt = ['webm'].includes(fileExt)
  
  const isImage = isImageByType || isImageByExt
  const isVideo = isVideoByType || isVideoByExt
  
  // 파일 크기 제한 (동영상은 50MB, 이미지는 10MB)
  const maxSize = isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024
  if (file.size > maxSize) {
    throw new Error(isVideo ? '동영상 파일 크기는 50MB를 초과할 수 없습니다.' : '이미지 파일 크기는 10MB를 초과할 수 없습니다.')
  }

  // API 라우트를 통해 업로드 (서버 사이드에서 서비스 롤 키 사용)
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch('/api/admin/upload', {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    // Content-Type 확인
    const contentType = response.headers.get('content-type')
    let errorMessage = '파일 업로드에 실패했습니다.'
    
    if (contentType && contentType.includes('application/json')) {
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch (e) {
        // JSON 파싱 실패
        errorMessage = `업로드 실패 (상태 코드: ${response.status})`
      }
    } else {
      // HTML 응답인 경우
      const text = await response.text()
      if (text.includes('관리자 권한이 필요합니다')) {
        errorMessage = '관리자 권한이 필요합니다. 로그인 후 다시 시도해주세요.'
      } else {
        errorMessage = `업로드 실패 (상태 코드: ${response.status})`
      }
    }
    throw new Error(errorMessage)
  }

  // 성공 응답 처리
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text()
    throw new Error(`서버 응답 형식 오류: ${text.substring(0, 100)}`)
  }

  const data = await response.json()
  return {
    url: data.url,
    videoBaseName: data.videoBaseName,
    fileType: data.fileType || (isVideo ? 'video' : 'image')
  }
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
      return 'gemini-3-flash-preview'
    }
    
    return data?.selected_model || 'gemini-3-flash-preview'
  } catch (e) {
    return 'gemini-3-flash-preview'
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
        throw error
      }
    }
    
    return true
  } catch (e) {
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
      return 'nara'
    }
    
    return data?.selected_speaker || 'nara'
  } catch (e) {
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
        throw error
      }
    }
    
    return true
  } catch (e) {
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
      return 'batch'
    }

    const mode = (data as any)?.fortune_view_mode
    return mode === 'realtime' ? 'realtime' : 'batch'
  } catch (e) {
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
        throw error
      }
    } else {
      const { error } = await supabase
        .from('app_settings')
        .insert({ id: 1, ...payload })

      if (error) {
        throw error
      }
    }
    
    return true
  } catch (e) {
    throw e
  }
}

// 병렬/직렬 점사 모드 조회
export async function getUseSequentialFortune(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('use_sequential_fortune')
      .eq('id', 1)
      .single()

    if (error) {
      return false // 기본값: 병렬점사 (false)
    }

    const useSequential = (data as any)?.use_sequential_fortune
    return useSequential === true // true면 직렬점사, false면 병렬점사
  } catch (e) {
    return false // 기본값: 병렬점사
  }
}


