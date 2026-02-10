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
    
    if (!role_prompt || !menu_subtitles || !Array.isArray(menu_subtitles) || menu_subtitles.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    const apiKey = process.env.NEXT_PUBLIC_JEMINAI_API_URL

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Jeminai API key not configured' },
        { status: 500 }
      )
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    
    // 모델 선택
    const selectedModel = model || 'gemini-3-flash-preview'
    
    // 모델별 최대 출력 토큰 설정
    // Gemini Pro 모델들: 65536
    // Gemini Flash 모델들: 65536 (최대값)
    const maxOutputTokens = 65536
    
    // 일반 모드 사용 (HTML 형태로 결과 반환)
    const geminiModel = genAI.getGenerativeModel({ 
      model: selectedModel,
      generationConfig: {
        // 창의성 억제, 입력 데이터 집착
        temperature: 0.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: maxOutputTokens,
      },
      // 재회 상담 서비스를 위한 필수 설정 (모든 필터 해제)
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_NONE,
        },
      ],
    })

    // JSON 데이터 파싱하여 각 주의 값 추출
    let parsedManseRyeok: any = null
    if (manse_ryeok_json) {
      try {
        parsedManseRyeok = JSON.parse(manse_ryeok_json)
      } catch (e) {
      }
    }

    const hasManseRyeokData = !!(parsedManseRyeok || manse_ryeok_text || manse_ryeok_table)

    // 만세력 데이터 필수 확인
    if (!hasManseRyeokData) {
      return NextResponse.json(
        { error: 'manse_ryeok_text 또는 manse_ryeok_json이 필요합니다.' },
        { status: 400 }
      )
    }

    // 프롬프트 작성
    // menu_items 정보를 포함하여 각 메뉴별로 제목과 썸네일을 포함한 HTML 생성
    const menuItemsInfo = menu_items ? menu_items.map((item: any, idx: number) => {
      const menuTitle = typeof item === 'string' ? item : (item.value || item.title || '')
      const menuThumbnail = typeof item === 'object' ? (item.thumbnail || '') : ''
      return {
        index: idx,
        title: menuTitle,
        thumbnail: menuThumbnail
      }
    }) : []

    // 한국의 현재 날짜/시간 가져오기 (Asia/Seoul, UTC+9)
    const now = new Date()
    const koreaFormatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const koreaDateString = koreaFormatter.format(now)
    const koreaYearFormatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
    })
    const currentYear = parseInt(koreaYearFormatter.format(now))

    // 상세메뉴가 있는 소제목이 있는지 미리 확인
    const hasDetailMenusInSubtitles = menu_subtitles.some((s: any) => s.detailMenus && s.detailMenus.length > 0)

    const prompt = `
${isSecondRequest ? `
🚨🚨🚨 **중요: 2차 요청입니다. 절대 처음부터 다시 시작하지 마세요!** 🚨🚨🚨
**이전 요청에서 이미 완료된 메뉴/소제목은 절대 포함하지 마세요.**
**아래에 나열된 남은 메뉴/소제목만 해석하세요.**
**메뉴 제목이나 썸네일을 다시 생성하지 마세요. 오직 남은 소제목의 해석 내용만 생성하세요.**
**다시 강조: 처음부터 다시 시작하지 마세요!**

---
` : ''}
${isParallelMode && previousContext ? `
🔄 **병렬점사 모드: 이전 대메뉴 컨텍스트** 🔄
이전 대메뉴에서 생성된 점사 내용입니다. 이 내용을 참고하여 현재 대메뉴의 점사를 자연스럽게 이어가세요.
**중요:** 이전 내용을 그대로 반복하지 말고, 현재 대메뉴의 내용만 새로 생성하되, 전체적인 맥락과 흐름을 유지하세요.

**이전 대메뉴 점사 내용:**
${previousContext.substring(0, 5000)}${previousContext.length > 5000 ? '\n...(이전 내용의 일부만 표시, 전체 맥락 참고)' : ''}

---
` : ''}
당신은 ${role_prompt}입니다.

---

---
# ⚠️ 입력 데이터 (계산된 불변의 값 - 그대로 복사하여 사용)

${manse_ryeok_text ? `${manse_ryeok_text}` : '(만세력 텍스트 데이터 없음 - 해석 불가)'}

${manse_ryeok_json ? `
**JSON 형식 만세력 데이터 (구조화):**
\`\`\`json
${manse_ryeok_json}
\`\`\`
` : ''}

${day_gan_info ? `
**일간(日干) 정보:** ${day_gan_info.fullName} (천간: ${day_gan_info.gan}(${day_gan_info.hanja}), 오행: ${day_gan_info.ohang})
` : ''}

${hasManseRyeokData ? `
**중요:** 위 데이터만 사용하세요. 생년월일/띠/출생지는 보안상 제공되지 않았으며, 임의로 추정하거나 계산하는 행위는 금지됩니다.
` : ''}

${!hasManseRyeokData ? `
⚠️⚠️⚠️ 만세력 데이터가 없습니다. 어떤 해석도 하지 말고, "만세력 데이터가 없어 해석할 수 없습니다"라고만 답하세요.
` : ''}

${restrictions ? `주의사항: ${restrictions}` : ''}

사용자 정보:
- 이름: ${user_info.name}
${user_info.gender ? `- 성별: ${user_info.gender}` : ''}
- 생년월일/생시는 보안상 제공하지 않습니다.
${partner_info ? `
이성 정보:
- 이름: ${partner_info.name}
${partner_info.gender ? `- 성별: ${partner_info.gender}` : ''}
- 생년월일/생시는 보안상 제공하지 않습니다.
` : ''}

---

${isSecondRequest ? `
🚨🚨🚨 **중요: 2차 요청입니다. 절대 처음부터 다시 시작하지 마세요!** 🚨🚨🚨

**이미 완료된 소제목 목록 (절대 포함하지 마세요!):**
${completedSubtitles && completedSubtitles.length > 0 ? completedSubtitles.map((sub: any, idx: number) => {
  const subtitleText = typeof sub === 'string' ? sub : (sub.subtitle || sub.title || `소제목 ${idx + 1}`)
  return `- ${subtitleText} (이미 완료됨, 건너뛰세요)`
}).join('\n') : '없음'}

**⚠️⚠️⚠️ 반드시 준수할 사항 (매우 중요!):** ⚠️⚠️⚠️
1. **위에 나열된 완료된 소제목은 절대 포함하지 마세요.** 이미 해석이 완료되었으므로 건너뛰세요.
2. **처음부터 다시 시작하지 마세요.** 아래에 나열된 남은 메뉴/소제목만 해석하세요.
3. **이전 요청의 HTML 구조나 내용을 반복하지 마세요.** 오직 남은 소제목만 새로 생성하세요.
4. **메뉴 제목이나 썸네일을 다시 생성하지 마세요.** 남은 소제목의 해석 내용만 생성하세요.
5. **완료된 소제목의 HTML을 생성하지 마세요.** 오직 남은 소제목만 HTML로 작성하세요.
6. **완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 HTML에 포함하지 마세요!**

이전 요청에서 타임아웃으로 인해 일부만 완료되었으므로, 남은 부분만 이어서 해석합니다.
**🚨🚨🚨 다시 강조: 위에 나열된 완료된 소제목은 건너뛰고, 아래 남은 소제목만 해석하세요! 처음부터 다시 시작하지 마세요! 🚨🚨🚨**
` : ''}

${isSecondRequest ? `
**⚠️ 아래에 나열된 남은 소제목만 해석하세요. 위에 나열된 완료된 소제목은 절대 포함하지 마세요!**
` : ''}

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요.

${menuItemsInfo.map((menuItem: any, menuIdx: number) => {
  // ⚠️ 병렬점사 모드에서는 요청마다 "현재 대메뉴 1개"만 들어오고,
  // menu_subtitles도 "현재 대메뉴에 해당하는 소제목/상세메뉴"만 전달된다.
  // 따라서 여기서 다시 숫자(prefix)로 필터링하면 2번째 대메뉴부터 전부 비게 되어
  // "첫 대제목만 덩그러니 남는" 현상이 발생할 수 있다.
  const menuNumber = (isParallelMode && typeof currentMenuIndex === 'number')
    ? currentMenuIndex + 1
    : menuIdx + 1

  // 병렬점사: 이미 현재 대메뉴 것만 넘어오므로 그대로 사용
  // 직렬/일괄: 전체가 넘어오므로 메뉴번호로 필터링
  const subtitlesForMenu = (isParallelMode && typeof currentMenuIndex === 'number')
    ? menu_subtitles
    : menu_subtitles.filter((sub: any) => {
        const match = sub.subtitle.match(/^(\d+)/)
        return match ? parseInt(match[1]) === menuNumber : false
      })
  
  // 2차 요청일 때는 남은 소제목이 있는 메뉴만 표시
  if (isSecondRequest && subtitlesForMenu.length === 0) {
    return ''
  }
  
  return `
메뉴 ${menuNumber}: ${menuItem.title}
${menuItem.thumbnail ? `썸네일 URL: ${menuItem.thumbnail}` : ''}

${isSecondRequest ? `**⚠️ 이 메뉴의 아래 소제목들만 해석하세요. 위에 나열된 완료된 소제목은 건너뛰세요!**` : ''}

이 메뉴의 소제목들:
${subtitlesForMenu.map((sub: any, subIdx: number) => {
    const globalSubIdx = menu_subtitles.findIndex((s: any) => s.subtitle === sub.subtitle)
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

    // 스트리밍 응답 생성
    const encoder = new TextEncoder()
    
    // ReadableStream 생성
    const stream = new ReadableStream({
      async start(controller) {
        // 변수들을 try 블록 밖에 선언하여 catch 블록에서도 접근 가능하도록 함
        let fullText = ''
        let isFirstChunk = true
        // streamStartTime을 generateContentStream 호출 전에 설정하여 정확한 시간 측정
        const streamStartTime = Date.now()
        const TIMEOUT_WARNING = 280000 // 280초 (타임아웃 20초 전 경고)
        const TIMEOUT_PARTIAL = 280000 // 280초 (1차 요청 중단, 2차 요청으로 이어가기)
        const MAX_DURATION = 300000 // 300초 (서버 타임아웃)
        let hasSentTimeoutWarning = false
        let hasSentPartialDone = false
        
        // 완료된 메뉴/소제목 파싱 함수 (catch 블록에서도 사용하기 위해 try 블록 밖에 선언)
        const parseCompletedSubtitles = (html: string, allMenuSubtitles: any[]) => {
          const completedSubtitles: number[] = []
          const completedMenus: number[] = []

          // HTML에서 모든 소제목 섹션 추출 (더 견고한 방법)
          // subtitle-section과 detail-menu-section div를 찾되, 내부 구조를 정확히 파악
          // 패턴: <div class="subtitle-section">...<h3 class="subtitle-title">...</h3>...<div class="subtitle-content">...</div>...</div>
          // 패턴: <div class="detail-menu-section">...<h3 class="detail-menu-title">...</h3>...<div class="detail-menu-content">...</div>...</div>
          
          // subtitle-section과 detail-menu-section 모두 찾기
          const sectionStartRegex = /<div[^>]*class="[^"]*(subtitle-section|detail-menu-section)[^"]*"[^>]*>/gi
          const sectionMatches: RegExpExecArray[] = []
          let match: RegExpExecArray | null
          while ((match = sectionStartRegex.exec(html)) !== null) {
            sectionMatches.push(match)
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
          
          const firstSection = subtitleSections[0]
          if (firstSection) {
          } else {
          }
          
          // 각 소제목이 완료되었는지 확인
          allMenuSubtitles.forEach((subtitle, index) => {
            const menuMatch = subtitle.subtitle.match(/^(\d+)-(\d+)/)
            if (!menuMatch) return
            
            const menuNumber = parseInt(menuMatch[1])
            const subtitleNumber = parseInt(menuMatch[2])
            
            // 소제목 제목 패턴 (더 유연하게 - h3 태그 내부의 모든 내용을 고려)
            const subtitleTitleEscaped = subtitle.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // 패턴 1: h3 태그 안에 소제목 제목이 포함되어 있는지 확인 (태그 내부 구조 고려)
            const subtitleTitlePattern1 = new RegExp(
              `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${subtitleTitleEscaped}([\\s\\S]*?)</h3>`,
              'i'
            )
            // 패턴 2: 마침표를 제거한 버전
            const subtitleTitleWithoutDot = subtitle.subtitle.replace(/\./g, '')
            const subtitleTitlePattern2 = new RegExp(
              `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${subtitleTitleWithoutDot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)</h3>`,
              'i'
            )
            // 패턴 3: 숫자 패턴만 매칭 (예: "1-1" 또는 "1-1.")
            const numberPattern = new RegExp(
              `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${menuNumber}-${subtitleNumber}([\\s\\S]*?)</h3>`,
              'i'
            )
            // 패턴 4: h3 태그 내부 텍스트를 추출해서 직접 비교
            const h3TextPattern = new RegExp(
              `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)</h3>`,
              'i'
            )
            
            // 소제목 내용 패턴 (더 유연하게) - subtitle-content 또는 detail-menu-content
            const subtitleContentPattern = /<div[^>]*class="[^"]*(subtitle-content|detail-menu-content)[^"]*"[^>]*>[\s\S]*?<\/div>/i
            
            // detail-menu-section의 경우 detail-menu-title 패턴도 확인
            const detailMenuTitlePattern = /<h3[^>]*class="[^"]*detail-menu-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i
            
            // 완료된 소제목 확인: 제목과 내용이 모두 있어야 함
            let found = false
            for (const section of subtitleSections) {
              // subtitle-section인지 detail-menu-section인지 확인
              const isDetailMenuSection = section.includes('detail-menu-section')
              
              let titleMatches = false
              
              if (isDetailMenuSection) {
                // detail-menu-section의 경우: detail-menu-title에서 소제목 제목 찾기
                const detailMenuTitleMatch = section.match(detailMenuTitlePattern)
                if (detailMenuTitleMatch) {
                  const detailMenuTitleText = detailMenuTitleMatch[1].replace(/<[^>]+>/g, '').trim()
                  // 상세메뉴 제목이 소제목과 일치하는지 확인
                  // 상세메뉴는 평평한 배열이므로 subtitle과 직접 비교
                  if (detailMenuTitleText.includes(subtitle.subtitle) || 
                      detailMenuTitleText.includes(subtitleTitleWithoutDot) ||
                      detailMenuTitleText.includes(`${menuNumber}-${subtitleNumber}`)) {
                    titleMatches = true
                  }
                }
              } else {
                // subtitle-section의 경우: 기존 로직 사용
                // 여러 패턴으로 제목 매칭 시도
                titleMatches = subtitleTitlePattern1.test(section) || 
                               subtitleTitlePattern2.test(section) || 
                               numberPattern.test(section)
                
                // 패턴 4: h3 태그 내부 텍스트 직접 비교
                if (!titleMatches) {
                  const h3Match = section.match(h3TextPattern)
                  if (h3Match) {
                    const h3Text = h3Match[1].replace(/<[^>]+>/g, '').trim() // HTML 태그 제거 후 텍스트만 추출
                    // 소제목 제목이 포함되어 있는지 확인 (부분 매칭)
                    if (h3Text.includes(subtitle.subtitle) || 
                        h3Text.includes(subtitleTitleWithoutDot) ||
                        h3Text.includes(`${menuNumber}-${subtitleNumber}`)) {
                      titleMatches = true
                    }
                  }
                }
              }
              
              if (titleMatches && subtitleContentPattern.test(section)) {
                // 내용이 비어있지 않은지 확인 (최소 10자 이상)
                // subtitle-content 또는 detail-menu-content 모두 확인
                const contentMatch = section.match(/<div[^>]*class="[^"]*(subtitle-content|detail-menu-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
                if (contentMatch && contentMatch[2].trim().length > 10) {
                  if (!completedSubtitles.includes(index)) {
                    completedSubtitles.push(index)
                    if (!completedMenus.includes(menuNumber - 1)) {
                      completedMenus.push(menuNumber - 1)
                    }
                    found = true
                    break
                  }
                }
              }
            }
            
            if (!found) {
            }
          })

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
            const COMPLETION_CHECK_INTERVAL = 10 // 10번째 청크마다 완료 여부 체크 (조기 done 전송 빈도 향상)
            const MIN_LENGTH_FOR_EVERY_CHUNK_CHECK = 3000 // 이 길이 이상이면 매 청크마다 완료 체크
            let allSubtitlesCompletedEarly = false // 모든 소제목이 조기에 완료되었는지 플래그
            
            for await (const chunk of streamResult.stream) {
              chunkIndex++
              // 타임아웃 직전 부분 완료 처리 (1차 요청 중단, 2차 요청으로 이어가기)
              const elapsed = Date.now() - streamStartTime
              
              // 매 100번째 청크마다 경과 시간 로깅 (디버깅용)
              if (chunkIndex % 100 === 0 || elapsed >= 270000) {
              }
              
              // chunkText를 먼저 처리
              let chunkText = ''
              try {
                chunkText = chunk.text()
                if (chunkText) {
                  fullText += chunkText
                  
                  // 첫 번째 청크인 경우 시작 신호 전송
                  if (isFirstChunk) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`))
                    isFirstChunk = false
                  }
                  
                  // 청크 데이터 전송
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'chunk', 
                    text: chunkText,
                    accumulatedLength: fullText.length
                  })}\n\n`))
                }
              } catch (chunkError: any) {
                // 청크 처리 에러는 로깅만 하고 계속 진행
                // 전체 스트림이 실패하지 않도록 함
              }
              
              // 모든 소제목 완료 여부 체크: 10청크마다, 또는 HTML이 3000자 이상이면 매 청크마다 (끝난 직후 즉시 done 전송)
              if (fullText.trim().length > 100 && (chunkIndex - lastCompletionCheckChunk >= COMPLETION_CHECK_INTERVAL || fullText.length >= MIN_LENGTH_FOR_EVERY_CHUNK_CHECK)) {
                // HTML 코드 블록 제거 (있는 경우) - 파싱 전에 정리
                let htmlForParsing = fullText.trim()
                const htmlBlockMatch = htmlForParsing.match(/```html\s*([\s\S]*?)\s*```/)
                if (htmlBlockMatch) {
                  htmlForParsing = htmlBlockMatch[1].trim()
                } else {
                  const codeBlockMatch = htmlForParsing.match(/```\s*([\s\S]*?)\s*```/)
                  if (codeBlockMatch) {
                    htmlForParsing = codeBlockMatch[1].trim()
                  }
                }
                
                // 완료된 메뉴/소제목 파싱
                const { completedSubtitles } = parseCompletedSubtitles(htmlForParsing, menu_subtitles)
                const allSubtitlesCompleted = completedSubtitles.length === menu_subtitles.length
                
                if (allSubtitlesCompleted) {
                  
                  allSubtitlesCompletedEarly = true
                  // 즉시 루프 종료하여 스트림 읽기 중단
                  break // for await 루프를 즉시 종료
                } else {
                  lastCompletionCheckChunk = chunkIndex
                  // 완료되지 않았으면 계속 진행
                }
              }
              
              // 1만자 제한 체크 (2차 요청이 아니고, 아직 partial_done을 보내지 않았을 때만)
              if (fullText.length >= MAX_HTML_LENGTH && !hasSentPartialDone && !isSecondRequest) {
                
                // HTML 코드 블록 제거 (있는 경우) - 파싱 전에 정리
                let htmlForParsing = fullText.trim()
                const htmlBlockMatch = htmlForParsing.match(/```html\s*([\s\S]*?)\s*```/)
                if (htmlBlockMatch) {
                  htmlForParsing = htmlBlockMatch[1].trim()
                } else {
                  const codeBlockMatch = htmlForParsing.match(/```\s*([\s\S]*?)\s*```/)
                  if (codeBlockMatch) {
                    htmlForParsing = codeBlockMatch[1].trim()
                  }
                }
                
                // 완료된 메뉴/소제목 파싱
                const { completedSubtitles, completedMenus } = parseCompletedSubtitles(htmlForParsing, menu_subtitles)
                const remainingSubtitles = menu_subtitles
                  .map((sub: any, index: number) => ({ ...sub, originalIndex: index }))
                  .filter((_: any, index: number) => !completedSubtitles.includes(index))
                
                if (remainingSubtitles.length > 0) {
                  // 안전하게 HTML 끊기: 완료된 소제목/상세메뉴까지만 포함
                  let safeHtml = htmlForParsing
                  
                  // 마지막으로 완전히 닫힌 subtitle-section 또는 detail-menu-section 찾기
                  // 정규식으로 모든 완료된 섹션 추출
                  const completedSectionPattern = /<div[^>]*class="[^"]*(subtitle-section|detail-menu-section)[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/gi
                  const sections: RegExpMatchArray[] = []
                  let sectionMatch: RegExpMatchArray | null
                  while ((sectionMatch = completedSectionPattern.exec(safeHtml)) !== null) {
                    sections.push(sectionMatch)
                  }
                  
                  let safeCutIndex = -1
                  
                  if (sections.length > 0) {
                    // 마지막 완료된 섹션의 끝 위치 찾기
                    const lastSection = sections[sections.length - 1]
                    safeCutIndex = lastSection.index! + lastSection[0].length
                  } else {
                    // 섹션을 못 찾았으면 마지막 </div>로 자르기
                    safeCutIndex = safeHtml.lastIndexOf('</div>')
                    if (safeCutIndex > 0) {
                      safeCutIndex += 6 // </div> 길이
                    }
                  }
                  
                  // 안전한 지점까지 자르기
                  if (safeCutIndex > 0 && safeCutIndex < safeHtml.length) {
                    // 테이블 안에 있는지 확인: safeCutIndex 이전에 열린 테이블이 닫혔는지 체크
                    const beforeCut = safeHtml.substring(0, safeCutIndex)
                    let openTables = (beforeCut.match(/<table[^>]*>/gi) || []).length
                    let closeTables = (beforeCut.match(/<\/table>/gi) || []).length
                    
                    // 테이블이 열려있으면 테이블을 닫는 위치로 이동
                    if (openTables > closeTables) {
                      // 마지막 열린 테이블의 위치 찾기
                      const lastOpenTableIndex = beforeCut.lastIndexOf('<table')
                      if (lastOpenTableIndex > 0) {
                        // 마지막 열린 테이블부터 safeCutIndex까지의 내용 확인
                        const tableContent = safeHtml.substring(lastOpenTableIndex, safeCutIndex)
                        // 테이블이 닫히는 위치 찾기
                        const tableCloseIndex = safeHtml.indexOf('</table>', lastOpenTableIndex)
                        if (tableCloseIndex > 0 && tableCloseIndex < safeHtml.length) {
                          // 테이블이 닫히는 위치 이후로 끊기
                          safeCutIndex = tableCloseIndex + 8 // </table> 길이
                        } else {
                          // 테이블이 닫히지 않았으면 마지막 열린 테이블 이전으로 끊기
                          safeCutIndex = lastOpenTableIndex
                        }
                      }
                    }
                    
                    safeHtml = safeHtml.substring(0, safeCutIndex)
                    
                    // 태그 밸런스 맞추기 (열린 태그가 있으면 닫기)
                    let openDivs = (safeHtml.match(/<div/g) || []).length
                    let closeDivs = (safeHtml.match(/<\/div>/g) || []).length
                    openTables = (safeHtml.match(/<table[^>]*>/gi) || []).length
                    closeTables = (safeHtml.match(/<\/table>/gi) || []).length
                    
                    // 테이블이 열려있으면 닫기 (테이블 안에 테이블이 들어가지 않도록)
                    while (openTables > closeTables) {
                      safeHtml += '</table>'
                      closeTables++
                    }
                    
                    // div가 열려있으면 닫기
                    while (openDivs > closeDivs) {
                      safeHtml += '</div>'
                      closeDivs++
                    }
                    
                    // 마지막으로 열린 섹션이 닫혔는지 확인하고 안 닫혔으면 제거
                    const lastSectionStart = Math.max(
                      safeHtml.lastIndexOf('<div class="subtitle-section"'),
                      safeHtml.lastIndexOf('<div class="detail-menu-section"')
                    )
                    
                    if (lastSectionStart > 0) {
                      const afterStart = safeHtml.substring(lastSectionStart)
                      const openCount = (afterStart.match(/<div/g) || []).length
                      const closeCount = (afterStart.match(/<\/div>/g) || []).length
                      
                      if (openCount > closeCount) {
                        // 닫히지 않았으면 제거 (이전까지만 사용)
                        safeHtml = safeHtml.substring(0, lastSectionStart)
                        
                        // 다시 태그 밸런싱
                        openDivs = (safeHtml.match(/<div/g) || []).length
                        closeDivs = (safeHtml.match(/<\/div>/g) || []).length
                        openTables = (safeHtml.match(/<table/g) || []).length
                        closeTables = (safeHtml.match(/<\/table>/g) || []).length
                        
                        while (openTables > closeTables) {
                          safeHtml += '</table>'
                          closeTables++
                        }
                        
                        while (openDivs > closeDivs) {
                          safeHtml += '</div>'
                          closeDivs++
                        }
                      }
                    }
                    
                    // HTML 정리
                    safeHtml = safeHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
                    safeHtml = safeHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
                    safeHtml = safeHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
                    safeHtml = safeHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                    safeHtml = safeHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                    safeHtml = safeHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                    safeHtml = safeHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                    safeHtml = safeHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                    safeHtml = safeHtml.replace(/\*\*/g, '')
                    
                    // 부분 완료 신호 전송 (2차 요청 필요)
                    hasSentPartialDone = true

                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                      type: 'partial_done',
                      html: safeHtml,
                      remainingSubtitles: remainingSubtitles.map((sub: any) => sub.originalIndex),
                      completedSubtitles: completedSubtitles,
                    })}\n\n`))
                    
                    controller.close()
                    return // 1차 요청 종료, 2차 요청으로 이어가기
                  }
                }
              }
              
              // 280초 경과 시 로그 출력 (디버깅용) - 매 청크마다 체크
              if (elapsed >= TIMEOUT_PARTIAL && !hasSentPartialDone && !isSecondRequest) {
              }
              
              // 280초 경과 체크 (isSecondRequest가 아닐 때만)
              if (elapsed >= TIMEOUT_PARTIAL && fullText.trim() && fullText.trim().length > 50 && !hasSentPartialDone && !isSecondRequest) {
                
                // HTML 코드 블록 제거 (있는 경우) - 파싱 전에 정리
                let htmlForParsing = fullText.trim()
                const htmlBlockMatch = htmlForParsing.match(/```html\s*([\s\S]*?)\s*```/)
                if (htmlBlockMatch) {
                  htmlForParsing = htmlBlockMatch[1].trim()
                } else {
                  const codeBlockMatch = htmlForParsing.match(/```\s*([\s\S]*?)\s*```/)
                  if (codeBlockMatch) {
                    htmlForParsing = codeBlockMatch[1].trim()
                  }
                }
                
                // 완료된 메뉴/소제목 파싱 (정리된 HTML 사용)
                const { completedSubtitles, completedMenus } = parseCompletedSubtitles(htmlForParsing, menu_subtitles)
                const remainingSubtitles = menu_subtitles
                  .map((sub: any, index: number) => ({ ...sub, originalIndex: index }))
                  .filter((_: any, index: number) => !completedSubtitles.includes(index))

                if (remainingSubtitles.length > 0) {
                  // 부분 완료 신호 전송 (2차 요청 필요)
                  hasSentPartialDone = true
                  
                  // HTML 정리 (기존 로직과 동일)
                  let cleanHtml = fullText.trim()
                  const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
                  if (htmlBlockMatch) {
                    cleanHtml = htmlBlockMatch[1].trim()
                  } else {
                    const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
                    if (codeBlockMatch) {
                      cleanHtml = codeBlockMatch[1].trim()
                    }
                  }
                  
                  // HTML 정리
                  cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
                  cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
                  cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
                  cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                  cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                  cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                  cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                  cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                  cleanHtml = cleanHtml.replace(/\*\*/g, '')

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'partial_done',
                    html: cleanHtml,
                    remainingSubtitles: remainingSubtitles.map((sub: any) => sub.originalIndex),
                    completedSubtitles: completedSubtitles,
                  })}\n\n`))
                  
                  controller.close()
                  return // 1차 요청 종료, 2차 요청으로 이어가기
                }
              }
              
              // 타임아웃 경고 (한 번만)
              if (elapsed >= TIMEOUT_WARNING && !hasSentTimeoutWarning) {
                hasSentTimeoutWarning = true
              }
            }
            
            // 스트림 루프 종료 시 경과 시간 로깅
            const finalElapsed = Date.now() - streamStartTime
            
            // 모든 소제목이 조기에 완료된 경우 즉시 완료 처리
            if (allSubtitlesCompletedEarly) {
              
              // HTML 코드 블록 제거 및 정리
              let cleanHtml = fullText.trim()
              const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
              if (htmlBlockMatch) {
                cleanHtml = htmlBlockMatch[1].trim()
              } else {
                const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
                if (codeBlockMatch) {
                  cleanHtml = codeBlockMatch[1].trim()
                }
              }
              
              // HTML 정리
              cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
              cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
              cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
              cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              cleanHtml = cleanHtml.replace(/\*\*/g, '')

              // 완료 신호 즉시 전송
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'done',
                html: cleanHtml,
                isTruncated: false,
                finishReason: 'STOP',
                usage: undefined,
              })}\n\n`))
              
              controller.close()
              return // 조기 완료 처리 완료, 이후 로직 건너뛰기
            }
          } catch (streamReadError: any) {
                const streamErrorMessage = streamReadError?.message || String(streamReadError)
                
                // 재시도 가능한 에러 체크
                const is429Error = streamErrorMessage.includes('429') || streamReadError?.status === 429
                const isRetryableStreamError = 
                  streamErrorMessage.includes('Failed to parse stream') ||
                  streamErrorMessage.includes('500') ||
                  streamErrorMessage.includes('503') ||
                  is429Error || // Rate limit
                  streamErrorMessage.includes('timeout') ||
                  streamErrorMessage.includes('ECONNRESET') ||
                  streamErrorMessage.includes('ETIMEDOUT') ||
                  streamErrorMessage.includes('network')
                
                // 부분 데이터가 충분하면 에러를 throw하지 않고 계속 진행
            if (fullText.trim() && fullText.trim().length > 100) {
                  // 부분 데이터가 충분하면 재시도하지 않고 계속 진행
                  break // 스트림 읽기 루프 종료, 이후 처리 계속
            } else {
                  // 부분 데이터가 없거나 너무 적으면
                  // 재시도 가능한 에러면 throw하여 외부 재시도 루프에서 처리
                  if (isRetryableStreamError) {
                    throw streamReadError // 재시도 루프로 전달
                  } else {
                    // 재시도 불가능한 에러면 throw
              throw streamReadError
                  }
            }
          }
          
          // 응답 완료 처리
          let response: any
          let finishReason: string | undefined
          let isTruncated = false
          
          try {
            response = await streamResult.response
            finishReason = response.candidates?.[0]?.finishReason
            isTruncated = finishReason === 'MAX_TOKENS'
          } catch (responseError: any) {
            // 응답 대기 실패해도 지금까지 받은 데이터로 처리
            if (!fullText.trim() || fullText.trim().length < 100) {
              throw responseError
            }
            // 기본값 설정
            response = { usageMetadata: null }
            finishReason = undefined
            isTruncated = false
          }
          
          // fullText가 비어있는 경우 체크
          // 네트워크/제미나이 정상일 때는 발생하지 않아야 하지만, 방어적 코딩
          if (!fullText.trim()) {
            // 네트워크/제미나이 정상일 때는 발생하지 않아야 함
            throw new Error('스트림에서 데이터를 받지 못했습니다.')
          }
          
          // HTML 코드 블록 제거 (있는 경우)
          let cleanHtml = fullText.trim()
          const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
          if (htmlBlockMatch) {
            cleanHtml = htmlBlockMatch[1].trim()
          } else {
            const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
            if (codeBlockMatch) {
              cleanHtml = codeBlockMatch[1].trim()
            }
          }
          
          // cleanHtml이 비어있는 경우 체크
          // 네트워크/제미나이 정상일 때는 발생하지 않아야 하지만, 방어적 코딩
          if (!cleanHtml.trim()) {
            // 네트워크/제미나이 정상일 때는 발생하지 않아야 함
            throw new Error('처리된 HTML이 비어있습니다.')
          }
          
          // 소제목과 본문 사이의 공백 제거
          // </h3> 태그와 <div class="subtitle-content"> 사이의 모든 공백 문자(줄바꿈, 스페이스, 탭 등) 제거
          // 전역적으로 교체하기 위해 replaceAll 대신 정규식을 사용
          // 방법 1: 소제목 닫는 태그 뒤의 공백 제거
          cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
          // 방법 2: 구체적인 클래스명이 있는 경우도 처리
          cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
          // 방법 3: 태그 사이의 줄바꿈 문자 제거 (전체 HTML에서 불필요한 줄바꿈 제거)
          // 주의: <pre> 태그 등이 없으므로 안전하다고 가정
          // cleanHtml = cleanHtml.replace(/>\s+</g, '><') // 이건 너무 과감할 수 있음
          
          // <br> 태그 처리: 불필요한 연속 <br> 제거
          cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')

          // 점사 결과 HTML의 모든 테이블 앞 줄바꿈 정리 (반 줄만 띄우기)
          // 테이블 태그 앞의 모든 줄바꿈을 제거하고 CSS로 간격 조정
          cleanHtml = cleanHtml
            // 이전 태그 닫기(>)와 테이블 사이의 모든 줄바꿈/공백 제거
            .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
            // 줄 시작부터 테이블까지의 모든 줄바꿈/공백 제거
            .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
            // 테이블 앞의 공백 문자 제거 (줄바꿈 없이 바로 붙이기)
            .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
            // 텍스트 단락 태그(</p>, </div>, </h3> 등) 뒤의 모든 공백과 줄바꿈 제거 후 테이블
            .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
            // 모든 종류의 태그 뒤의 연속된 줄바꿈과 공백을 제거하고 테이블 바로 붙이기
            .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
          
          // ** 문자 제거 (마크다운 강조 표시 제거)
          cleanHtml = cleanHtml.replace(/\*\*/g, '')
          
          // finishReason이 MAX_TOKENS인 경우에도 실제로 모든 소제목이 완료되었는지 확인
          let actualIsTruncated = isTruncated
          let actualFinishReason = finishReason
          
          if (finishReason === 'MAX_TOKENS') {
            const { completedSubtitles } = parseCompletedSubtitles(cleanHtml, menu_subtitles)
            const allSubtitlesCompleted = completedSubtitles.length === menu_subtitles.length

            if (allSubtitlesCompleted) {
              actualIsTruncated = false
              actualFinishReason = 'STOP'
            } else {
            }
          }
          
          if (isSecondRequest) {
          } else {
          }
          
          // 완료 신호 전송
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'done',
            html: cleanHtml,
            isTruncated: actualIsTruncated,
            finishReason: actualFinishReason,
            usage: response.usageMetadata ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              candidatesTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0,
            } : undefined,
          })}\n\n`))
          
          controller.close()
              lastError = null
              break // 스트림 처리 성공, 재시도 루프 종료
        } catch (error: any) {
              lastError = error
              const errorMessage = error?.message || error?.toString() || ''
          
              // 재시도 가능한 에러 체크
              const is429Error = errorMessage.includes('429') || error?.status === 429
              const isRetryableError = 
                errorMessage.includes('Failed to parse stream') ||
                errorMessage.includes('500') ||
                errorMessage.includes('503') ||
                is429Error || // Rate limit
                errorMessage.includes('timeout') ||
                errorMessage.includes('ECONNRESET') ||
                errorMessage.includes('ETIMEDOUT') ||
                errorMessage.includes('network')
              
              // 재시도 가능한 에러이고 마지막 시도가 아니면 재시도
              if (attempt < maxRetries && isRetryableError) {
                const waitTime = attempt * 2000 // 2초, 4초, 6초 대기
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue // 재시도
              }
              
              // 마지막 시도이거나 재시도 불가능한 에러면 throw하지 않고 아래 에러 처리로 진행
            }
          }
          
          // 재시도가 모두 실패한 경우 에러 처리
          if (lastError) {
            const errorMessage = lastError?.message || lastError?.toString() || ''
          const isTimeoutError = errorMessage.includes('timeout') || 
                                 errorMessage.includes('타임아웃') || 
                                 errorMessage.includes('Function execution timeout') ||
                                 errorMessage.includes('maxDuration')
          
          // 280초 경과 체크 (타임아웃 에러가 아니어도) - catch 블록에서도 체크
          const elapsed = Date.now() - streamStartTime
          
          if (elapsed >= TIMEOUT_PARTIAL && fullText.trim() && fullText.trim().length > 50 && !hasSentPartialDone && !isSecondRequest) {
            
            try {
              // 완료된 메뉴/소제목 파싱
              const { completedSubtitles, completedMenus } = parseCompletedSubtitles(fullText, menu_subtitles)
              const remainingSubtitles = menu_subtitles
                .map((sub: any, index: number) => ({ ...sub, originalIndex: index }))
                .filter((_: any, index: number) => !completedSubtitles.includes(index))

              if (remainingSubtitles.length > 0) {
                hasSentPartialDone = true
                
                // HTML 정리
                let cleanHtml = fullText.trim()
                const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
                if (htmlBlockMatch) {
                  cleanHtml = htmlBlockMatch[1].trim()
                } else {
                  const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
                  if (codeBlockMatch) {
                    cleanHtml = codeBlockMatch[1].trim()
                  }
                }
                
                // HTML 정리
                cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
                cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
                cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
                cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                cleanHtml = cleanHtml.replace(/\*\*/g, '')

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'partial_done',
                  html: cleanHtml,
                  remainingSubtitles: remainingSubtitles.map((sub: any) => sub.originalIndex),
                  completedSubtitles: completedSubtitles,
                })}\n\n`))
                
                controller.close()
                return // 에러 처리 건너뛰기
              }
            } catch (processError: any) {
              // 처리 실패 시 일반 에러 처리로 진행
            }
          }
          
          // 타임아웃 에러이고 부분 데이터가 충분하면 완료 처리
          if (isTimeoutError && fullText.trim() && fullText.trim().length > 100) {
            
            try {
              // 부분 데이터를 HTML로 처리
              let cleanHtml = fullText.trim()
              const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
              if (htmlBlockMatch) {
                cleanHtml = htmlBlockMatch[1].trim()
              } else {
                const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
                if (codeBlockMatch) {
                  cleanHtml = codeBlockMatch[1].trim()
                }
              }
              
              // HTML 정리 (기존 로직과 동일)
              cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
              cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
              cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
              cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
              cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
              cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
              cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
              cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
              cleanHtml = cleanHtml.replace(/\*\*/g, '')
              
              if (cleanHtml.trim() && cleanHtml.trim().length > 100) {
                // 부분 데이터를 완료 처리
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'done',
                  html: cleanHtml,
                  isTruncated: true, // 타임아웃으로 인한 잘림 표시
                  finishReason: 'TIMEOUT',
                  usage: undefined,
                })}\n\n`))
                controller.close()
                return // 에러 처리 건너뛰기
              }
            } catch (processError: any) {
              // 처리 실패 시 일반 에러 처리로 진행
            }
          }
          
          // 사용자 친화적 에러 메시지 생성
          let userFriendlyMessage: string | null = '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
            const errorStatus = lastError?.status || lastError?.code || ''
          
          // 429 Rate Limit 에러 처리 - 점사중... 메시지가 이미 떠 있으므로 에러 메시지 전송하지 않음
          if (errorMessage.includes('429') || errorStatus === 429 || errorStatus === '429') {
            userFriendlyMessage = null // 에러 메시지 전송하지 않음 (점사중... 메시지가 이미 표시됨)
          } 
          // 500, 503 서버 에러
          else if (errorMessage.includes('500') || errorMessage.includes('503') || errorStatus === 500 || errorStatus === 503) {
            userFriendlyMessage = '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
          }
          // 타임아웃 에러
          else if (isTimeoutError) {
            userFriendlyMessage = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
          }
          // 네트워크 에러
          else if (errorMessage.includes('network') || errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT')) {
            userFriendlyMessage = '네트워크 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
          }
            // Failed to parse stream 에러
            else if (errorMessage.includes('Failed to parse stream')) {
              userFriendlyMessage = '점사 응답 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
            }
          
          // 에러 메시지가 필요한 경우에만 전송
          if (userFriendlyMessage) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                error: userFriendlyMessage
              })}\n\n`))
            } catch (enqueueError: any) {
            }
          }
          
          try {
            controller.close()
          } catch (closeError: any) {
          }
        }
      }
    })

    // 스트리밍 응답 반환
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error: any) {
    
    const rawErrorMessage = error?.message || error?.toString() || '서버 에러 발생'
    
    // 기술적인 에러 메시지를 사용자 친화적인 메시지로 변환
    let userFriendlyMessage = '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
    
    if (rawErrorMessage.includes('Failed to parse stream')) {
      userFriendlyMessage = '점사 응답 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
    } else if (rawErrorMessage.includes('429') || rawErrorMessage.includes('Rate limit')) {
      userFriendlyMessage = '점사 서비스 사용량이 많습니다. 잠시 후 다시 시도해주세요.'
    } else if (rawErrorMessage.includes('500') || rawErrorMessage.includes('503')) {
      userFriendlyMessage = '서버에 일시적인 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
    } else if (rawErrorMessage.includes('timeout') || rawErrorMessage.includes('TIMEOUT')) {
      userFriendlyMessage = '응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.'
    } else if (rawErrorMessage.includes('network') || rawErrorMessage.includes('ECONNRESET') || rawErrorMessage.includes('ETIMEDOUT')) {
      userFriendlyMessage = '네트워크 연결에 문제가 발생했습니다. 잠시 후 다시 시도해주세요.'
    }
    
    return NextResponse.json(
      { 
        error: userFriendlyMessage,
        details: error?.stack || error?.toString()
      },
      { status: 500 }
    )
  }
}

