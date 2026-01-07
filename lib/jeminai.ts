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
  isParallelMode?: boolean
  currentMenuIndex?: number
  totalMenus?: number
  allMenuGroups?: Array<{
    menuIndex: number
    menuItem: any
    subtitles: Array<{ subtitle: string; interpretation_tool: string; char_count: number }>
  }>
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
        completedSubtitleIndices: request.completedSubtitleIndices,
        previousContext: (request as any).previousContext,
        isParallelMode: (request as any).isParallelMode,
        currentMenuIndex: (request as any).currentMenuIndex,
        totalMenus: (request as any).totalMenus
      }
      
      // 디버그: 전달되는 모델 값 확인
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
      if (fetchError.name === 'AbortError') {
        const errorMsg = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
        onChunk({ type: 'error', error: errorMsg })
        throw new Error(errorMsg)
      }
      
      // 네트워크 연결 실패 시 더 자세한 에러 메시지
      if (fetchError.message?.includes('Failed to fetch') || fetchError.message?.includes('NetworkError')) {
        const detailedError = `서버 연결 실패: ${edgeFunctionUrl}에 연결할 수 없습니다. 서버가 실행 중인지 확인하세요.`
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
      // 사용자 친화적 에러 메시지 생성
      let userFriendlyMessage = '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
      if (response.status === 429) {
        // 429 에러는 점사중... 메시지가 이미 떠 있으므로 에러 메시지 전송하지 않음
        // 서버에서 재시도가 모두 실패한 경우이지만, 조용히 실패 처리
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
  return { html: mockHtml }
}
