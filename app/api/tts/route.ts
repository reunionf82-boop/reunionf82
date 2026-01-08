import { NextRequest, NextResponse } from 'next/server'
import { TypecastClient } from '@neosapience/typecast-js'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const getTypecastClient = () => {
  const apiKey = process.env.TYPECAST_API_KEY
  if (!apiKey) return null
  return new TypecastClient({ apiKey })
}

const DEFAULT_TYPECAST_VOICE_ID = 'tc_5ecbbc6099979700087711d8'

async function getSelectedTtsProviderFromDb(): Promise<{ provider: 'naver' | 'typecast'; voiceId: string }> {
  try {
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from('app_settings')
      .select('id, selected_tts_provider, selected_typecast_voice_id')
      .eq('id', 1)
      .maybeSingle()

    if (error || !data) {
      return { provider: 'naver', voiceId: DEFAULT_TYPECAST_VOICE_ID }
    }

    const provider = (data as any).selected_tts_provider === 'typecast' ? 'typecast' : 'naver'
    const voiceId = String((data as any).selected_typecast_voice_id || '').trim() || DEFAULT_TYPECAST_VOICE_ID
    return { provider, voiceId }
  } catch {
    // ✅ 값을 못 읽었으면 네이버
    return { provider: 'naver', voiceId: DEFAULT_TYPECAST_VOICE_ID }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    let { text, speaker, provider, voiceId } = body


    if (!text) {
      return NextResponse.json(
        { error: '텍스트가 필요합니다.' },
        { status: 400 }
      )
    }

    // ✅ 최종 분기 규칙(요구사항)
    // - 디폴트: 네이버
    // - selected_tts_provider가 typecast이면 typecast
    // - 서버오류/값을 못 읽으면 네이버
    // => 클라이언트 provider/voiceId는 신뢰하지 않고 서버가 DB에서 결정한다.
    const settings = await getSelectedTtsProviderFromDb()
    const finalProvider: 'naver' | 'typecast' = settings.provider
    const finalVoiceId: string = settings.voiceId

    const logPrefix = '[api/tts]'
    const safeTextLen = typeof text === 'string' ? text.length : 0
    // NOTE: 텍스트 원문은 로그에 남기지 않는다(민감정보/개인정보 가능성).
    console.log(`${logPrefix} request`, {
      selectedProvider: finalProvider,
      hasTypecastKey: !!process.env.TYPECAST_API_KEY,
      voiceIdStartsWithTc: typeof finalVoiceId === 'string' ? finalVoiceId.startsWith('tc_') : false,
      textLen: safeTextLen,
    })

    // 화자 설정 (기본값: nara)
    const selectedSpeaker = speaker || 'nara'
    const validSpeakers = ['nara', 'mijin', 'nhajun', 'ndain', 'jinho']
    const finalSpeaker = validSpeakers.includes(selectedSpeaker) ? selectedSpeaker : 'nara'
    

    // 텍스트 정리: HTML 엔티티 디코딩 및 특수 문자 처리
    // HTML 엔티티 디코딩
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
    
    // 연속된 공백 제거 및 줄바꿈 정리
    text = text.replace(/\s+/g, ' ').trim()
    
    // 텍스트 길이 제한 (Clova Voice는 최대 5000자이지만, 안전을 위해 2000자로 제한)
    // 한글은 UTF-8에서 3바이트이고, URL 인코딩 시 %XX 형식으로 인코딩되어 길이가 3배가 됨
    // 예: "안녕" (2자) -> "%EC%95%88%EB%85%95" (18자)
    // 따라서 2000자 한글 텍스트는 URL 인코딩 후 약 6000자가 됨
    // Clova Voice API는 URL 인코딩 전 원본 텍스트 길이를 기준으로 하지만, 
    // 요청 본문 크기 제한이 있을 수 있으므로 더 보수적으로 제한
    const MAX_TEXT_LENGTH = 2000
    const originalLength = text.length
    
    // UTF-8 바이트 길이 계산 함수
    const getByteLength = (str: string): number => {
      return new TextEncoder().encode(str).length
    }
    
    // 바이트 길이 기준으로도 체크 (한글 고려)
    const MAX_BYTE_LENGTH = 6000 // 약 2000자 한글에 해당하는 바이트 수
    
    if (text.length > MAX_TEXT_LENGTH || getByteLength(text) > MAX_BYTE_LENGTH) {
      // 먼저 문자 길이로 자르기
      let truncated = text.substring(0, MAX_TEXT_LENGTH)
      
      // 바이트 길이도 확인하여 추가로 자르기
      while (getByteLength(truncated) > MAX_BYTE_LENGTH && truncated.length > 0) {
        truncated = truncated.substring(0, truncated.length - 10)
      }
      
      // 문장 중간에서 잘리지 않도록 마지막 공백이나 문장 부호를 찾아서 자름
      const lastSpace = truncated.lastIndexOf(' ')
      const lastPeriod = truncated.lastIndexOf('.')
      const lastComma = truncated.lastIndexOf(',')
      const lastNewline = truncated.lastIndexOf('\n')
      const lastQuestion = truncated.lastIndexOf('?')
      const lastExclamation = truncated.lastIndexOf('!')
      
      const cutPoint = Math.max(
        lastSpace, 
        lastPeriod, 
        lastComma, 
        lastNewline, 
        lastQuestion,
        lastExclamation,
        Math.floor(truncated.length * 0.9) // 최소 90%는 유지
      )
      
      if (cutPoint > truncated.length * 0.8) {
        truncated = truncated.substring(0, cutPoint + 1)
      }
      
      text = truncated.trim()
      const originalByteLength = getByteLength(text) // 원본 바이트 길이 (잘리기 전)
    }
    
    // 최종 길이 재확인 (안전장치)
    if (text.length > MAX_TEXT_LENGTH) {
      text = text.substring(0, MAX_TEXT_LENGTH).trim()
    }
    if (getByteLength(text) > MAX_BYTE_LENGTH) {
      // 바이트 길이 기준으로 추가 자르기
      let finalText = text
      while (getByteLength(finalText) > MAX_BYTE_LENGTH && finalText.length > 0) {
        finalText = finalText.substring(0, finalText.length - 10)
      }
      text = finalText.trim()
    }

    // Typecast TTS (공식 SDK 사용)
    if (finalProvider === 'typecast') {
      // 타입캐스트는 voice id가 정상일 때만 시도 (아니면 네이버로 폴백)
      const client = getTypecastClient()
      if (!client) {
        console.warn(`${logPrefix} typecast disabled: missing TYPECAST_API_KEY -> fallback to naver`)
      } else if (!finalVoiceId.startsWith('tc_')) {
        console.warn(`${logPrefix} typecast disabled: invalid voiceId -> fallback to naver`, { voiceId: finalVoiceId })
      } else {
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

        try {
          // 429 완화: 짧은 백오프 재시도
          let lastErr: any = null
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const audio = await client.textToSpeech({
                text,
                model: 'ssfm-v21',
                voice_id: finalVoiceId,
                language: 'kor',
                output: {
                  volume: 100,
                  audio_pitch: 0,
                  audio_tempo: 1,
                  audio_format: 'mp3'
                }
              })

              const format = (audio as any)?.format || 'mp3'
              const mime =
                format === 'wav' ? 'audio/wav' :
                format === 'mp3' ? 'audio/mpeg' :
                'application/octet-stream'

              const audioData = (audio as any)?.audioData
              if (!audioData) {
                // 타입캐스트 응답 이상이면 네이버로 폴백
                console.warn(`${logPrefix} typecast invalid response: missing audioData -> fallback to naver`, {
                  voiceId: finalVoiceId,
                })
                break
              }

              const buffer = audioData instanceof ArrayBuffer
                ? Buffer.from(new Uint8Array(audioData))
                : Buffer.isBuffer(audioData)
                  ? audioData
                  : Buffer.from(audioData)

              return new NextResponse(buffer, {
                headers: {
                  'Content-Type': mime,
                  'Content-Disposition': `inline; filename="speech.${format}"`,
                  'Cache-Control': 'no-store',
                  'X-TTS-Provider': 'typecast',
                  'X-TTS-VoiceId': finalVoiceId,
                },
              })
            } catch (err: any) {
              lastErr = err
              const statusCode = err?.statusCode || err?.status
              console.warn(`${logPrefix} typecast error -> fallback to naver`, {
                attempt,
                statusCode,
                message: err?.message,
                voiceId: finalVoiceId,
              })
              // ✅ 요구사항: typecast 서버오류(402 포함)면 네이버로 폴백
              if (statusCode === 429 && attempt < 2) {
                await sleep(500 * Math.pow(2, attempt))
                continue
              }
              break
            }
          }
          // 마지막 에러가 있더라도 네이버로 폴백 (요구사항)
          void lastErr
        } catch {
          // 예외도 네이버로 폴백
          console.warn(`${logPrefix} typecast exception -> fallback to naver`, { voiceId: finalVoiceId })
        }
      }
    }

    // Naver Clova Voice (기존)
    // 환경 변수에서 네이버 클라우드 플랫폼 인증 정보 가져오기
    const clientId = process.env.NAVER_CLOVA_CLIENT_ID
    const clientSecret = process.env.NAVER_CLOVA_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: 'Clova Voice API 인증 정보가 설정되지 않았습니다.' },
        { status: 500 }
      )
    }

    // API 키 형식 검증 (기본적인 형식 확인)
    if (clientId.length < 10 || clientSecret.length < 10) {
      return NextResponse.json(
        { error: 'Clova Voice API 인증 정보 형식이 올바르지 않습니다.' },
        { status: 500 }
      )
    }

    // Clova Voice API 엔드포인트
    const url = 'https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts'

    // 헤더 설정
    const headers = {
      'X-NCP-APIGW-API-KEY-ID': clientId,
      'X-NCP-APIGW-API-KEY': clientSecret,
      'Content-Type': 'application/x-www-form-urlencoded',
    }

    // 요청 데이터 (URLSearchParams가 자동으로 인코딩)
    const params = new URLSearchParams()
    params.append('speaker', finalSpeaker)
    params.append('volume', '0')
    params.append('speed', '0')
    params.append('pitch', '0')
    params.append('format', 'mp3')
    params.append('text', text)

    // API 호출
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: params.toString(),
    })

    if (!response.ok) {
      let errorText = ''
      try {
        errorText = await response.text()
        // 401 Unauthorized 에러인 경우 특별 처리
        if (response.status === 401) {
          return NextResponse.json(
            { error: '음성 변환 실패: Authentication Failed (API 키가 올바르지 않거나 만료되었습니다. 환경 변수를 확인해주세요.)' },
            { status: 401 }
          )
        }
        
        // JSON 형식의 에러 메시지 파싱 시도
        try {
          const errorJson = JSON.parse(errorText)
          const errorMessage = errorJson.error?.message || errorJson.message || errorText
          return NextResponse.json(
            { error: `음성 변환 실패: ${errorMessage}` },
            { status: response.status }
          )
        } catch {
          // JSON 파싱 실패 시 원본 텍스트 사용
          return NextResponse.json(
            { error: `음성 변환 실패 (${response.status}): ${errorText || '알 수 없는 오류'}` },
            { status: response.status }
          )
        }
      } catch (e) {
        return NextResponse.json(
          { error: `음성 변환 실패: ${response.status}` },
          { status: response.status }
        )
      }
    }

    // 오디오 데이터를 ArrayBuffer로 변환
    const audioBuffer = await response.arrayBuffer()

    // MP3 오디오 데이터 반환
    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'inline; filename="speech.mp3"',
        'Cache-Control': 'no-store',
        'X-TTS-Provider': 'naver',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || '음성 변환 중 오류가 발생했습니다.',
        ...(process.env.NODE_ENV !== 'production'
          ? { _debug: { provider: 'unknown' } }
          : {}),
      },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    )
  }
}

