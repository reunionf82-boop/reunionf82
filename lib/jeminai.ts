// 재미나이 API 호출 함수 (서버 사이드 API 라우트 사용)

interface JeminaiRequest {
  role_prompt: string
  restrictions: string
  menu_subtitles: Array<{
    subtitle: string
    interpretation_tool: string
    char_count: number
    thumbnail?: string
  }>
  menu_items?: Array<any> // menu_items 추가
  user_info: {
    name: string
    gender: string
    birth_date: string
    birth_hour?: string
  }
  partner_info?: {
    name: string
    gender: string
    birth_date: string
    birth_hour?: string
  }
  model?: string
  manse_ryeok_table?: string
  manse_ryeok_text?: string
  manse_ryeok_json?: string
  day_gan_info?: any
  isSecondRequest?: boolean
  completedSubtitles?: Array<any>
  completedSubtitleIndices?: number[]
}

interface JeminaiResponse {
  html: string // HTML 결과
  isTruncated?: boolean
  finishReason?: string
  usage?: {
    promptTokens: number
    candidatesTokens: number
    totalTokens: number
  }
}

// 스트리밍 콜백 타입
export type StreamingCallback = (data: {
  type: 'start' | 'chunk' | 'done' | 'error' | 'partial_done'
  text?: string
  html?: string
  accumulatedLength?: number
  isTruncated?: boolean
  finishReason?: string
  remainingSubtitles?: number[]
  completedSubtitles?: number[]
  usage?: {
    promptTokens: number
    candidatesTokens: number
    totalTokens: number
  }
  error?: string
}) => void

// 스트리밍 API 호출 함수
export async function callJeminaiAPIStream(
  request: JeminaiRequest,
  onChunk: StreamingCallback
): Promise<JeminaiResponse> {
  // Supabase Edge Function을 사용하므로 모의 응답 로직 제거
  // 이제는 항상 Supabase Edge Function을 호출합니다
  
  try {
    const selectedModel = request.model || 'gemini-3-flash-preview'
    const modelDisplayName = selectedModel === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : selectedModel === 'gemini-3-flash-preview' ? 'Gemini 3.0 Flash' : selectedModel === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : selectedModel
    console.log('=== 재미나이 API 스트리밍 호출 시작 ===')
    console.log('선택된 모델:', modelDisplayName, `(${selectedModel})`)
    
    // Supabase Edge Function URL 구성
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    
    console.log('=== Supabase 환경 변수 확인 ===')
    console.log('Supabase URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : '없음')
    console.log('Supabase Anon Key:', supabaseAnonKey ? `${supabaseAnonKey.substring(0, 20)}...` : '없음')
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase 환경 변수 오류:', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey })
      throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
    }

    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/jeminai`
    console.log('Edge Function URL:', edgeFunctionUrl)

    // fetch 타임아웃 설정 (390초, 서버 타임아웃 400초보다 짧게)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 390000) // 390초
    
    let response: Response
    try {
      response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          role_prompt: request.role_prompt,
          restrictions: request.restrictions,
          menu_subtitles: request.menu_subtitles,
          menu_items: request.menu_items || [],
          user_info: request.user_info,
          partner_info: request.partner_info,
          model: request.model || 'gemini-3-flash-preview',
          manse_ryeok_table: request.manse_ryeok_table,
          manse_ryeok_text: request.manse_ryeok_text,
          manse_ryeok_json: request.manse_ryeok_json,
          day_gan_info: request.day_gan_info,
          isSecondRequest: request.isSecondRequest,
          completedSubtitles: request.completedSubtitles,
          completedSubtitleIndices: request.completedSubtitleIndices
        }),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      if (fetchError.name === 'AbortError') {
        const errorMsg = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
        console.error(errorMsg)
        onChunk({ type: 'error', error: errorMsg })
        throw new Error(errorMsg)
      }
      throw fetchError
    }

    console.log('API 응답 상태:', response.status, response.statusText)
    console.log('Content-Type:', response.headers.get('content-type'))

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = '재미나이 API 호출 실패'
      try {
        const error = JSON.parse(errorText)
        errorMessage = error.error || error.message || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }
      
      // 사용자 친화적 에러 메시지 생성
      let userFriendlyMessage = '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
      if (response.status === 429) {
        // 429 에러는 점사중... 메시지가 이미 떠 있으므로 에러 메시지 전송하지 않음
        // 서버에서 재시도가 모두 실패한 경우이지만, 조용히 실패 처리
        console.error('API 에러: 429 Rate Limit (재시도 모두 실패)')
        // 에러 메시지 전송하지 않고 조용히 실패
        throw new Error('429 Rate Limit')
      } else if (response.status === 500 || response.status === 503) {
        userFriendlyMessage = '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
      } else if (response.status >= 400 && response.status < 500) {
        userFriendlyMessage = '요청 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
      }
      
      console.error('API 에러:', errorMessage, '상태:', response.status)
      onChunk({ type: 'error', error: userFriendlyMessage })
      throw new Error(userFriendlyMessage)
    }

    // 스트림 읽기
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    
    if (!reader) {
      const errorMsg = '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
      console.error('스트림을 읽을 수 없습니다.')
      onChunk({ type: 'error', error: errorMsg })
      throw new Error(errorMsg)
    }

    console.log('스트림 리더 생성 완료, 데이터 읽기 시작')
    let buffer = ''
    let finalResponse: JeminaiResponse | null = null
    let chunkCount = 0
    let accumulatedHtml = '' // done 타입을 받지 못한 경우를 위한 fallback
    let hasReceivedStart = false // start 타입 수신 여부 추적
    let hasReceivedPartialDone = false // partial_done 이벤트 수신 여부
    let lastChunkTime = Date.now() // 마지막 청크 수신 시간
    const streamStartTime = Date.now() // 스트림 시작 시간 (280초 경과 체크용)
    const STREAM_TIMEOUT = 300000 // 5분 (300초)
    const TIMEOUT_PARTIAL = 280000 // 280초 (1차 요청 중단, 2차 요청으로 이어가기)
    
    // 백그라운드에서도 스트림이 계속 읽히도록 보장
    // visibilitychange 이벤트 리스너 추가 (백그라운드 복귀 시 스트림 상태 확인)
    // 모바일에서 전화가 와도 스트림이 계속 읽히도록 보장
    let visibilityHandler: (() => void) | null = null
    let lastVisibilityChangeTime = Date.now()
    let isInBackground = false // 백그라운드 상태 추적
    let backgroundStartTime = 0 // 백그라운드 시작 시간
    if (typeof document !== 'undefined') {
      visibilityHandler = () => {
        const now = Date.now()
        if (document.hidden) {
          // 페이지가 백그라운드로 갔을 때 (전화 수신, 메신저 알림 탭, 다른 앱으로 이동 등)
          isInBackground = true
          backgroundStartTime = now
          lastVisibilityChangeTime = now
          console.log('페이지가 백그라운드로 전환됨 (전화/메신저/다른 앱 등), 스트림은 계속 진행됩니다.')
        } else {
          // 페이지가 다시 보이게 되면 (전화 종료, 메신저 닫고 복귀 등)
          const timeInBackground = now - lastVisibilityChangeTime
          isInBackground = false
          console.log(`페이지가 다시 보이게 됨 (백그라운드 시간: ${Math.round(timeInBackground / 1000)}초), 스트림 상태 확인`)
          
          // 백그라운드에 있었던 시간만큼 lastChunkTime 보정
          // 백그라운드에 있는 동안에는 타임아웃이 발생하지 않도록 보정
          if (backgroundStartTime > 0) {
            const backgroundDuration = now - backgroundStartTime
            lastChunkTime = Date.now() // 복귀 시점을 기준으로 갱신
            console.log(`백그라운드 시간 보정: ${Math.round(backgroundDuration / 1000)}초 동안 백그라운드에 있었음`)
          } else {
            lastChunkTime = Date.now()
          }
          
          // 백그라운드에 오래 있었으면 스트림이 끊겼을 수 있으므로 확인
          if (timeInBackground > 60000) { // 1분 이상 백그라운드에 있었으면
            console.warn('백그라운드에 오래 있었음, 스트림 상태 확인 필요')
          }
        }
      }
      document.addEventListener('visibilitychange', visibilityHandler)
      
      // 모바일에서 전화 수신, 메신저 알림 등으로 백그라운드로 전환되어도 스트림이 계속 읽히도록 보장
      // fetch와 ReadableStream은 백그라운드에서도 계속 작동하므로
      // 별도의 처리는 필요 없지만, 로깅을 통해 상태 확인
    }

    try {
      while (true) {
        // 스트림 타임아웃 체크 (백그라운드에서는 타임아웃 체크 건너뛰기)
        // 백그라운드에 있는 동안에는 타임아웃이 발생하지 않도록 처리
        // 전화 통화 중에도 스트림이 계속 읽히므로 타임아웃 체크 불필요
        if (!isInBackground) {
          const now = Date.now()
          if (now - lastChunkTime > STREAM_TIMEOUT) {
            // 타임아웃이지만 부분 데이터가 있으면 fallback 처리
            if (accumulatedHtml.trim() && accumulatedHtml.trim().length > 100) {
              console.warn('스트림 타임아웃 발생했지만 부분 데이터가 충분함. fallback 처리합니다.')
              break // 루프 종료하여 fallback 처리로 이동
            }
            throw new Error('응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.')
          }
        } else {
          // 백그라운드에 있는 동안에는 타임아웃 체크 건너뛰기
          // 전화 통화 중에도 스트림은 계속 읽히므로 타임아웃 발생하지 않음
        }
        
        // 백그라운드에서도 스트림 읽기가 계속되도록 보장
        // reader.read()는 백그라운드에서도 정상 작동 (모바일 전화 수신 시에도 계속 진행)
        // Promise가 해결될 때까지 기다리므로 백그라운드에서도 정상 작동
        const { done, value } = await reader.read()
        
        // 모바일에서 전화가 와서 백그라운드로 갔다가 복귀한 경우에도
        // reader.read()는 계속 작동하며 데이터를 받을 수 있음
        
        if (done) {
          console.log('스트림 읽기 완료, 총 청크:', chunkCount)
          // 스트림 종료 시 버퍼에 남은 데이터 처리
          if (buffer.trim()) {
            console.log('버퍼에 남은 데이터 처리:', buffer.substring(0, 200))
            const lines = buffer.split('\n')
            for (const line of lines) {
              if (line.trim() && line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  console.log('버퍼에서 스트림 데이터 수신:', data.type)
                  
                  if (data.type === 'done') {
                    finalResponse = {
                      html: data.html,
                      isTruncated: data.isTruncated,
                      finishReason: data.finishReason,
                      usage: data.usage
                    }
                    onChunk({
                      type: 'done',
                      html: data.html,
                      isTruncated: data.isTruncated,
                      finishReason: data.finishReason,
                      usage: data.usage
                    })
                  } else if (data.type === 'error') {
                    const errorMsg = data.error || '스트리밍 중 오류가 발생했습니다.'
                    console.error('버퍼에서 스트림 에러:', errorMsg)
                    onChunk({ type: 'error', error: errorMsg })
                    throw new Error(errorMsg)
                  }
                } catch (e) {
                  console.error('버퍼 데이터 파싱 에러:', e, '라인:', line.substring(0, 100))
                }
              }
            }
          }
          break
        }
        
        chunkCount++
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // 마지막 불완전한 라인은 버퍼에 보관
        
        for (const line of lines) {
          if (line.trim() && line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              console.log('스트림 데이터 수신:', data.type, data.accumulatedLength || 'N/A')
              
              if (data.type === 'start') {
                hasReceivedStart = true
                lastChunkTime = Date.now() // start 수신 시 시간 갱신
                onChunk({ type: 'start' })
              } else if (data.type === 'chunk') {
                lastChunkTime = Date.now() // chunk 수신 시 시간 갱신
                if (data.text) {
                  accumulatedHtml += data.text
                  onChunk({
                    type: 'chunk',
                    text: data.text,
                    accumulatedLength: data.accumulatedLength
                  })
                }
              } else if (data.type === 'partial_done') {
                console.log('=== 클라이언트: 1차 요청 부분 완료 수신 ===')
                console.log('1차 요청 완료된 HTML 길이:', (data.html || accumulatedHtml).length, '자')
                console.log('완료된 소제목 인덱스:', data.completedSubtitles || [])
                console.log('남은 소제목 인덱스:', data.remainingSubtitles || [])
                console.log('남은 소제목 개수:', (data.remainingSubtitles || []).length, '개')
                console.log('경과 시간:', Math.round((Date.now() - streamStartTime) / 1000), '초')
                console.log('=== 클라이언트: 1차 요청 부분 완료 수신 ===')
                
                hasReceivedPartialDone = true
                onChunk({
                  type: 'partial_done',
                  html: data.html || accumulatedHtml,
                  remainingSubtitles: data.remainingSubtitles || [],
                  completedSubtitles: data.completedSubtitles || []
                })
              } else if (data.type === 'done') {
                lastChunkTime = Date.now() // done 수신 시 시간 갱신
                if (data.html) {
                  finalResponse = {
                    html: data.html,
                    isTruncated: data.isTruncated,
                    finishReason: data.finishReason,
                    usage: data.usage
                  }
                  onChunk({
                    type: 'done',
                    html: data.html,
                    isTruncated: data.isTruncated,
                    finishReason: data.finishReason,
                    usage: data.usage
                  })
                } else {
                  console.warn('done 타입을 받았지만 html이 없음. accumulatedHtml 사용.')
                  // done 타입을 받았지만 html이 없는 경우 fallback
                  if (accumulatedHtml.trim()) {
                    // fallback 처리로 이동 (아래 로직에서 처리)
                  }
                }
              } else if (data.type === 'error') {
                // 서버에서 이미 사용자 친화적 메시지를 보냈으므로 그대로 사용
                const errorMsg = data.error || '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
                console.error('스트림 에러:', errorMsg)
                onChunk({ type: 'error', error: errorMsg })
                throw new Error(errorMsg)
              }
            } catch (e: any) {
              // 파싱 에러를 더 상세히 로깅
              console.error('스트림 데이터 파싱 에러:', e?.message || e, '라인:', line.substring(0, 200))
              console.error('파싱 에러 스택:', e?.stack)
              // JSON 파싱 에러인 경우에만 무시하고 계속 진행 (다른 에러는 throw)
              if (!(e instanceof SyntaxError)) {
                throw e
              }
            }
          }
        }
      }
    } catch (streamError: any) {
      console.error('스트림 읽기 중 에러:', streamError)
      
      // visibilitychange 리스너 제거
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler)
      }
      
      // 부분 데이터가 충분하면 에러 대신 성공 처리
      if (accumulatedHtml.trim() && accumulatedHtml.trim().length > 100) {
        console.warn('스트림 읽기 중 에러 발생했지만 부분 데이터가 충분함. fallback 처리합니다.')
        // fallback 처리로 이동 (아래 로직에서 처리)
      } else {
        // 사용자 친화적 에러 메시지
        const errorMsg = streamError?.message?.includes('타임아웃') || streamError?.message?.includes('timeout')
          ? '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
          : streamError?.message?.includes('네트워크') || streamError?.message?.includes('network')
          ? '네트워크 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
          : '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
        
        onChunk({ type: 'error', error: errorMsg })
        throw new Error(errorMsg)
      }
    } finally {
      // visibilitychange 리스너 제거 (정상 종료 시에도)
      if (visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', visibilityHandler)
      }
    }
    
    // done 타입을 받지 못한 경우, accumulated HTML로 fallback 시도
    if (!finalResponse) {
      // start 타입을 받지 못한 경우 경고
      if (!hasReceivedStart) {
        console.warn('start 타입을 받지 못함. 스트림이 제대로 시작되지 않았을 수 있습니다.')
      }
      
      if (accumulatedHtml.trim()) {
        console.warn('done 타입을 받지 못했지만 accumulated HTML이 있음. fallback 처리.')
        console.log('accumulatedHtml 길이:', accumulatedHtml.length)
        
        // 서버와 동일한 HTML 정리 로직 적용 (텍스트 깨짐 방지)
        let cleanHtml = accumulatedHtml.trim()
        
        // HTML 코드 블록 제거 (있는 경우)
        const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
        if (htmlBlockMatch) {
          cleanHtml = htmlBlockMatch[1].trim()
          console.log('Fallback: HTML 코드 블록 제거됨')
        } else {
          const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
          if (codeBlockMatch) {
            cleanHtml = codeBlockMatch[1].trim()
            console.log('Fallback: 코드 블록 제거됨')
          }
        }
        
        // 소제목과 본문 사이의 공백 제거
        cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
        cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
        
        // <br> 태그 처리: 불필요한 연속 <br> 제거
        cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
        
        // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리
        cleanHtml = cleanHtml
          .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
          .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
          .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
          .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
          .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
        
        // ** 문자 제거 (마크다운 강조 표시 제거)
        cleanHtml = cleanHtml.replace(/\*\*/g, '')
        
        finalResponse = {
          html: cleanHtml
        }
        onChunk({
          type: 'done',
          html: cleanHtml
        })
      } else {
        // accumulatedHtml이 비어있거나 너무 적은 경우
        // 네트워크/제미나이 정상일 때는 발생하지 않아야 하지만, 방어적 코딩
        const errorMsg = accumulatedHtml.length > 0 && accumulatedHtml.length < 100
          ? '상담 결과 생성이 중단되었습니다. 잠시 후 다시 시도해주세요.'
          : '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
        console.error('done 타입을 받지 못하고 accumulatedHtml이 비어있음 - 네트워크/제미나이 정상이면 발생하지 않아야 함')
        console.error('버퍼 상태:', buffer.substring(0, 500))
        console.error('accumulatedHtml 길이:', accumulatedHtml.length)
        console.error('hasReceivedStart:', hasReceivedStart)
        onChunk({ type: 'error', error: errorMsg })
        throw new Error(errorMsg)
      }
    }
    
    // visibilitychange 리스너 제거 (정상 완료 시)
    if (visibilityHandler && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityHandler)
    }
    
    console.log('=== 재미나이 API 스트리밍 완료 ===')
    return finalResponse
  } catch (error: any) {
    console.error('=== 재미나이 API 스트리밍 에러 ===')
    console.error('에러:', error)
    
    // 429 Rate Limit 에러는 점사중... 메시지가 이미 떠 있으므로 에러 메시지 전송하지 않음
    if (error?.message?.includes('429 Rate Limit')) {
      console.error('429 Rate Limit 에러 - 에러 메시지 전송하지 않음 (점사중... 메시지가 이미 표시됨)')
      // 에러 메시지 전송하지 않고 조용히 실패
      throw error
    }
    
    // 이미 사용자 친화적 메시지가 설정된 경우 그대로 사용
    const errorMsg = error?.message && (
      error.message.includes('잠시 후') || 
      error.message.includes('대기 중') ||
      error.message.includes('시도해주세요')
    ) ? error.message : '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
    
    onChunk({ type: 'error', error: errorMsg })
    throw new Error(errorMsg)
  }
}

// 기존 비스트리밍 함수 (하위 호환성 유지)
export async function callJeminaiAPI(request: JeminaiRequest): Promise<JeminaiResponse> {
  return new Promise((resolve, reject) => {
    callJeminaiAPIStream(request, (data) => {
      if (data.type === 'done') {
        resolve({
          html: data.html || '',
          isTruncated: data.isTruncated,
          finishReason: data.finishReason,
          usage: data.usage
        })
      } else if (data.type === 'error') {
        reject(new Error(data.error || '오류가 발생했습니다.'))
      }
    }).catch(reject)
  })
}

// 모의 응답 생성 함수
function getMockResponse(request: JeminaiRequest): JeminaiResponse {
  console.log('모의 응답 생성 중...')
  
  const menuItems = request.menu_items || []
  let mockHtml = ''
  
  menuItems.forEach((menuItem: any, menuIndex: number) => {
    const menuTitle = typeof menuItem === 'string' ? menuItem : (menuItem.value || menuItem.title || '')
    const menuThumbnail = typeof menuItem === 'object' ? (menuItem.thumbnail || '') : ''
    const menuNumber = menuIndex + 1
    
    // 해당 메뉴의 소제목들 찾기
    const subtitlesForMenu = request.menu_subtitles.filter((sub: any) => {
      const match = sub.subtitle.match(/^(\d+)-(\d+)/)
      return match ? parseInt(match[1]) === menuNumber : false
    })
    
    mockHtml += `<div class="menu-section">
  <h2 class="menu-title">${menuTitle}</h2>`
    
    if (menuThumbnail) {
      mockHtml += `\n  <img src="${menuThumbnail}" alt="${menuTitle}" class="menu-thumbnail" />`
    }
    
    subtitlesForMenu.forEach((subtitle: any) => {
      const cleanSubtitle = subtitle.subtitle.replace(/^\d+-\d+[\.\s]\s*/, '').trim()
      mockHtml += `\n  
  <div class="subtitle-section">
    <h3 class="subtitle-title">${subtitle.subtitle}</h3>
    <div class="subtitle-content">
      <p><strong>${cleanSubtitle}</strong></p>
      <p>${cleanSubtitle}에 대한 상세한 해석 결과입니다. 사용자의 정보를 바탕으로 ${subtitle.interpretation_tool}를 활용하여 분석했습니다.</p>
      <p>역할 프롬프트에 따라 작성되었으며, 금칙사항을 준수하여 ${subtitle.char_count}자 이내로 작성되었습니다.</p>
    </div>
  </div>`
    })
    
    mockHtml += `\n</div>\n\n`
  })
  
  return { html: mockHtml }
}
