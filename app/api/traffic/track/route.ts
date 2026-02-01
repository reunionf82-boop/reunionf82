import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_PAGES = new Set(['home', 'form'])

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any))
    const page = typeof body?.page === 'string' ? body.page.trim() : ''

    if (!ALLOWED_PAGES.has(page)) {
      return NextResponse.json(
        { error: 'page는 home 또는 form이어야 합니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    const now = new Date()
    const kstDate = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const day = kstDate.toISOString().slice(0, 10)

    const ipRaw = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
    const ip = ipRaw.split(',')[0]?.trim() || ''
    const userAgent = req.headers.get('user-agent') || ''

    const existingUid = req.cookies.get('f82_uid')?.value
    const uid = existingUid || crypto.randomUUID()
    const fingerprintHash = crypto
      .createHash('sha256')
      .update(`${uid}|${ip}|${userAgent}`)
      .digest('hex')

    const { data: uniqueInsertData, error: uniqueInsertError } = await supabase
      .from('daily_unique_page_views')
      .upsert(
        {
          page,
          day,
          fingerprint_hash: fingerprintHash,
        },
        { onConflict: 'page,day,fingerprint_hash', ignoreDuplicates: true }
      )
      .select('id')

    if (uniqueInsertError) {
      throw uniqueInsertError
    }

    const { data: existingCountData, error: existingCountError } = await supabase
      .from('daily_page_views')
      .select('view_count')
      .eq('page', page)
      .eq('day', day)
      .maybeSingle()

    if (existingCountError) {
      throw existingCountError
    }

    let updatedCount = 1
    if (existingCountData?.view_count !== undefined && existingCountData?.view_count !== null) {
      updatedCount = Number(existingCountData.view_count) + 1
      const { error: updateError } = await supabase
        .from('daily_page_views')
        .update({ view_count: updatedCount })
        .eq('page', page)
        .eq('day', day)

      if (updateError) {
        throw updateError
      }
    } else {
      const { error: insertError } = await supabase
        .from('daily_page_views')
        .insert({
          page,
          day,
          view_count: updatedCount,
        })

      if (insertError) {
        throw insertError
      }
    }

    const { count: uniqueDailyCount, error: uniqueCountError } = await supabase
      .from('daily_unique_page_views')
      .select('*', { count: 'exact', head: true })
      .eq('page', page)
      .eq('day', day)

    if (uniqueCountError) {
      throw uniqueCountError
    }

    const response = NextResponse.json({
      success: true,
      page,
      day,
      daily_views: updatedCount,
      daily_unique: uniqueDailyCount || 0,
      inserted_unique: Array.isArray(uniqueInsertData) && uniqueInsertData.length > 0,
    })

    if (!existingUid) {
      response.cookies.set('f82_uid', uid, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        httpOnly: true,
        sameSite: 'lax',
      })
    }

    return response
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '유입 추적에 실패했습니다.' },
      { status: 500 }
    )
  }
}
