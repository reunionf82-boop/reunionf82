// 재미나이 API 호출 함수 (서버 사이드 API 라우트 사용)

interface JeminaiRequest {
  role_prompt: string
  restrictions: string
  menu_subtitles: Array<{
    subtitle: string
    interpretation_tool: string
    char_count: number
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
  type: 'start' | 'chunk' | 'done' | 'error'
  text?: string
  html?: string
  accumulatedLength?: number
  isTruncated?: boolean
  finishReason?: string
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
  const apiKey = process.env.NEXT_PUBLIC_JEMINAI_API_URL
  
  // API 키가 없거나 localhost면 모의 응답 반환
  const isDevelopment = process.env.NODE_ENV === 'development'
  const hasInvalidKey = !apiKey || apiKey.includes('localhost')
  
  if (isDevelopment && hasInvalidKey) {
    console.log('개발 모드: 모의 응답 반환', { isDevelopment, hasInvalidKey })
    const mockResponse = getMockResponse(request)
    // 모의 응답도 스트리밍처럼 시뮬레이션
    onChunk({ type: 'start' })
    // 청크로 나누어 전송
    const chunkSize = 100
    for (let i = 0; i < mockResponse.html.length; i += chunkSize) {
      const chunk = mockResponse.html.substring(i, i + chunkSize)
      onChunk({ 
        type: 'chunk', 
        text: chunk,
        accumulatedLength: Math.min(i + chunkSize, mockResponse.html.length)
      })
      await new Promise(resolve => setTimeout(resolve, 50)) // 시뮬레이션 딜레이
    }
    onChunk({ type: 'done', html: mockResponse.html })
    return mockResponse
  }
  
  if (!apiKey) {
    throw new Error('NEXT_PUBLIC_JEMINAI_API_URL 환경 변수가 설정되지 않았습니다.')
  }
  
  try {
    const selectedModel = request.model || 'gemini-2.5-flash'
    const modelDisplayName = selectedModel === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : selectedModel === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : selectedModel
    console.log('=== 재미나이 API 스트리밍 호출 시작 ===')
    console.log('선택된 모델:', modelDisplayName, `(${selectedModel})`)
    
    const response = await fetch('/api/jeminai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role_prompt: request.role_prompt,
        restrictions: request.restrictions,
        menu_subtitles: request.menu_subtitles,
        menu_items: request.menu_items || [],
        user_info: request.user_info,
        partner_info: request.partner_info,
        model: request.model || 'gemini-2.5-flash'
      }),
    })

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
      console.error('API 에러:', errorMessage)
      onChunk({ type: 'error', error: errorMessage })
      throw new Error(errorMessage)
    }

    // 스트림 읽기
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    
    if (!reader) {
      const errorMsg = '스트림을 읽을 수 없습니다.'
      console.error(errorMsg)
      onChunk({ type: 'error', error: errorMsg })
      throw new Error(errorMsg)
    }

    console.log('스트림 리더 생성 완료, 데이터 읽기 시작')
    let buffer = ''
    let finalResponse: JeminaiResponse | null = null
    let chunkCount = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          console.log('스트림 읽기 완료, 총 청크:', chunkCount)
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
                onChunk({ type: 'start' })
              } else if (data.type === 'chunk') {
                onChunk({
                  type: 'chunk',
                  text: data.text,
                  accumulatedLength: data.accumulatedLength
                })
              } else if (data.type === 'done') {
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
                console.error('스트림 에러:', errorMsg)
                onChunk({ type: 'error', error: errorMsg })
                throw new Error(errorMsg)
              }
            } catch (e) {
              console.error('스트림 데이터 파싱 에러:', e, '라인:', line.substring(0, 100))
            }
          }
        }
      }
    } catch (streamError: any) {
      console.error('스트림 읽기 중 에러:', streamError)
      onChunk({ type: 'error', error: streamError?.message || '스트림 읽기 중 오류가 발생했습니다.' })
      throw streamError
    }
    
    if (!finalResponse) {
      const errorMsg = '응답을 받지 못했습니다.'
      console.error(errorMsg)
      onChunk({ type: 'error', error: errorMsg })
      throw new Error(errorMsg)
    }
    
    console.log('=== 재미나이 API 스트리밍 완료 ===')
    return finalResponse
  } catch (error: any) {
    console.error('=== 재미나이 API 스트리밍 에러 ===')
    console.error('에러:', error)
    onChunk({ type: 'error', error: error?.message || '오류가 발생했습니다.' })
    throw error
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
