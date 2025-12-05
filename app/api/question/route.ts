import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

export async function POST(req: NextRequest) {
        try {
          const body = await req.json()
          const { question, menuTitle, subtitles, subtitlesContent, userName } = body

          if (!question || !menuTitle || !subtitles || !Array.isArray(subtitles)) {
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
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096, // 한글 200자 = 약 600토큰, 충분한 여유를 두고 4096토큰 설정
      },
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

    // 소제목 내용을 텍스트로 변환 (길이 제한 - 프롬프트가 너무 길면 MAX_TOKENS 발생)
    const subtitlesText = subtitlesContent 
      ? subtitlesContent
          .slice(0, 3) // 최대 3개 소제목만 사용 (프롬프트 길이 줄이기)
          .map((sub: any, idx: number) => {
            const title = sub.title || subtitles[idx] || ''
            const content = (sub.content || '').substring(0, 300) // 각 내용은 최대 300자로 줄임
            return `소제목 ${idx + 1}: ${title}\n내용: ${content}`
          })
          .join('\n\n')
      : subtitles.slice(0, 3).join(', ')

    // 프롬프트 단순화 및 최적화
    const userNameText = userName ? `내담자 이름: ${userName}\n\n` : ''
    const prompt = `당신은 전문 점사 상담사입니다.

${userNameText}대제목: ${menuTitle}

소제목 목록:
${subtitles.slice(0, 3).map((sub, idx) => `${idx + 1}. ${sub}`).join('\n')}

소제목 내용 (참고용):
${subtitlesText.substring(0, 1500)}${subtitlesText.length > 1500 ? '...' : ''}

내담자 질문: ${question}

규칙:
1. 질문이 위 소제목들과 관련이 있으면 답변하세요.
2. 관련이 없으면 "${userName ? userName + '님' : '내담자님'}, 주제 안에서만 점사가 가능합니다."라고만 답변하세요.
3. 답변은 200자 이내로 간결하게 작성하세요.
4. 반드시 높임말(존댓말)을 사용하세요. "입니다", "하세요", "되세요", "됩니다", "입니다" 등의 표준 높임말을 사용하고, 반말("이다", "하다", "되다" 등)을 절대 사용하지 마세요. "입니다요", "것입니다요" 같은 비표준 표현은 절대 사용하지 마세요.
5. ${userName ? `답변할 때 반드시 이름을 부를 때는 "${userName}님" 또는 "${userName.length > 1 ? userName.substring(1) + '님' : userName + '님'}" 형식으로 부르세요. 예를 들어 "이미자"라는 이름이면 "이미자님" 또는 "미자님"이라고 부르세요. "${userName}"이라고 이름만 부르지 마세요. 반드시 "님"을 붙여서 부르세요.` : '답변할 때 "님", "님의", "당신", "당신의" 같은 호칭을 사용하지 마세요. 호칭 없이 바로 본론을 말하세요.'}
6. 절대로 자신의 정체성이나 서비스 이름을 밝히지 마세요. "재미나이", "Jeminai", "재미나이 점사" 등의 단어나 표현을 절대 사용하지 마세요. "이 점사는", "위 점사는", "점사는" 같은 표현을 사용하세요.

답변:`

    console.log('=== 재미나이 질문 답변 API 호출 시작 ===')
    console.log('프롬프트 길이:', prompt.length)
    console.log('프롬프트 미리보기:', prompt.substring(0, 200))
    console.log('질문:', question)
    console.log('대제목:', menuTitle)
    console.log('소제목 개수:', subtitles.length)
    
    let answer = ''
    let response: any = null
    let finishReason: string | undefined = undefined
    
    try {
      const result = await model.generateContent(prompt)
      response = result.response
      
      console.log('=== 재미나이 API 응답 받음 ===')
      console.log('response 타입:', typeof response)
      console.log('response.constructor.name:', response.constructor?.name)
      
      // 응답 객체 전체 구조 로깅 (답변 추출 전)
      console.log('=== 응답 객체 전체 구조 (답변 추출 전) ===')
      console.log('response.keys:', Object.keys(response))
      console.log('response.candidates:', response.candidates)
      if (response.candidates && response.candidates.length > 0) {
        console.log('response.candidates[0]:', JSON.stringify(response.candidates[0], null, 2))
        console.log('response.candidates[0].content:', response.candidates[0].content)
        console.log('response.candidates[0].content.parts:', response.candidates[0].content?.parts)
      }
      console.log('response.text:', response.text)
      console.log('response.text 타입:', typeof response.text)
      
      // finishReason 확인
      finishReason = response.candidates?.[0]?.finishReason
      console.log('Finish Reason:', finishReason)
      
      // 응답 기본 정보 로깅
      console.log('Candidates 개수:', response.candidates?.length || 0)
      console.log('Usage Metadata:', JSON.stringify(response.usageMetadata, null, 2))
      console.log('Prompt Feedback:', JSON.stringify(response.promptFeedback, null, 2))
      
      // 응답이 차단되었는지 확인
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        console.error('응답이 차단됨:', finishReason)
        return NextResponse.json(
          { error: '안전 필터에 의해 응답이 차단되었습니다.' },
          { status: 500 }
        )
      }
      
      // MAX_TOKENS인 경우에도 부분 응답이 있을 수 있으므로 계속 진행
      if (finishReason === 'MAX_TOKENS') {
        console.log('MAX_TOKENS 도달 - 부분 응답 추출 시도')
      }
      
      // 방법 1: response.text() 먼저 시도 (MAX_TOKENS인 경우에도 작동)
      try {
        console.log('방법 1 시도: response.text() 호출')
        const textMethod = response.text
        console.log('textMethod 타입:', typeof textMethod)
        console.log('textMethod:', textMethod)
        
        if (typeof textMethod === 'function') {
          const textResult = textMethod.call(response)
          console.log('textResult 타입:', typeof textResult)
          console.log('textResult가 Promise인가?', textResult instanceof Promise)
          
          // 비동기일 수도 있으므로 Promise인지 확인
          if (textResult instanceof Promise) {
            answer = (await textResult).trim()
          } else {
            answer = String(textResult).trim()
          }
          
          console.log('방법 1 결과 - answer 길이:', answer.length)
          console.log('방법 1 결과 - answer 내용:', answer.substring(0, 200))
          
          if (answer) {
            console.log('방법 1 (response.text()) 성공, 답변:', answer.substring(0, 100))
            console.log('답변 전체 길이:', answer.length)
          } else {
            console.log('방법 1: response.text()가 빈 문자열 반환')
          }
        } else {
          console.log('response.text가 함수가 아님, 실제 값:', textMethod)
        }
      } catch (textError: any) {
        console.error('방법 1 (response.text()) 오류:', textError.message)
        console.error('오류 스택:', textError.stack)
        console.error('오류 전체:', textError)
      }
      
      // 방법 2: candidates에서 직접 추출 (방법 1이 실패한 경우)
      if (!answer && response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0]
        console.log('방법 2 시도 - Candidate 정보:', {
          finishReason: candidate.finishReason,
          hasContent: !!candidate.content,
          hasParts: !!(candidate.content && candidate.content.parts),
          partsLength: candidate.content?.parts?.length || 0
        })
        
        if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          // parts 배열에서 텍스트 추출
          for (const part of candidate.content.parts) {
            if (part && typeof part === 'object') {
              // part.text가 있는지 확인
              if ('text' in part && typeof part.text === 'string') {
                answer += part.text
              }
              // 다른 가능한 필드들 확인
              else if (part.text !== undefined) {
                answer += String(part.text)
              }
            }
          }
          answer = answer.trim()
          
          if (answer) {
            console.log('방법 2 (candidates) 성공, 답변:', answer.substring(0, 100))
            console.log('답변 전체 길이:', answer.length)
          } else {
            console.log('방법 2: parts에서 텍스트를 추출할 수 없음')
            console.log('parts 상세:', JSON.stringify(candidate.content.parts, null, 2))
          }
        } else {
          console.log('candidate.content.parts가 없거나 비어있음')
          console.log('candidate 전체 구조:', JSON.stringify(candidate, null, 2))
        }
      } else if (!answer) {
        console.log('response.candidates가 없거나 비어있음')
      }
      
      // 방법 3: promptFeedback 확인
      if (!answer && response.promptFeedback) {
        console.log('promptFeedback:', response.promptFeedback)
        if (response.promptFeedback.blockReason) {
          throw new Error(`응답이 차단되었습니다: ${response.promptFeedback.blockReason}`)
        }
      }
      
      // 모든 방법 실패 시 상세 로그 및 클라이언트로 전달
      if (!answer) {
        console.error('=== 모든 방법으로 답변 추출 실패 ===')
        console.error('Finish Reason:', finishReason)
        console.error('Candidates 개수:', response.candidates?.length || 0)
        
        // 응답 객체를 안전하게 직렬화 (순환 참조 방지)
        const responseInfo: any = {
          finishReason,
          candidatesCount: response.candidates?.length || 0,
          hasUsageMetadata: !!response.usageMetadata,
          hasPromptFeedback: !!response.promptFeedback,
          responseKeys: Object.keys(response),
        }
        
        // 첫 번째 candidate 상세 정보
        if (response.candidates && response.candidates.length > 0) {
          const candidate = response.candidates[0]
          responseInfo.firstCandidate = {
            finishReason: candidate.finishReason,
            hasContent: !!candidate.content,
            hasParts: !!(candidate.content && candidate.content.parts),
            partsLength: candidate.content?.parts?.length || 0,
            parts: candidate.content?.parts || null,
            content: candidate.content ? {
              role: candidate.content.role,
              partsCount: candidate.content.parts?.length || 0
            } : null
          }
          
          console.error('첫 번째 candidate 상세:', JSON.stringify(responseInfo.firstCandidate, null, 2))
        }
        
        console.error('Response 전체 구조:', JSON.stringify(responseInfo, null, 2))
        
        // 클라이언트로 상세 정보 전달
        return NextResponse.json(
          { 
            error: '답변을 추출할 수 없습니다.',
            debug: responseInfo
          },
          { status: 500 }
        )
      }
    } catch (apiError: any) {
      console.error('Gemini API 호출 중 오류:', apiError)
      throw apiError
    }

    // 답변이 비어있으면 에러
    if (!answer || answer.length === 0) {
      console.error('답변이 비어있습니다.')
      return NextResponse.json(
        { error: 'Gemini API가 빈 답변을 반환했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    // 200자 제한 확인 및 처리
    if (answer.length > 200) {
      answer = answer.substring(0, 197) + '...'
    }

    console.log('최종 답변:', answer)
    return NextResponse.json({ answer })
  } catch (error: any) {
    console.error('질문 답변 생성 오류:', error)
    return NextResponse.json(
      { error: error.message || '답변 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

