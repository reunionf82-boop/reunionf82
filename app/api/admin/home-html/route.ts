import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handleRequest() {
  const supabase = getAdminSupabaseClient()

  // app_settings에서 home_html 조회
  const { data, error } = await supabase
    .from('app_settings')
    .select('home_html, home_bg_color')
    .eq('id', 1)
    // ✅ id=1 행이 중복이어도 PostgREST의 single-coercion 에러를 피하기 위해 배열로 받고 첫 행만 사용
    .limit(1)

  // ✅ 에러를 200 + 빈 값으로 숨기면, 프론트/어드민에서 "저장한 코드가 사라짐"처럼 보임
  if (error) throw new Error(error.message || 'Failed to load home html')

  const row = Array.isArray(data) ? data[0] : null
  const homeHtml = typeof (row as any)?.home_html === 'string' ? String((row as any).home_html) : ''
  const homeBgColor = typeof (row as any)?.home_bg_color === 'string' ? String((row as any).home_bg_color) : ''
  return { home_html: homeHtml, home_bg_color: homeBgColor }
}

// ✅ POST 방식으로 조회 (캐시 우회)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    
    // 저장 요청인지 확인
    if (body.action === 'save' && body.home_html !== undefined) {
      // 저장 처리
      const supabase = getAdminSupabaseClient()
      const payload = { id: 1, home_html: body.home_html, home_bg_color: body.home_bg_color ?? null }

      // 1) 우선 upsert (정상적으로는 PK/UNIQUE(id) 기반으로 동작)
      let savedRow: any = null
      let updateError: any = null

      const upsertRes = await supabase
        .from('app_settings')
        .upsert(payload, { onConflict: 'id' })
        .select('home_html, home_bg_color')
        .limit(1)

      // PostgREST single-coercion 에러 방지: 배열로 받고 첫 행만 사용
      savedRow = Array.isArray(upsertRes.data) ? upsertRes.data[0] : null
      updateError = upsertRes.error

      // 2) 만약 app_settings.id에 UNIQUE/PK가 없어서 upsert가 실패하면 update→insert로 fallback
      if (updateError) {
        const msg = String(updateError?.message || '')
        const isConflictConstraintError =
          msg.toLowerCase().includes('on conflict') ||
          msg.toLowerCase().includes('no unique') ||
          msg.toLowerCase().includes('no unique or exclusion constraint') ||
          msg.toLowerCase().includes('there is no unique constraint')

        if (isConflictConstraintError) {
          // update 시도
          const updRes = await supabase
            .from('app_settings')
            .update({ home_html: body.home_html, home_bg_color: body.home_bg_color ?? null })
            .eq('id', 1)
            .select('home_html, home_bg_color')
            .limit(1)

          savedRow = Array.isArray(updRes.data) ? updRes.data[0] : null
          updateError = updRes.error

          // id=1 행이 없어서 update 결과가 없으면 insert 시도
          if (!updateError && !savedRow) {
            const insRes = await supabase
              .from('app_settings')
              .insert(payload)
              .select('home_html, home_bg_color')
              .limit(1)

            savedRow = Array.isArray(insRes.data) ? insRes.data[0] : null
            updateError = insRes.error

          }
        }
      }

      if (updateError) {
        const msg = String(updateError?.message || '')
        const hint =
          msg.toLowerCase().includes('column') && msg.toLowerCase().includes('does not exist')
            ? 'DB에 home_html/home_bg_color 컬럼이 없습니다. supabase-add-home-html.sql 및 supabase-add-home-bg-color.sql을 프로덕션 DB에 실행하세요.'
            : msg.toLowerCase().includes('on conflict') || msg.toLowerCase().includes('no unique')
              ? 'app_settings.id에 UNIQUE 또는 PRIMARY KEY가 필요합니다.'
              : ''
        return NextResponse.json(
          { error: '홈 HTML 저장에 실패했습니다.', details: msg, hint },
          { status: 500 }
        )
      }

      const resultHomeHtml =
        typeof (savedRow as any)?.home_html === 'string' ? String((savedRow as any).home_html) : String(body.home_html || '')
      const resultHomeBgColor =
        typeof (savedRow as any)?.home_bg_color === 'string' ? String((savedRow as any).home_bg_color) : String(body.home_bg_color ?? '')

      return NextResponse.json(
        { success: true, home_html: resultHomeHtml, home_bg_color: resultHomeBgColor },
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        }
      )
    }

    // 조회 요청
    const result = await handleRequest()
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    })
  } catch (e: any) {
    return NextResponse.json(
      { error: '홈 HTML 조회에 실패했습니다.', details: e?.message || '' },
      { status: 500 }
    )
  }
}
