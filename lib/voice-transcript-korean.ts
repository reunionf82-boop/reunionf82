import { GoogleGenerativeAI } from '@google/generative-ai'

export type VoiceMessage = { role: string; text: string }

const SUMMARY_MODEL = 'gemini-2.0-flash'

/** 일본어(히라가나·가타카나·한자) 등 한글이 아닌 문자가 포함돼 있으면 true */
export function hasNonKoreanScript(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)
}

/**
 * 보이스 대화 문장들을 한국어만 사용하도록 정규화.
 * 외래어·외국어는 한글 발음대로 기록 (내담자 한국어 중심).
 * 실패 시 원본 배열 반환.
 */
export async function normalizeVoiceMessagesToKorean(
  messages: VoiceMessage[]
): Promise<VoiceMessage[]> {
  if (!Array.isArray(messages) || messages.length === 0) return messages

  const apiKey = process.env.NEXT_PUBLIC_JEMINAI_API_URL
  if (!apiKey) return messages

  const texts = messages.map((m) => String(m.text ?? '').trim())
  const allEmpty = texts.every((t) => !t)
  if (allEmpty) return messages

  try {
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: SUMMARY_MODEL })

    const prompt = `다음은 음성 상담 전사 문장들입니다. 각 문장을 한국어만 사용하도록 바꿔주세요.
규칙:
1. 외래어와 외국어(영어, 일본어, 아랍어 등)는 한글 발음 나는 대로 기록할 것.
2. 숫자와 문장부호(.,!? 등)는 유지할 것.
3. 출력은 문장만 순서대로 한 줄에 하나씩 출력할 것. 번호나 역할 없이.
4. 입력 문장 수와 출력 문장 수가 같아야 함.

문장들:
${texts.join('\n')}`

    const result = await model.generateContent(prompt)
    const response = result.response
    const candidate = response.candidates?.[0]
    const output = candidate?.content?.parts?.[0]?.text
    if (!output || typeof output !== 'string') return messages

    const lines = output
      .split(/\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)

    if (lines.length !== messages.length) return messages

    return messages.map((m, i) => ({ role: m.role, text: lines[i] ?? m.text }))
  } catch {
    return messages
  }
}
