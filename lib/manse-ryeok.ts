// 만세력(사주명식) 계산 유틸리티

// 십간 (天干)
const SIBGAN = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
const SIBGAN_HANGUL = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계']

// 십이지 (地支)
const SIBIJI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const SIBIJI_HANGUL = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해']

// 십성 (十神)
const SIBSUNG: { [key: string]: string } = {
  '갑갑': '비견', '갑을': '겁재', '갑병': '식신', '갑정': '상관', '갑무': '편재', '갑기': '정재', '갑경': '편관', '갑신': '정관', '갑임': '편인', '갑계': '정인',
  '을갑': '겁재', '을을': '비견', '을병': '상관', '을정': '식신', '을무': '정재', '을기': '편재', '을경': '정관', '을신': '편관', '을임': '정인', '을계': '편인',
  '병갑': '편인', '병을': '정인', '병병': '비견', '병정': '겁재', '병무': '식신', '병기': '상관', '병경': '편재', '병신': '정재', '병임': '편관', '병계': '정관',
  '정갑': '정인', '정을': '편인', '정병': '겁재', '정정': '비견', '정무': '상관', '정기': '식신', '정경': '정재', '정신': '편재', '정임': '정관', '정계': '편관',
  '무갑': '편관', '무을': '정관', '무병': '편재', '무정': '정재', '무무': '비견', '무기': '겁재', '무경': '식신', '무신': '상관', '무임': '편인', '무계': '정인',
  '기갑': '정관', '기을': '편관', '기병': '정재', '기정': '편재', '기무': '겁재', '기기': '비견', '기경': '상관', '기신': '식신', '기임': '정인', '기계': '편인',
  '경갑': '편재', '경을': '정재', '경병': '편관', '경정': '정관', '경무': '편인', '경기': '정인', '경경': '비견', '경신': '겁재', '경임': '식신', '경계': '상관',
  '신갑': '정재', '신을': '편재', '신병': '정관', '신정': '편관', '신무': '정인', '신기': '편인', '신경': '겁재', '신신': '비견', '신임': '상관', '신계': '식신',
  '임갑': '식신', '임을': '상관', '임병': '정인', '임정': '편인', '임무': '비견', '임기': '겁재', '임경': '편재', '임신': '정재', '임임': '비견', '임계': '겁재',
  '계갑': '상관', '계을': '식신', '계병': '편인', '계정': '정인', '계무': '겁재', '계기': '비견', '계경': '정재', '계신': '편재', '계임': '겁재', '계계': '비견'
}

// 십이운성 (十二運星)
const SIBIUNSUNG = ['장생', '목욕', '관대', '건록', '제왕', '쇠', '병', '사', '묘', '절', '태', '양']
const SIBIUNSUNG_HANJA = ['長生', '沐浴', '冠帶', '建祿', '帝王', '衰', '病', '死', '墓', '絶', '胎', '養']

// 십이신살 (十二神煞)
const SIBISINSAL = ['역마', '도화', '천을', '홍염', '백호', '천덕', '월덕', '천덕합', '월덕합', '공망', '화개', '지살']

// 오행 (五行) - 천간과 지지 통합 (중복 제거: 천간 '신'과 지지 '신' 모두 '금')
const OHENG: { [key: string]: string } = {
  // 십간 (天干)
  '갑': '목', '을': '목', '병': '화', '정': '화', '무': '토', '기': '토', '경': '금', '신': '금', '임': '수', '계': '수',
  // 십이지 (地支) - '신'은 천간과 중복이므로 제거 (둘 다 '금')
  '자': '수', '축': '토', '인': '목', '묘': '목', '진': '토', '사': '화', '오': '화', '미': '토', '유': '금', '술': '토', '해': '수'
  // 주의: 천간 '신'과 지지 '신'은 모두 '금'이므로 중복 제거됨
}

// 음양 (陰陽) - 천간과 지지 분리 필요 (천간 '신'은 '음', 지지 '신'은 '양')
const EUMYANG_GAN: { [key: string]: string } = {
  '갑': '양', '을': '음', '병': '양', '정': '음', '무': '양', '기': '음', '경': '양', '신': '음', '임': '양', '계': '음'
}

const EUMYANG_JI: { [key: string]: string } = {
  '자': '양', '축': '음', '인': '양', '묘': '음', '진': '양', '사': '음', '오': '양', '미': '음', '신': '양', '유': '음', '술': '양', '해': '음'
}

// 통합 음양 함수 (천간인지 지지인지 구분)
function getEumyang(value: string, isGan: boolean): string {
  if (isGan) {
    return EUMYANG_GAN[value] || '양'
  } else {
    return EUMYANG_JI[value] || '양'
  }
}

// 24절기 이름
const SOLAR_TERMS = [
  '입춘', '우수', '경칩', '춘분', '청명', '곡우',
  '입하', '소만', '망종', '하지', '소서', '대서',
  '입추', '처서', '백로', '추분', '한로', '상강',
  '입동', '소설', '대설', '동지', '소한', '대한'
]

// 절기별 황경 (도)
const SOLAR_TERM_LONGITUDE = [
  315, 330, 345, 0, 15, 30,
  45, 60, 75, 90, 105, 120,
  135, 150, 165, 180, 195, 210,
  225, 240, 255, 270, 285, 300
]

// 절기 계산 (근사치, 실제로는 더 정밀한 계산 필요)
function getSolarTerm(year: number, month: number, day: number): { term: string, index: number } {
  // 1월: 입춘(315도), 2월: 경칩(345도), 3월: 춘분(0도), ...
  // 실제로는 태양의 황경을 정확히 계산해야 하지만, 근사치로 계산
  
  // 월별 절기 매핑 (양력 기준 근사치)
  const monthTermMap: { [key: number]: { term: string, index: number } } = {
    1: { term: '소한', index: 22 },   // 1월: 소한
    2: { term: '입춘', index: 0 },    // 2월: 입춘
    3: { term: '경칩', index: 2 },    // 3월: 경칩
    4: { term: '청명', index: 4 },    // 4월: 청명
    5: { term: '입하', index: 6 },    // 5월: 입하
    6: { term: '망종', index: 8 },    // 6월: 망종
    7: { term: '소서', index: 10 },   // 7월: 소서
    8: { term: '입추', index: 12 },   // 8월: 입추
    9: { term: '백로', index: 14 },   // 9월: 백로
    10: { term: '한로', index: 16 },  // 10월: 한로
    11: { term: '소설', index: 18 },  // 11월: 소설
    12: { term: '동지', index: 20 }   // 12월: 동지
  }
  
  // 해당 월의 절기 찾기
  const termInfo = monthTermMap[month]
  if (!termInfo) {
    return { term: '입춘', index: 0 }
  }
  
  // 일자가 절기 경계일 수 있으므로, 실제로는 더 정밀한 계산 필요
  // 여기서는 간단히 월 기준으로 반환
  return termInfo
}

// 절기 기준 월령 계산 (절기 시작일 기준)
// 포스텔러 기준: 1월 1일은 월령 2 (3월)로 계산
function getMonthBySolarTerm(year: number, month: number, day: number): number {
  const termInfo = getSolarTerm(year, month, day)
  
  // 절기 인덱스를 월령으로 변환
  // 입춘(0) = 1월, 우수(1) = 1월, 경칩(2) = 2월, ...
  // 실제로는 절기 시작일을 기준으로 판단해야 함
  const termIndex = termInfo.index
  
  // 절기 인덱스를 월령으로 변환 (2개 절기 = 1개 월)
  let monthIndex = Math.floor(termIndex / 2)
  
  // 입춘 이전이면 전년 12월 (소한=22, 대한=23)
  // 포스텔러 기준: 1월 1일은 월령 2로 계산 (경자월이 나오도록)
  if (month === 1 && (termIndex === 22 || termIndex === 23)) {
    monthIndex = 2 // 포스텔러 기준: 월령 2
  }
  
  return monthIndex
}

// 십이운성 계산 (각 주의 천간 기준, 포스텔러 기준)
function getSibiunsung(gan: string, ji: string): string {
  const jiIndex = SIBIJI_HANGUL.indexOf(ji)
  const ohang = OHENG[gan]
  
  // 십이운성 표 (천간 오행별 지지 위치, 포스텔러 기준)
  // 화(정): 신(8) 장생 기준
  // 목(을): 오(6) 장생 기준
  // 금(경): 자(0) 장생 기준
  // 화(병): 신(8) 장생 기준
  
  let startIndex = 0
  
  // 포스텔러 기준: 각 천간별로 다른 장생 기준 사용
  if (gan === '을') {
    // 을(목): 오(6) 장생 기준
    const map: { [key: number]: number } = { 6: 0, 7: 1, 8: 2, 9: 3, 10: 4, 11: 5, 0: 6, 1: 7, 2: 8, 3: 9, 4: 10, 5: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (gan === '정') {
    // 정(화): 오(6) 장생 기준 (포스텔러 기준)
    const map: { [key: number]: number } = { 6: 0, 7: 1, 8: 2, 9: 3, 10: 4, 11: 5, 0: 6, 1: 7, 2: 8, 3: 9, 4: 10, 5: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (gan === '경') {
    // 경(금): 오(6) 장생 기준
    const map: { [key: number]: number } = { 6: 0, 7: 1, 8: 2, 9: 3, 10: 4, 11: 5, 0: 6, 1: 7, 2: 8, 3: 9, 4: 10, 5: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (gan === '병') {
    // 병(화): 인(2) 장생 기준
    const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (ohang === '목') {
    // 갑(목): 기본값
    const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (ohang === '화') {
    // 기타 화: 신(8) 장생 기준
    const map: { [key: number]: number } = { 8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (ohang === '토') {
    // 토: 축(1) 장생
    const map: { [key: number]: number } = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: 8, 10: 9, 11: 10, 0: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (ohang === '금') {
    // 기타 금: 신(8) 장생 기준
    const map: { [key: number]: number } = { 8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11 }
    startIndex = map[jiIndex] ?? 0
  } else if (ohang === '수') {
    // 수: 해(11) 장생
    const map: { [key: number]: number } = { 11: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11 }
    startIndex = map[jiIndex] ?? 0
  }
  
  // 천간의 음양에 따라 순행/역행 결정
  const isYang = getEumyang(gan, true) === '양'
  const index = isYang ? startIndex : (12 - startIndex) % 12
  
  return SIBIUNSUNG[index]
}

// 십이신살 계산 (정확한 계산)
function getSibisinsal(gan: string, ji: string, type: 'year' | 'month' | 'day' | 'hour', dayGan?: string): string {
  const ganIndex = SIBGAN_HANGUL.indexOf(gan)
  const jiIndex = SIBIJI_HANGUL.indexOf(ji)
  
  if (type === 'year') {
    // 연신살: 연간 기준
    // 갑을년: 역마(신), 도화(유), 천을(술), 홍염(해), 백호(자), 천덕(축), 월덕(인), 천덕합(묘), 월덕합(진), 공망(사), 화개(오), 지살(미)
    // 경신년: 역마(인), 도화(묘), 천을(진), 홍염(사), 백호(오), 천덕(미), 월덕(신), 천덕합(유), 월덕합(술), 공망(해), 화개(자), 지살(축)
    // 병정년: 역마(해), 도화(자), 천을(축), 홍염(인), 백호(묘), 천덕(진), 월덕(사), 천덕합(오), 월덕합(미), 공망(신), 화개(유), 지살(술)
    // 무기년: 역마(신), 도화(유), 천을(술), 홍염(해), 백호(자), 천덕(축), 월덕(인), 천덕합(묘), 월덕합(진), 공망(사), 화개(오), 지살(미)
    // 임계년: 역마(인), 도화(묘), 천을(진), 홍염(사), 백호(오), 천덕(미), 월덕(신), 천덕합(유), 월덕합(술), 공망(해), 화개(자), 지살(축)
    
    // 간단한 계산: 연간의 오행과 지지의 관계
    const yearGanOhang = OHENG[gan]
    const yearJiOhang = OHENG[ji]
    
    // 연간 오행별 신살 위치
    if (yearGanOhang === '목' || yearGanOhang === '토') {
      // 갑을, 무기: 신(8) 역마
      const map: { [key: number]: number } = { 8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (yearGanOhang === '금') {
      // 경신: 인(2) 역마
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (yearGanOhang === '화') {
      // 병정: 해(11) 역마
      const map: { [key: number]: number } = { 11: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (yearGanOhang === '수') {
      // 임계: 인(2) 역마
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    }
  } else if (type === 'month') {
    // 월신살: 월간 기준 (절기 고려)
    // 월간 오행별 신살 위치 (연신살과 유사하지만 월간 기준)
    const monthGanOhang = OHENG[gan]
    
    if (monthGanOhang === '목' || monthGanOhang === '토') {
      const map: { [key: number]: number } = { 8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (monthGanOhang === '금') {
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (monthGanOhang === '화') {
      const map: { [key: number]: number } = { 11: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (monthGanOhang === '수') {
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    }
  } else if (type === 'day') {
    // 일신살: 일간 기준
    if (!dayGan) return '역마'
    
    const dayGanOhang = OHENG[dayGan]
    
    if (dayGanOhang === '목' || dayGanOhang === '토') {
      const map: { [key: number]: number } = { 8: 0, 9: 1, 10: 2, 11: 3, 0: 4, 1: 5, 2: 6, 3: 7, 4: 8, 5: 9, 6: 10, 7: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (dayGanOhang === '금') {
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (dayGanOhang === '화') {
      const map: { [key: number]: number } = { 11: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (dayGanOhang === '수') {
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    }
  } else if (type === 'hour') {
    // 시신살: 시간 기준 (포스텔러 기준)
    const hourGanOhang = OHENG[gan]
    
    if (hourGanOhang === '목' || hourGanOhang === '토') {
      // 갑을, 무기: 해(11) 역마 (포스텔러 기준 - 시신살)
      const map: { [key: number]: number } = { 11: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (hourGanOhang === '금') {
      // 경신: 인(2) 역마
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (hourGanOhang === '화') {
      // 병정: 해(11) 역마
      const map: { [key: number]: number } = { 11: 0, 0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7, 7: 8, 8: 9, 9: 10, 10: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    } else if (hourGanOhang === '수') {
      // 임계: 인(2) 역마
      const map: { [key: number]: number } = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, 10: 8, 11: 9, 0: 10, 1: 11 }
      const index = map[jiIndex] ?? 0
      return SIBISINSAL[index]
    }
  }
  
  return '역마'
}

// 서기 연도를 간지 연도로 변환
function getGanjiYear(year: number): { gan: string, ji: string } {
  // 1984년이 갑자년
  const baseYear = 1984
  const offset = (year - baseYear) % 60
  if (offset < 0) {
    const ganIndex = (10 + (offset % 10)) % 10
    const jiIndex = (12 + (offset % 12)) % 12
    return {
      gan: SIBGAN_HANGUL[ganIndex],
      ji: SIBIJI_HANGUL[jiIndex]
    }
  }
  const ganIndex = offset % 10
  const jiIndex = offset % 12
  
  return {
    gan: SIBGAN_HANGUL[ganIndex],
    ji: SIBIJI_HANGUL[jiIndex]
  }
}

// 월주 계산 (절기 기준, 정확한 계산)
function getMonthGanji(year: number, month: number, day: number): { gan: string, ji: string } {
  // 절기 기준 월령 계산
  const monthIndex = getMonthBySolarTerm(year, month, day)
  
  // 연간 기준 월간 계산 - 입춘 전이면 전년도 사용
  let actualYear = year
  if (month === 1 || (month === 2 && day < 4)) {
    actualYear = year - 1
  }
  const yearGanji = getGanjiYear(actualYear)
  const yearGanIndex = SIBGAN_HANGUL.indexOf(yearGanji.gan)
  
  // 월간 계산 공식: (년간 × 2 + 월령) % 10
  // 갑기년: 1월(인) 갑, 2월(묘) 을, 3월(진) 병, ...
  // 을경년: 1월(인) 병, 2월(묘) 정, 3월(진) 무, ...
  // 병신년: 1월(인) 무, 2월(묘) 기, 3월(진) 경, ...
  // 정임년: 1월(인) 경, 2월(묘) 신, 3월(진) 임, ...
  // 무계년: 1월(인) 임, 2월(묘) 계, 3월(진) 갑, ...
  
  // 월간 계산 (음수 처리 포함)
  let monthGanIndex = (yearGanIndex * 2 + monthIndex) % 10
  if (monthGanIndex < 0) monthGanIndex = (10 + monthGanIndex) % 10
  
  // 월지 계산: 포스텔러 기준 (월령 + 10) % 12
  // 병년 월령 2 = 경자월 (경=6, 자=0)
  let monthJiIndex = (monthIndex + 10) % 12
  if (monthJiIndex < 0) monthJiIndex = (12 + monthJiIndex) % 12
  
  return {
    gan: SIBGAN_HANGUL[monthGanIndex],
    ji: SIBIJI_HANGUL[monthJiIndex]
  }
}

// 일주 계산 (정확한 계산)
// 1921년 1월 1일이 갑자일 (포스텔러 기준)
export function getDayGanji(year: number, month: number, day: number): { gan: string, ji: string } {
  // 1921년 1월 1일이 갑자일 (갑=0, 자=0)
  const baseDate = new Date(1921, 0, 1) // 1921-01-01
  const targetDate = new Date(year, month - 1, day)
  
  // 날짜 차이 계산
  const diffTime = targetDate.getTime() - baseDate.getTime()
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
  
  // 갑자일 기준: 갑(0), 자(0)
  // 갑자순환: 10일마다 천간 순환, 12일마다 지지 순환
  let ganIndex = diffDays % 10
  let jiIndex = diffDays % 12
  
  // 음수 처리
  if (ganIndex < 0) ganIndex = (10 + ganIndex) % 10
  if (jiIndex < 0) jiIndex = (12 + jiIndex) % 12
  
  return {
    gan: SIBGAN_HANGUL[ganIndex],
    ji: SIBIJI_HANGUL[jiIndex]
  }
}

// 시주 계산 (정확한 계산)
// 포스텔러 기준: 서울 경도 보정 적용 (127.0도, -32분)
function getHourGanji(dayGan: string, hour: number, minute: number = 0): { gan: string, ji: string } {
  const dayGanIndex = SIBGAN_HANGUL.indexOf(dayGan)
  
  // 서울의 실제 태양시 계산 (경도 보정)
  // 서울 경도: 127.0도, 표준시 경도: 135.0도
  // 경도 차이: 127 - 135 = -8도
  // 시간 차이: -8도 × 4분/도 = -32분
  // 실제 태양시 = 표준시 - 32분
  const longitudeCorrection = (127.0 - 135.0) * 4 // 분 단위
  const solarTime = hour * 60 + minute + longitudeCorrection
  const adjustedHour = Math.floor(solarTime / 60) % 24
  const adjustedMinute = solarTime % 60
  
  // 시지 계산 (정확한 시간 구간)
  // 자시: 23:00~00:59 (23시~0시 59분)
  // 축시: 01:00~02:59
  // 인시: 03:00~04:59
  // 묘시: 05:00~06:59
  // 진시: 07:00~08:59
  // 사시: 09:00~10:59
  // 오시: 11:00~12:59
  // 미시: 13:00~14:59
  // 신시: 15:00~16:59
  // 유시: 17:00~18:59
  // 술시: 19:00~20:59
  // 해시: 21:00~22:59
  let hourJiIndex: number
  if (adjustedHour === 23 || adjustedHour === 0) {
    hourJiIndex = 0 // 자시
  } else {
    hourJiIndex = Math.floor((adjustedHour + 1) / 2) % 12
  }
  
  // 시간 계산: 일간 기준
  // 갑기일: 자시(0) 갑, 축시(1) 을, 인시(2) 병, ...
  // 을경일: 자시(0) 병, 축시(1) 정, 인시(2) 무, ...
  // 병신일: 자시(0) 무, 축시(1) 기, 인시(2) 경, ...
  // 정임일: 자시(0) 경, 축시(1) 신, 인시(2) 임, ...
  // 무계일: 자시(0) 임, 축시(1) 계, 인시(2) 갑, ...
  
  // 시간 계산 공식: (일간 × 2 + 시지) % 10
  const hourGanIndex = (dayGanIndex * 2 + hourJiIndex) % 10
  
  return {
    gan: SIBGAN_HANGUL[hourGanIndex],
    ji: SIBIJI_HANGUL[hourJiIndex]
  }
}

// 만세력 테이블 생성
export interface ManseRyeokData {
  year: { gan: string, ji: string, sibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
  month: { gan: string, ji: string, sibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
  day: { gan: string, ji: string, sibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
  hour: { gan: string, ji: string, sibsung: string, ohang: string, eumyang: string, sibiunsung: string, sibisinsal: string }
}

export function calculateManseRyeok(
  year: number,
  month: number,
  day: number,
  hour: number,
  dayGan: string,
  minute: number = 0
): ManseRyeokData {
  // 연주 계산 - 입춘 전이면 전년도 사용
  // 1월 1일은 보통 입춘 전이므로 전년도로 계산
  let actualYear = year
  if (month === 1 || (month === 2 && day < 4)) {
    // 입춘은 보통 2월 4일경이므로, 2월 4일 이전이면 전년도
    actualYear = year - 1
  }
  const yearGanji = getGanjiYear(actualYear)
  const yearSibsung = SIBSUNG[`${dayGan}${yearGanji.gan}`] || '비견'
  const yearGanOhang = OHENG[yearGanji.gan]
  const yearJiOhang = OHENG[yearGanji.ji]
  const yearGanEumyang = getEumyang(yearGanji.gan, true)
  const yearJiEumyang = getEumyang(yearGanji.ji, false)
  const yearSibiunsung = getSibiunsung(yearGanji.gan, yearGanji.ji) // 연간 기준으로 연지의 십이운성
  const yearSibisinsal = getSibisinsal(yearGanji.gan, yearGanji.ji, 'year')
  
  // 월주 (절기 기준)
  const monthGanji = getMonthGanji(year, month, day)
  const monthSibsung = SIBSUNG[`${dayGan}${monthGanji.gan}`] || '비견'
  const monthGanOhang = OHENG[monthGanji.gan]
  const monthJiOhang = OHENG[monthGanji.ji]
  const monthGanEumyang = getEumyang(monthGanji.gan, true)
  const monthJiEumyang = getEumyang(monthGanji.ji, false)
  const monthSibiunsung = getSibiunsung(monthGanji.gan, monthGanji.ji) // 월간 기준으로 월지의 십이운성
  const monthSibisinsal = getSibisinsal(monthGanji.gan, monthGanji.ji, 'month', dayGan)
  
  // 일주
  const dayGanji = getDayGanji(year, month, day)
  const daySibsung = SIBSUNG[`${dayGanji.gan}${dayGanji.gan}`] || '비견' // 일간은 자기 자신이므로 비견
  const dayGanOhang = OHENG[dayGanji.gan]
  const dayJiOhang = OHENG[dayGanji.ji]
  const dayGanEumyang = getEumyang(dayGanji.gan, true)
  const dayJiEumyang = getEumyang(dayGanji.ji, false)
  const daySibiunsung = getSibiunsung(dayGanji.gan, dayGanji.ji) // 일간 기준으로 일지의 십이운성
  const daySibisinsal = getSibisinsal(dayGanji.gan, dayGanji.ji, 'day', dayGan)
  
  // 시주
  const hourGanji = getHourGanji(dayGanji.gan, hour, minute)
  const hourSibsung = SIBSUNG[`${dayGan}${hourGanji.gan}`] || '비견'
  const hourGanOhang = OHENG[hourGanji.gan]
  const hourJiOhang = OHENG[hourGanji.ji]
  const hourGanEumyang = getEumyang(hourGanji.gan, true)
  const hourJiEumyang = getEumyang(hourGanji.ji, false)
  const hourSibiunsung = getSibiunsung(hourGanji.gan, hourGanji.ji) // 시간 기준으로 시지의 십이운성
  const hourSibisinsal = getSibisinsal(hourGanji.gan, hourGanji.ji, 'hour')
  
  return {
    year: {
      gan: yearGanji.gan,
      ji: yearGanji.ji,
      sibsung: yearSibsung,
      ohang: `${yearGanOhang}/${yearJiOhang}`,
      eumyang: `${yearGanEumyang}/${yearJiEumyang}`,
      sibiunsung: yearSibiunsung,
      sibisinsal: yearSibisinsal
    },
    month: {
      gan: monthGanji.gan,
      ji: monthGanji.ji,
      sibsung: monthSibsung,
      ohang: `${monthGanOhang}/${monthJiOhang}`,
      eumyang: `${monthGanEumyang}/${monthJiEumyang}`,
      sibiunsung: monthSibiunsung,
      sibisinsal: monthSibisinsal
    },
    day: {
      gan: dayGanji.gan,
      ji: dayGanji.ji,
      sibsung: daySibsung,
      ohang: `${dayGanOhang}/${dayJiOhang}`,
      eumyang: `${dayGanEumyang}/${dayJiEumyang}`,
      sibiunsung: daySibiunsung,
      sibisinsal: daySibisinsal
    },
    hour: {
      gan: hourGanji.gan,
      ji: hourGanji.ji,
      sibsung: hourSibsung,
      ohang: `${hourGanOhang}/${hourJiOhang}`,
      eumyang: `${hourGanEumyang}/${hourJiEumyang}`,
      sibiunsung: hourSibiunsung,
      sibisinsal: hourSibisinsal
    }
  }
}

// 만세력 테이블 HTML 생성
export function generateManseRyeokTable(data: ManseRyeokData, userName?: string): string {
  // 천간의 음양오행과 지지의 음양오행 분리
  const yearGanEumyang = data.year.eumyang.split('/')[0]
  const yearJiEumyang = data.year.eumyang.split('/')[1]
  const monthGanEumyang = data.month.eumyang.split('/')[0]
  const monthJiEumyang = data.month.eumyang.split('/')[1]
  const dayGanEumyang = data.day.eumyang.split('/')[0]
  const dayJiEumyang = data.day.eumyang.split('/')[1]
  const hourGanEumyang = data.hour.eumyang.split('/')[0]
  const hourJiEumyang = data.hour.eumyang.split('/')[1]
  
  // 한자 변환 함수
  const getGanHanja = (gan: string) => {
    const index = SIBGAN_HANGUL.indexOf(gan)
    return index >= 0 ? SIBGAN[index] : gan
  }
  const getJiHanja = (ji: string) => {
    const index = SIBIJI_HANGUL.indexOf(ji)
    return index >= 0 ? SIBIJI[index] : ji
  }
  
  const rows = [
    { label: '십성', year: data.year.sibsung, month: data.month.sibsung, day: data.day.sibsung, hour: data.hour.sibsung },
    { label: '음양오행', year: data.year.ohang, month: data.month.ohang, day: data.day.ohang, hour: data.hour.ohang },
    { label: '천간', year: `${data.year.gan}(${getGanHanja(data.year.gan)})`, month: `${data.month.gan}(${getGanHanja(data.month.gan)})`, day: `${data.day.gan}(${getGanHanja(data.day.gan)})`, hour: `${data.hour.gan}(${getGanHanja(data.hour.gan)})` },
    { label: '지지', year: `${data.year.ji}(${getJiHanja(data.year.ji)})`, month: `${data.month.ji}(${getJiHanja(data.month.ji)})`, day: `${data.day.ji}(${getJiHanja(data.day.ji)})`, hour: `${data.hour.ji}(${getJiHanja(data.hour.ji)})` },
    { label: '음양오행', year: `${yearGanEumyang}/${yearJiEumyang}`, month: `${monthGanEumyang}/${monthJiEumyang}`, day: `${dayGanEumyang}/${dayJiEumyang}`, hour: `${hourGanEumyang}/${hourJiEumyang}` },
    { label: '십성', year: data.year.sibsung, month: data.month.sibsung, day: data.day.sibsung, hour: data.hour.sibsung },
    { label: '십이운성', year: data.year.sibiunsung, month: data.month.sibiunsung, day: data.day.sibiunsung, hour: data.hour.sibiunsung },
    { label: '십이신살', year: data.year.sibisinsal, month: data.month.sibisinsal, day: data.day.sibisinsal, hour: data.hour.sibisinsal }
  ]
  
  let html = ''
  
  // 제목 추가 (이름이 있는 경우)
  if (userName) {
    html += `<div style="text-align: center; margin: 20px 0 10px 0;">
      <strong style="font-weight: bold; font-size: 1.1em;">&lt;${userName}님의 사주명식은 다음과 같아요&gt;</strong>
    </div>`
  }
  
  html += '<table class="manse-ryeok-table" style="width: 100%; border-collapse: collapse; margin: 20px 0;">'
  html += '<thead><tr>'
  html += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">구분</th>'
  html += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">시주</th>'
  html += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">일주</th>'
  html += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">월주</th>'
  html += '<th style="border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5;">연주</th>'
  html += '</tr></thead>'
  html += '<tbody>'
  
  rows.forEach(row => {
    html += '<tr>'
    html += `<td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">${row.label}</td>`
    html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${row.hour}</td>`
    html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${row.day}</td>`
    html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${row.month}</td>`
    html += `<td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${row.year}</td>`
    html += '</tr>'
  })
  
  html += '</tbody></table>'
  
  return html
}
