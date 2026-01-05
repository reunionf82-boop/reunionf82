// 만세력(사주명식) 계산 유틸리티

// 십간 (天干)
const SIBGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const SIBGAN_HANGUL = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']

// 십이지 (地支)
const SIBIJI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const SIBIJI_HANGUL = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해']

// 지장간 (地支藏干)
const JIJANGGAN: { [key: string]: string[] } = {
  '자': ['계'],
  '축': ['기', '신', '계'], 
  '인': ['갑', '병', '무'], 
  '묘': ['을'],
  '진': ['을', '무', '계'], 
  '사': ['병', '무', '경'], 
  '오': ['정', '기'], 
  '미': ['정', '을', '기'], 
  '신': ['경', '임', '무'], 
  '유': ['신'],
  '술': ['신', '정', '무'], 
  '해': ['임', '갑'] 
}

// 십성 (十神)
const SIBSUNG: { [key: string]: string } = {
  // 갑(목)
  '갑갑': '비견', '갑을': '겁재', '갑병': '식신', '갑정': '상관', '갑무': '편재', '갑기': '정재', '갑경': '편관', '갑신': '정관', '갑임': '편인', '갑계': '정인',
  // 을(목)
  '을갑': '겁재', '을을': '비견', '을병': '상관', '을정': '식신', '을무': '정재', '을기': '편재', '을경': '정관', '을신': '편관', '을임': '정인', '을계': '편인',
  // 병(화)
  '병갑': '편인', '병을': '정인', '병병': '비견', '병정': '겁재', '병무': '식신', '병기': '상관', '병경': '편재', '병신': '정재', '병임': '편관', '병계': '정관',
  // 정(화)
  '정갑': '정인', '정을': '편인', '정병': '겁재', '정정': '비견', '정무': '상관', '정기': '식신', '정경': '정재', '정신': '편재', '정임': '정관', '정계': '편관',
  // 무(토) - 수정됨
  '무갑': '편관', '무을': '정관', '무병': '편인', '무정': '정인', '무무': '비견', '무기': '겁재', '무경': '식신', '무신': '상관', '무임': '편재', '무계': '정재',
  // 기(토) - 수정됨
  '기갑': '정관', '기을': '편관', '기병': '정인', '기정': '편인', '기무': '겁재', '기기': '비견', '기경': '상관', '기신': '식신', '기임': '정재', '기계': '편재',
  // 경(금)
  '경갑': '편재', '경을': '정재', '경병': '편관', '경정': '정관', '경무': '편인', '경기': '정인', '경경': '비견', '경신': '겁재', '경임': '식신', '경계': '상관',
  // 신(금)
  '신갑': '정재', '신을': '편재', '신병': '정관', '신정': '편관', '신무': '정인', '신기': '편인', '신경': '겁재', '신신': '비견', '신임': '상관', '신계': '식신',
  // 임(수) - 수정됨
  '임갑': '식신', '임을': '상관', '임병': '편재', '임정': '정재', '임무': '편관', '임기': '정관', '임경': '편인', '임신': '정인', '임임': '비견', '임계': '겁재',
  // 계(수) - 수정됨
  '계갑': '상관', '계을': '식신', '계병': '정재', '계정': '편재', '계무': '정관', '계기': '편관', '계경': '정인', '계신': '편인', '계임': '겁재', '계계': '비견'
}

// 한자 매핑
const SIBSUNG_HANJA: Record<string, string> = {
  '비견': '比肩', '겁재': '劫財', '식신': '食神', '상관': '傷官',
  '편재': '偏財', '정재': '正財', '편관': '偏官', '정관': '正官',
  '편인': '偏印', '정인': '正印'
}
const OHANG_HANJA: Record<string, string> = {
  '목': '木', '화': '火', '토': '土', '금': '金', '수': '水'
}
const SIBIUNSUNG_HANJA: Record<string, string> = {
  '장생': '長生', '목욕': '沐浴', '관대': '冠帶', '건록': '建祿',
  '제왕': '帝王', '쇠': '衰', '병': '病', '사': '死',
  '묘': '墓', '절': '絶', '태': '胎', '양': '養'
}
const SIBISINSAL_HANJA: Record<string, string> = {
  '지살': '地殺', '도화': '桃花', '월살': '月殺', '망신': '亡身',
  '장성': '將星', '반안': '攀鞍', '역마': '驛馬', '육해': '六害',
  '화개': '華蓋', '겁살': '劫殺', '재살': '災殺', '천살': '天殺'
}

const SIBIUNSUNG = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']
const SIBISINSAL = ['역마', '도화', '천을', '홍염', '백호', '천덕', '월덕', '천덕합', '월덕합', '공망', '화개', '지살']

// 오행 (五行)
const OHENG: { [key: string]: string } = {
  '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토', '기': '토', '경': '금', '신': '금', '임': '수', '계': '수',
  '자': '수', '축': '토', '인': '목', '묘': '목', '진': '토', '사': '화', '오': '화', '미': '토', '유': '금', '술': '토', '해': '수'
}

// 음양 (陰陽)
const EUMYANG_GAN: { [key: string]: string } = {
  '갑': '양', '을': '음', '병': '양', '정': '음', '무': '양', '기': '음', '경': '양', '신': '음', '임': '양', '계': '음'
}

const EUMYANG_JI: { [key: string]: string } = {
  '자': '양', '축': '음', '인': '양', '묘': '음', '진': '양', '사': '음', '오': '양', '미': '음', '신': '양', '유': '음', '술': '양', '해': '음'
}

function getEumyang(value: string, isGan: boolean): string {
  if (isGan) return EUMYANG_GAN[value] || '양'
  return EUMYANG_JI[value] || '양'
}

// 24절기 (일자 기준) - 대략적인 양력 일자
// 입춘(2/4), 경칩(3/6), 청명(4/5), 입하(5/6), 망종(6/6), 소서(7/7)
// 입추(8/8), 백로(9/8), 한로(10/8), 입동(11/7), 대설(12/7), 소한(1/6)
const SOLAR_TERMS_DATE = {
  1: 6,  // 소한
  2: 4,  // 입춘
  3: 6,  // 경칩
  4: 5,  // 청명
  5: 6,  // 입하
  6: 6,  // 망종
  7: 7,  // 소서
  8: 8,  // 입추
  9: 8,  // 백로
  10: 8, // 한로
  11: 7, // 입동
  12: 7  // 대설
}

// 절기 기준 월령 계산 (정확한 일자 비교)
function getMonthIndex(month: number, day: number): number {
  // 기본 월령: 양력 월 - 2 (예: 2월 -> 0 인월, 3월 -> 1 묘월 ...)
  // 입춘(2월 4일) 이전이면 전년도 축월(11)
  
  const termDay = SOLAR_TERMS_DATE[month as keyof typeof SOLAR_TERMS_DATE] || 5
  
  // 해당 월의 절기일 이전이면 이전 달로 간주
  if (day < termDay) {
    // 2월 3일 -> 1월 취급 -> (1 - 2) = -1 -> 11 (축월)
    // 1월 5일 -> 12월 취급 -> (12 - 2) = 10 (자월)
    // 하지만 1월은 13월로 계산해서 -2 하면 11이 되어야 하는데...
    // 1월 5일 (소한 전) -> 12월(자월)이 맞음. 
    // 1월 6일 (소한 후) -> 1월(축월). 
    
    // 계산 편의를 위해:
    // 1월 -> 13, 2월 -> 14로 보지 말고 그냥 인덱스 계산
    
    if (month === 1) return 10 // 자월 (11번째)
    if (month === 2) return 11 // 축월 (12번째)
    return month - 3 // 3월(경칩 전) -> 0 인월이 아니라 11 축월? 아니지. 3월 5일 -> 2월(묘월) 아님. 인월(0).
    // 3월 5일 (경칩 전) -> 2월 입춘 후이므로 인월(0).
    // 3월 6일 (경칩 후) -> 묘월(1).
  }
  
  // 절기일 이후 (해당 월의 절기 시작)
  // 1월 6일(소한) ~ 2월 3일 -> 축월(11)
  // 2월 4일(입춘) ~ 3월 5일 -> 인월(0)
  // 3월 6일(경칩) ~ 4월 4일 -> 묘월(1)
  
  if (month === 1) return 11 // 축월
  if (month === 2) return 0  // 인월
  return month - 2
}

// 십이운성 계산
function getSibiunsung(gan: string, ji: string): string {
  const jiIndex = SIBIJI_HANGUL.indexOf(ji)
  const ohang = OHENG[gan]
  
  // 십이운성 로직 보정 (포스텔러 기준 참고)
  // 양간: 순행, 음간: 역행
  // 장생 위치:
  // 갑(해), 병/무(인), 경(사), 임(신)
  // 을(오), 정/기(유), 신(자), 계(묘)
  
  let startJiIndex = 0
  const isYang = getEumyang(gan, true) === '양'
  
  if (gan === '갑') startJiIndex = 11 // 해
  else if (gan === '을') startJiIndex = 6 // 오
  else if (gan === '병' || gan === '무') startJiIndex = 2 // 인
  else if (gan === '정' || gan === '기') startJiIndex = 9 // 유
  else if (gan === '경') startJiIndex = 5 // 사
  else if (gan === '신') startJiIndex = 0 // 자
  else if (gan === '임') startJiIndex = 8 // 신
  else if (gan === '계') startJiIndex = 3 // 묘
  
  let offset = 0
  if (isYang) {
    // 순행: (지지 - 장생)
    offset = (jiIndex - startJiIndex + 12) % 12
  } else {
    // 역행: (장생 - 지지)
    offset = (startJiIndex - jiIndex + 12) % 12
  }
  
  return SIBIUNSUNG[offset]
}

// 십이신살 계산
function getSibisinsal(targetJi: string, standardJi: string): string {
  const SIBINSAL_ORDER = ['지살', '도화', '월살', '망신', '장성', '반안', '역마', '육해', '화개', '겁살', '재살', '천살']
  
  // 삼합 기준표 (첫 글자가 지살의 시작점)
  // 신자진 -> 신(8)
  // 인오술 -> 인(2)
  // 사유축 -> 사(5)
  // 해묘미 -> 해(11)
  
  const standardIndex = SIBIJI_HANGUL.indexOf(standardJi)
  let startIndex = 0
  
  // 삼합 그룹 찾기
  if ([8, 0, 4].includes(standardIndex)) startIndex = 8 // 신자진 (수)
  else if ([2, 6, 10].includes(standardIndex)) startIndex = 2 // 인오술 (화)
  else if ([5, 9, 1].includes(standardIndex)) startIndex = 5 // 사유축 (금)
  else if ([11, 3, 7].includes(standardIndex)) startIndex = 11 // 해묘미 (목)
  
  const targetIndex = SIBIJI_HANGUL.indexOf(targetJi)
  const diff = (targetIndex - startIndex + 12) % 12
  
  return SIBINSAL_ORDER[diff]
}

// 서기 연도를 간지 연도로 변환
function getGanjiYear(year: number): { gan: string, ji: string } {
  // 1984년 갑자년
  const baseYear = 1984
  let offset = (year - baseYear) % 60
  if (offset < 0) offset += 60
  
  const ganIndex = offset % 10
  const jiIndex = offset % 12
  
  return {
    gan: SIBGAN_HANGUL[ganIndex],
    ji: SIBIJI_HANGUL[jiIndex]
  }
}

// 월주 계산
function getMonthGanji(year: number, month: number, day: number): { gan: string, ji: string } {
  const monthIndex = getMonthIndex(month, day) // 0(인월) ~ 11(축월)
  
  // 입춘(2월 4일경) 이전이면 전년도
  let actualYear = year
  // 1월은 무조건 전년도 취급 (소한~대한은 전년도 축월, 입춘 전까지)
  // 2월 4일 이전도 전년도
  if (month === 1 || (month === 2 && day < 4)) {
    actualYear = year - 1
  }
  
  const yearGanji = getGanjiYear(actualYear)
  const yearGanIndex = SIBGAN_HANGUL.indexOf(yearGanji.gan)
  
  // 월두법: 연간에 따라 월간 결정
  // 갑기년 -> 병인두 (병=2)
  // 을경년 -> 무인두 (무=4)
  // 병신년 -> 경인두 (경=6)
  // 정임년 -> 임인두 (임=8)
  // 무계년 -> 갑인두 (갑=0)
  // 공식: (연간%5 * 2 + 2) % 10 -> 인월의 천간 인덱스
  
  const startGanIndex = ((yearGanIndex % 5) * 2 + 2) % 10
  const monthGanIndex = (startGanIndex + monthIndex) % 10
  
  // 월지: 인월(0)은 인(2)
  const monthJiIndex = (monthIndex + 2) % 12
  
  return {
    gan: SIBGAN_HANGUL[monthGanIndex],
    ji: SIBIJI_HANGUL[monthJiIndex]
  }
}

// 일주 계산
export function getDayGanji(year: number, month: number, day: number): { gan: string, ji: string } {
  // 1900년 1월 1일은 갑술일 (갑=0, 술=10)
  // 기준일 변경: 1900-01-01
  // UTC를 사용하여 타임존 변화로 인한 날짜 계산 오차 방지
  const baseDate = new Date(Date.UTC(1900, 0, 1))
  const targetDate = new Date(Date.UTC(year, month - 1, day))
  
  const diffTime = targetDate.getTime() - baseDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // 갑술(0, 10) 기준
  // 갑(0) + diff % 10
  // 술(10) + diff % 12
  
  let ganIndex = (0 + diffDays) % 10
  let jiIndex = (10 + diffDays) % 12
  
  if (ganIndex < 0) ganIndex += 10
  if (jiIndex < 0) jiIndex += 12
  
  return {
    gan: SIBGAN_HANGUL[ganIndex],
    ji: SIBIJI_HANGUL[jiIndex]
  }
}

// 시주 계산
function getHourGanji(dayGan: string, hour: number, minute: number = 0): { gan: string, ji: string } {
  const dayGanIndex = SIBGAN_HANGUL.indexOf(dayGan)
  
  // 서울 경도 보정 (-32분)은 하지 않음 (사용자 혼란 방지 및 통상적 만세력 기준)
  // 보통 3시는 축시/인시 경계이나 여기서는 단순화하여 01:30~03:29 축시, 03:30~05:29 인시 적용
  // 또는 더 단순하게 2시간 간격
  
  // 자: 23~1, 축: 1~3, 인: 3~5 ...
  // 이렇게 하면 3시는 인시가 됨.
  // 하지만 사용자 피드백(이미지 2, 4)에서 3시는 '축시'로 나옴 (정축).
  // 즉 03:00은 축시로 판정 (01:30 ~ 03:30 기준인 듯)
  
  // 만세력 표준 시간 (동경 135도 기준)
  // 자: 23:30 ~ 01:29
  // 축: 01:30 ~ 03:29
  // 인: 03:30 ~ 05:29
  
  // 따라서 3시는 축시 (01:30 ~ 03:29)에 포함됨.
  
  let hourJiIndex = 0
  if (hour >= 23 || hour === 0) hourJiIndex = 0 // 자 (00시대는 자시)
  else if (hour >= 1 && hour < 3) hourJiIndex = 1 // 축 (01, 02) -> 3시는? 
  // 3시 정각은 03:00. 03:29까지 축시.
  // 간단 로직:
  // 23:30 ~ 01:29 자
  // 01:30 ~ 03:29 축
  // ...
  
  const timeVal = hour * 60 + minute
  // 자시 시작 23:30 (1410분) -> 0으로 처리하기 위해 오프셋
  // (time + 30) / 120
  
  // 03:00 (180분) + 30 = 210. 210 / 120 = 1.75 -> 1 (축)
  // 03:30 (210분) + 30 = 240. 240 / 120 = 2 (인)
  
  let adjustedIndex = Math.floor((timeVal + 30) / 120)
  hourJiIndex = adjustedIndex % 12
  
  // 시두법: 일간 기준
  // 갑기일 -> 갑자시 (갑=0)
  // 을경일 -> 병자시 (병=2)
  // 병신일 -> 무자시 (무=4)
  // 정임일 -> 경자시 (경=6)
  // 무계일 -> 임자시 (임=8)
  // 공식: (일간%5 * 2 + 시지) % 10
  
  const startGanIndex = (dayGanIndex % 5) * 2
  const hourGanIndex = (startGanIndex + hourJiIndex) % 10
  
  return {
    gan: SIBGAN_HANGUL[hourGanIndex],
    ji: SIBIJI_HANGUL[hourJiIndex]
  }
}

const formatWithHanja = (value: string, map: Record<string, string>) => {
  const trimmed = value?.trim()
  if (!trimmed) return ''
  const hanja = map[trimmed]
  return hanja ? `${trimmed}(${hanja})` : trimmed
}

const formatOhang = (value: string) => {
  return value
    .split('/')
    .map(v => {
      const t = v.trim()
      const hanja = OHANG_HANJA[t]
      return hanja ? `${t}(${hanja})` : t
    })
    .join('/')
}

const getGanHanja = (gan: string) => {
  const index = SIBGAN_HANGUL.indexOf(gan)
  return index >= 0 ? SIBGAN[index] : gan
}
const getJiHanja = (ji: string) => {
  const index = SIBIJI_HANGUL.indexOf(ji)
  return index >= 0 ? SIBIJI[index] : ji
}

export interface ManseRyeokData {
  year: { gan: string, ji: string, sibsung: string, jiSibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
  month: { gan: string, ji: string, sibsung: string, jiSibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
  day: { gan: string, ji: string, sibsung: string, jiSibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
  hour: { gan: string, ji: string, sibsung: string, jiSibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
}

export function calculateManseRyeok(
  year: number,
  month: number,
  day: number,
  hour: number,
  dayGan: string,
  minute: number = 0
): ManseRyeokData {
  // 연주
  let actualYear = year
  // 입춘(2/4) 기준 연도 변경
  if (month === 1 || (month === 2 && day < 4)) {
    actualYear = year - 1
  }
  const yearGanji = getGanjiYear(actualYear)
  
  // 월주
  const monthGanji = getMonthGanji(year, month, day)
  
  // 일주 (입력받은 dayGan 사용)
  const dayGanji = getDayGanji(year, month, day) // 검증용
  // 만약 dayGan과 계산된 dayGanji.gan이 다르면? -> 입력값 신뢰 (portal 등 외부 주입 가능성)
  // 여기서는 계산된 값 사용 (정확성 위해)
  
  // 시주
  const hourGanji = getHourGanji(dayGan, hour, minute)
  
  // 십이신살 계산을 위한 지지 데이터 미리 준비
  const yearJi = yearGanji.ji
  const dayJi = dayGanji.ji

  // 데이터 조립 (십성, 오행 등)
  // targetPillar: 'year' | 'month' | 'day' | 'hour'
  const getInfo = (targetGan: string, targetJi: string, targetPillar: string) => {
    // 십이신살 기준: 연주는 일지 기준, 나머지는 연지 기준
    const standardJi = targetPillar === 'year' ? dayJi : yearJi
    
    return {
      gan: targetGan,
      ji: targetJi,
      sibsung: SIBSUNG[`${dayGan}${targetGan}`] || '비견',
      jiSibsung: SIBSUNG[`${dayGan}${targetJi}`] || '비견', // 지지 십성은 지장간 본기 기준 등 복잡하나 여기선 약식 매핑 필요. 임시로 천간 매핑 사용 불가.
      // 지지 십성 정확한 계산 필요 (지장간 본기)
      // 자(계), 축(기), 인(갑)...
      ohang: `${OHENG[targetGan]}/${OHENG[targetJi]}`,
      eumyang: `${getEumyang(targetGan, true)}/${getEumyang(targetJi, false)}`,
      sibiunsung: getSibiunsung(dayGan, targetJi),
      sibisinsal: getSibisinsal(targetJi, standardJi)
    }
  }
  
  // 지지 십성 계산 보정
  const getJiSibsung = (ji: string) => {
     // 지장간 본기 매핑 (지지의 대표 오행이 아니라 지장간의 본기를 기준으로 십성을 정해야 함)
     // 자(계), 축(기), 인(갑), 묘(을), 진(무), 사(병)
     // 오(정), 미(기), 신(경), 유(신), 술(무), 해(임)
     
     const mainGanMap: Record<string, string> = {
       '자': '계', '축': '기', '인': '갑', '묘': '을', '진': '무', '사': '병',
       '오': '정', '미': '기', '신': '경', '유': '신', '술': '무', '해': '임'
     }
     const mainGan = mainGanMap[ji]
     return SIBSUNG[`${dayGan}${mainGan}`] || '비견'
  }
  
  // 시주 계산 로직 수정: 시주 지지의 십성이 잘못 계산되는 문제 해결 (1980-05-05 03:00 예시)
  // 일간: 무(戊)
  // 시주: 계축(癸丑)
  // 시지: 축(丑) -> 지장간 본기: 기(己)
  // 무(戊) + 기(己) = 겁재 (정답)
  // 현재 코드는 getJiSibsung을 호출하므로 로직상으로는 맞음.
  // 하지만 사용자 피드백에서는 "시주 십성만 다르다"고 함.
  // 1번 이미지(AI 생성): 시주 천간 십성이 정재, 지지 십성이 '겁재' (축토 지장간 기토와 무토 비견 관계? 아님. 무-기: 겁재 맞음)
  // 2번 이미지(정답): 시주 천간 십성이 정재, 지지 십성이 '겁재'
  // 잠깐, 사용자 이미지를 보면:
  // 1번(AI): 시주 천간(계) -> 정인(正印)??? -> 무계합화? 아님. 무토 일간에 계수는 정재임.
  // 1번 이미지 텍스트: "시주 천간: 정인(正印)" -> 이건 틀림. 무토에게 계수는 정재임.
  // 아하, 1번 이미지의 일간이 '무'가 아니라 다른걸로 잘못 인식되었나?
  // 1번 이미지 표: 일주 천간 '무(戊)', 시주 천간 '계(癸)'.
  // 십성 행을 보면 시주에 '정인'이라고 적혀있음.
  // 무토 일간에 계수는 '정재'가 맞음. (무토=양토, 계수=음수 -> 정재)
  // 왜 정인으로 나왔지?
  // SIBSUNG 매핑 확인: '무계' -> '정재'로 되어 있음.
  // 코드는 정상인데?
  // 아, 1번 이미지 표의 시주 십성이 '정인'으로 되어있는 이유는?
  // 혹시 일간이 잘못 들어갔나?
  // 1번 이미지 일주: 무인. 일간 무.
  // 시주: 계축.
  // 무-계: 정재.
  // 근데 1번 이미지엔 '정인'이라 써있음.
  // 정인이 나오려면 일간이 '갑'이어야 '계'가 정인임. (갑-계: 정인)
  // 아님. 갑목에게 계수는 정인.
  // 1번 이미지 일간이 무토인데 왜 정인?
  // 아! 혹시 getInfo 함수에서 sibsung 계산할 때 dayGan을 잘못 참조하고 있나?
  // calculateManseRyeok 함수 내에서 dayGan 변수는 매개변수로 받음.
  // getInfo나 makePillar 클로저가 dayGan을 잘 보고 있나?
  // 예.
  
  // 다시 1번 이미지 자세히 보기.
  // 시주: 계축. 십성: 정인 / 겁재.
  // 2번 이미지(정답): 계축. 십성: 정재 / 겁재.
  // 지지 십성(겁재)는 둘 다 맞음 (무-축(기): 겁재).
  // 천간 십성이 틀림. 정인 vs 정재.
  // 무토에게 계수는 정재가 맞음. 정인은 틀림.
  // 왜 코드가 정인을 뱉었을까?
  // SIBSUNG['무계'] = '정재' 확인됨.
  
  // 가능성 1: dayGan이 '무'가 아니라 '갑'으로 들어왔다?
  // 하지만 일주 컬럼엔 '무'라고 찍혀있음.
  // 가능성 2: SIBSUNG 키 생성 시 오타?
  // `${dayGan}${gan}`
  
  // 혹시... 1980년 5월 5일 양력/음력 문제?
  // 이미지는 양력 5월 5일.
  // 만세력 라이브러리는 양력 기준.
  // 일주 계산: 무인(戊寅) 맞음?
  // 1980.5.5 -> 무인일 맞음.
  // 시주: 03:00 -> 축시(01:30~03:30) -> 계축시 맞음.
  // 무-계: 정재.
  
  // 왜 정인이 나왔을까...
  // 아, 혹시 getDayGanji에서 반환하는 gan이 한글 '무'가 아니라 다른건가?
  // SIBGAN_HANGUL 인덱싱 사용함.
  
  // 역추론: 정인이 나오려면 일간이 '갑'이거나, 대상 천간이 '정'이어야 함 (무-정: 정인).
  // 시간이 '계'인데 '정'으로 잘못 계산되었거나,
  // 일간이 '무'인데 '갑'으로 잘못 계산되었거나.
  // 근데 표에는 '무'와 '계'라고 명시되어 있음.
  // 즉, 글자는 맞는데 십성 매핑만 틀림.
  
  // 무-계 -> 정재.
  // 혹시 SIBSUNG 객체에 '무계': '정인' 으로 잘못 되어있나?
  // 33행: '무계': '정인'  <-- 발견!!!
  // 33행: '무임': '편인', '무계': '정인'
  // 무토(토) 입장에서 임수/계수는 재성임. (토극수)
  // 무-임(양-양): 편재.
  // 무-계(양-음): 정재.
  // 코드 33행: '무병': '편재'?? 아님. 무-병(토-화) -> 인성.
  // 무-병: 편인. 무-정: 정인.
  // 코드 33행 다시 보기:
  // '무갑': '편관' (O, 목극토)
  // '무을': '정관' (O)
  // '무병': '편재' (X) -> 편인이어야 함. 화생토.
  // '무정': '정재' (X) -> 정인이어야 함.
  // '무무': '비견' (O)
  // '무기': '겁재' (O)
  // '무경': '식신' (O, 토생금)
  // '무신': '상관' (O)
  // '무임': '편인' (X) -> 편재이어야 함. 토극수.
  // '무계': '정인' (X) -> 정재이어야 함.
  
  // 33행 (무토 일간) 매핑이 엉망임.
  // '무병': '편인', '무정': '정인'
  // '무임': '편재', '무계': '정재'
  
  // 다른 행도 점검 필요.
  // 갑(목): 병(화)-식신, 정-상관, 무(토)-편재, 기-정재, 경(금)-편관, 신-정관, 임(수)-편인, 계-정인. (맞음)
  // 을(목): 병-상관, 정-식신, 무-정재, 기-편재, 경-정관, 신-편관, 임-정인, 계-편인. (맞음)
  // 병(화): 무(토)-식신, 기-상관, 경(금)-편재, 신-정재, 임(수)-편관, 계-정관, 갑(목)-편인, 을-정인. (맞음)
  // 정(화): 무-상관, 기-식신, 경-정재, 신-편재, 임-정관, 계-편관, 갑-정인, 을-편인. (맞음)
  // 무(토): 
  //   갑(목): 편관
  //   을(목): 정관
  //   병(화): 편인 (코드엔 편재로 되어있음 -> 수정 필요)
  //   정(화): 정인 (코드엔 정재로 되어있음 -> 수정 필요)
  //   무(토): 비견
  //   기(토): 겁재
  //   경(금): 식신
  //   신(금): 상관
  //   임(수): 편재 (코드엔 편인으로 되어있음 -> 수정 필요)
  //   계(수): 정재 (코드엔 정인으로 되어있음 -> 수정 필요)
  
  // 기(토):
  //   갑: 정관
  //   을: 편관
  //   병: 정인 (코드: 정재 -> 수정 필요)
  //   정: 편인 (코드: 편재 -> 수정 필요)
  //   무: 겁재
  //   기: 비견
  //   경: 상관
  //   신: 식신
  //   임: 정재 (코드: 정인 -> 수정 필요)
  //   계: 편재 (코드: 편인 -> 수정 필요)
  
  // 경(금):
  //   갑: 편재
  //   을: 정재
  //   병: 편관
  //   정: 정관
  //   무: 편인
  //   기: 정인
  //   경: 비견
  //   신: 겁재
  //   임: 식신
  //   계: 상관
  //   (경금은 대체로 맞아보임)
  
  // 신(금):
  //   갑: 정재
  //   을: 편재
  //   병: 정관
  //   정: 편관
  //   무: 정인
  //   기: 편인
  //   경: 겁재
  //   신: 비견
  //   임: 상관
  //   계: 식신
  //   (신금도 맞아보임)
  
  // 임(수):
  //   갑: 식신
  //   을: 상관
  //   병: 편재
  //   정: 정재 (코드: 편인 -> 수정 필요?? 37행 확인)
  //   37행: '임병': '정인'(X)->편재, '임정': '편인'(X)->정재
  //   '임무': 비견? 아님. 토극수. 임-무: 편관.
  //   '임기': 겁재? 아님. 임-기: 정관.
  //   '임경': 편재? 아님. 금생수. 임-경: 편인.
  //   '임신': 정재? 아님. 임-신: 정인.
  //   '임임': 비견.
  //   '임계': 겁재.
  
  // 계(수):
  //   갑: 상관
  //   을: 식신
  //   병: 정재 (코드: 편인 -> 수정)
  //   정: 편재 (코드: 정인 -> 수정)
  //   무: 정관 (코드: 겁재 -> 수정)
  //   기: 편관 (코드: 비견 -> 수정)
  //   경: 정인 (코드: 정재 -> 수정)
  //   신: 편인 (코드: 편재 -> 수정)
  //   임: 겁재
  //   계: 비견
  
  // 총체적 난국이었음. 무토, 기토, 임수, 계수 일간의 십성 매핑이 대거 틀려있었음.
  // 이를 전면 수정해야 함.

  
  const makePillar = (gan: string, ji: string, pillarType: string) => ({
    gan, ji,
    sibsung: SIBSUNG[`${dayGan}${gan}`] || '비견',
    jiSibsung: getJiSibsung(ji),
    ohang: `${OHENG[gan]}/${OHENG[ji]}`,
    eumyang: `${getEumyang(gan, true)}/${getEumyang(ji, false)}`,
    sibiunsung: getSibiunsung(dayGan, ji),
    sibisinsal: getSibisinsal(ji, pillarType === 'year' ? dayJi : yearJi)
  })

  return {
    year: makePillar(yearGanji.gan, yearGanji.ji, 'year'),
    month: makePillar(monthGanji.gan, monthGanji.ji, 'month'),
    day: makePillar(dayGan, dayGanji.ji, 'day'), // 일간은 입력값 유지
    hour: makePillar(hourGanji.gan, hourGanji.ji, 'hour')
  }
}

// 오행에 따른 색상 매핑
const OHANG_COLOR: Record<string, string> = {
  '화': '#ff0000',  // 빨간색
  '목': '#0000ff',  // 파란색
  '토': '#ff8800',  // 주황색
  '금': '#808080',  // 그레이
  '수': '#000000'   // 검정색
}

// 음양과 오행을 결합하여 포맷팅하는 함수 (예: -화(火))
const formatEumyangOhang = (eumyang: string, ohang: string): string => {
  const eumyangSymbol = eumyang === '양' ? '+' : '-'
  const ohangHanja = OHANG_HANJA[ohang] || ''
  return `${eumyangSymbol}${ohang}${ohangHanja ? `(${ohangHanja})` : ''}`
}

// 오행에 따른 색상 스타일 생성
const getOhangColorStyle = (ohang: string): string => {
  const color = OHANG_COLOR[ohang] || '#000000'
  return `color: ${color};`
}

export interface ManseRyeokCaptionInfo {
  name: string
  year: number
  month: number
  day: number
  hour?: string | null
  calendarType: 'solar' | 'lunar' | 'lunar-leap'
  convertedDate?: { year: number; month: number; day: number } | null
}

// kor-lunar 라이브러리를 사용한 정확한 음력/양력 변환
import korLunar from 'kor-lunar'

// 음력->양력 변환 (kor-lunar 사용)
export function convertLunarToSolarAccurate(year: number, month: number, day: number, isLeap: boolean = false): { year: number; month: number; day: number } | null {
  try {
    const solarDate = korLunar.toSolar(year, month, day, isLeap)
    if (!solarDate) {
      return null
    }
    return {
      year: solarDate.year,
      month: solarDate.month,
      day: solarDate.day
    }
  } catch (error) {
    console.error('음력->양력 변환 오류:', error)
    return null
  }
}

// 양력->음력 변환 (kor-lunar 사용)
export function convertSolarToLunarAccurate(year: number, month: number, day: number): { year: number; month: number; day: number } | null {
  try {
    const lunarDate = korLunar.toLunar(year, month, day)
    if (!lunarDate) {
      return null
    }
    return {
      year: lunarDate.year,
      month: lunarDate.month,
      day: lunarDate.day
    }
  } catch (error) {
    console.error('양력->음력 변환 오류:', error)
    return null
  }
}

export function generateManseRyeokTable(
  data: ManseRyeokData, 
  userName?: string,
  captionInfo?: ManseRyeokCaptionInfo
): string {
  // 천간의 음양오행과 지지의 음양오행 분리
  const yearGanEumyang = data.year.eumyang.split('/')[0]
  const yearJiEumyang = data.year.eumyang.split('/')[1]
  const monthGanEumyang = data.month.eumyang.split('/')[0]
  const monthJiEumyang = data.month.eumyang.split('/')[1]
  const dayGanEumyang = data.day.eumyang.split('/')[0]
  const dayJiEumyang = data.day.eumyang.split('/')[1]
  const hourGanEumyang = data.hour.eumyang.split('/')[0]
  const hourJiEumyang = data.hour.eumyang.split('/')[1]

  // 오행 분리
  const yearGanOhang = data.year.ohang.split('/')[0]
  const yearJiOhang = data.year.ohang.split('/')[1]
  const monthGanOhang = data.month.ohang.split('/')[0]
  const monthJiOhang = data.month.ohang.split('/')[1]
  const dayGanOhang = data.day.ohang.split('/')[0]
  const dayJiOhang = data.day.ohang.split('/')[1]
  const hourGanOhang = data.hour.ohang.split('/')[0]
  const hourJiOhang = data.hour.ohang.split('/')[1]
  
  // 캡션 생성
  // 형식: [이름 : 양력/음력 2008년 7월 11일 (양력/음력 2008년 5월 10일) 시]
  let caption = ''
  if (captionInfo) {
    const { name, year, month, day, hour, calendarType, convertedDate } = captionInfo
    
    // 캘린더 타입에 따른 날짜 표시
    const calendarTypeStr = calendarType === 'solar' ? '양력' : '음력'
    const dateStr = `${calendarTypeStr} ${year}년 ${month}월 ${day}일`
    
    // 변환된 날짜 표시
    let convertedDateStr = ''
    if (convertedDate) {
      if (calendarType === 'solar') {
        // 양력을 체크했으면 뒤 괄호 내용은 음력
        convertedDateStr = ` (음력 ${convertedDate.year}년 ${convertedDate.month}월 ${convertedDate.day}일)`
      } else if (calendarType === 'lunar' || calendarType === 'lunar-leap') {
        // 음력을 체크했으면 뒤 괄호 내용은 양력
        convertedDateStr = ` (양력 ${convertedDate.year}년 ${convertedDate.month}월 ${convertedDate.day}일)`
      }
    }
    
    // 시간 처리
    let timeStr = ''
    if (!hour || hour === '') {
      // 태어난 시 모름(디폴트)일 때 시간을 표시하지 말고 '모름'으로 표시
      timeStr = ' 모름'
    } else {
      // 지지 문자를 시간으로 변환
      const hourMap: { [key: string]: string } = {
        '子': '23:30 ~ 01:29',
        '丑': '01:30 ~ 03:29',
        '寅': '03:30 ~ 05:29',
        '卯': '05:30 ~ 07:29',
        '辰': '07:30 ~ 09:29',
        '巳': '09:30 ~ 11:29',
        '午': '11:30 ~ 13:29',
        '未': '13:30 ~ 15:29',
        '申': '15:30 ~ 17:29',
        '酉': '17:30 ~ 19:29',
        '戌': '19:30 ~ 21:29',
        '亥': '21:30 ~ 23:29'
      }
      
      // 숫자 시간인 경우 (예: "23-01")
      const hourMatch = hour.match(/(\d+)/)
      if (hourMatch) {
        const hourNum = parseInt(hourMatch[1])
        timeStr = ` ${hourNum}시`
      } else if (hourMap[hour]) {
        // 지지 문자인 경우
        timeStr = ` ${hour}시(${hourMap[hour]})`
      } else {
        timeStr = ` ${hour}시`
      }
    }
    
    // 형식: [이름 : 양력/음력 2008년 7월 11일 (양력/음력 2008년 5월 10일) 시]
    caption = `[${name} : ${dateStr}${convertedDateStr}${timeStr}]`
  } else if (userName) {
    // 기존 호환성을 위해 userName만 있는 경우
    caption = userName
  }

  // 천간 한자 변환 함수
  const getGanHanja = (gan: string) => {
    const index = SIBGAN_HANGUL.indexOf(gan)
    return index >= 0 ? SIBGAN[index] : gan
  }
  
  // 지지 한자 변환 함수
  const getJiHanja = (ji: string) => {
    const index = SIBIJI_HANGUL.indexOf(ji)
    return index >= 0 ? SIBIJI[index] : ji
  }

  // 지장간 계산 함수
  const getJijanggan = (ji: string): string => {
    const jijangganList = JIJANGGAN[ji] || []
    if (jijangganList.length === 0) return ''
    
    // 한글과 한자를 함께 표시 (예: "계신기(癸辛己)")
    const hangul = jijangganList.join('')
    const hanja = jijangganList.map(gan => getGanHanja(gan)).join('')
    return `${hangul}(${hanja})`
  }

  // 행 데이터 준비 (색상 정보 포함)
  const rows = [
    { 
      label: '십성', 
      year: { text: formatWithHanja(data.year.sibsung, SIBSUNG_HANJA), color: '' },
      month: { text: formatWithHanja(data.month.sibsung, SIBSUNG_HANJA), color: '' },
      day: { text: formatWithHanja(data.day.sibsung, SIBSUNG_HANJA), color: '' },
      hour: { text: formatWithHanja(data.hour.sibsung, SIBSUNG_HANJA), color: '' }
    },
    { 
      label: '음양오행', 
      year: { text: formatEumyangOhang(yearGanEumyang, yearGanOhang), color: getOhangColorStyle(yearGanOhang) },
      month: { text: formatEumyangOhang(monthGanEumyang, monthGanOhang), color: getOhangColorStyle(monthGanOhang) },
      day: { text: formatEumyangOhang(dayGanEumyang, dayGanOhang), color: getOhangColorStyle(dayGanOhang) },
      hour: { text: formatEumyangOhang(hourGanEumyang, hourGanOhang), color: getOhangColorStyle(hourGanOhang) }
    },
    { 
      label: '천간', 
      year: { text: `${data.year.gan}(${getGanHanja(data.year.gan)})`, color: getOhangColorStyle(yearGanOhang) },
      month: { text: `${data.month.gan}(${getGanHanja(data.month.gan)})`, color: getOhangColorStyle(monthGanOhang) },
      day: { text: `${data.day.gan}(${getGanHanja(data.day.gan)})`, color: getOhangColorStyle(dayGanOhang) },
      hour: { text: `${data.hour.gan}(${getGanHanja(data.hour.gan)})`, color: getOhangColorStyle(hourGanOhang) }
    },
    { 
      label: '지지', 
      year: { text: `${data.year.ji}(${getJiHanja(data.year.ji)})`, color: getOhangColorStyle(yearJiOhang) },
      month: { text: `${data.month.ji}(${getJiHanja(data.month.ji)})`, color: getOhangColorStyle(monthJiOhang) },
      day: { text: `${data.day.ji}(${getJiHanja(data.day.ji)})`, color: getOhangColorStyle(dayJiOhang) },
      hour: { text: `${data.hour.ji}(${getJiHanja(data.hour.ji)})`, color: getOhangColorStyle(hourJiOhang) }
    },
    { 
      label: '음양오행', 
      year: { text: formatEumyangOhang(yearJiEumyang, yearJiOhang), color: getOhangColorStyle(yearJiOhang) },
      month: { text: formatEumyangOhang(monthJiEumyang, monthJiOhang), color: getOhangColorStyle(monthJiOhang) },
      day: { text: formatEumyangOhang(dayJiEumyang, dayJiOhang), color: getOhangColorStyle(dayJiOhang) },
      hour: { text: formatEumyangOhang(hourJiEumyang, hourJiOhang), color: getOhangColorStyle(hourJiOhang) }
    },
    { 
      label: '십성', 
      year: { text: formatWithHanja(data.year.jiSibsung, SIBSUNG_HANJA), color: '' },
      month: { text: formatWithHanja(data.month.jiSibsung, SIBSUNG_HANJA), color: '' },
      day: { text: formatWithHanja(data.day.jiSibsung, SIBSUNG_HANJA), color: '' },
      hour: { text: formatWithHanja(data.hour.jiSibsung, SIBSUNG_HANJA), color: '' }
    },
    { 
      label: '지장간', 
      year: { text: getJijanggan(data.year.ji), color: '' },
      month: { text: getJijanggan(data.month.ji), color: '' },
      day: { text: getJijanggan(data.day.ji), color: '' },
      hour: { text: getJijanggan(data.hour.ji), color: '' }
    },
    { 
      label: '십이운성', 
      year: { text: formatWithHanja(data.year.sibiunsung, SIBIUNSUNG_HANJA), color: '' },
      month: { text: formatWithHanja(data.month.sibiunsung, SIBIUNSUNG_HANJA), color: '' },
      day: { text: formatWithHanja(data.day.sibiunsung, SIBIUNSUNG_HANJA), color: '' },
      hour: { text: formatWithHanja(data.hour.sibiunsung, SIBIUNSUNG_HANJA), color: '' }
    },
    { 
      label: '십이신살', 
      year: { text: formatWithHanja(data.year.sibisinsal, SIBISINSAL_HANJA), color: '' },
      month: { text: formatWithHanja(data.month.sibisinsal, SIBISINSAL_HANJA), color: '' },
      day: { text: formatWithHanja(data.day.sibisinsal, SIBISINSAL_HANJA), color: '' },
      hour: { text: formatWithHanja(data.hour.sibisinsal, SIBISINSAL_HANJA), color: '' }
    }
  ]
  
  let html = ''
  
  html += '<table class="manse-ryeok-table" style="width: 100%; border-collapse: collapse; margin: 0 0 20px 0; font-size: 14px; border-radius: 12px; overflow: hidden; border: none;">'
  
  // 캡션 추가 (테이블 상단 중앙정렬)
  if (caption) {
    html += `<caption style="caption-side: top; text-align: center; font-size: 16px; font-weight: bold; padding: 10px 0; margin-bottom: 10px;">${caption}</caption>`
  }
  
  html += '<thead><tr>'
  html += '<th style="border-top: none; border-left: none; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-size: 14px; font-weight: bold; border-radius: 12px 0 0 0;">구분</th>'
  html += '<th style="border-top: none; border-left: none; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-size: 14px; font-weight: bold;">시주</th>'
  html += '<th style="border-top: none; border-left: none; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-size: 14px; font-weight: bold;">일주</th>'
  html += '<th style="border-top: none; border-left: none; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-size: 14px; font-weight: bold;">월주</th>'
  html += '<th style="border-top: none; border-left: none; border-right: none; border-bottom: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-size: 14px; font-weight: bold; border-radius: 0 12px 0 0;">연주</th>'
  html += '</tr></thead>'
  html += '<tbody>'
  
  rows.forEach((row, rowIndex) => {
    html += '<tr>'
    // 마지막 행의 첫 번째 셀에 하단 왼쪽 모서리 둥글게
    const isLastRow = rowIndex === rows.length - 1
    const firstCellStyle = isLastRow 
      ? 'border-top: 1px solid #ddd; border-left: none; border-right: 1px solid #ddd; border-bottom: none; padding: 8px; font-weight: bold; font-size: 14px; border-radius: 0 0 0 12px; background-color: #f5f5f5;'
      : 'border-top: 1px solid #ddd; border-left: none; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 8px; font-weight: bold; font-size: 14px; background-color: #f5f5f5;'
    html += `<td style="${firstCellStyle}">${row.label}</td>`
    // 천간, 지지 행은 폰트 크기 2배 (28px), 나머지는 기본 크기
    const isGanjiRow = row.label === '천간' || row.label === '지지'
    const cellFontSize = isGanjiRow ? '28px' : '14px'
    // 마지막 행의 마지막 셀에 하단 오른쪽 모서리 둥글게
    const lastCellStyle = isLastRow 
      ? `border-top: 1px solid #ddd; border-left: none; border-right: none; border-bottom: none; padding: 8px; text-align: center; font-size: ${cellFontSize}; ${row.year.color}; border-radius: 0 0 12px 0; background-color: #f0f4ff;`
      : `border-top: 1px solid #ddd; border-left: none; border-right: none; border-bottom: 1px solid #ddd; padding: 8px; text-align: center; font-size: ${cellFontSize}; ${row.year.color}; background-color: #f0f4ff;`
    const middleCellStyle = isLastRow
      ? `border-top: 1px solid #ddd; border-left: none; border-right: 1px solid #ddd; border-bottom: none; padding: 8px; text-align: center; font-size: ${cellFontSize}; background-color: #f0f4ff;`
      : `border-top: 1px solid #ddd; border-left: none; border-right: 1px solid #ddd; border-bottom: 1px solid #ddd; padding: 8px; text-align: center; font-size: ${cellFontSize}; background-color: #f0f4ff;`
    html += `<td style="${middleCellStyle}${row.hour.color}">${row.hour.text}</td>`
    html += `<td style="${middleCellStyle}${row.day.color}">${row.day.text}</td>`
    html += `<td style="${middleCellStyle}${row.month.color}">${row.month.text}</td>`
    html += `<td style="${lastCellStyle}">${row.year.text}</td>`
    html += '</tr>'
  })
  
  html += '</tbody></table>'
  
  return html
}

export function generateManseRyeokText(data: ManseRyeokData): string {
  const getGanHanja = (gan: string) => {
    const index = SIBGAN_HANGUL.indexOf(gan)
    return index >= 0 ? SIBGAN[index] : gan
  }
  const getJiHanja = (ji: string) => {
    const index = SIBIJI_HANGUL.indexOf(ji)
    return index >= 0 ? SIBIJI[index] : ji
  }
  
  let text = ''
  
  text += `=== 시주 (Hour Pillar) ===\n`
  text += `천간: ${data.hour.gan}(${getGanHanja(data.hour.gan)}) | 지지: ${data.hour.ji}(${getJiHanja(data.hour.ji)}) | 합쳐서: ${data.hour.gan}${data.hour.ji}(${getGanHanja(data.hour.gan)}${getJiHanja(data.hour.ji)})\n`
  text += `십성(천간): ${data.hour.sibsung} | 십성(지지): ${data.hour.jiSibsung}\n`
  
  text += `=== 일주 (Day Pillar) ===\n`
  text += `천간(일간): ${data.day.gan}(${getGanHanja(data.day.gan)}) | 지지: ${data.day.ji}(${getJiHanja(data.day.ji)}) | 합쳐서: ${data.day.gan}${data.day.ji}(${getGanHanja(data.day.gan)}${getJiHanja(data.day.ji)})\n`
  text += `십성(천간): ${data.day.sibsung} | 십성(지지): ${data.day.jiSibsung}\n`
  
  text += `=== 월주 (Month Pillar) ===\n`
  text += `천간: ${data.month.gan}(${getGanHanja(data.month.gan)}) | 지지: ${data.month.ji}(${getJiHanja(data.month.ji)}) | 합쳐서: ${data.month.gan}${data.month.ji}(${getGanHanja(data.month.gan)}${getJiHanja(data.month.ji)})\n`
  text += `십성(천간): ${data.month.sibsung} | 십성(지지): ${data.month.jiSibsung}\n`
  
  text += `=== 연주 (Year Pillar) ===\n`
  text += `천간: ${data.year.gan}(${getGanHanja(data.year.gan)}) | 지지: ${data.year.ji}(${getJiHanja(data.year.ji)}) | 합쳐서: ${data.year.gan}${data.year.ji}(${getGanHanja(data.year.gan)}${getJiHanja(data.year.ji)})\n`
  text += `십성(천간): ${data.year.sibsung} | 십성(지지): ${data.year.jiSibsung}`
  
  return text
}
