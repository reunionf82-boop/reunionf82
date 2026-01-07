import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai'

// Vercel Serverless Function의 타임아웃을 5분(300초)으로 설정
export const maxDuration = 300

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
      model: 'gemini-3-flash-preview',
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

    
    let answer = ''
    let response: any = null
    let finishReason: string | undefined = undefined
    
    try {
      const result = await model.generateContent(prompt)
      response = result.response
      
      
      // 응답 객체 전체 구조 로깅 (답변 추출 전)
      if (response.candidates && response.candidates.length > 0) {
      }
      
      // finishReason 확인
      finishReason = response.candidates?.[0]?.finishReason
      
      // 응답 기본 정보 로깅
      
      // 응답이 차단되었는지 확인
      if (finishReason === 'SAFETY' || finishReason === 'RECITATION') {
        return NextResponse.json(
          { error: '안전 필터에 의해 응답이 차단되었습니다.' },
          { status: 500 }
        )
      }
      
      // MAX_TOKENS인 경우에도 부분 응답이 있을 수 있으므로 계속 진행
      if (finishReason === 'MAX_TOKENS') {
      }
      
      // 방법 1: response.text() 먼저 시도 (MAX_TOKENS인 경우에도 작동)
      try {
        const textMethod = response.text
        
        if (typeof textMethod === 'function') {
          const textResult = textMethod.call(response)
          
          // 비동기일 수도 있으므로 Promise인지 확인
          if (textResult instanceof Promise) {
            answer = (await textResult).trim()
          } else {
            answer = String(textResult).trim()
          }
          
          
          if (answer) {
          } else {
          }
        } else {
        }
      } catch (textError: any) {
      }
      
      // 방법 2: candidates에서 직접 추출 (방법 1이 실패한 경우)
      if (!answer && response.candidates && response.candidates.length > 0) {
        const candidate = response.candidates[0]
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
          } else {
          }
        } else {
        }
      } else if (!answer) {
      }
      
      // 방법 3: promptFeedback 확인
      if (!answer && response.promptFeedback) {
        if (response.promptFeedback.blockReason) {
          throw new Error(`응답이 차단되었습니다: ${response.promptFeedback.blockReason}`)
        }
      }
      
      // 모든 방법 실패 시 상세 로그 및 클라이언트로 전달
      if (!answer) {
        
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
          
        }
        
        
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
      throw apiError
    }

    // 답변이 비어있으면 에러
    if (!answer || answer.length === 0) {
      return NextResponse.json(
        { error: 'Gemini API가 빈 답변을 반환했습니다. 다시 시도해주세요.' },
        { status: 500 }
      )
    }

    // 200자 제한 확인 및 처리
    if (answer.length > 200) {
      answer = answer.substring(0, 197) + '...'
    }

    return NextResponse.json({ answer })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || '답변 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

