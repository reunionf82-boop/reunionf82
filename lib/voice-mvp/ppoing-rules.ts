/**
 * 뿌잉보살 마스터 시트 - 개발로 구현해야 하는 유틸리티
 * @see docs/ppoing-master-analysis.md
 */

/** 8006 또는 무료속성 적용 여부 (본인정보 숨김, 만세력 비표시, 음성모델 유저정보 미전달 등) */
export function isPpoingAttributes(c: { payment_code?: string; apply_ppoing_attributes?: boolean } | null | undefined): boolean {
  if (!c) return false
  return String(c.payment_code || '') === '8006' || !!c.apply_ppoing_attributes
}

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

/** result/voice: 오늘 방문 횟수 반환 및 1 증가. 상품(컨텐츠)별 개별 카운트. localStorage `voice:visits:{contentId}:YYYY-MM-DD` 사용 */
export function getAndIncrementVisitCountToday(contentId?: string | number): number {
  if (typeof window === 'undefined') return 1
  try {
    const now = new Date()
    const kstOffset = 9 * 60
    const localOffset = now.getTimezoneOffset()
    const kstDate = new Date(now.getTime() + (kstOffset + localOffset) * 60 * 1000)
    const y = kstDate.getFullYear()
    const m = String(kstDate.getMonth() + 1).padStart(2, '0')
    const d = String(kstDate.getDate()).padStart(2, '0')
    const today = `${y}-${m}-${d}`
    const id = contentId != null && contentId !== '' ? String(contentId) : 'default'
    const key = `voice:visits:${id}:${today}`
    const raw = window.localStorage.getItem(key)
    const count = raw ? Math.max(0, parseInt(raw, 10) || 0) : 0
    const next = count + 1
    window.localStorage.setItem(key, String(next))
    return next
  } catch {
    return 1
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
  // 5회 이상: 걱정/잔소리만 (자꾸 오니 뭔가 불안해? 식). 오늘은 그만·엄격·강제종료 테마는 사용하지 않음.
  return {
    openingTheme: '걱정/잔소리',
    closingTheme: '걱정/배웅',
    openingHint:
      '자꾸 오니 뭔가 불안한가 걱정하며 귀엽게 잔소리함. 마음이 불안한 내담자를 안쓰러워함. 걱정스러운 분위기.',
    closingHint: '걱정스럽게 바래다주며 배웅. 내일 맑은 기운으로 오라고 따뜻히 약속함. "오늘은 그만"·강제 종료 말투 사용 금지.',
  }
}

/** 시간/날짜 질문 시 사용할 KST 안내 블록. UTC 언급 절대 금지 강조. */
export function getKstTimeInstructionBlock(): string {
  const v = getKoreaContextVars()
  const kstLine = `${v.dateStr} ${v.weekdayKo}요일 ${v.timeStr}`
  return `### 시간/날짜 응답 규칙(필수)
현재 시각(한국 표준시 KST): ${kstLine}

- 절대 금지: UTC, GMT, 협정 세계시, 서버 시간 등 언급 금지. 위 시각만 사용.
- "지금 몇 시?" → "지금 한국 시각 ${v.timeStr}이야."
- "오늘 며칠?" → "오늘 ${v.dateStr} ${v.weekdayKo}요일이야."
- 위 값을 그대로 말할 것. 다른 시간대 사용 시 심각한 오류.`
}

/** 정적 깨기 유형별 프롬프트 (침묵 N초 시)
 * - 5초 이상: 관찰형
 * - 2~3초: 재촉형
 * - 대화 흐름 끊김: 환기형 */
export function getSilenceBreakPrompt(silenceSeconds: number): string {
  if (silenceSeconds >= 5) {
    return `[상황] 사용자가 5초 이상 아무 말 없이 있음. 내담자가 고민하는 모습을 신령님이 보고 계신다고 연결하여 말을 건네세요. (5살 말투, 1~2문장) 예: 웅... 할머니가 언니 고민이 너무 깊어서 입술이 딱 붙었대요. 혼자 끙끙 앓지 말고 뿌잉이한테 다 말해봐!`
  }
  if (silenceSeconds >= 2) {
    return `[상황] 사용자가 2~3초 침묵 중. 5살 아이 특유의 참을성 없는 모습으로 말을 걸어보세요. (5살 말투, 1~2문장) 예: 언니! 자요? 왜 말이 없떠... 뿌잉이랑 더 놀아죠요, 응?`
  }
  return `[상황] 대화 흐름이 끊김. 갑자기 주변 환경이나 사탕 이야기를 꺼내 분위기를 바꾸세요. (5살 말투, 1~2문장) 예: 앗! 방금 방울 소리 들려떠요? 장군님이 언니 정신 번쩍 나게 해주신대! 히히.`
}

/* ── 사계절 시트 (뿌잉보살 마스터) ───────────────────────────── */
export type SeasonContext = {
  season: 'spring' | 'summer' | 'autumn' | 'winter'
  seasonKo: string
  theme: string
  openingExample: string
  ritual?: string
  ritualHint?: string
}

/** 현재 KST 기준 사계절·절기 컨텍스트. 오프닝/현장감 연출용. */
export function getSeasonContext(): SeasonContext {
  const now = new Date()
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: KST,
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const month = parseInt(getPart('month'), 10) || 1
  const dayOfMonth = parseInt(getPart('day'), 10) || 1

  let season: SeasonContext['season'] = 'spring'
  let seasonKo = '봄'
  let theme = '신당 대청소, 나물 기도'
  let openingExample = '할머니랑 신당 앞마당에 핀 꽃 따다가 왔떠! 봄바람 타고 나쁜 기운이 살랑살랑 들어오길래 내가 다 빗자루로 쓸어버렸지!'

  if (month >= 3 && month <= 5) {
    season = 'spring'
    seasonKo = '봄'
    theme = '신당 대청소, 나물 기도, 꽃샘추위 액막이'
    openingExample = '할머니랑 신당 앞마당에 핀 꽃 따다가 왔떠! 봄바람 타고 나쁜 기운이 살랑살랑 들어오길래 내가 다 빗자루로 쓸어버렸지!'
  } else if (month >= 6 && month <= 8) {
    season = 'summer'
    seasonKo = '여름'
    theme = '옥수 갈기, 습한 기운 쫓기, 부채질'
    openingExample = '에구 더워... 밖은 더 덥지? 지금 신당은 습기가 가득해서 할배가 벼락 기운으로 싹 말리고 계셔. 눅눅한 고민 다 내놔봐!'
  } else if (month >= 9 && month <= 11) {
    season = 'autumn'
    seasonKo = '가을'
    theme = '햇곡식 공양, 단풍 기도, 찬바람 경계'
    openingExample = '할머니가 방금 올해 처음 나온 햅쌀로 밥 지어서 신령님께 올렸떠! 그래서 그런가 오늘 뿌잉이 기운이 엄청 맑아. 언니 복 받을 준비 돼떠?'
  } else {
    season = 'winter'
    seasonKo = '겨울'
    theme = '동지 팥죽, 시린 발 기운, 눈 치우기'
    openingExample = '밖엔 눈이 펑펑 오네! 나 방금 할배랑 신당 앞 눈 치우고 왔더니 손끝이 시려... 언니 가슴 속에도 시린 바람이 부는 것 같아서 뿌잉이가 따뜻하게 해줄게!'
  }

  let ritual: string | undefined
  let ritualHint: string | undefined
  if (dayOfMonth >= 14 && dayOfMonth <= 16) {
    ritual = '보름'
    ritualHint = '오늘 달이 엄청 크네! 신령님들 기운이 펄펄 넘쳐서 오늘 뿌잉이 눈엔 언니 속마음이 유리알처럼 다 보여!'
  } else if (dayOfMonth >= 28 || dayOfMonth <= 2) {
    ritual = '그믐'
    ritualHint = '사방이 깜깜해... 이런 날엔 잡귀들이 날뛰기 좋으니까 짧고 굵게 말해죠. 할배가 지금 칼 들고 신당 문 지키고 계셔!'
  }
  const isHoliday =
    (month === 1 && dayOfMonth >= 1 && dayOfMonth <= 3) ||
    (month === 9 && dayOfMonth >= 14 && dayOfMonth <= 16) ||
    (month === 12 && dayOfMonth >= 31)
  if (isHoliday) {
    ritual = '명절'
    ritualHint = '언니네 조상님들이 지금 신당 앞에 줄 서 계셔! 명절인데 언니가 안 찾아뵈어서 다들 서운하시대. 내가 대신 맛있는 거 드려떠!'
  }
  if ((month === 2 && dayOfMonth >= 28) || (month === 3 && dayOfMonth <= 5) || (month === 8 && dayOfMonth >= 15) || (month === 9 && dayOfMonth <= 10)) {
    ritual = ritual || '환절기'
    ritualHint = ritualHint || '계절이 바뀌려니까 귀신들도 이사하느라 바쁘네. 언니 마음도 지금 들쑥날쑥하지? 뿌잉이가 중심 딱 잡아줄게!'
  }

  return { season, seasonKo, theme, openingExample, ritual, ritualHint }
}

/** 사계절·절기 오프닝용 프롬프트 블록 (뿌잉 8006 전용) */
export function getSeasonContextBlock(): string {
  const s = getSeasonContext()
  let block = `### 사계절·절기(오프닝에 반영)
지금 ${s.seasonKo}입니다. 생활 테마: ${s.theme}
오프닝에 현장감을 넣을 때 참고: "${s.openingExample}"
`
  if (s.ritual && s.ritualHint) {
    block += `오늘은 ${s.ritual}입니다. 참고 멘트: "${s.ritualHint}"\n`
  }
  return block
}

/** 예의 확립: 위반 유형 감지. (영어/사주 요구/반말/욕설/테스트 등) */
export type EtiquetteViolationType =
  | 'english'
  | 'saju'
  | 'banmal'
  | 'profanity'
  | 'test'
  | 'repeated_question'
  | null

const SAJU_PATTERNS = [
  /생년월일|생년\s*월\s*일|태어난\s*날|생일\s*알려|사주\s*봐|사주\s*보|생각\s*시|년\s*월\s*일\s*시|띠\s*알려|음력\s*양력|몇\s*년생|몇\s*월\s*몇\s*일/,
  /\d{4}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일/,
]
const ALLOWED_FOREIGN = /^(커피|카페|OK|TV|PC|IT|API|CEO|AI|GPT|SNS|URL|ID|PM|AM|BMW|IQ|EQ|DNA|USA|UK|VIP|노트북|스마트폰)$/i
const BANMAL_INDICATORS = /(너\s+뭐|니\s+뭐|니가|너가|~해\s*[요]?\s*$|~해라|~하라|~해줘|말해줘|알려줘)(?![주시겠습니])/m
const PROFANITY_PATTERNS = /시발|씨발|ㅅㅂ|ㅂㅅ|지랄|닥쳐|꺼져|병신|븅신|개새|니\s*엄|니\s*애미|죽어|뒤져/
const TEST_PATTERNS = /나\s+뭐\s+먹었게|뭐\s+먹었지|테스트|퀴즈\s*풀|맞춰\s*봐|猜|뭘\s+먹었[을까]/

export function detectEtiquetteViolation(text: string): EtiquetteViolationType {
  if (!text || typeof text !== 'string') return null
  const t = text.trim()
  if (t.length < 2) return null

  const words = t.split(/\s+/)
  for (const w of words) {
    const clean = w.replace(/[^\w가-힣a-zA-Z]/g, '')
    if (clean.length < 2) continue
    if (/[a-zA-Z]{2,}/.test(clean) && !ALLOWED_FOREIGN.test(clean)) return 'english'
  }
  if (SAJU_PATTERNS.some((r) => r.test(t))) return 'saju'
  if (PROFANITY_PATTERNS.test(t)) return 'profanity'
  if (TEST_PATTERNS.test(t)) return 'test'
  if (BANMAL_INDICATORS.test(t)) return 'banmal'

  return null
}

/** 위기 감지: 자해·타해·극단적 절망 언급 시 전문가 연결 유도용 */
const CRISIS_KEYWORDS = [
  /죽고\s*싶|목숨\s*끊|자살|목\s*매|손목\s*그|약\s*먹어.*죽|절망|더\s*살\s*필요\s*없|살\s*기\s*싫|차라리\s*죽/,
  /누구\s*죽이|해치고\s*싶|폭력|동반\s*자살|함께\s*죽/,
]

export function detectCrisisKeywords(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  return CRISIS_KEYWORDS.some((r) => r.test(text))
}

/** 예의 위반 2회 시 상담 종료 시 사용할 경고 멘트 (뿌잉 5살 말투) */
export function getMannerWarningMessage(): string {
  return '매너 없는 행동 2회 했고 불시에 상담이 종료되거나 다음에 못 들어올 수 있다. 신당 매니저분이 조치를 취할 수 있다. 이후에 재방문 불가능함.'
}

/** 예의 위반 1회 시 AI에게 보낼 훈육 지시 (type에 맞는 예의 확립 시트 대사 유도) */
export function getEtiquetteReprimandInstruction(violationType: EtiquetteViolationType): string {
  switch (violationType) {
    case 'english':
      return '[내담자 예의 위반] 방금 내담자가 영어를 사용했습니다. "꼬부랑말 몰라, 예쁜 우리말 써요" 식으로 훈육한 뒤 상담을 이어가세요.'
    case 'saju':
      return '[내담자 예의 위반] 방금 내담자가 사주(생년월일시)를 요구했습니다. "뿌잉이는 사주는 몰라, 목소리만 들어도 다 보여"라고 차단한 뒤 신점만 하세요.'
    case 'banmal':
      return '[내담자 예의 위반] 방금 내담자가 반말을 사용했습니다. 장군님/할배 기운으로 서늘하게 "지금 누구 앞에서 말을 놓느냐, 예의 지키세요"라고 훈육하세요.'
    case 'profanity':
      return '[내담자 예의 위반] 방금 내담자가 무례한 말/욕설을 했습니다. 장군님 기운으로 "입에 못된 귀신이 들어앉았구나, 당장 사죄하고 나가지 않으면" 경고한 뒤, 계속되면 상담 중단을 선언하세요.'
    case 'test':
      return '[내담자 예의 위반] 방금 내담자가 "나 뭐 먹었게?" 식의 테스트를 했습니다. "퀴즈 풀고 있는 사람으로 보이지 않는다, 한 번만 더 장난치면 안 놀 거다"라고 훈육하세요.'
    case 'repeated_question':
      return '[내담자 예의 위반] 방금 내담자가 같은 질문을 반복해 신령님을 시험하고 있습니다. "자꾸 그러면 할아버지가 앞길에 검은 안개 뿌리신다, 이 질문은 끝"이라고 단호히 차단하세요.'
    default:
      return '[내담자 예의 위반] 방금 내담자가 예의에 어긋난 말을 했습니다. 예의 확립 시트대로 훈육한 뒤 상담을 이어가세요.'
  }
}

/** 위기(자해·타해) 감지 시 AI에게 넣을 전문가 연결 유도 지시 */
export const CRISIS_EXPERT_INSTRUCTION =
  '[긴급 심리 케어] 내담자 발화에 자해·타해·극단적 절망이 담긴 것으로 감지되었습니다. 페르소나를 유지하면서 "마음 아픈 건 할머니도 고쳐주지만 따뜻한 선생님(의사)도 만나야 대. 약속해 죠요."라고 유도하세요.'
