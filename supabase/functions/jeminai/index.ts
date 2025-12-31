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

  console.log('Gemini API URL:', url.substring(0, 80) + '...')
  console.log('요청 본문 크기:', JSON.stringify(requestBody).length, 'bytes')
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  console.log('Gemini API 응답 상태:', response.status, response.statusText)
  console.log('Content-Type:', response.headers.get('content-type'))

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Gemini API 에러:', errorText)
    throw new Error(`Gemini API 호출 실패: ${response.status} ${errorText}`)
  }

  if (!response.body) {
    console.error('응답 본문이 없습니다.')
    throw new Error('응답 본문이 없습니다.')
  }
  
  console.log('Gemini API 스트림 시작')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finishReason: string | undefined
  let totalBytesRead = 0

  try {
    console.log('스트림 리더 시작, 데이터 읽기 시작')
    let readAttempts = 0
    const maxReadAttempts = 100000 // 충분히 큰 값 (실제로는 done이 true가 되면 종료)
    
    while (readAttempts < maxReadAttempts) {
      readAttempts++
      
      // 첫 번째 읽기 시도 전에 로그
      if (readAttempts === 1) {
        console.log('첫 번째 reader.read() 호출 대기 중...')
      }
      
      // 1000번마다 진행 상황 로그
      if (readAttempts % 1000 === 0) {
        console.log(`읽기 시도 #${readAttempts}, 총 바이트: ${totalBytesRead}, finishReason: ${finishReason || '없음'}`)
      }
      
      const { done, value } = await reader.read()
      
      if (readAttempts === 1) {
        console.log('첫 번째 reader.read() 완료, done:', done, 'value:', value ? `있음 (${value.length} bytes)` : '없음')
      }
      
      if (done) {
        console.log('스트림 읽기 완료 (done: true), 총 읽은 바이트:', totalBytesRead, '총 읽기 시도:', readAttempts, 'finishReason:', finishReason || '없음')
        
        // 버퍼에 남은 데이터 처리
        if (buffer.trim()) {
          console.log('버퍼에 남은 데이터 처리 중, 버퍼 길이:', buffer.length)
          // 버퍼의 마지막 데이터 처리 시도
          const remainingDataPrefix = 'data: '
          const lastEventStart = buffer.lastIndexOf(remainingDataPrefix)
          if (lastEventStart !== -1) {
            const lastJsonStart = lastEventStart + remainingDataPrefix.length
            const lastJsonStr = buffer.substring(lastJsonStart).trim()
            if (lastJsonStr) {
              try {
                const lastData = JSON.parse(lastJsonStr)
                if (lastData.candidates && lastData.candidates[0]) {
                  const lastCandidate = lastData.candidates[0]
                  if (lastCandidate.content && lastCandidate.content.parts) {
                    for (const part of lastCandidate.content.parts) {
                      if (part.text) {
                        onChunk({ text: part.text })
                      }
                    }
                  }
                  if (lastCandidate.finishReason && !finishReason) {
                    finishReason = lastCandidate.finishReason
                    console.log('버퍼에서 Finish Reason 발견:', finishReason)
                  }
                }
              } catch (e) {
                console.log('버퍼 마지막 데이터 파싱 실패 (무시 가능):', e)
              }
            }
          }
        }
        break
      }

      if (!value || value.length === 0) {
        console.log('빈 값 수신, 계속 대기...')
        continue
      }

      totalBytesRead += value.length
      if (totalBytesRead % 10000 === 0 || totalBytesRead < 1000 || readAttempts <= 5) {
        console.log(`읽은 바이트: ${totalBytesRead} (시도 #${readAttempts}, 청크 크기: ${value.length})`)
      }

      buffer += decoder.decode(value, { stream: true })
      
      // Server-Sent Events 형식 파싱
      // Gemini API는 "data: "로 시작하는 각 이벤트를 보냄
      // 각 이벤트는 완전한 JSON 객체이거나 여러 줄로 나뉘어질 수 있음
      
      while (true) {
        // "data: "로 시작하는 이벤트 찾기
        const dataPrefix = 'data: '
        const eventStart = buffer.indexOf(dataPrefix)
        
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
                console.log('Finish Reason 수신:', finishReason)
                
                // STOP이 아닌 경우 (MAX_TOKENS 등) 로그 추가
                if (finishReason !== 'STOP') {
                  console.warn(`⚠️ Finish Reason이 STOP이 아님: ${finishReason}, 부분 완료 처리 필요할 수 있음`)
                }
              }
            } else {
              console.log('후보 데이터 없음, 키:', Object.keys(data))
            }
          } catch (e) {
            console.error('JSON 파싱 실패:', e, 'JSON 시작:', jsonStr.substring(0, 200))
          }
        }
      }
    }
  } catch (streamError: any) {
    console.error('=== 스트림 읽기 중 에러 발생 ===')
    console.error('에러 타입:', typeof streamError)
    console.error('에러 메시지:', streamError?.message || String(streamError))
    console.error('에러 스택:', streamError?.stack || 'N/A')
    console.error('총 읽은 바이트:', totalBytesRead)
    console.error('버퍼 길이:', buffer.length)
    console.error('버퍼 시작 부분:', buffer.substring(0, 200))
    throw streamError
  } finally {
    try {
      reader.releaseLock()
      console.log('스트림 리더 종료')
    } catch (releaseError) {
      console.error('리더 해제 중 에러:', releaseError)
    }
  }

  return { response: null, finishReason }
}

// 완료된 소제목 파싱 함수
function parseCompletedSubtitles(html: string, allMenuSubtitles: any[]): { completedSubtitles: number[], completedMenus: number[] } {
  const completedSubtitles: number[] = []
  const completedMenus: number[] = []

  console.log('=== parseCompletedSubtitles 시작 ===')
  console.log('HTML 길이:', html.length)
  console.log('전체 소제목 개수:', allMenuSubtitles.length)
  console.log('HTML 시작 부분 (500자):', html.substring(0, 500))
  console.log('HTML 끝 부분 (500자):', html.substring(Math.max(0, html.length - 500)))

  const subtitleSectionStartRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi
  const subtitleSectionMatches: RegExpMatchArray[] = []
  let match: RegExpMatchArray | null
  while ((match = subtitleSectionStartRegex.exec(html)) !== null) {
    subtitleSectionMatches.push(match)
  }

  console.log('subtitle-section 시작 태그 매칭 개수:', subtitleSectionMatches.length)
  if (subtitleSectionMatches.length > 0) {
    console.log('첫 번째 subtitle-section 샘플:', html.substring(subtitleSectionMatches[0].index!, subtitleSectionMatches[0].index! + 500))
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

  console.log('추출된 subtitle-section 개수:', subtitleSections.length)

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
          console.log(`소제목 ${index}: h3 태그를 찾을 수 없음, 섹션 시작: ${section.substring(0, 200)}`)
        }
        continue
      }

      const h3Text = h3Match[1].trim()
      const subtitleTitleWithoutDot = subtitle.subtitle.replace(/\.$/, '')
      let titleMatches = false

      // 정확한 매칭
      if (h3Text === subtitle.subtitle || h3Text === subtitleTitleWithoutDot) {
        titleMatches = true
      } else {
        // 부분 매칭 (더 유연하게)
        const h3TextNormalized = h3Text.replace(/\s+/g, ' ').trim()
        const subtitleNormalized = subtitle.subtitle.replace(/\s+/g, ' ').trim()
        const subtitleWithoutDotNormalized = subtitleTitleWithoutDot.replace(/\s+/g, ' ').trim()
        
        if (h3TextNormalized === subtitleNormalized || 
            h3TextNormalized === subtitleWithoutDotNormalized ||
            h3Text.includes(subtitle.subtitle) || 
            h3Text.includes(subtitleTitleWithoutDot) ||
            h3Text.includes(`${menuNumber}-${subtitleNumber}`) ||
            h3TextNormalized.includes(subtitleNormalized) ||
            h3TextNormalized.includes(subtitleWithoutDotNormalized)) {
          titleMatches = true
        }
      }

      if (index < 3) { // 처음 3개만 디버깅 로그
        console.log(`소제목 ${index} (${subtitle.subtitle}): h3Text="${h3Text}", titleMatches=${titleMatches}`)
      }

      // subtitle-content 확인
      const subtitleContentPattern = /<div[^>]*class="[^"]*subtitle-content[^"]*"[^>]*>/i
      const hasContent = subtitleContentPattern.test(section)
      
      if (titleMatches && hasContent) {
        // content 내용 확인 (더 유연한 패턴)
        const contentMatch = section.match(/<div[^>]*class="[^"]*subtitle-content[^"]*"[^>]*>([\s\S]*?)(?:<\/div>|$)/i)
        if (contentMatch) {
          const contentText = contentMatch[1].trim()
          // HTML 태그를 제거한 순수 텍스트 길이 확인
          const textOnly = contentText.replace(/<[^>]+>/g, '').trim()
          
          if (textOnly.length > 10) {
            if (!completedSubtitles.includes(index)) {
              completedSubtitles.push(index)
              if (!completedMenus.includes(menuNumber - 1)) {
                completedMenus.push(menuNumber - 1)
              }
              found = true
              console.log(`✅ 소제목 ${index} (${subtitle.subtitle}) 완료 감지, 내용 길이: ${textOnly.length}자`)
              break
            }
          } else {
            if (index < 3) {
              console.log(`소제목 ${index}: 내용이 너무 짧음 (${textOnly.length}자)`)
            }
          }
        } else {
          if (index < 3) {
            console.log(`소제목 ${index}: content 매칭 실패`)
          }
        }
      } else {
        if (index < 3) {
          console.log(`소제목 ${index}: titleMatches=${titleMatches}, hasContent=${hasContent}`)
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

// 프롬프트 생성 함수
function buildPrompt(body: any): string {
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

  // 한국의 현재 날짜/시간
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

  const menuItemsInfo = menu_items ? menu_items.map((item: any, idx: number) => {
    const menuTitle = typeof item === 'string' ? item : (item.value || item.title || '')
    const menuThumbnail = typeof item === 'object' ? (item.thumbnail || '') : ''
    return {
      index: idx,
      title: menuTitle,
      thumbnail: menuThumbnail
    }
  }) : []

  // 프롬프트 생성 (원본 로직과 동일)
  let prompt = `
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
당신은 ${role_prompt}입니다.

---

# [입력 데이터]

**만세력 정보:**
${manse_ryeok_text || '만세력 텍스트 없음'}

${manse_ryeok_table ? `**만세력 테이블:**\n${manse_ryeok_table}` : ''}

${day_gan_info ? `**일간 정보:**\n- 한글명: ${day_gan_info.fullName}\n- 간지: ${day_gan_info.gan}\n- 한자: ${day_gan_info.hanja}\n- 오행: ${day_gan_info.ohang}` : ''}

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

**중요: 현재 날짜 정보**
- 오늘은 ${koreaDateString}입니다.
- 현재 연도는 ${currentYear}년입니다.
- 해석할 때 반드시 이 날짜 정보를 기준으로 하세요. 과거 연도(예: 2024년)를 언급하지 마세요.

${isSecondRequest ? `
**⚠️ 아래에 나열된 남은 소제목만 해석하세요. 위에 나열된 완료된 소제목은 절대 포함하지 마세요!**
` : ''}

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요:

${menuItemsInfo.map((menuItem: any, menuIdx: number) => {
  const menuNumber = menuIdx + 1
  const subtitlesForMenu = menu_subtitles.filter((sub: any, idx: number) => {
    const match = sub.subtitle.match(/^(\d+)-(\d+)/)
    return match ? parseInt(match[1]) === menuNumber : false
  })
  
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
      console.error(`❌ 소제목 "${sub.subtitle}"의 char_count가 설정되지 않았거나 0 이하입니다. char_count: ${charCount}`)
    }
    const thumbnail = menu_subtitles[globalSubIdx]?.thumbnail || ''
    return `
  ${sub.subtitle}
  - 해석도구: ${tool}
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
    <h3 class="subtitle-title">[소제목]</h3>
    ${menu_subtitles.some((s: any) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[소제목 썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div>
  </div>
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[다음 소제목]</h3>
    ${menu_subtitles.some((s: any) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[소제목 썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
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

    console.log('=== 재미나이 Edge Function 시작 ===')
    console.log('요청 모델:', model)
    console.log('메뉴 소제목 개수:', menu_subtitles?.length)
    console.log('2차 요청 여부:', isSecondRequest || false)
    console.log('요청 본문 크기:', JSON.stringify(body).length, 'bytes')

    if (!role_prompt || !menu_subtitles || !Array.isArray(menu_subtitles) || menu_subtitles.length === 0) {
      console.error('Invalid request format:', { role_prompt: !!role_prompt, menu_subtitles: menu_subtitles?.length })
      return new Response(
        JSON.stringify({ error: 'Invalid request format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY') || ''
    console.log('GEMINI_API_KEY 존재 여부:', !!apiKey, '길이:', apiKey.length)
    if (!apiKey) {
      console.error('GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.')
      return new Response(
        JSON.stringify({ error: 'GEMINI_API_KEY 환경 변수가 설정되지 않았습니다.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const prompt = buildPrompt(body)
    console.log('프롬프트 길이:', prompt.length)

    // Server-Sent Events 스트리밍 응답 생성
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        let fullText = ''
        let isFirstChunk = true
        const streamStartTime = Date.now()
        const TIMEOUT_PARTIAL = 400000 // 400초
        const MAX_DURATION = 400000 // 400초 (Supabase Edge Function 제한)
        let hasSentPartialDone = false

        try {
          console.log('=== Gemini API 스트리밍 호출 시작 ===')
          console.log('API 키 길이:', apiKey.length)
          console.log('모델:', model)
          console.log('프롬프트 길이:', prompt.length)
          console.log(`타임아웃 설정: ${TIMEOUT_PARTIAL/1000}초 (부분 완료), ${MAX_DURATION/1000}초 (최대)`)
          
          let chunkCount = 0
          let lastCompletionCheckChunk = 0
          const COMPLETION_CHECK_INTERVAL = 50
          let allSubtitlesCompletedEarly = false
          
          // Gemini API 스트리밍 호출
          const { finishReason } = await callGeminiStream(
            apiKey,
            model,
            prompt,
            (chunk: any) => {
              chunkCount++
              if (chunkCount % 10 === 0 || chunkCount === 1) {
                console.log(`Gemini 청크 #${chunkCount} 수신:`, chunk.text ? chunk.text.substring(0, 50) : '텍스트 없음')
              }
              const elapsed = Date.now() - streamStartTime

              // 첫 번째 청크인 경우 시작 신호 전송
              if (isFirstChunk) {
                console.log('첫 번째 청크 수신, 시작 신호 전송')
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'start' })}\n\n`))
                isFirstChunk = false
              }

              if (chunk.text) {
                fullText += chunk.text

                // 청크 데이터 전송
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  type: 'chunk', 
                  text: chunk.text,
                  accumulatedLength: fullText.length
                })}\n\n`))

                // 모든 소제목 완료 여부 주기적 체크 (50번째 청크마다)
                if (chunkCount - lastCompletionCheckChunk >= COMPLETION_CHECK_INTERVAL && fullText.trim().length > 100) {
                  // HTML 코드 블록 제거
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
                    console.log(`✅ [청크 ${chunkCount}] 모든 소제목이 완료되었습니다! 스트림을 즉시 중단합니다.`)
                    console.log(`완료된 소제목: ${completedSubtitles.length}/${menu_subtitles.length}개`)
                    console.log(`fullText 길이: ${fullText.length}자`)
                    
                    allSubtitlesCompletedEarly = true
                    
                    // HTML 정리
                    let cleanHtml = fullText.trim()
                    const htmlBlockMatch2 = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/)
                    if (htmlBlockMatch2) {
                      cleanHtml = htmlBlockMatch2[1].trim()
                    } else {
                      const codeBlockMatch2 = cleanHtml.match(/```\s*([\s\S]*?)\s*```/)
                      if (codeBlockMatch2) {
                        cleanHtml = codeBlockMatch2[1].trim()
                      }
                    }
                    
                    cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
                    cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
                    cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
                    cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
                    cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
                    cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
                    cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
                    cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
                    cleanHtml = cleanHtml.replace(/\*\*/g, '')
                    
                    console.log(`✅ 조기 완료 처리: HTML 길이 ${cleanHtml.length}자`)
                    
                    // 완료 신호 즉시 전송
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                      type: 'done',
                      html: cleanHtml,
                      isTruncated: false,
                      finishReason: 'STOP',
                    })}\n\n`))
                    
                    controller.close()
                    console.log('✅ 모든 소제목 조기 완료: 스트림 종료')
                    
                    // 조기 완료 신호 (callGeminiStream 함수에서 체크하여 스트림 종료할 수 있도록)
                    // 하지만 callGeminiStream이 이를 지원하지 않으므로, 콜백에서 완료 처리만 수행
                    // callGeminiStream은 계속 실행되지만 전송은 중단됨
                    return // 콜백 종료 (하지만 callGeminiStream은 계속 실행됨)
                  } else {
                    lastCompletionCheckChunk = chunkCount
                  }
                }
              }
            }
          )
          
          // 조기 완료 처리된 경우 이후 로직 건너뛰기
          if (allSubtitlesCompletedEarly) {
            console.log('✅ 조기 완료 처리 완료, 이후 로직 건너뛰기')
            return
          }

          console.log(`=== Gemini API 스트리밍 완료 ===`)
          console.log(`총 청크 수: ${chunkCount}`)
          console.log(`fullText 길이: ${fullText.length}자`)
          console.log(`Finish Reason: ${finishReason || '없음 (스트림이 중간에 끊김)'}`)
          
          // Finish Reason이 없거나 STOP이 아닌 경우 경고
          if (!finishReason) {
            console.warn('⚠️ Finish Reason이 없습니다. 스트림이 완전히 전송되지 않았을 수 있습니다.')
            console.warn('⚠️ 부분 완료 처리를 시도하거나 2차 요청이 필요할 수 있습니다.')
          } else if (finishReason !== 'STOP') {
            console.warn(`⚠️ Finish Reason이 STOP이 아닙니다: ${finishReason}`)
            console.warn('⚠️ 부분 완료 처리를 시도하거나 2차 요청이 필요할 수 있습니다.')
          }
          
          // 스트림 완료 처리
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

          cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
          cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
          cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
          cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
          cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
          cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
          cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
          cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
          cleanHtml = cleanHtml.replace(/\*\*/g, '')

          // finishReason이 MAX_TOKENS인 경우에도 실제로 모든 소제목이 완료되었는지 확인
          let actualIsTruncated = finishReason === 'MAX_TOKENS' || !finishReason
          let actualFinishReason = finishReason || 'STOP'
          
          if (finishReason === 'MAX_TOKENS') {
            console.log('=== MAX_TOKENS 감지: 실제 점사 완료 여부 확인 ===')
            const { completedSubtitles } = parseCompletedSubtitles(cleanHtml, menu_subtitles)
            const allSubtitlesCompleted = completedSubtitles.length === menu_subtitles.length
            
            console.log(`전체 소제목: ${menu_subtitles.length}개`)
            console.log(`완료된 소제목: ${completedSubtitles.length}개`)
            console.log(`모든 소제목 완료 여부: ${allSubtitlesCompleted ? '✅ 예' : '❌ 아니오'}`)
            
            if (allSubtitlesCompleted) {
              console.log('✅ 점사가 모두 완료되었습니다. MAX_TOKENS는 점사 완료 후 추가 생성이 발생한 것으로 보입니다.')
              console.log('✅ isTruncated를 false로 설정하고 finishReason을 STOP으로 변경합니다.')
              actualIsTruncated = false
              actualFinishReason = 'STOP'
            } else {
              console.log('❌ 일부 소제목이 미완료 상태입니다. MAX_TOKENS로 인한 잘림으로 처리합니다.')
              console.log(`미완료 소제목: ${menu_subtitles.length - completedSubtitles.length}개`)
            }
            console.log('=== MAX_TOKENS 확인 완료 ===')
          }

          // 2차 요청 자동 시작 로직 제거됨 - 항상 done 전송
          console.log('✅ 스트림 완료, done 전송')
          console.log('원본 Finish Reason:', finishReason)
          console.log('실제 Finish Reason:', actualFinishReason)
          console.log('원본 isTruncated:', finishReason === 'MAX_TOKENS' || !finishReason)
          console.log('실제 isTruncated:', actualIsTruncated)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'done',
            html: cleanHtml,
            isTruncated: actualIsTruncated,
            finishReason: actualFinishReason,
          })}\n\n`))

          controller.close()
        } catch (error: any) {
          console.error('=== 스트리밍 중 에러 발생 ===')
          console.error('에러 타입:', typeof error)
          console.error('에러 메시지:', error?.message || String(error))
          console.error('에러 스택:', error?.stack || 'N/A')
          const elapsed = Date.now() - streamStartTime
          console.error('경과 시간:', Math.round(elapsed/1000), '초')
          console.error('fullText 길이:', fullText.length, '자')

          // 2차 요청 자동 시작 로직 제거됨 - 에러 발생 시 error 전송
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
            type: 'error',
            error: error?.message || '스트리밍 중 오류가 발생했습니다.'
          })}\n\n`))

          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })
  } catch (error: any) {
    console.error('Edge Function 오류:', error)
    return new Response(
      JSON.stringify({ 
        error: '서버 오류가 발생했습니다.', 
        details: error?.message || String(error)
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
