import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { content_id } = body

    if (!content_id) {
      return NextResponse.json(
        { error: 'content_id는 필수입니다.' },
        { status: 400 }
      )
    }

    const supabase = getAdminSupabaseClient()

    const contentId = parseInt(content_id)
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

    let inserted = false
    const { data: insertData, error: insertError } = await supabase
      .from('daily_unique_content_views')
      .upsert({
        content_id: contentId,
        day,
        fingerprint_hash: fingerprintHash,
      }, { onConflict: 'content_id,day,fingerprint_hash', ignoreDuplicates: true })
      .select('id')

    if (insertError) {
      throw insertError
    }

    if (Array.isArray(insertData) && insertData.length > 0) {
      inserted = true
    }

    let totalCount = 0
    if (inserted) {
      // 현재 클릭 수 조회
      const { data: currentData } = await supabase
        .from('contents')
        .select('click_count')
        .eq('id', contentId)
        .single()

      const currentCount = (currentData?.click_count || 0) as number
      const { data: updatedData, error: updateError } = await supabase
        .from('contents')
        .update({ click_count: currentCount + 1 })
        .eq('id', contentId)
        .select('click_count')
        .single()

      if (updateError) {
        throw updateError
      }

      totalCount = updatedData?.click_count || currentCount + 1
    } else {
      const { data: currentData } = await supabase
        .from('contents')
        .select('click_count')
        .eq('id', contentId)
        .single()
      totalCount = (currentData?.click_count || 0) as number
    }

    const { count: dailyCount, error: countError } = await supabase
      .from('daily_unique_content_views')
      .select('*', { count: 'exact', head: true })
      .eq('content_id', contentId)
      .eq('day', day)

    if (countError) {
      throw countError
    }

    const response = NextResponse.json({
      success: true,
      daily_count: dailyCount || 0,
      total_count: totalCount,
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
      { error: error.message || '클릭 수 증가에 실패했습니다.' },
      { status: 500 }
    )
  }
}
