// 재미나이 API 호출 함수 (서버 사이드 API 라우트 사용)

interface JeminaiRequest {
  role_prompt: string
  restrictions: string
  menu_subtitles: Array<{
    subtitle: string
    interpretation_tool: string
    char_count: number
    thumbnail?: string
    detailMenus?: Array<{
      detailMenu: string
      interpretation_tool: string
      char_count?: number
    }>
    detail_menu_char_count?: number
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
    
    // Cloudways 서버 URL 확인 (우선 사용)
    const cloudwaysUrl = process.env.NEXT_PUBLIC_CLOUDWAYS_URL || ''
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    
    // Cloudways가 설정되어 있으면 우선 사용, 없으면 Supabase Edge Function 사용
    let edgeFunctionUrl: string
    let useCloudways = false
    
    if (cloudwaysUrl && cloudwaysUrl.trim() !== '') {
      useCloudways = true
      edgeFunctionUrl = `${cloudwaysUrl}/chat`
    } else {
      if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase 환경 변수 오류:', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey })
        throw new Error('Supabase 환경 변수가 설정되지 않았습니다.')
      }
      edgeFunctionUrl = `${supabaseUrl}/functions/v1/jeminai`
    }

    // fetch 타임아웃 설정
    // Cloudways: 29분 (1740초) - 서버 타임아웃(30분)보다 약간 짧게 설정하여 서버 타임아웃 전에 감지, Supabase: 390초
    const timeout = useCloudways ? 1740000 : 390000 // Cloudways는 29분, Supabase는 390초
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)
    
    let response: Response
    try {
      // 헤더 설정
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      // Supabase Edge Function만 Authorization 헤더 필요
      // Cloudways 프록시는 서버 사이드에서 처리하므로 Authorization 불필요
      if (!useCloudways && supabaseAnonKey) {
        headers['Authorization'] = `Bearer ${supabaseAnonKey}`
      }
      
      const requestBody = {
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
      }
      
      // 디버그: 전달되는 모델 값 확인
      console.log('=== Gemini API 호출 ===')
      console.log('전달되는 모델:', requestBody.model)
      console.log('요청 URL:', edgeFunctionUrl)
      console.log('Cloudways URL 환경변수:', process.env.NEXT_PUBLIC_CLOUDWAYS_URL || '설정되지 않음')
      console.log('useCloudways:', useCloudways)
      console.log('=====================')
      
      response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal
      })
      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      
      // 네트워크 에러 상세 로깅
      console.error('❌ Fetch 에러 발생:', fetchError.name)
      console.error('에러 메시지:', fetchError.message)
      console.error('요청 URL:', edgeFunctionUrl)
      
      if (fetchError.name === 'AbortError') {
        const errorMsg = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
        console.error(errorMsg)
        onChunk({ type: 'error', error: errorMsg })
        throw new Error(errorMsg)
      }
      
      // 네트워크 연결 실패 시 더 자세한 에러 메시지
      if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('NetworkError')) {
        const detailedError = `서버 연결 실패: ${edgeFunctionUrl}에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.`
        console.error(detailedError)
        throw new Error(detailedError)
      }
      
      throw fetchError
    }

    // API 응답 확인
    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = '재미나이 API 호출 실패'
      try {
        const error = JSON.parse(errorText)
        errorMessage = error.error || error.message || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }
      
      // 디버그: 에러 상세 정보 로그
      const sentModel = request.model || 'gemini-3-flash-preview'
      console.error('=== API 에러 상세 ===')
      console.error('상태 코드:', response.status)
      console.error('에러 메시지:', errorMessage)
      console.error('전달된 모델:', sentModel)
      console.error('에러 응답 본문:', errorText)
      console.error('==================')
      
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

    let buffer = ''
    let finalResponse: JeminaiResponse | null = null
    let chunkCount = 0
    let accumulatedHtml = '' // done 타입을 받지 못한 경우를 위한 fallback
    let hasReceivedStart = false // start 타입 수신 여부 추적
    let hasReceivedPartialDone = false // partial_done 이벤트 수신 여부
    let lastChunkTime = Date.now() // 마지막 청크 수신 시간
    const streamStartTime = Date.now() // 스트림 시작 시간 (280초 경과 체크용)
    // Cloudways 사용 시: 29분 (1740초) - 서버 타임아웃(30분)보다 약간 짧게 설정
    // Supabase 사용 시: 5분 (300초) - 기존 유지
    const STREAM_TIMEOUT = useCloudways ? 1740000 : 300000 // Cloudways: 29분, Supabase: 5분
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
          // 백그라운드로 전환됨
        } else {
          // 페이지가 다시 보이게 되면
          const timeInBackground = now - lastVisibilityChangeTime
          isInBackground = false
          
          // 백그라운드에 있었던 시간만큼 lastChunkTime 보정
          if (backgroundStartTime > 0) {
            lastChunkTime = Date.now()
          } else {
            lastChunkTime = Date.now()
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
          const timeSinceLastChunk = now - lastChunkTime
          const totalElapsed = now - streamStartTime
          
          // 경고 로그 (28분 경과 시점 - 서버 타임아웃 30분 전 경고)
          if (totalElapsed > 1680000 && totalElapsed < 1685000) {
          }
          
          if (timeSinceLastChunk > STREAM_TIMEOUT) {
            console.error(`❌ 스트림 타임아웃 발생: 마지막 청크로부터 ${Math.round(timeSinceLastChunk / 1000)}초 경과, 전체 경과 시간: ${Math.round(totalElapsed / 1000)}초, 누적 HTML 길이: ${accumulatedHtml.length}자`)
            // 타임아웃이지만 부분 데이터가 있으면 fallback 처리
            if (accumulatedHtml.trim() && accumulatedHtml.trim().length > 100) {
              break // 루프 종료하여 fallback 처리로 이동
            }
            throw new Error(`응답 시간이 초과되었습니다. (경과 시간: ${Math.round(totalElapsed / 1000)}초, 누적 데이터: ${accumulatedHtml.length}자)`)
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
          // 스트림 종료 시 버퍼에 남은 데이터 처리
          if (buffer.trim()) {
            const lines = buffer.split('\n')
            for (const line of lines) {
              if (line.trim() && line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6))
                  
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
                hasReceivedPartialDone = true
                const partialHtml = data.html || accumulatedHtml
                console.log('⚠️ 1차 요청 부분 완료 (길이 제한 도달):', {
                  htmlLength: partialHtml.length,
                  completedSubtitles: data.completedSubtitles?.length || 0,
                  remainingSubtitles: data.remainingSubtitles?.length || 0,
                  message: '현재 항목 완료 후 2차 요청으로 이어갑니다.'
                })
                onChunk({
                  type: 'partial_done',
                  html: partialHtml,
                  remainingSubtitles: data.remainingSubtitles || [],
                  completedSubtitles: data.completedSubtitles || []
                })
              } else if (data.type === 'done') {
                lastChunkTime = Date.now() // done 수신 시 시간 갱신
                
                // MAX_TOKENS로 종료된 경우 처리
                if (data.finishReason === 'MAX_TOKENS') {
                  if (!data.isTruncated) {
                    // 서버에서 모든 소제목이 완료되었는지 확인하여 isTruncated를 false로 설정한 경우
                  } else {
                    // 실제로 잘린 경우
                    console.error('❌ 제미나이 API: MAX_TOKENS 한계에 도달하여 응답이 잘렸습니다.')
                    console.error('❌ HTML 길이:', data.html?.length || 0, '자')
                    console.error('❌ 현재 maxOutputTokens: 65536 (약 20000-30000자 한글 기준)')
                  }
                } else if (data.finishReason === 'STOP') {
                  // 정상 완료
                } else if (!data.finishReason) {
                }
                
                if (data.html) {
                  // MAX_TOKENS로 인한 잘림이고 미완료 소제목이 있으면 재요청
                  if (data.finishReason === 'MAX_TOKENS' && data.isTruncated && data.completedSubtitleIndices && data.completedSubtitleIndices.length > 0) {
                    
                    // 완료된 HTML 저장
                    const completedHtml = data.html
                    
                    // 재요청 준비
                    const retryRequest: JeminaiRequest = {
                      ...request,
                      isSecondRequest: true,
                      completedSubtitleIndices: data.completedSubtitleIndices
                    }
                    
                    // 재요청 실행
                    try {
                      let retryAccumulatedHtml = ''
                      const retryResponse = await callJeminaiAPIStream(retryRequest, (retryChunk) => {
                        // 재요청의 chunk를 누적하여 첫 번째 HTML과 병합하여 전달
                        if (retryChunk.type === 'chunk') {
                          if (retryChunk.text) {
                            retryAccumulatedHtml += retryChunk.text
                          }
                          // 첫 번째 HTML과 재요청 chunk를 병합하여 전달 (html 필드에 포함)
                          const mergedHtml = completedHtml + retryAccumulatedHtml
                          onChunk({
                            type: 'chunk',
                            text: retryChunk.text || '', // 재요청의 새로운 chunk만 전달
                            html: mergedHtml // 병합된 전체 HTML 전달
                          })
                        } else if (retryChunk.type === 'start') {
                          // 재요청 시작 시 첫 번째 HTML 유지
                          retryAccumulatedHtml = ''
                          onChunk(retryChunk)
                        } else {
                          // 기타 이벤트는 그대로 전달
                          onChunk(retryChunk)
                        }
                      })
                      
                      // 재요청이 완료되면 완료된 HTML과 재요청 HTML 병합
                      // retryResponse.html이 있으면 사용, 없으면 retryAccumulatedHtml 사용
                      const retryHtml = retryResponse.html || retryAccumulatedHtml
                      if (retryHtml) {
                        // 완료된 HTML과 재요청 HTML 병합 (서버에서 이미 깨진 부분 제거됨)
                        const mergedHtml = completedHtml + retryHtml
                        // done 이벤트 전송 (최종 병합된 HTML)
                        onChunk({
                          type: 'done',
                          html: mergedHtml,
                          isTruncated: retryResponse.isTruncated || false,
                          finishReason: retryResponse.finishReason || 'STOP',
                          usage: retryResponse.usage
                        })
                        finalResponse = {
                          html: mergedHtml,
                          isTruncated: retryResponse.isTruncated || false,
                          finishReason: retryResponse.finishReason || 'STOP',
                          usage: retryResponse.usage
                        }
                      } else {
                        // retryHtml이 없으면 completedHtml만 반환
                        onChunk({
                          type: 'done',
                          html: completedHtml,
                          isTruncated: true,
                          finishReason: 'MAX_TOKENS',
                          usage: data.usage
                        })
                        finalResponse = {
                          html: completedHtml,
                          isTruncated: true,
                          finishReason: 'MAX_TOKENS',
                          usage: data.usage
                        }
                      }
                    } catch (retryError: any) {
                      console.error('재요청 실패:', retryError)
                      // 재요청이 실패해도 완료된 HTML은 반환
                      onChunk({
                        type: 'done',
                        html: completedHtml,
                        isTruncated: true,
                        finishReason: 'MAX_TOKENS',
                        usage: data.usage
                      })
                      finalResponse = {
                        html: completedHtml,
                        isTruncated: true,
                        finishReason: 'MAX_TOKENS',
                        usage: data.usage
                      }
                    }
                  } else {
                    // 일반적인 done 이벤트 처리
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
                  }
                } else {
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
      }
      
      if (accumulatedHtml.trim()) {
        
        // 서버와 동일한 HTML 정리 로직 적용 (텍스트 깨짐 방지)
        let cleanHtml = accumulatedHtml.trim()
        
        // HTML 코드 블록 제거 (있는 경우)
        const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
        if (htmlBlockMatch) {
          cleanHtml = htmlBlockMatch[1].trim()
        } else {
          const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
          if (codeBlockMatch) {
            cleanHtml = codeBlockMatch[1].trim()
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
        
        // 클라이언트 fallback: 서버가 응답하지 못한 경우를 위한 재요청 로직
        // 실제로는 서버가 이미 처리하므로 이 로직은 거의 실행되지 않음
        const MAX_TEXT_LENGTH_BEFORE_RETRY = 100000 // 서버 설정과 동일하게 유지 (서버가 주로 처리)
        if (cleanHtml.length >= MAX_TEXT_LENGTH_BEFORE_RETRY && !request.isSecondRequest && request.menu_subtitles && request.menu_subtitles.length > 0) {
          
          // 클라이언트에서 완료된 소제목 파싱 (서버와 동일한 로직)
          const parseCompletedSubtitles = (html: string, allMenuSubtitles: any[]) => {
            const completedSubtitles: number[] = []
            
            // HTML에서 모든 소제목 섹션 추출
            const subtitleSectionStartRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi
            const subtitleSectionMatches: RegExpMatchArray[] = []
            let match: RegExpMatchArray | null
            while ((match = subtitleSectionStartRegex.exec(html)) !== null) {
              subtitleSectionMatches.push(match)
            }
            
            const subtitleSections: string[] = []
            
            // 각 subtitle-section의 시작 위치에서 닫는 태그까지 찾기
            for (let i = 0; i < subtitleSectionMatches.length; i++) {
              const match = subtitleSectionMatches[i]
              const startIndex = match.index!
              const startTag = match[0]
              
              let depth = 1
              let currentIndex = startIndex + startTag.length
              let endIndex = -1
              
              while (currentIndex < html.length && depth > 0) {
                const nextOpenDiv = html.indexOf('<div', currentIndex)
                const nextCloseDiv = html.indexOf('</div>', currentIndex)
                
                if (nextCloseDiv === -1) break
                
                if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
                  depth++
                  currentIndex = nextOpenDiv + 4
                } else {
                  depth--
                  if (depth === 0) {
                    endIndex = nextCloseDiv + 6
                    break
                  }
                  currentIndex = nextCloseDiv + 6
                }
              }
              
              if (endIndex > startIndex) {
                const section = html.substring(startIndex, endIndex)
                subtitleSections.push(section)
              }
            }
            
            // 각 소제목이 완료되었는지 확인
            allMenuSubtitles.forEach((subtitle, index) => {
              const menuMatch = subtitle.subtitle.match(/^(\d+)-(\d+)/)
              if (!menuMatch) return
              
              const menuNumber = parseInt(menuMatch[1])
              const subtitleNumber = parseInt(menuMatch[2])
              
              const subtitleTitleEscaped = subtitle.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const subtitleTitlePattern1 = new RegExp(
                `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${subtitleTitleEscaped}([\\s\\S]*?)</h3>`,
                'i'
              )
              const subtitleTitleWithoutDot = subtitle.subtitle.replace(/\./g, '')
              const subtitleTitlePattern2 = new RegExp(
                `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${subtitleTitleWithoutDot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)</h3>`,
                'i'
              )
              const numberPattern = new RegExp(
                `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${menuNumber}-${subtitleNumber}([\\s\\S]*?)</h3>`,
                'i'
              )
              const h3TextPattern = new RegExp(
                `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)</h3>`,
                'i'
              )
              
              const subtitleContentPattern = /<div[^>]*class="[^"]*subtitle-content[^"]*"[^>]*>[\s\S]*?<\/div>/i
              
              let found = false
              for (const section of subtitleSections) {
                let titleMatches = subtitleTitlePattern1.test(section) || 
                                 subtitleTitlePattern2.test(section) || 
                                 numberPattern.test(section)
                
                if (!titleMatches) {
                  const h3Match = section.match(h3TextPattern)
                  if (h3Match) {
                    const h3Text = h3Match[1].replace(/<[^>]+>/g, '').trim()
                    if (h3Text.includes(subtitle.subtitle) || 
                        h3Text.includes(subtitleTitleWithoutDot) ||
                        h3Text.includes(`${menuNumber}-${subtitleNumber}`)) {
                      titleMatches = true
                    }
                  }
                }
                
                if (titleMatches && subtitleContentPattern.test(section)) {
                  const contentMatch = section.match(/<div[^>]*class="[^"]*subtitle-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
                  if (contentMatch && contentMatch[1].trim().length > 10) {
                    if (!completedSubtitles.includes(index)) {
                      completedSubtitles.push(index)
                      found = true
                      break
                    }
                  }
                }
              }
            })
            
            return { completedSubtitles }
          }
          
          const parseResult = parseCompletedSubtitles(cleanHtml, request.menu_subtitles)
          const allSubtitlesCompleted = parseResult.completedSubtitles.length === request.menu_subtitles.length
          
          if (!allSubtitlesCompleted && parseResult.completedSubtitles.length > 0) {
            
            // 재요청 준비
            const retryRequest: JeminaiRequest = {
              ...request,
              isSecondRequest: true,
              completedSubtitleIndices: parseResult.completedSubtitles
            }
            
            // 재요청 실행
            try {
              let retryAccumulatedHtml = ''
              const retryResponse = await callJeminaiAPIStream(retryRequest, (retryChunk) => {
                // 재요청의 chunk를 누적하여 첫 번째 HTML과 병합하여 전달
                if (retryChunk.type === 'chunk') {
                  if (retryChunk.text) {
                    retryAccumulatedHtml += retryChunk.text
                  }
                  // 첫 번째 HTML과 재요청 chunk를 병합하여 전달 (html 필드에 포함)
                  const mergedHtml = cleanHtml + retryAccumulatedHtml
                  onChunk({
                    type: 'chunk',
                    text: retryChunk.text || '', // 재요청의 새로운 chunk만 전달
                    html: mergedHtml // 병합된 전체 HTML 전달
                  })
                } else if (retryChunk.type === 'start') {
                  // 재요청 시작 시 첫 번째 HTML 유지
                  retryAccumulatedHtml = ''
                  onChunk(retryChunk)
                } else {
                  // 기타 이벤트는 그대로 전달
                  onChunk(retryChunk)
                }
              })
              
              // 재요청이 완료되면 완료된 HTML과 재요청 HTML 병합
              // retryResponse.html이 있으면 사용, 없으면 retryAccumulatedHtml 사용
              const retryHtml = retryResponse.html || retryAccumulatedHtml
              if (retryHtml) {
                const mergedHtml = cleanHtml + retryHtml
                onChunk({
                  type: 'done',
                  html: mergedHtml,
                  isTruncated: retryResponse.isTruncated || false,
                  finishReason: retryResponse.finishReason || 'STOP',
                  usage: retryResponse.usage
                })
                finalResponse = {
                  html: mergedHtml,
                  isTruncated: retryResponse.isTruncated || false,
                  finishReason: retryResponse.finishReason || 'STOP',
                  usage: retryResponse.usage
                }
              } else {
                // retryHtml이 없으면 cleanHtml만 반환
                onChunk({
                  type: 'done',
                  html: cleanHtml,
                  isTruncated: true,
                  finishReason: 'MAX_TOKENS'
                })
                finalResponse = {
                  html: cleanHtml,
                  isTruncated: true,
                  finishReason: 'MAX_TOKENS'
                }
              }
            } catch (retryError: any) {
              console.error('Fallback 재요청 실패:', retryError)
              // 재요청이 실패해도 완료된 HTML은 반환
              finalResponse = {
                html: cleanHtml,
                isTruncated: true,
                finishReason: 'MAX_TOKENS'
              }
              onChunk({
                type: 'done',
                html: cleanHtml,
                isTruncated: true,
                finishReason: 'MAX_TOKENS'
              })
            }
          } else {
            // 모든 소제목이 완료되었거나 completedSubtitles가 없는 경우 정상 완료로 처리
            finalResponse = {
              html: cleanHtml
            }
            onChunk({
              type: 'done',
              html: cleanHtml
            })
          }
        } else {
          // 100000자 미만이거나 재요청인 경우 정상 완료로 처리
          finalResponse = {
            html: cleanHtml
          }
          onChunk({
            type: 'done',
            html: cleanHtml
          })
        }
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
