import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getKSTNow } from '@/lib/payment-utils'
import { logPaymentEvent } from '@/lib/payment-event-log'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { requestKey, savedId, phone, password, replaceRequestKey } = body

    if (!phone || !password) {
      return NextResponse.json(
        { error: '휴대폰 번호와 비밀번호는 필수입니다.' },
        { status: 400 }
      )
    }

    if (!requestKey && !savedId) {
      return NextResponse.json(
        { error: 'requestKey 또는 savedId 중 하나는 필수입니다.' },
        { status: 400 }
      )
    }

    // 60일 후 만료 시간 계산 (KST 기준)
    const nowKST = new Date(getKSTNow())
    const expiresAt = new Date(nowKST.getTime() + 60 * 24 * 60 * 60 * 1000) // 60일 후

    // 평문으로 저장 (encrypted_* 컬럼명은 유지)
    const plainPhone = String(phone).trim()
    const plainPassword = String(password).trim()

    const normalizedRequestKey = requestKey ? String(requestKey).trim() : ''
    const normalizedReplaceKey = replaceRequestKey ? String(replaceRequestKey).trim() : ''
    const hasRequestKey = normalizedRequestKey.length > 0

    // ✅ 결제 성공 후 점사 시작 시: 기존 pending_{oid} 행을 request_xxx로 교체 → 점사 완료 후 saved_id가 이 행에 기록됨 (나의 이용내역 조회 가능)
    if (hasRequestKey && normalizedReplaceKey) {
      const { data: replaceRows, error: replaceError } = await supabase
        .from('user_credentials')
        .select('id, request_key, saved_id')
        .eq('request_key', normalizedReplaceKey)
        .limit(1)

      if (!replaceError && replaceRows && replaceRows.length > 0) {
        const { data: updated, error: updateError } = await supabase
          .from('user_credentials')
          .update({
            request_key: normalizedRequestKey,
            encrypted_phone: plainPhone,
            encrypted_password: plainPassword,
            expires_at: expiresAt.toISOString()
          })
          .eq('id', replaceRows[0].id)
          .select()
          .single()
        if (!updateError && updated) {
          // 결제 건 연결: payment.request_key를 pending_oid → request_xxx로 갱신
          await supabase
            .from('payments')
            .update({ request_key: normalizedRequestKey, updated_at: getKSTNow() })
            .eq('request_key', normalizedReplaceKey)
          const oidFromReplace = normalizedReplaceKey.replace(/^pending_/, '')
          await logPaymentEvent(supabase, {
            oid: oidFromReplace || undefined,
            requestKey: normalizedReplaceKey,
            eventType: 'uc_replace_ok',
            success: true,
            meta: { newRequestKey: normalizedRequestKey }
          })
          return NextResponse.json({
            success: true,
            id: updated.id,
            requestKey: updated.request_key,
            savedId: updated.saved_id,
            updated: true
          })
        }
      }

      // 폴백: user_credentials에 pending_oid 행이 없어도(초기 저장 실패 등) payments.request_key는 갱신 → pending에서 빠져나감
      const { error: paymentUpdateError } = await supabase
        .from('payments')
        .update({ request_key: normalizedRequestKey, updated_at: getKSTNow() })
        .eq('request_key', normalizedReplaceKey)
      const oidFromReplace = normalizedReplaceKey.replace(/^pending_/, '')
      await logPaymentEvent(supabase, {
        oid: oidFromReplace || undefined,
        requestKey: normalizedReplaceKey,
        eventType: 'uc_replace_fallback',
        success: !paymentUpdateError,
        message: paymentUpdateError ? paymentUpdateError.message : undefined,
        meta: { hadReplaceRow: !!(replaceRows && replaceRows.length > 0) }
      })
      if (!paymentUpdateError) {
        // 신규 user_credentials 행은 아래 hasRequestKey 분기에서 생성됨
      }
    }

    if (hasRequestKey) {
      // ✅ request_key가 이미 존재하면 업데이트로 처리 (중복 생성 방지)
      const { data: existingRows, error: existingError } = await supabase
        .from('user_credentials')
        .select('id, request_key, saved_id')
        .eq('request_key', normalizedRequestKey)
        .order('created_at', { ascending: false })
        .limit(1)

      if (existingError) {
        return NextResponse.json(
          { error: '인증 정보 조회에 실패했습니다.', details: existingError.message },
          { status: 500 }
        )
      }

      if (existingRows && existingRows.length > 0) {
        const existing = existingRows[0]
        const updatePayload: Record<string, any> = {
          encrypted_phone: plainPhone,
          encrypted_password: plainPassword,
          expires_at: expiresAt.toISOString()
        }
        if (savedId) {
          updatePayload.saved_id = savedId
        }

        const { data: updated, error: updateError } = await supabase
          .from('user_credentials')
          .update(updatePayload)
          .eq('id', existing.id)
          .select()
          .single()

        if (updateError) {
          return NextResponse.json(
            { error: '인증 정보 업데이트에 실패했습니다.', details: updateError.message },
            { status: 500 }
          )
        }

        // 점사 완료: payment에 saved_id·fortune_status 반영 (다시보기 가능 상태 추적)
        if (savedId) {
          await supabase
            .from('payments')
            .update({
              saved_id: parseInt(String(savedId), 10),
              fortune_status: 'completed',
              updated_at: getKSTNow()
            })
            .eq('request_key', normalizedRequestKey)
        }

        return NextResponse.json({
          success: true,
          id: updated.id,
          requestKey: updated.request_key,
          savedId: updated.saved_id,
          updated: true
        })
      }
    }

    // DB에 저장 (KST 기준) - 신규 생성
    const { data, error } = await supabase
      .from('user_credentials')
      .insert({
        request_key: hasRequestKey ? normalizedRequestKey : null,
        saved_id: savedId || null,
        encrypted_phone: plainPhone,
        encrypted_password: plainPassword,
        created_at: getKSTNow(), // KST 기준으로 저장
        expires_at: expiresAt.toISOString() // KST 기준으로 계산된 만료 시간
      })
      .select()
      .single()

    if (error) {
      if (normalizedRequestKey.startsWith('pending_')) {
        const oidFromKey = normalizedRequestKey.replace(/^pending_/, '')
        await logPaymentEvent(supabase, {
          oid: oidFromKey || undefined,
          requestKey: normalizedRequestKey,
          eventType: 'uc_pending_failed',
          success: false,
          message: error.message
        })
      }
      return NextResponse.json(
        { error: '인증 정보 저장에 실패했습니다.', details: error.message },
        { status: 500 }
      )
    }
    if (normalizedRequestKey.startsWith('pending_')) {
      const oidFromKey = normalizedRequestKey.replace(/^pending_/, '')
      await logPaymentEvent(supabase, {
        oid: oidFromKey || undefined,
        requestKey: normalizedRequestKey,
        eventType: 'uc_pending_saved',
        success: true
      })
    }
    return NextResponse.json({
      success: true,
      id: data.id,
      requestKey: data.request_key,
      savedId: data.saved_id
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
