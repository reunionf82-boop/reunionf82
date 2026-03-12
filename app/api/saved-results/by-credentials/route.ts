import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { plainOrDecrypt } from '@/lib/encryption'

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

// 전화번호 정규화 함수 (하이픈 제거하여 비교)
function normalizePhone(phone: string): string {
  return phone.replace(/[-\s]/g, '')
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { phone, password } = body

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: '휴대폰 번호와 비밀번호는 필수입니다.' },
        { status: 400 }
      )
    }

    // 전화번호와 비밀번호 정규화 (공백 제거, 앞뒤 공백 제거)
    const normalizedPhone = normalizePhone(phone.trim())
    const normalizedPassword = password.trim()

    if (!normalizedPhone || !normalizedPassword) {
      return NextResponse.json(
        { success: false, error: '휴대폰 번호와 비밀번호는 필수입니다.' },
        { status: 400 }
      )
    }

    // user_credentials에서 만료되지 않은 레코드 조회 (saved_id 또는 voice_saved_id 있는 것)
    const { data: credentials, error: credentialsError } = await supabase
      .from('user_credentials')
      .select('saved_id, voice_saved_id, encrypted_phone, encrypted_password')
      .gt('expires_at', new Date().toISOString())
      .or('saved_id.not.is.null,voice_saved_id.not.is.null')

    if (credentialsError) {
      return NextResponse.json(
        { success: false, error: '인증 정보 조회에 실패했습니다.', details: credentialsError.message },
        { status: 500 }
      )
    }

    if (!credentials || credentials.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    type CredRow = { saved_id: number | null; voice_saved_id: number | null; encrypted_phone: string; encrypted_password: string }
    const phoneMatchedCredentials: CredRow[] = []

    for (const cred of credentials as CredRow[]) {
      if (!cred.saved_id && !cred.voice_saved_id) continue
      try {
        const decryptedPhone = plainOrDecrypt(cred.encrypted_phone)
        const normalizedDecryptedPhone = normalizePhone(decryptedPhone.trim())
        if (normalizedDecryptedPhone === normalizedPhone) {
          phoneMatchedCredentials.push(cred)
        }
      } catch {
        continue
      }
    }

    if (phoneMatchedCredentials.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const matchingSavedIds = new Set<number>()
    const matchingVoiceSavedIds = new Set<number>()

    for (const cred of phoneMatchedCredentials) {
      try {
        const decryptedPassword = plainOrDecrypt(cred.encrypted_password)
        if (decryptedPassword.trim() !== normalizedPassword) continue
        if (cred.saved_id != null) matchingSavedIds.add(cred.saved_id)
        if (cred.voice_saved_id != null) matchingVoiceSavedIds.add(cred.voice_saved_id)
      } catch {
        continue
      }
    }

    const matchingSavedIdsArray = Array.from(matchingSavedIds)
    const matchingVoiceSavedIdsArray = Array.from(matchingVoiceSavedIds)

    if (matchingSavedIdsArray.length === 0 && matchingVoiceSavedIdsArray.length === 0) {
      return NextResponse.json(
        { success: false, error: '일치하는 이용내역을 찾을 수 없습니다.' },
        { status: 404 }
      )
    }

    const sixtyDaysAgo = new Date()
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

    let fortuneResults: any[] = []
    if (matchingSavedIdsArray.length > 0) {
      const { data, error } = await supabase
        .from('saved_results')
        .select('*')
        .in('id', matchingSavedIdsArray)
        .gte('saved_at', sixtyDaysAgo.toISOString())
        .order('saved_at', { ascending: false })
      if (!error) fortuneResults = data || []
    }

    let voiceResults: any[] = []
    if (matchingVoiceSavedIdsArray.length > 0) {
      const { data, error } = await supabase
        .from('saved_results_voice')
        .select('*')
        .in('id', matchingVoiceSavedIdsArray)
        .gte('saved_at', sixtyDaysAgo.toISOString())
        .order('saved_at', { ascending: false })
      if (!error && data) {
        voiceResults = data.map((r: any) => ({
          ...r,
          result_type: 'voice',
          voice_audio_url: r.voice_audio_url ?? undefined
        }))
      }
    }

    const savedResults = [...fortuneResults, ...voiceResults].sort(
      (a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime()
    )

    const verifiedResults: any[] = []
    for (const result of savedResults) {
      const isFortune = result.result_type !== 'voice'
      const idInSet = isFortune
        ? matchingSavedIdsArray.includes(result.id)
        : matchingVoiceSavedIdsArray.includes(result.id)
      if (!idInSet) continue

      let isValid = false
      for (const cred of phoneMatchedCredentials) {
        const idMatch = (cred.saved_id != null && cred.saved_id === result.id) || (cred.voice_saved_id != null && cred.voice_saved_id === result.id)
        if (!idMatch) continue

        try {
          const decryptedPassword = plainOrDecrypt(cred.encrypted_password)
          const normalizedDecryptedPassword = decryptedPassword.trim()
          
          // 전화번호는 이미 일치하므로 비밀번호만 확인
          if (normalizedDecryptedPassword === normalizedPassword) {
            isValid = true
            break
          }
        } catch (decryptError) {
          continue
        }
      }
      
      if (isValid) {
        verifiedResults.push(result)
      }
    }

    // 컨텐츠별 요약 글자수 조회 (점사 요약 버튼 노출 여부: 0이면 비표시)
    const contentIds = Array.from(new Set((verifiedResults as any[]).map((r: any) => r.content_id).filter((id: any) => id != null)))
    if (contentIds.length > 0) {
      const { data: contentRows } = await supabase
        .from('contents')
        .select('id, summary_max_chars')
        .in('id', contentIds)
      const charsByContentId: Record<number, number | null> = {}
      ;(contentRows || []).forEach((r: any) => {
        charsByContentId[r.id] = r.summary_max_chars
      })
      verifiedResults.forEach((r: any) => {
        r.summary_max_chars = r.content_id != null ? charsByContentId[r.content_id] : undefined
      })
    }

    return NextResponse.json({
      success: true,
      data: verifiedResults
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: '서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    )
  }
}
