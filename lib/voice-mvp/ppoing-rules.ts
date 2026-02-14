/**
 * 뿌잉보살 마스터 시트 - 개발로 구현해야 하는 유틸리티
 * @see docs/ppoing-master-analysis.md
 */

/** TTS 출력 전 괄호/대괄호 제거. 괄호 안 지문은 읽지 않음. */
export function sanitizeForTts(text: string): string {
  if (!text || typeof text !== 'string') return ''
  let out = text
  // ( ) 괄호와 내용 제거
  out = out.replace(/\([^)]*\)/g, '')
  // [[ ]] 대괄호와 내용 제거
  out = out.replace(/\[\[[^\]]*\]\]/g, '')
  // 남은 괄호/대괄호 조각 제거
  out = out.replace(/[\[\]()]/g, '')
  // 연속 공백 정리
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out
}

export type KoreaContextVars = {
  dateStr: string
  timeStr: string
  weekday: number // 0=일, 1=월, ...
  weekdayKo: string
  hour: number // 0-23
  timeSlot: 'dawn' | 'morning' | 'afternoon' | 'evening' | 'night'
  timeSlotHint: string
  isMonday: boolean
  isFriday: boolean
  isFullMoon: boolean
  isHoliday: boolean
}

const KST = 'Asia/Seoul'

/** 한국 표준시(KST) 기준 요일/시간대/특수일 변수 반환. 서버가 UTC여도 정확히 KST로 계산. */
export function getKoreaContextVars(): KoreaContextVars {
  const now = new Date()
  const dateStr = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(now)
  const timeStr = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(now)
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    hour: 'numeric',
    hour12: false,
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
  }).formatToParts(now)
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const hour = parseInt(getPart('hour'), 10) || 0
  const dayOfMonth = parseInt(getPart('day'), 10) || 1
  const month = parseInt(getPart('month'), 10) || 1
  const weekdayShort = getPart('weekday')
  const WEEKDAY_MAP: Record<string, number> = {
    일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  }
  const dayOfWeek = WEEKDAY_MAP[weekdayShort] ?? new Date(now.getTime() + 9 * 60 * 60 * 1000).getUTCDay()

  let timeSlot: KoreaContextVars['timeSlot'] = 'afternoon'
  let timeSlotHint = '해가 높으니 양기가 짙어요.'
  if (hour >= 0 && hour < 5) {
    timeSlot = 'dawn'
    timeSlotHint = '지금 귀문이 열려서 조용히 해야 대!'
  } else if (hour >= 5 && hour < 12) {
    timeSlot = 'morning'
    timeSlotHint = '해가 막 떠서 기운이 맑아요.'
  } else if (hour >= 12 && hour < 17) {
    timeSlot = 'afternoon'
    timeSlotHint = '해가 높으니 장군님 기세가 짱이야!'
  } else if (hour >= 17 && hour < 21) {
    timeSlot = 'evening'
    timeSlotHint = '해가 지는 시간이라 조상님 발걸음이 느려요.'
  } else {
    timeSlot = 'night'
    timeSlotHint = '밖이 어두워져서 귀신들이 놀러 나오기 좋은 시간이에요.'
  }

  const isMonday = dayOfWeek === 1
  const isFriday = dayOfWeek === 5
  const weekdayKo = ['일', '월', '화', '수', '목', '금', '토'][dayOfWeek] ?? ''

  const isFullMoon = dayOfMonth >= 14 && dayOfMonth <= 16
  const isHoliday =
    (month === 1 && dayOfMonth >= 1 && dayOfMonth <= 3) ||
    (month === 9 && dayOfMonth >= 14 && dayOfMonth <= 16) ||
    (month === 12 && dayOfMonth >= 31)

  return {
    dateStr,
    timeStr,
    weekday: dayOfWeek,
    weekdayKo,
    hour,
    timeSlot,
    timeSlotHint,
    isMonday,
    isFriday,
    isFullMoon,
    isHoliday,
  }
}

/** 방문 횟수에 따른 입구/출구 가이드 텍스트 (AI 프롬프트용) */
export function getVisitGuidanceText(visitCountToday: number): {
  openingTheme: string
  closingTheme: string
  openingHint: string
  closingHint: string
} {
  if (visitCountToday <= 1) {
    return {
      openingTheme: '신비/초대',
      closingTheme: '첫 인연 축복',
      openingHint:
        '처음 보는 기운에 호기심을 보임. 사주 없이 신점으로만 본다는 점을 강조. 신비롭고 초대하는 분위기.',
      closingHint: '첫 인연에 대한 축복. 할머니가 대문 앞까지 바래다주시는 상황 연출.',
    }
  }
  if (visitCountToday <= 4) {
    return {
      openingTheme: '친근/확인',
      closingTheme: '다시 만날 기약',
      openingHint:
        '아는 체를 하며 반가워함. 아까 준 공수를 잊었는지 장난스럽게 물음. 친근한 분위기.',
      closingHint: '장군님(할아버지, 할머니)이 가는 길을 지켜주시는 묘사. 조만간 다시 웃으며 만날 것을 기약.',
    }
  }
  if (visitCountToday <= 9) {
    return {
      openingTheme: '걱정/잔소리',
      closingTheme: '오늘은 그만',
      openingHint:
        '왜 자꾸 오냐며 귀엽게 잔소리함. 마음이 불안한 내담자를 안쓰러워함. 걱정스러운 분위기.',
      closingHint: '"오늘은 이제 그만!"이라며 단호히 배웅. 내일 맑은 기운으로 오라고 약속함.',
    }
  }
  return {
    openingTheme: '엄격/훈육',
    closingTheme: '강제 종료',
    openingHint:
      '할배(장군님)가 노하셨음을 알림. 똑같은 질문은 신령님을 시험하는 것이라 꾸짖음. 엄격한 분위기.',
    closingHint: '"흥! 할배가 문 닫으래!"라며 강제 종료. 예의를 갖추지 않으면 복이 달아난다고 경고.',
  }
}

/** 정적 깨기 유형별 프롬프트 (침묵 N초 시) */
export function getSilenceBreakPrompt(silenceSeconds: number): string {
  if (silenceSeconds >= 5) {
    return `[상황] 사용자가 5초 이상 아무 말 없이 있음. 고민하는 모습을 신령님이 보고 계신다고 연결하여 말을 건네세요. 예: "웅... 할머니가 언니 고민이 너무 깊어서 입술이 딱 붙었대요. 혼자 끙끙 앓지 말고 뿌잉이한테 다 말해봐!" (5살 말투 유지, 1~2문장)`
  }
  if (silenceSeconds >= 2) {
    return `[상황] 사용자가 2~3초 침묵 중. 5살 아이 특유의 참을성 없는 모습으로 말을 걸어보세요. 예: "언니! 자요? 왜 말이 없떠... 뿌잉이랑 더 놀아죠요, 응?" (5살 말투 유지, 1~2문장)`
  }
  return `[상황] 대화 흐름이 끊김. 주변 환경이나 사탕 이야기를 꺼내 분위기를 바꾸세요. (5살 말투 유지, 1~2문장)`
}
