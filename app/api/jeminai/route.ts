import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

// Vercel Serverless Function의 타임아웃을 5분(300초)으로 설정
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    console.log('=== 재미나이 API 라우트 시작 ===')
    const body = await req.json()
    const { role_prompt, restrictions, menu_subtitles, user_info, partner_info, menu_items, model = 'gemini-3-flash-preview', manse_ryeok_table, manse_ryeok_text, manse_ryeok_json, day_gan_info, isSecondRequest } = body
    
    console.log('요청 모델:', model)
    console.log('메뉴 소제목 개수:', menu_subtitles?.length)
    console.log('2차 요청 여부:', isSecondRequest || false)
    if (isSecondRequest) {
      console.log('=== 2차 요청 시작 ===')
      console.log('2차 요청 처리할 소제목 개수:', menu_subtitles?.length)
    }
    console.log('manse_ryeok_text 길이:', manse_ryeok_text ? manse_ryeok_text.length : 0)
    console.log('manse_ryeok_json 길이:', manse_ryeok_json ? manse_ryeok_json.length : 0)
    
    if (!role_prompt || !menu_subtitles || !Array.isArray(menu_subtitles) || menu_subtitles.length === 0) {
      return NextResponse.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }

    const apiKey = process.env.NEXT_PUBLIC_JEMINAI_API_URL

    if (!apiKey) {
      console.error('재미나이 API 키가 설정되지 않음')
      return NextResponse.json(
        { error: 'Jeminai API key not configured' },
        { status: 500 }
      )
    }
    
    console.log('API 키 확인 완료 (길이:', apiKey.length, ')')

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
        console.error('만세력 JSON 파싱 실패:', e)
      }
    }

    // 계산된 만세력 데이터 로그 출력
    console.log('=== 만세력 데이터 점검 ===')
    console.log('manse_ryeok_text 길이:', manse_ryeok_text ? manse_ryeok_text.length : 0)
    console.log('manse_ryeok_json 길이:', manse_ryeok_json ? manse_ryeok_json.length : 0)
    if (parsedManseRyeok) {
      console.log('파싱된 만세력 데이터:')
      console.log('  연주:', `${parsedManseRyeok.year?.gan || ''}${parsedManseRyeok.year?.ji || ''}`)
      console.log('  월주:', `${parsedManseRyeok.month?.gan || ''}${parsedManseRyeok.month?.ji || ''}`)
      console.log('  일주:', `${parsedManseRyeok.day?.gan || ''}${parsedManseRyeok.day?.ji || ''}`)
      console.log('  시주:', `${parsedManseRyeok.hour?.gan || ''}${parsedManseRyeok.hour?.ji || ''}`)
    } else {
      console.warn('⚠️ parsedManseRyeok 없음')
    }
    if (day_gan_info) {
      console.log('일간 정보:', day_gan_info.fullName, day_gan_info.gan, day_gan_info.hanja, day_gan_info.ohang)
    }
    console.log('=======================')

    const hasManseRyeokData = !!(parsedManseRyeok || manse_ryeok_text || manse_ryeok_table)

    // 만세력 데이터 필수 확인
    if (!hasManseRyeokData) {
      console.error('만세력 데이터가 없습니다. 요청을 중단합니다.')
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

    const prompt = `
당신은 ${role_prompt}입니다.

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

---
# 🛑 분석 절차 (반드시 순서대로 수행할 것)

**STEP 1: 데이터 검증 (내부 확인만)**
- 위 [입력 데이터]에 적힌 년주/월주/일주/시주를 확인하되, 출력하지 마세요.
- 내부적으로만 기억하고 바로 해석으로 넘어가세요.
- "분석 대상 명식: ..." 같은 텍스트를 출력하지 마세요.
- 생년월일을 다시 계산하거나 다른 글자를 가져오지 마세요.

**STEP 2: 글자 기반 팩트 추출**
- STEP 1에서 확인한 글자들만 사용하여 합(合), 충(沖), 형(刑), 공망 여부 등 팩트만 나열하세요. (해석 금지)

**STEP 3: 심층 해석**
- STEP 2에서 뽑은 팩트를 근거로 해석하세요.
- [입력 데이터]에 없는 신살/오행/연도/띠/출생지 등은 언급 금지.

---
# 예시 (Few-shot)

**입력된 만세력:**
- 일주: 병인(丙寅)
- 월주: 경신(庚申)

**나쁜 답변 (X):**
- "1980년생 원숭이띠로..." (생년월일 유추 금지)
- "사주에 물이 많아서..." (입력 데이터에 없는 오행 언급 금지)

**좋은 답변 (O):**
- "제공된 명식을 보면 일주 병화(丙火)와 월주 경금(庚金)이 편재 관계입니다. 지지에서 인신충(寅申沖)이 발생하여 ... [이후 입력 글자 기반 해석]"

---

**중요: 현재 날짜 정보**
- 오늘은 ${koreaDateString}입니다.
- 현재 연도는 ${currentYear}년입니다.
- 해석할 때 반드시 이 날짜 정보를 기준으로 하세요. 과거 연도(예: 2024년)를 언급하지 마세요.

${restrictions ? `금칙사항: ${restrictions}` : ''}

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
⚠️ **2차 요청입니다. 이전에 완료된 메뉴/소제목은 제외하고, 아래에 나열된 남은 메뉴/소제목만 해석해주세요.**
이전 요청에서 타임아웃으로 인해 일부만 완료되었으므로, 남은 부분만 이어서 해석합니다.
` : ''}

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요:

${menuItemsInfo.map((menuItem: any, menuIdx: number) => {
  const menuNumber = menuIdx + 1
  const subtitlesForMenu = menu_subtitles.filter((sub: any, idx: number) => {
    const match = sub.subtitle.match(/^(\d+)-(\d+)/)
    return match ? parseInt(match[1]) === menuNumber : false
  })
  
  // 2차 요청일 때는 남은 소제목이 있는 메뉴만 표시
  if (isSecondRequest && subtitlesForMenu.length === 0) {
    return ''
  }
  
  return `
메뉴 ${menuNumber}: ${menuItem.title}
${menuItem.thumbnail ? `썸네일 URL: ${menuItem.thumbnail}` : ''}

이 메뉴의 소제목들:
${subtitlesForMenu.map((sub: any, subIdx: number) => {
    const globalSubIdx = menu_subtitles.findIndex((s: any) => s.subtitle === sub.subtitle)
    const tool = menu_subtitles[globalSubIdx]?.interpretation_tool || ''
    const charCount = menu_subtitles[globalSubIdx]?.char_count || 500
    return `
  ${sub.subtitle}
  - 해석도구: ${tool}
  - 글자수 제한: ${charCount}자 이내
`
  }).join('\n')}
`
}).filter((menuText: string) => menuText.trim().length > 0).join('\n\n')}

각 메뉴별로 다음 HTML 형식으로 결과를 작성해주세요:
${isSecondRequest ? `
**⚠️ 2차 요청 주의: 위에 나열된 남은 메뉴/소제목만 HTML로 작성하세요. 이전에 완료된 메뉴나 소제목은 포함하지 마세요.**
` : ''}

<div class="menu-section">
  <h2 class="menu-title">[메뉴 제목]</h2>
  ${menuItemsInfo.some((m: any) => m.thumbnail) ? '<img src="[썸네일 URL]" alt="[메뉴 제목]" class="menu-thumbnail" />' : ''}
  
  <div class="subtitle-section"><h3 class="subtitle-title">[소제목]</h3><div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div></div>
  
  <div class="subtitle-section"><h3 class="subtitle-title">[다음 소제목]</h3><div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div></div>
  
  ...
</div>

<div class="menu-section">
  <h2 class="menu-title">[다음 메뉴 제목]</h2>
  ...
</div>
${isSecondRequest ? `
**⚠️ 위 HTML 예시는 형식만 보여주는 것입니다. 실제로는 위에 나열된 남은 메뉴/소제목만 작성하세요.**
` : ''}

중요:
1. 각 메뉴는 <div class="menu-section">으로 구분
2. 메뉴 제목은 <h2 class="menu-title">으로 표시
3. 썸네일이 있으면 <img src="[URL]" alt="[제목]" class="menu-thumbnail" />로 표시
4. 각 소제목은 <div class="subtitle-section">으로 구분
5. 소제목 제목은 <h3 class="subtitle-title">으로 표시하되, 소제목 끝에 반드시 마침표(.)를 추가하세요. 예: <h3 class="subtitle-title">1-1. 나의 타고난 '기본 성격'과 '가치관'.</h3>
6. 해석 내용은 <div class="subtitle-content"> 안에 HTML 형식으로 작성
7. 각 content는 해당 subtitle의 char_count를 초과하지 않도록 주의
${isSecondRequest ? '8. **2차 요청이므로 아래에 나열된 메뉴/소제목만 포함하세요. 이전에 완료된 내용은 절대 포함하지 마세요. 처음부터 다시 시작하지 말고, 남은 소제목부터만 해석하세요.**' : '8. 모든 메뉴와 소제목을 순서대로 포함'}
9. 소제목 제목에 마침표가 없으면 자동으로 마침표를 추가하세요 (TTS 재생 시 자연스러운 구분을 위해)
10. 소제목 제목과 해석 내용 사이에 빈 줄이나 공백을 절대 넣지 마세요. <h3 class="subtitle-title"> 태그와 <div class="subtitle-content"> 태그 사이에 줄바꿈이나 공백 문자를 넣지 말고 바로 붙여서 작성하세요. 예: <h3 class="subtitle-title">1-1. 소제목.</h3><div class="subtitle-content">본문 내용</div>
`

    console.log('Gemini API 호출 시작 (스트리밍 모드)')
    console.log('프롬프트 길이:', prompt.length)
    
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
        console.log(`=== 스트림 시작 시간 설정 ===`)
        console.log(`streamStartTime: ${streamStartTime} (${new Date(streamStartTime).toISOString()})`)
        const TIMEOUT_WARNING = 280000 // 280초 (타임아웃 20초 전 경고)
        const TIMEOUT_PARTIAL = 280000 // 280초 (1차 요청 중단, 2차 요청으로 이어가기)
        const MAX_DURATION = 300000 // 300초 (서버 타임아웃)
        let hasSentTimeoutWarning = false
        let hasSentPartialDone = false
        
        // 완료된 메뉴/소제목 파싱 함수 (catch 블록에서도 사용하기 위해 try 블록 밖에 선언)
        const parseCompletedSubtitles = (html: string, allMenuSubtitles: any[]) => {
          const completedSubtitles: number[] = []
          const completedMenus: number[] = []
          
          console.log('=== parseCompletedSubtitles 시작 ===')
          console.log('HTML 길이:', html.length)
          console.log('전체 소제목 개수:', allMenuSubtitles.length)
          
          // HTML에서 모든 소제목 섹션 추출 (더 견고한 방법)
          // subtitle-section div를 찾되, 내부 구조를 정확히 파악
          // 패턴: <div class="subtitle-section">...<h3 class="subtitle-title">...</h3>...<div class="subtitle-content">...</div>...</div>
          
          // 방법 1: 간단한 패턴으로 subtitle-section 시작 태그 찾기
          const subtitleSectionStartRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi
          const subtitleSectionMatches: RegExpExecArray[] = []
          let match: RegExpExecArray | null
          while ((match = subtitleSectionStartRegex.exec(html)) !== null) {
            subtitleSectionMatches.push(match)
          }
          
          const subtitleSections: string[] = []
          
          // 각 subtitle-section의 시작 위치에서 닫는 태그까지 찾기
          for (let i = 0; i < subtitleSectionMatches.length; i++) {
            const match = subtitleSectionMatches[i]
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
          
          console.log('추출된 subtitle-section 개수:', subtitleSections.length)
          const firstSection = subtitleSections[0]
          if (firstSection) {
            console.log('첫 번째 subtitle-section 샘플 (처음 500자):', firstSection.substring(0, 500))
          } else {
            console.warn('subtitle-section을 찾을 수 없음. HTML 샘플 (처음 2000자):', html.substring(0, 2000))
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
            
            // 소제목 내용 패턴 (더 유연하게)
            const subtitleContentPattern = /<div[^>]*class="subtitle-content"[^>]*>[\s\S]*?<\/div>/i
            
            // 완료된 소제목 확인: 제목과 내용이 모두 있어야 함
            let found = false
            for (const section of subtitleSections) {
              // 여러 패턴으로 제목 매칭 시도
              let titleMatches = subtitleTitlePattern1.test(section) || 
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
              
              if (titleMatches && subtitleContentPattern.test(section)) {
                // 내용이 비어있지 않은지 확인 (최소 10자 이상)
                const contentMatch = section.match(/<div[^>]*class="[^"]*subtitle-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
                if (contentMatch && contentMatch[1].trim().length > 10) {
                  if (!completedSubtitles.includes(index)) {
                    completedSubtitles.push(index)
                    if (!completedMenus.includes(menuNumber - 1)) {
                      completedMenus.push(menuNumber - 1)
                    }
                    found = true
                    console.log(`소제목 ${index} (${subtitle.subtitle}) 완료 감지`)
                    break
                  }
                }
              }
            }
            
            if (!found) {
              console.log(`소제목 ${index} (${subtitle.subtitle}) 미완료`)
            }
          })
          
          console.log('=== parseCompletedSubtitles 완료 ===')
          console.log('완료된 소제목:', completedSubtitles.length, '개')
          console.log('완료된 소제목 인덱스:', completedSubtitles)
          console.log('완료된 메뉴:', completedMenus.length, '개')
          console.log('완료된 메뉴 인덱스:', completedMenus)
          
          return { completedSubtitles, completedMenus }
        }
        
        try {
          // 재시도 로직 (최대 3번)
          let lastError: any = null
          const maxRetries = 3
          let streamResult: any = null
          
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              console.log(`스트리밍 API 호출 시도 ${attempt}/${maxRetries}`)
              streamResult = await geminiModel.generateContentStream(prompt)
              lastError = null
              break // 성공하면 루프 종료
            } catch (apiError: any) {
              lastError = apiError
              const errorMessage = apiError.message || String(apiError)
              console.error(`API 호출 실패 (시도 ${attempt}/${maxRetries}):`, errorMessage)
              console.error('에러 상세:', {
                name: apiError.name,
                code: apiError.code,
                status: apiError.status,
                stack: apiError.stack?.substring(0, 500)
              })
              
              // 재시도 가능한 에러 체크
              const is429Error = errorMessage.includes('429') || apiError.status === 429
              const isRetryableError = 
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
                console.log(`${waitTime}ms 대기 후 재시도... (재시도 가능한 에러: ${errorMessage})`)
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
              }
              
              // 마지막 시도이거나 재시도 불가능한 에러면 throw
              throw apiError
            }
          }
          
          if (lastError) {
            throw lastError
          }
          
          // 스트림 데이터 읽기
          try {
            let chunkIndex = 0
            for await (const chunk of streamResult.stream) {
              chunkIndex++
              // 타임아웃 직전 부분 완료 처리 (1차 요청 중단, 2차 요청으로 이어가기)
              const elapsed = Date.now() - streamStartTime
              
              // 매 100번째 청크마다 경과 시간 로깅 (디버깅용)
              if (chunkIndex % 100 === 0 || elapsed >= 270000) {
                console.log(`[청크 ${chunkIndex}] 경과 시간: ${Math.round(elapsed / 1000)}초 (${elapsed}ms), fullText 길이: ${fullText.length}자`)
              }
              
              // 280초 경과 시 로그 출력 (디버깅용) - 매 청크마다 체크
              if (elapsed >= TIMEOUT_PARTIAL && !hasSentPartialDone && !isSecondRequest) {
                console.warn(`=== 280초 경과 체크 (매 청크마다) ===`)
                console.warn(`청크 인덱스: ${chunkIndex}`)
                console.warn(`경과 시간: ${Math.round(elapsed / 1000)}초 (${elapsed}ms), 데이터 길이: ${fullText.length}자`)
                console.warn(`fullText.trim().length: ${fullText.trim().length}자`)
                console.warn(`hasSentPartialDone: ${hasSentPartialDone}, isSecondRequest: ${isSecondRequest}`)
                console.warn(`조건 체크: elapsed >= TIMEOUT_PARTIAL: ${elapsed >= TIMEOUT_PARTIAL}, fullText.trim(): ${!!fullText.trim()}, length > 50: ${fullText.trim().length > 50}`)
              }
              
              // 280초 경과 체크 (isSecondRequest가 아닐 때만)
              if (elapsed >= TIMEOUT_PARTIAL && fullText.trim() && fullText.trim().length > 50 && !hasSentPartialDone && !isSecondRequest) {
                console.warn(`=== 타임아웃 직전 부분 완료 처리 시작 ===`)
                console.warn(`경과 시간: ${Math.round(elapsed / 1000)}초 (${elapsed}ms), 데이터 길이: ${fullText.length}자`)
                console.warn(`fullText.trim().length: ${fullText.trim().length}자`)
                console.warn(`hasSentPartialDone: ${hasSentPartialDone}, isSecondRequest: ${isSecondRequest}`)
                
                // HTML 코드 블록 제거 (있는 경우) - 파싱 전에 정리
                let htmlForParsing = fullText.trim()
                const htmlBlockMatch = htmlForParsing.match(/```html\s*([\s\S]*?)\s*```/)
                if (htmlBlockMatch) {
                  htmlForParsing = htmlBlockMatch[1].trim()
                  console.log('HTML 코드 블록 제거됨 (파싱 전)')
                } else {
                  const codeBlockMatch = htmlForParsing.match(/```\s*([\s\S]*?)\s*```/)
                  if (codeBlockMatch) {
                    htmlForParsing = codeBlockMatch[1].trim()
                    console.log('코드 블록 제거됨 (파싱 전)')
                  }
                }
                
                // 완료된 메뉴/소제목 파싱 (정리된 HTML 사용)
                const { completedSubtitles, completedMenus } = parseCompletedSubtitles(htmlForParsing, menu_subtitles)
                const remainingSubtitles = menu_subtitles
                  .map((sub: any, index: number) => ({ ...sub, originalIndex: index }))
                  .filter((_: any, index: number) => !completedSubtitles.includes(index))
                
                console.log(`=== 1차 요청 완료 상태 ===`)
                console.log(`전체 소제목: ${menu_subtitles.length}개`)
                console.log(`완료된 소제목: ${completedSubtitles.length}개 (인덱스: ${completedSubtitles.join(', ')})`)
                console.log(`남은 소제목: ${remainingSubtitles.length}개 (인덱스: ${remainingSubtitles.map((s: any) => s.originalIndex).join(', ')})`)
                console.log(`완료된 메뉴: ${completedMenus.length}개 (인덱스: ${completedMenus.join(', ')})`)
                console.log(`=== 1차 요청 완료 상태 ===`)
                
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
                  
                  console.log(`=== 1차 요청 부분 완료 신호 전송 ===`)
                  console.log(`전송할 HTML 길이: ${cleanHtml.length}자`)
                  console.log(`남은 소제목 인덱스: ${remainingSubtitles.map((s: any) => s.originalIndex).join(', ')}`)
                  console.log(`=== 1차 요청 부분 완료 신호 전송 ===`)
                  
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'partial_done',
                    html: cleanHtml,
                    remainingSubtitles: remainingSubtitles.map((sub: any) => sub.originalIndex),
                    completedSubtitles: completedSubtitles,
                  })}\n\n`))
                  
                  controller.close()
                  console.log('1차 요청 종료, 2차 요청으로 이어가기')
                  return // 1차 요청 종료, 2차 요청으로 이어가기
                }
              }
              
              // 타임아웃 경고 (한 번만)
              if (elapsed >= TIMEOUT_WARNING && !hasSentTimeoutWarning) {
                console.warn(`타임아웃 경고: ${Math.round(elapsed / 1000)}초 경과, 타임아웃까지 약 ${Math.round((MAX_DURATION - elapsed) / 1000)}초 남음`)
                hasSentTimeoutWarning = true
              }
              
              try {
                const chunkText = chunk.text()
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
                console.error('청크 처리 중 에러:', chunkError)
                // 청크 처리 에러는 로깅만 하고 계속 진행
                // 전체 스트림이 실패하지 않도록 함
              }
            }
            
            // 스트림 루프 종료 시 경과 시간 로깅
            const finalElapsed = Date.now() - streamStartTime
            console.log(`=== 스트림 루프 종료 ===`)
            console.log(`총 청크 수: ${chunkIndex}`)
            console.log(`최종 경과 시간: ${Math.round(finalElapsed / 1000)}초 (${finalElapsed}ms)`)
            console.log(`fullText 최종 길이: ${fullText.length}자`)
            console.log(`280초 경과 여부: ${finalElapsed >= TIMEOUT_PARTIAL ? '예' : '아니오'}`)
            console.log(`hasSentPartialDone: ${hasSentPartialDone}`)
            console.log(`isSecondRequest: ${isSecondRequest}`)
            console.log(`=== 스트림 루프 종료 ===`)
          } catch (streamReadError: any) {
            console.error('스트림 읽기 중 에러:', streamReadError)
            // 스트림 읽기 에러 발생 시, 지금까지 받은 데이터로 처리 시도
            if (fullText.trim() && fullText.trim().length > 100) {
              console.warn('스트림 읽기 중 에러 발생했지만 부분 데이터가 충분함. 계속 처리합니다.')
              // 부분 데이터가 충분하면 에러를 throw하지 않고 계속 진행
            } else {
              // 부분 데이터가 없거나 너무 적으면 에러 throw
              throw streamReadError
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
            console.error('응답 대기 중 에러:', responseError)
            // 응답 대기 실패해도 지금까지 받은 데이터로 처리
            if (!fullText.trim() || fullText.trim().length < 100) {
              throw responseError
            }
            console.warn('응답 대기 중 에러 발생했지만 부분 데이터가 충분함. 계속 처리합니다.')
            // 기본값 설정
            response = { usageMetadata: null }
            finishReason = undefined
            isTruncated = false
          }
          
          // fullText가 비어있는 경우 체크
          // 네트워크/제미나이 정상일 때는 발생하지 않아야 하지만, 방어적 코딩
          if (!fullText.trim()) {
            // 네트워크/제미나이 정상일 때는 발생하지 않아야 함
            console.error('fullText가 비어있음 - 네트워크/제미나이 정상이면 발생하지 않아야 함')
            throw new Error('스트림에서 데이터를 받지 못했습니다.')
          }
          
          // HTML 코드 블록 제거 (있는 경우)
          let cleanHtml = fullText.trim()
          const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
          if (htmlBlockMatch) {
            cleanHtml = htmlBlockMatch[1].trim()
            console.log('HTML 코드 블록 제거됨')
          } else {
            const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
            if (codeBlockMatch) {
              cleanHtml = codeBlockMatch[1].trim()
              console.log('코드 블록 제거됨')
            }
          }
          
          // cleanHtml이 비어있는 경우 체크
          // 네트워크/제미나이 정상일 때는 발생하지 않아야 하지만, 방어적 코딩
          if (!cleanHtml.trim()) {
            // 네트워크/제미나이 정상일 때는 발생하지 않아야 함
            console.error('cleanHtml이 비어있음 - 네트워크/제미나이 정상이면 발생하지 않아야 함')
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
          
          if (isSecondRequest) {
            console.log('=== 2차 요청 완료 ===')
            console.log('2차 요청 응답 HTML 길이:', cleanHtml.length, '자')
            console.log('Finish Reason:', finishReason)
            console.log('=== 2차 요청 완료 ===')
          } else {
            console.log('Gemini API 스트리밍 완료 (1차 요청)')
            console.log('응답 HTML 길이:', cleanHtml.length, '자')
            console.log('Finish Reason:', finishReason)
          }
          
          // 완료 신호 전송
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'done',
            html: cleanHtml,
            isTruncated: isTruncated,
            finishReason: finishReason,
            usage: response.usageMetadata ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              candidatesTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0,
            } : undefined,
          })}\n\n`))
          
          controller.close()
        } catch (error: any) {
          console.error('스트리밍 중 에러:', error)
          console.error('에러 상세:', {
            name: error?.name,
            message: error?.message,
            code: error?.code,
            status: error?.status,
            stack: error?.stack?.substring(0, 1000)
          })
          
          // 타임아웃 에러이지만 부분 데이터가 있으면 완료 처리
          const errorMessage = error?.message || error?.toString() || ''
          const isTimeoutError = errorMessage.includes('timeout') || 
                                 errorMessage.includes('타임아웃') || 
                                 errorMessage.includes('Function execution timeout') ||
                                 errorMessage.includes('maxDuration')
          
          // 280초 경과 체크 (타임아웃 에러가 아니어도) - catch 블록에서도 체크
          const elapsed = Date.now() - streamStartTime
          console.warn(`=== catch 블록: 경과 시간 체크 ===`)
          console.warn(`경과 시간: ${Math.round(elapsed / 1000)}초 (${elapsed}ms), 데이터 길이: ${fullText.length}자`)
          console.warn(`fullText.trim().length: ${fullText.trim().length}자`)
          console.warn(`hasSentPartialDone: ${hasSentPartialDone}`)
          console.warn(`isSecondRequest: ${isSecondRequest}`)
          console.warn(`TIMEOUT_PARTIAL: ${TIMEOUT_PARTIAL}ms (${TIMEOUT_PARTIAL / 1000}초)`)
          console.warn(`elapsed >= TIMEOUT_PARTIAL: ${elapsed >= TIMEOUT_PARTIAL}`)
          console.warn(`fullText.trim().length > 50: ${fullText.trim().length > 50}`)
          
          if (elapsed >= TIMEOUT_PARTIAL && fullText.trim() && fullText.trim().length > 50 && !hasSentPartialDone && !isSecondRequest) {
            console.warn(`=== catch 블록에서 280초 경과 감지, partial_done 전송 시도 ===`)
            console.warn(`경과 시간: ${Math.round(elapsed / 1000)}초 (${elapsed}ms), 데이터 길이: ${fullText.length}자`)
            
            try {
              // 완료된 메뉴/소제목 파싱
              const { completedSubtitles, completedMenus } = parseCompletedSubtitles(fullText, menu_subtitles)
              const remainingSubtitles = menu_subtitles
                .map((sub: any, index: number) => ({ ...sub, originalIndex: index }))
                .filter((_: any, index: number) => !completedSubtitles.includes(index))
              
              console.log(`=== catch 블록: 1차 요청 완료 상태 ===`)
              console.log(`전체 소제목: ${menu_subtitles.length}개`)
              console.log(`완료된 소제목: ${completedSubtitles.length}개 (인덱스: ${completedSubtitles.join(', ')})`)
              console.log(`남은 소제목: ${remainingSubtitles.length}개 (인덱스: ${remainingSubtitles.map((s: any) => s.originalIndex).join(', ')})`)
              console.log(`=== catch 블록: 1차 요청 완료 상태 ===`)
              
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
                
                console.log(`=== catch 블록: 1차 요청 부분 완료 신호 전송 ===`)
                console.log(`전송할 HTML 길이: ${cleanHtml.length}자`)
                console.log(`남은 소제목 인덱스: ${remainingSubtitles.map((s: any) => s.originalIndex).join(', ')}`)
                console.log(`=== catch 블록: 1차 요청 부분 완료 신호 전송 ===`)
                
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
              console.error('catch 블록에서 부분 데이터 처리 중 에러:', processError)
              // 처리 실패 시 일반 에러 처리로 진행
            }
          }
          
          // 타임아웃 에러이고 부분 데이터가 충분하면 완료 처리
          if (isTimeoutError && fullText.trim() && fullText.trim().length > 100) {
            console.warn('타임아웃 에러 발생했지만 부분 데이터가 충분함. 완료 처리합니다.')
            console.log(`부분 데이터 길이: ${fullText.length}자`)
            
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
              console.error('부분 데이터 처리 중 에러:', processError)
              // 처리 실패 시 일반 에러 처리로 진행
            }
          }
          
          // 사용자 친화적 에러 메시지 생성
          let userFriendlyMessage: string | null = '점사를 진행하는 중 일시적인 문제가 발생했습니다. 다시 시도해 주시거나 고객센터로 문의해 주세요.'
          const errorStatus = error?.status || error?.code || ''
          
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
          
          // 에러 메시지가 필요한 경우에만 전송
          if (userFriendlyMessage) {
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                type: 'error', 
                error: userFriendlyMessage
              })}\n\n`))
            } catch (enqueueError: any) {
              console.error('에러 메시지 전송 실패:', enqueueError)
            }
          }
          
          try {
            controller.close()
          } catch (closeError: any) {
            console.error('스트림 닫기 실패:', closeError)
          }
        }
      }
    })
    
    console.log('=== 재미나이 API 라우트 완료 (스트리밍) ===')
    
    // 스트리밍 응답 반환
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error: any) {
    console.error('=== 재미나이 API 라우트 에러 ===')
    console.error('에러 타입:', typeof error)
    console.error('에러 객체:', error)
    console.error('에러 메시지:', error?.message)
    console.error('에러 스택:', error?.stack)
    console.error('============================')
    
    const errorMessage = error?.message || error?.toString() || '서버 에러 발생'
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error?.stack || error?.toString()
      },
      { status: 500 }
    )
  }
}


