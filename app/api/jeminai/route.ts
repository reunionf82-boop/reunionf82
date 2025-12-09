import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

export async function POST(req: NextRequest) {
  try {
    console.log('=== 재미나이 API 라우트 시작 ===')
    const body = await req.json()
    const { role_prompt, restrictions, menu_subtitles, user_info, partner_info, menu_items, model = 'gemini-2.5-flash', manse_ryeok_table, manse_ryeok_text, manse_ryeok_json, day_gan_info } = body
    
    console.log('요청 모델:', model)
    console.log('메뉴 소제목 개수:', menu_subtitles?.length)
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
    const selectedModel = model || 'gemini-2.5-flash'
    
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

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요:

${menuItemsInfo.map((menuItem: any, menuIdx: number) => {
  const menuNumber = menuIdx + 1
  const subtitlesForMenu = menu_subtitles.filter((sub: any, idx: number) => {
    const match = sub.subtitle.match(/^(\d+)-(\d+)/)
    return match ? parseInt(match[1]) === menuNumber : false
  })
  
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
}).join('\n\n')}

각 메뉴별로 다음 HTML 형식으로 결과를 작성해주세요:

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

중요:
1. 각 메뉴는 <div class="menu-section">으로 구분
2. 메뉴 제목은 <h2 class="menu-title">으로 표시
3. 썸네일이 있으면 <img src="[URL]" alt="[제목]" class="menu-thumbnail" />로 표시
4. 각 소제목은 <div class="subtitle-section">으로 구분
5. 소제목 제목은 <h3 class="subtitle-title">으로 표시하되, 소제목 끝에 반드시 마침표(.)를 추가하세요. 예: <h3 class="subtitle-title">1-1. 나의 타고난 '기본 성격'과 '가치관'.</h3>
6. 해석 내용은 <div class="subtitle-content"> 안에 HTML 형식으로 작성
7. 각 content는 해당 subtitle의 char_count를 초과하지 않도록 주의
8. 모든 메뉴와 소제목을 순서대로 포함
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
              console.error(`API 호출 실패 (시도 ${attempt}/${maxRetries}):`, apiError.message)
              
              // 500 에러이고 마지막 시도가 아니면 재시도
              if (attempt < maxRetries && apiError.message?.includes('500')) {
                const waitTime = attempt * 2000 // 2초, 4초, 6초 대기
                console.log(`${waitTime}ms 대기 후 재시도...`)
                await new Promise(resolve => setTimeout(resolve, waitTime))
                continue
              }
              
              // 마지막 시도이거나 500이 아닌 에러면 throw
              throw apiError
            }
          }
          
          if (lastError) {
            throw lastError
          }
          
          let fullText = ''
          let isFirstChunk = true
          
          // 스트림 데이터 읽기
          for await (const chunk of streamResult.stream) {
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
          }
          
          // 응답 완료 처리
          const response = await streamResult.response
          const finishReason = response.candidates?.[0]?.finishReason
          const isTruncated = finishReason === 'MAX_TOKENS'
          
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

          
          // ** 문자 제거 (마크다운 강조 표시 제거)
          cleanHtml = cleanHtml.replace(/\*\*/g, '')
          
          console.log('Gemini API 스트리밍 완료')
          console.log('응답 HTML 길이:', cleanHtml.length)
          console.log('Finish Reason:', finishReason)
          
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
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error', 
            error: error?.message || '스트리밍 중 오류가 발생했습니다.' 
          })}\n\n`))
          controller.close()
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

