import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

// Vercel Serverless Function의 타임아웃을 5분(300초)으로 설정
export const maxDuration = 300

// HTML 길이 제한 상수 (10만자)
const MAX_HTML_LENGTH = 100000

export async function POST(req: NextRequest) {
  try {

    const body = await req.json()
    const { role_prompt, restrictions, menu_subtitles, user_info, partner_info, menu_items, model = 'gemini-3-flash-preview', manse_ryeok_table, manse_ryeok_text, manse_ryeok_json, day_gan_info, isSecondRequest, completedSubtitles, completedSubtitleIndices, previousContext, isParallelMode, currentMenuIndex, totalMenus } = body

    if (isParallelMode) {


    }
    
    // 상세메뉴 데이터 구조 확인을 위한 정밀 로그
    if (menu_subtitles && menu_subtitles.length > 0) {
      const subtitlesWithDetailMenus = menu_subtitles.filter((s: any) => s.detailMenus && s.detailMenus.length > 0)

      if (subtitlesWithDetailMenus.length > 0) {

    const tool = menu_subtitles[globalSubIdx]?.interpretation_tool || ''
    const charCount = menu_subtitles[globalSubIdx]?.char_count
    if (!charCount || charCount <= 0) {

    }
    const thumbnail = menu_subtitles[globalSubIdx]?.thumbnail || ''
    
    return `
  ${sub.subtitle}
  ${role_prompt ? `**역할:** 당신은 ${role_prompt}입니다. 이 소제목을 해석할 때 이 역할을 유지하세요.\n  ` : ''}
  ${restrictions ? `**주의사항:** ${restrictions}\n  ` : ''}
  ${tool ? `**해석도구:** ${tool}\n  ` : ''}
  - 글자수: ${charCount ? `${charCount}자 이내` : '글자수 제한 없음'}
  ${thumbnail ? `- 썸네일 URL: ${thumbnail}` : ''}`
  }).join('\n')}
`
}).filter((menuText: string) => menuText.trim().length > 0).join('\n\n')}

각 메뉴별로 다음 HTML 구조로 결과를 작성해주세요:

<div class="menu-section">
  <h2 class="menu-title">[메뉴 제목]</h2>
  ${menuItemsInfo.some((m: any) => m.thumbnail) ? '<img src="[썸네일 URL]" alt="[메뉴 제목]" class="menu-thumbnail" />' : ''}
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[소제목 또는 상세메뉴 제목]</h3>
    ${menu_subtitles.some((s: any) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[썸네일 URL]" alt="썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용]</div>
  </div>
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[다음 소제목 또는 상세메뉴 제목]</h3>
    <div class="subtitle-content">[해석 내용]</div>
  </div>

  ...
</div>

**중요한 HTML 형식 지시사항:**
- 문단 간 한 줄 띄기가 필요한 경우, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요.
- HTML에서는 일반 텍스트의 줄바꿈이나 공백만으로는 화면에 빈 줄이 표시되지 않습니다.
- 문단 사이에 빈 줄을 표시하려면: <p>첫 번째 문단</p><br><p>두 번째 문단</p> 또는 <p>첫 번째 문단<br><br>두 번째 문단</p> 형태로 작성하세요.
- 해석도구에서 "문단간 한줄띄기" 지시가 있으면, 반드시 <br> 또는 <p> 태그로 표현하세요.

`

          }
          
          const subtitleSections: string[] = []
          
          // 각 section의 시작 위치에서 닫는 태그까지 찾기
          for (let i = 0; i < sectionMatches.length; i++) {
            const match = sectionMatches[i]
            const startIndex = match.index!
            const startTag = match[0]
            
            // 시작 태그 다음부터 닫는 </div> 찾기 (중첩된 div 고려)
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

          return { completedSubtitles, completedMenus }
        }
        
        // 재시도 로직 (최대 3번) - API 호출 + 스트림 읽기 전체를 재시도
          let lastError: any = null
          const maxRetries = 3
          let streamResult: any = null
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              // 매 시도마다 초기화 (단, hasSentPartialDone과 hasSentTimeoutWarning은 유지)
              fullText = ''
              isFirstChunk = true
              streamResult = null

              streamResult = await geminiModel.generateContentStream(prompt)
          
          // 스트림 데이터 읽기
          try {
            let chunkIndex = 0
            let lastCompletionCheckChunk = 0 // 마지막 완료 체크 청크 인덱스
            const COMPLETION_CHECK_INTERVAL = 50 // 50번째 청크마다 완료 여부 체크
            let allSubtitlesCompletedEarly = false // 모든 소제목이 조기에 완료되었는지 플래그
            
            for await (const chunk of streamResult.stream) {
              chunkIndex++
              // 타임아웃 직전 부분 완료 처리 (1차 요청 중단, 2차 요청으로 이어가기)
              const elapsed = Date.now() - streamStartTime
              
              // 매 100번째 청크마다 경과 시간 로깅 (디버깅용)
              if (chunkIndex % 100 === 0 || elapsed >= 270000) {

  }
}


