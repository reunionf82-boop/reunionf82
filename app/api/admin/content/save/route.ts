import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'

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
      updated_at: getKSTNow(), // KST 기준으로 저장
    }

    if (id) {
      // 업데이트
      // payment_code는 변경 불가 (이미 설정된 경우 유지)
      if (dataToSave.payment_code === undefined || dataToSave.payment_code === null) {
        // payment_code가 전달되지 않은 경우 기존 값 유지
        delete dataToSave.payment_code
      }
      
      // 북커버/엔딩북커버 썸네일 보호: 빈 문자열이면 기존 값 유지
      // 먼저 기존 레코드를 조회하여 현재 값 확인
      const { data: existingContent } = await supabase
        .from('contents')
        .select('book_cover_thumbnail, book_cover_thumbnail_video, ending_book_cover_thumbnail, ending_book_cover_thumbnail_video, menu_items')
        .eq('id', id)
        .single()
      
      // 북커버/엔딩북커버 썸네일이 빈 문자열이거나 undefined/null이면 기존 값으로 유지
      if (existingContent) {
        if (!dataToSave.book_cover_thumbnail || dataToSave.book_cover_thumbnail.trim() === '') {
          if (existingContent.book_cover_thumbnail) {
            dataToSave.book_cover_thumbnail = existingContent.book_cover_thumbnail
          } else {
            delete dataToSave.book_cover_thumbnail
          }
        }
        
        if (!dataToSave.book_cover_thumbnail_video || dataToSave.book_cover_thumbnail_video.trim() === '') {
          if (existingContent.book_cover_thumbnail_video) {
            dataToSave.book_cover_thumbnail_video = existingContent.book_cover_thumbnail_video
          } else {
            delete dataToSave.book_cover_thumbnail_video
          }
        }
        
        if (!dataToSave.ending_book_cover_thumbnail || dataToSave.ending_book_cover_thumbnail.trim() === '') {
          if (existingContent.ending_book_cover_thumbnail) {
            dataToSave.ending_book_cover_thumbnail = existingContent.ending_book_cover_thumbnail
          } else {
            delete dataToSave.ending_book_cover_thumbnail
          }
        }
        
        if (!dataToSave.ending_book_cover_thumbnail_video || dataToSave.ending_book_cover_thumbnail_video.trim() === '') {
          if (existingContent.ending_book_cover_thumbnail_video) {
            dataToSave.ending_book_cover_thumbnail_video = existingContent.ending_book_cover_thumbnail_video
          } else {
            delete dataToSave.ending_book_cover_thumbnail_video
          }
        }
      }

      if (existingContent && menu_items) {
        const ensureString = (value: any) => (typeof value === 'string' ? value : '')
        const pickIfEmpty = (incoming: any, fallback: any) => {
          const incomingValue = ensureString(incoming).trim()
          if (incomingValue !== '') return incomingValue
          const fallbackValue = ensureString(fallback).trim()
          return fallbackValue !== '' ? fallbackValue : incomingValue
        }

        const existingMenuItemsRaw = existingContent.menu_items
        const existingMenuItems = typeof existingMenuItemsRaw === 'string'
          ? (() => {
              try {
                return JSON.parse(existingMenuItemsRaw)
              } catch {
                return []
              }
            })()
          : existingMenuItemsRaw

        if (Array.isArray(existingMenuItems) && Array.isArray(menu_items)) {
          const mergedMenuItems = menu_items.map((item: any, index: number) => {
            const existingItem = existingMenuItems[index] || {}
            const mergedItem = { ...item }

            mergedItem.thumbnail_image_url = pickIfEmpty(
              mergedItem.thumbnail_image_url,
              existingItem.thumbnail_image_url || existingItem.thumbnail
            )
            mergedItem.thumbnail_video_url = pickIfEmpty(
              mergedItem.thumbnail_video_url,
              existingItem.thumbnail_video_url || existingItem.thumbnail_video
            )

            if (Array.isArray(mergedItem.subtitles)) {
              mergedItem.subtitles = mergedItem.subtitles.map((sub: any, subIndex: number) => {
                const existingSub = (existingItem.subtitles || [])[subIndex] || {}
                const mergedSub = { ...sub }

                mergedSub.thumbnail_image_url = pickIfEmpty(
                  mergedSub.thumbnail_image_url,
                  existingSub.thumbnail_image_url || existingSub.thumbnail
                )
                mergedSub.thumbnail_video_url = pickIfEmpty(
                  mergedSub.thumbnail_video_url,
                  existingSub.thumbnail_video_url || existingSub.thumbnail_video
                )

                if (Array.isArray(mergedSub.detailMenus)) {
                  mergedSub.detailMenus = mergedSub.detailMenus.map((dm: any, dmIndex: number) => {
                    const existingDm = (existingSub.detailMenus || [])[dmIndex] || {}
                    const mergedDm = { ...dm }

                    mergedDm.thumbnail_image_url = pickIfEmpty(
                      mergedDm.thumbnail_image_url,
                      existingDm.thumbnail_image_url || existingDm.thumbnail
                    )
                    mergedDm.thumbnail_video_url = pickIfEmpty(
                      mergedDm.thumbnail_video_url,
                      existingDm.thumbnail_video_url || existingDm.thumbnail_video
                    )

                    return mergedDm
                  })
                }

                return mergedSub
              })
            }

            return mergedItem
          })

          dataToSave.menu_items = JSON.stringify(mergedMenuItems)
        }
      }
      
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
      
      // payment_code 자동 부여 (없는 경우에만)
      if (!dataWithoutId.payment_code || dataWithoutId.payment_code === '') {
        // 기존 컨텐츠의 모든 payment_code를 가져와서 Set으로 변환 (빠른 조회를 위해)
        const { data: existingCodes } = await supabase
          .from('contents')
          .select('payment_code')
          .not('payment_code', 'is', null)
        
        // 존재하는 payment_code를 Set으로 변환 (빠른 조회를 위해)
        const existingCodeSet = new Set<string>()
        if (existingCodes && existingCodes.length > 0) {
          existingCodes.forEach(item => {
            if (item.payment_code) {
              const code = String(item.payment_code).trim()
              // 1000-9999 범위의 코드만 고려
              const num = parseInt(code, 10)
              if (!isNaN(num) && num >= 1000 && num <= 9999) {
                existingCodeSet.add(code.padStart(4, '0')) // 4자리로 정규화
              }
            }
          })
        }
        
        // 1001부터 순차적으로 증가하면서 DB에 없는 첫 번째 값 찾기
        let nextCode = 1001
        while (nextCode <= 9999) {
          const codeStr = String(nextCode).padStart(4, '0')
          if (!existingCodeSet.has(codeStr)) {
            // 이 코드가 DB에 없으므로 사용 가능
            break
          }
          nextCode++
        }
        
        // 9999를 넘으면 에러 발생 (VARCHAR(4) 제한)
        if (nextCode > 9999) {
          return NextResponse.json(
            { error: '저장에 실패했습니다: 결제 코드가 최대값(9999)을 초과했습니다. 관리자에게 문의하세요.' },
            { status: 500 }
          )
        }
        
        // 4자리로 포맷팅 (예: 1001, 1002, ...)
        dataWithoutId.payment_code = String(nextCode).padStart(4, '0')
      } else {
        // 클라이언트에서 payment_code를 전송한 경우, 4글자 제한 검증
        const paymentCodeStr = String(dataWithoutId.payment_code).trim()
        if (paymentCodeStr.length > 4) {
          return NextResponse.json(
            { error: '저장에 실패했습니다: 결제 코드는 4글자 이하여야 합니다.' },
            { status: 400 }
          )
        }
        // 4글자 이하로 제한
        dataWithoutId.payment_code = paymentCodeStr.substring(0, 4)
      }
      
      const { data, error } = await supabase
        .from('contents')
        .insert({
          ...dataWithoutId,
          created_at: getKSTNow(), // KST 기준으로 저장
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

