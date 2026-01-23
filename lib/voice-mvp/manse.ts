import {
  calculateManseRyeok,
  convertLunarToSolarAccurate,
  convertSolarToLunarAccurate,
  generateManseRyeokText,
  generateManseRyeokTable,
  getDayGanji,
  type ManseRyeokCaptionInfo,
} from '@/lib/manse-ryeok'

export type CalendarType = 'solar' | 'lunar' | 'lunar-leap'

export interface BirthInput {
  name: string
  gender: 'male' | 'female'
  year: number
  month: number
  day: number
  calendarType: CalendarType
  birthHour?: string | null // 지지 또는 숫자 or empty
}

const OHENG_MAP: { [key: string]: string } = {
  갑: '목',
  을: '목',
  병: '화',
  정: '화',
  무: '토',
  기: '토',
  경: '금',
  신: '금',
  임: '수',
  계: '수',
}

const SIBGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const SIBGAN_HANGUL = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']

function parseBirthHourToHourNum(birthHour?: string | null): number {
  // default 10:00 like existing form fallback
  let birthHourNum = 10
  const raw = String(birthHour || '').trim()
  if (!raw) return birthHourNum

  // 지지 문자인 경우 시간 매핑
  const hourMap: { [key: string]: number } = {
    子: 0,
    丑: 2,
    寅: 4,
    卯: 6,
    辰: 8,
    巳: 10,
    午: 12,
    未: 14,
    申: 16,
    酉: 18,
    戌: 20,
    亥: 22,
  }
  if (hourMap[raw] !== undefined) return hourMap[raw]

  const m = raw.match(/(\d+)/)
  if (m) {
    const n = parseInt(m[1], 10)
    if (!Number.isNaN(n)) return n
  }
  return birthHourNum
}

export function normalizeToSolar(b: BirthInput): {
  solarYear: number
  solarMonth: number
  solarDay: number
  convertedDate: { year: number; month: number; day: number } | null
} {
  if (b.calendarType === 'solar') {
    return {
      solarYear: b.year,
      solarMonth: b.month,
      solarDay: b.day,
      convertedDate: convertSolarToLunarAccurate(b.year, b.month, b.day),
    }
  }
  const isLeap = b.calendarType === 'lunar-leap'
  const solar = convertLunarToSolarAccurate(b.year, b.month, b.day, isLeap)
  return {
    solarYear: solar?.year ?? b.year,
    solarMonth: solar?.month ?? b.month,
    solarDay: solar?.day ?? b.day,
    convertedDate: solar, // for caption: show the solar when input is lunar
  }
}

export function buildManseBundle(b: BirthInput) {
  const { solarYear, solarMonth, solarDay, convertedDate } = normalizeToSolar(b)
  const hourNum = parseBirthHourToHourNum(b.birthHour)

  const dayGanji = getDayGanji(solarYear, solarMonth, solarDay)
  const dayGan = dayGanji.gan
  const dayGanOhang = OHENG_MAP[dayGan] || ''
  const ganIndex = SIBGAN_HANGUL.indexOf(dayGan)
  const dayGanHanja = ganIndex >= 0 ? SIBGAN[ganIndex] : ''

  const dayGanInfo = {
    gan: dayGan,
    hanja: dayGanHanja,
    ohang: dayGanOhang,
    fullName: `${dayGan}${dayGanOhang}(${dayGanHanja}${dayGanOhang})`,
  }

  const manse = calculateManseRyeok(solarYear, solarMonth, solarDay, hourNum, dayGan)

  const captionInfo: ManseRyeokCaptionInfo = {
    name: b.name || '',
    year: b.year,
    month: b.month,
    day: b.day,
    hour: b.birthHour || null,
    calendarType: b.calendarType,
    convertedDate,
  }

  const table = generateManseRyeokTable(manse, b.name, captionInfo)
  const text = generateManseRyeokText(manse)

  return {
    manse_json: manse,
    manse_text: text,
    manse_table: table,
    day_gan_info: dayGanInfo,
    computed_solar: { year: solarYear, month: solarMonth, day: solarDay },
  }
}

