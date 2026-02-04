import type { SupabaseClient } from '@supabase/supabase-js'

export type PaymentEventType =
  | 'payment_pending_saved'
  | 'payment_pending_failed'
  | 'payment_complete_ok'
  | 'payment_complete_not_found'
  | 'payment_complete_error'
  | 'uc_pending_saved'
  | 'uc_pending_failed'
  | 'uc_replace_ok'
  | 'uc_replace_fallback'
  | 'uc_replace_failed'

export interface PaymentEventParams {
  oid?: string | null
  requestKey?: string | null
  eventType: PaymentEventType
  success: boolean
  message?: string | null
  meta?: Record<string, unknown> | null
}

/**
 * 결제 흐름 추적 로그 (payment_events 테이블에 삽입).
 * 실패해도 결제/저장 로직에는 영향 주지 않도록 catch 후 무시.
 */
export async function logPaymentEvent(
  supabase: SupabaseClient,
  params: PaymentEventParams
): Promise<void> {
  try {
    await supabase.from('payment_events').insert({
      oid: params.oid || null,
      request_key: params.requestKey || null,
      event_type: params.eventType,
      success: params.success,
      message: params.message || null,
      meta: params.meta || null
    })
  } catch {
    // 로그 실패는 무시 (결제 플로우에 영향 없음)
  }
}
