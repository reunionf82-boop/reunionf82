import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Gemini API 직접 호출 함수 (Deno 환경)
async function callGeminiStream(
  apiKey: string,
  model: string,
  prompt: string,
  onChunk: (chunk: any) => void
): Promise<{ response: any; finishReason?: string }> {
  // alt=sse 파라미터가 필수입니다 (Server-Sent Events 형식)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
  
  const requestBody = {
    contents: [{
      role: 'user',
      parts: [{ text: prompt }]
    }],
    generationConfig: {
      temperature: 0.2,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 65536,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }
        if (eventStart === -1) {
          // 더 이상 이벤트가 없으면 버퍼에 남김
          break
        }
        
        // "data: " 다음부터 시작
        let jsonStart = eventStart + dataPrefix.length
        let jsonEnd = jsonStart
        
        // 완전한 JSON 객체를 찾기 위해 중괄호/대괄호 매칭
        let braceCount = 0
        let bracketCount = 0
        let inString = false
        let escapeNext = false
        
        for (let i = jsonStart; i < buffer.length; i++) {
          const char = buffer[i]
          
          if (escapeNext) {
            escapeNext = false
            continue
          }
          
          if (char === '\\') {
            escapeNext = true
            continue
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString
            continue
          }
          
          if (inString) continue
          
          if (char === '{') braceCount++
          else if (char === '}') {
            braceCount--
            if (braceCount === 0 && bracketCount === 0) {
              jsonEnd = i + 1
              break
            }
          }
          else if (char === '[') bracketCount++
          else if (char === ']') {
            bracketCount--
            if (braceCount === 0 && bracketCount === 0) {
              jsonEnd = i + 1
              break
            }
          }
        }
        
        // 완전한 JSON을 찾지 못했으면 더 기다림
        if (jsonEnd === jsonStart || braceCount !== 0 || bracketCount !== 0) {
          // 버퍼에 남김
          buffer = buffer.substring(eventStart)
          break
        }
        
        // JSON 추출
        const jsonStr = buffer.substring(jsonStart, jsonEnd).trim()
        
        // 버퍼에서 처리한 부분 제거
        buffer = buffer.substring(jsonEnd)
        
        // JSON 파싱
        if (jsonStr) {
          try {
            const data = JSON.parse(jsonStr)
            
            if (data.candidates && data.candidates[0]) {
              const candidate = data.candidates[0]
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  if (part.text) {
                    onChunk({ text: part.text })
                  }
                }
              }
              if (candidate.finishReason) {
                finishReason = candidate.finishReason
                // STOP이 아닌 경우 (MAX_TOKENS 등) 로그 추가
                if (finishReason !== 'STOP') {
                }
              }
            } else {
  }

  const subtitleSections: string[] = []

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
  allMenuSubtitles.forEach((subtitle: any, index: number) => {
    const match = subtitle.subtitle.match(/^(\d+)-(\d+)/)
    if (!match) return

    const menuNumber = parseInt(match[1])
    const subtitleNumber = parseInt(match[2])
    let found = false

    for (const section of subtitleSections) {
      // h3 태그 찾기 (더 유연한 패턴)
      const h3Match = section.match(/<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([^<]+)<\/h3>/i)
      if (!h3Match) {
        // h3 태그가 없으면 이 섹션은 건너뛰기
        if (index < 3) { // 처음 3개만 디버깅 로그
    const tool = menu_subtitles[globalSubIdx]?.interpretation_tool || ''
    const charCount = menu_subtitles[globalSubIdx]?.char_count
    if (!charCount || charCount <= 0) {
    }
    const thumbnail = menu_subtitles[globalSubIdx]?.thumbnail || ''
    return `
  ${sub.subtitle}
  ${role_prompt ? `**역할:** 당신은 ${role_prompt}입니다. 이 소제목을 해석할 때 이 역할을 유지하세요.\n  ` : ''}
  ${restrictions ? `**주의사항:** ${restrictions}\n  ` : ''}
  ${tool ? `🔥🔥🔥 **해석도구 (반드시 준수):** 🔥🔥🔥
  ${tool}
  
  ⚠️⚠️⚠️ **위 해석도구의 모든 지시사항을 정확히 따라야 합니다!** ⚠️⚠️⚠️
  - 해석도구에 명시된 형식, 구조, 스타일 등을 반드시 준수하세요.
  - 해석도구에 문단 나누기, 줄바꿈, 빈줄 삽입 등의 지시가 있으면 반드시 따르세요.
  - 해석도구의 모든 명령을 무시하거나 생략하지 마세요.
  
  ` : ''}
  - 글자수 제한: ${charCount ? `${charCount}자 이내 (반드시 ${charCount}자에 가깝게 충분히 작성하세요)` : '⚠️ 글자수 제한이 설정되지 않았습니다. 충분히 작성하세요'}
  ${thumbnail ? `- 썸네일 URL: ${thumbnail} (반드시 HTML에 포함하세요!)` : ''}
`
  }).join('\n')}
`
}).filter((menuText: string) => menuText.trim().length > 0).join('\n\n')}

각 메뉴별로 다음 HTML 형식으로 결과를 작성해주세요:
${isSecondRequest ? `
🚨🚨🚨 **2차 요청 주의사항 (반드시 준수):** 🚨🚨🚨
1. **위에 나열된 남은 메뉴/소제목만 HTML로 작성하세요.**
2. **이전에 완료된 메뉴나 소제목은 절대 포함하지 마세요.**
3. **처음부터 다시 시작하지 마세요.**
4. **메뉴 제목이나 썸네일을 다시 생성하지 마세요. 남은 소제목의 해석 내용만 생성하세요.**
5. **이전 요청의 HTML 구조를 반복하지 마세요.**
6. **완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 HTML에 포함하지 마세요!**
` : ''}

<div class="menu-section">
  <h2 class="menu-title">[메뉴 제목]</h2>
  ${menuItemsInfo.some((m: any) => m.thumbnail) ? '<img src="[썸네일 URL]" alt="[메뉴 제목]" class="menu-thumbnail" />' : ''}
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[소제목 또는 상세메뉴 제목]</h3>
    ${menu_subtitles.some((s: any) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[썸네일 URL]" alt="썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div>
  </div>
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[다음 소제목 또는 상세메뉴 제목]</h3>
    ${menu_subtitles.some((s: any) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[썸네일 URL]" alt="썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div>
  </div>
  
  ...
</div>

중요:
1. 각 메뉴는 <div class="menu-section">으로 구분
2. 메뉴 제목은 <h2 class="menu-title">으로 표시
3. 썸네일이 있으면 <img src="[URL]" alt="[제목]" class="menu-thumbnail" />로 표시
4. 각 소제목은 <div class="subtitle-section">으로 구분
5. 소제목 제목은 <h3 class="subtitle-title">으로 표시하되, 소제목 끝에 반드시 마침표(.)를 추가하세요. 예: <h3 class="subtitle-title">1-1. 나의 타고난 '기본 성격'과 '가치관'.</h3>
6. **소제목 썸네일이 제공된 경우 (위 소제목 목록에 "썸네일 URL"이 표시된 경우), 반드시 <h3 class="subtitle-title"> 태그 바로 다음에 <div class="subtitle-thumbnail-container"><img src="[썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>를 포함하세요. 썸네일이 없으면 포함하지 마세요.**
7. 해석 내용은 <div class="subtitle-content"> 안에 HTML 형식으로 작성
8. 각 content는 해당 subtitle의 char_count를 초과하지 않도록 주의
${isSecondRequest ? '9. 🚨🚨🚨 **2차 요청: 아래에 나열된 남은 메뉴/소제목만 포함하세요. 이전에 완료된 내용은 절대 포함하지 마세요. 처음부터 다시 시작하지 말고, 남은 소제목부터만 해석하세요. 메뉴 제목이나 썸네일을 다시 생성하지 마세요. 오직 남은 소제목의 해석 내용만 생성하세요. 위에 나열된 완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 포함하지 마세요!** 🚨🚨🚨' : '9. 모든 메뉴와 소제목을 순서대로 포함'}
10. 소제목 제목에 마침표가 없으면 자동으로 마침표를 추가하세요 (TTS 재생 시 자연스러운 구분을 위해)
11. 소제목 제목과 해석 내용 사이에 빈 줄이나 공백을 절대 넣지 마세요. <h3 class="subtitle-title"> 태그와 <div class="subtitle-content"> 태그 사이에 줄바꿈이나 공백 문자를 넣지 말고 바로 붙여서 작성하세요. 단, 썸네일이 있는 경우 <h3> 태그와 썸네일 사이, 썸네일과 <div class="subtitle-content"> 사이에는 줄바꿈이 있어도 됩니다. 예: <h3 class="subtitle-title">1-1. 소제목.</h3><div class="subtitle-thumbnail-container"><img src="[URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div><div class="subtitle-content">본문 내용</div>
`

  return prompt
}

serve(async (req) => {
  // CORS preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200
    })
  }

  try {
    const body = await req.json()
    const {
      role_prompt,
      restrictions,
      menu_subtitles,
      user_info,
      partner_info,
      menu_items,
      model = 'gemini-3-flash-preview',
      manse_ryeok_table,
      manse_ryeok_text,
      manse_ryeok_json,
      day_gan_info,
      isSecondRequest,
      completedSubtitles,
      completedSubtitleIndices
    } = body