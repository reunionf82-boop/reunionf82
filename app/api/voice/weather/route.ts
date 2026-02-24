/**
 * 사용자 위치 기반 날씨 정보 API
 * GET → IP → 위경도(ip-api.com) → Open-Meteo KMA → 한국어 날씨 블록
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SEOUL_LAT = 37.5665
const SEOUL_LON = 126.9780
const IPAPI_TIMEOUT_MS = 5000
const OPENMETEO_TIMEOUT_MS = 8000

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

const WMO_CODE_KO: Record<number, string> = {
  0: '맑음',
  1: '대체로 맑음',
  2: '구름 조금',
  3: '흐림',
  45: '안개',
  48: '짙은 안개',
  51: '가랑비',
  53: '이슬비',
  55: '잔비',
  56: '얼어붙는 이슬비',
  57: '얼어붙는 비',
  61: '약한 비',
  63: '비',
  65: '강한 비',
  66: '얼어붙는 비',
  67: '강한 얼어붙는 비',
  71: '약한 눈',
  73: '눈',
  75: '강한 눈',
  77: '싸락눈',
  80: '소나기',
  81: '소나기',
  82: '강한 소나기',
  85: '눈보라',
  86: '강한 눈보라',
  95: '뇌우',
  96: '우박 동반 뇌우',
  99: '강한 우박 동반 뇌우',
}

function wmoToKo(code: number): string {
  return WMO_CODE_KO[code] ?? '알 수 없음'
}

function getClientIp(request: NextRequest): string {
  const h = request.headers
  const cf = h.get('cf-connecting-ip')
  if (cf) return cf
  const vercel = h.get('x-vercel-forwarded-for')
  if (vercel) return vercel.split(',')[0].trim()
  const xff = h.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const real = h.get('x-real-ip')
  if (real) return real
  return '0.0.0.0'
}

interface GeoResult {
  lat: number
  lon: number
  city: string
}

async function ipToGeo(ip: string): Promise<GeoResult> {
  if (!ip || ip === '0.0.0.0' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { lat: SEOUL_LAT, lon: SEOUL_LON, city: '서울' }
  }
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,city,regionName,lat,lon,countryCode`,
      { signal: AbortSignal.timeout(IPAPI_TIMEOUT_MS) },
    )
    const data = await res.json() as { status?: string; lat?: number; lon?: number; city?: string; regionName?: string; countryCode?: string }
    if (data.status === 'success' && data.lat != null && data.lon != null) {
      let cityName = data.city || data.regionName || ''
      if (data.countryCode === 'KR') {
        const koCity = EN_TO_KO_CITY[cityName] ?? EN_TO_KO_CITY[data.regionName ?? '']
        if (koCity) cityName = koCity
      }
      return { lat: data.lat, lon: data.lon, city: cityName || '알 수 없음' }
    }
  } catch { /* fallback */ }
  return { lat: SEOUL_LAT, lon: SEOUL_LON, city: '서울' }
}

const EN_TO_KO_CITY: Record<string, string> = {
  Seoul: '서울', Busan: '부산', Incheon: '인천', Daegu: '대구', Daejeon: '대전',
  Gwangju: '광주', Ulsan: '울산', Sejong: '세종', Suwon: '수원', Seongnam: '성남',
  Goyang: '고양', Yongin: '용인', Bucheon: '부천', Ansan: '안산', Anyang: '안양',
  Changwon: '창원', Cheongju: '청주', Jeonju: '전주', Cheonan: '천안', Gimhae: '김해',
  Jeju: '제주', 'Jeju City': '제주', Pohang: '포항', Gimpo: '김포',
  Gyeonggi: '경기', 'Gyeonggi-do': '경기', 'Gyeongsang': '경상',
  'North Chungcheong': '충북', 'South Chungcheong': '충남',
  'North Gyeongsang': '경북', 'South Gyeongsang': '경남',
  'North Jeolla': '전북', 'South Jeolla': '전남',
  Gangwon: '강원', 'Gangwon-do': '강원',
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number
    relative_humidity_2m?: number
    apparent_temperature?: number
    precipitation?: number
    weather_code?: number
    wind_speed_10m?: number
  }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_sum?: number[]
  }
}

function buildWeatherBlock(city: string, data: OpenMeteoResponse): string {
  const lines: string[] = []
  const c = data.current
  if (c) {
    const now = new Date()
    const kstHour = (now.getUTCHours() + 9) % 24
    const kstMin = String(now.getUTCMinutes()).padStart(2, '0')
    lines.push(`### 현재 날씨 (${city}, ${kstHour}:${kstMin} 기준)`)
    if (c.temperature_2m != null) {
      const feel = c.apparent_temperature != null ? ` (체감 ${Math.round(c.apparent_temperature)}°C)` : ''
      lines.push(`- 기온: ${Math.round(c.temperature_2m)}°C${feel}`)
    }
    if (c.weather_code != null) lines.push(`- 날씨: ${wmoToKo(c.weather_code)}`)
    const extras: string[] = []
    if (c.relative_humidity_2m != null) extras.push(`습도 ${c.relative_humidity_2m}%`)
    if (c.wind_speed_10m != null) extras.push(`풍속 ${c.wind_speed_10m}m/s`)
    if (extras.length) lines.push(`- ${extras.join(', ')}`)
    if (c.precipitation != null) {
      lines.push(`- 강수: ${c.precipitation > 0 ? `${c.precipitation}mm` : '없음'}`)
    }
  }

  const d = data.daily
  if (d?.time?.length) {
    lines.push('')
    lines.push('### 7일 예보')
    for (let i = 0; i < d.time.length && i < 7; i++) {
      const date = new Date(d.time[i] + 'T00:00:00+09:00')
      const m = date.getMonth() + 1
      const day = date.getDate()
      const wd = WEEKDAY_KO[date.getDay()]
      const sky = d.weather_code?.[i] != null ? wmoToKo(d.weather_code[i]) : '?'
      const tMin = d.temperature_2m_min?.[i] != null ? Math.round(d.temperature_2m_min[i]) : '?'
      const tMax = d.temperature_2m_max?.[i] != null ? Math.round(d.temperature_2m_max[i]) : '?'
      const precip = d.precipitation_sum?.[i] != null ? d.precipitation_sum[i] : 0
      const precipStr = precip > 0 ? `, 강수 ${precip}mm` : ''
      lines.push(`- ${m}/${day}(${wd}): ${sky}, ${tMin}~${tMax}°C${precipStr}`)
    }
  }

  return lines.join('\n')
}

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request)
    const geo = await ipToGeo(ip)

    const params = new URLSearchParams({
      latitude: String(geo.lat),
      longitude: String(geo.lon),
      current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
      daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
      timezone: 'Asia/Seoul',
      forecast_days: '7',
      models: 'kma_seamless',
      wind_speed_unit: 'ms',
    })

    const meteoRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?${params}`,
      { signal: AbortSignal.timeout(OPENMETEO_TIMEOUT_MS) },
    )
    if (!meteoRes.ok) {
      console.error('[weather] Open-Meteo 오류:', meteoRes.status)
      return NextResponse.json({ city: geo.city, weatherBlock: '' })
    }
    const meteoData = (await meteoRes.json()) as OpenMeteoResponse
    const weatherBlock = buildWeatherBlock(geo.city, meteoData)

    return NextResponse.json({ city: geo.city, weatherBlock })
  } catch (err: any) {
    console.error('[weather] 날씨 조회 실패:', err?.message ?? err)
    return NextResponse.json({ city: '', weatherBlock: '' })
  }
}
