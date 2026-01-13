import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import { getKSTNow } from '@/lib/payment-utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { content_id, review_text, user_name, image_url, title } = body

    if ((!content_id && !title) || !review_text || review_text.trim() === '') {
      return NextResponse.json(
        { error: '컨텐츠 ID 또는 제목, 그리고 리뷰 내용은 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()
    
    let actualContentId: number | null = null
    
    // content_id가 있으면 먼저 확인
    if (content_id) {
      const contentIdNum = parseInt(content_id)
      console.log('[reviews/create] 저장 시도 - content_id:', contentIdNum)
      
      const { data: contentExists, error: contentCheckError } = await supabase
        .from('contents')
        .select('id')
        .eq('id', contentIdNum)
        .maybeSingle()
      
      if (contentCheckError) {
        console.error('[reviews/create] content 확인 오류:', contentCheckError)
        return NextResponse.json(
          { error: '컨텐츠 확인 중 오류가 발생했습니다.', details: contentCheckError.message },
          { status: 500 }
        )
      }
      
      if (contentExists && contentExists.id) {
        actualContentId = contentExists.id
        console.log('[reviews/create] content_id 유효함:', actualContentId)
      } else {
        console.warn('[reviews/create] 존재하지 않는 content_id:', contentIdNum)
      }
    }
    
    // content_id가 유효하지 않으면 title로 찾기 시도
    if (!actualContentId && title) {
      console.log('[reviews/create] title로 content_id 찾기 시도:', title)
      const { data: contentByTitle, error: titleSearchError } = await supabase
        .from('contents')
        .select('id, content_name')
        .ilike('content_name', `%${title.trim()}%`)
        .limit(1)
        .maybeSingle()
      
      if (titleSearchError) {
        console.error('[reviews/create] title 검색 오류:', titleSearchError)
      } else if (contentByTitle && contentByTitle.id) {
        actualContentId = contentByTitle.id
        console.log('[reviews/create] title로 content_id 찾음:', actualContentId)
      } else {
        console.warn('[reviews/create] title로도 content를 찾을 수 없음:', title)
      }
    }
    
    if (!actualContentId) {
      return NextResponse.json(
        { error: '컨텐츠를 찾을 수 없습니다. 관리자에게 문의해주세요.' },
        { status: 400 }
      )
    }
    
    const insertData: any = {
      content_id: actualContentId,
      review_text: review_text.trim(),
      user_name: user_name || null,
      is_visible: false, // 기본값은 노출 안 함 (관리자 승인 필요)
      is_best: false,
      created_at: getKSTNow() // KST 기준으로 저장
    }
    
    // image_url이 있으면 추가
    if (image_url) {
      insertData.image_url = image_url
    }
    
    console.log('[reviews/create] insertData:', JSON.stringify(insertData, null, 2))
    
    const { data, error } = await supabase
      .from('reviews')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[reviews/create] error:', error)
      console.error('[reviews/create] error details:', JSON.stringify(error, null, 2))
      console.error('[reviews/create] error code:', error.code)
      console.error('[reviews/create] error hint:', error.hint)
      return NextResponse.json(
        { error: '리뷰 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }
    
    console.log('[reviews/create] 저장 성공:', data)

    return NextResponse.json({
      success: true,
      review: data
    })
  } catch (error: any) {
    console.error('[reviews/create] exception:', error)
    return NextResponse.json(
      { error: error.message || '리뷰 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}
