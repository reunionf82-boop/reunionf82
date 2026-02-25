/**
 * 사용자 위치 기반 날씨 정보 API
 * GET → IP → 위경도(ip-api.com) → OpenWeatherMap → 한국어 날씨 블록
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SEOUL_LAT = 37.5665
const SEOUL_LON = 126.9780
const IPAPI_TIMEOUT_MS = 5000
const OWM_TIMEOUT_MS = 12000

const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토']

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

interface OWMCurrent {
  main?: { temp?: number; feels_like?: number; humidity?: number }
  weather?: { id?: number; main?: string; description?: string }[]
  wind?: { speed?: number }
  rain?: { '1h'?: number }
  snow?: { '1h'?: number }
}

interface OWMForecastItem {
  dt: number
  main?: { temp?: number; temp_min?: number; temp_max?: number }
  weather?: { description?: string }[]
  pop?: number
  rain?: { '3h'?: number }
  snow?: { '3h'?: number }
}

interface OWMForecastResponse {
  list?: OWMForecastItem[]
}

function buildWeatherBlock(city: string, current: OWMCurrent | null, forecast: OWMForecastResponse | null): string {
  const lines: string[] = []

  if (current) {
    const now = new Date()
    const kstHour = (now.getUTCHours() + 9) % 24
    const kstMin = String(now.getUTCMinutes()).padStart(2, '0')
    lines.push(`### 현재 날씨 (${city}, ${kstHour}:${kstMin} 기준)`)
    const m = current.main
    if (m?.temp != null) {
      const feel = m.feels_like != null ? ` (체감 ${Math.round(m.feels_like)}°C)` : ''
      lines.push(`- 기온: ${Math.round(m.temp)}°C${feel}`)
    }
    const desc = current.weather?.[0]?.description
    if (desc) lines.push(`- 날씨: ${desc}`)
    const extras: string[] = []
    if (m?.humidity != null) extras.push(`습도 ${m.humidity}%`)
    if (current.wind?.speed != null) extras.push(`풍속 ${current.wind.speed}m/s`)
    if (extras.length) lines.push(`- ${extras.join(', ')}`)
    const rainMm: number = (current.rain as { '1h'?: number } | undefined)?.['1h'] ?? 0
    const snowMm: number = (current.snow as { '1h'?: number } | undefined)?.['1h'] ?? 0
    if (rainMm > 0 || snowMm > 0) {
      lines.push(`- 강수: ${rainMm > 0 ? `비 ${rainMm}mm` : ''}${rainMm > 0 && snowMm > 0 ? ', ' : ''}${snowMm > 0 ? `눈 ${snowMm}mm` : ''}`)
    } else {
      lines.push('- 강수: 없음')
    }
  }

  const list = forecast?.list
  if (list?.length) {
    const byDay = new Map<string, { temps: number[]; desc: string; pop: number; rain: number }>()
    for (const item of list) {
      const date = new Date(item.dt * 1000)
      const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
      const existing = byDay.get(key)
      const temp = item.main?.temp ?? item.main?.temp_min ?? item.main?.temp_max
      const desc = item.weather?.[0]?.description ?? '알 수 없음'
      const pop = item.pop ?? 0
      const rain = (item.rain?.['3h'] ?? 0) + (item.snow?.['3h'] ?? 0)
      if (!existing) {
        byDay.set(key, { temps: temp != null ? [temp] : [], desc, pop, rain })
      } else {
        if (temp != null) existing.temps.push(temp)
        existing.pop = Math.max(existing.pop, pop)
        existing.rain += rain
      }
    }
    const sortedDays = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 7)
    if (sortedDays.length) {
      lines.push('')
      lines.push('### 5일 예보')
      for (const [key, day] of sortedDays) {
        const [y, m, d] = key.split('-').map(Number)
        const date = new Date(y, m - 1, d)
        const wd = WEEKDAY_KO[date.getDay()]
        const tMin = day.temps.length ? Math.round(Math.min(...day.temps)) : '?'
        const tMax = day.temps.length ? Math.round(Math.max(...day.temps)) : '?'
        const popPct = Math.round(day.pop * 100)
        const precipStr = day.rain > 0 ? `, 강수 ${day.rain.toFixed(1)}mm` : ''
        lines.push(`- ${m}/${d}(${wd}): ${day.desc}, ${tMin}~${tMax}°C, 강수확률 ${popPct}%${precipStr}`)
      }
    }
  }

  return lines.join('\n')
}

export async function GET(request: NextRequest) {
  const rawKey = process.env.OPENWEATHERMAP_API_KEY ?? process.env.OPENWEATHER_API_KEY ?? ''
  const apiKey = rawKey.trim()
  if (!apiKey) {
    return NextResponse.json({ city: '', weatherBlock: '' })
  }

  try {
    const ip = getClientIp(request)
    const geo = await ipToGeo(ip)

    const base = 'https://api.openweathermap.org/data/2.5'
    const units = 'metric'
    const lang = 'kr'
    const q = (params: Record<string, string>) => new URLSearchParams({ ...params, appid: apiKey, units, lang })

    const [currentRes, forecastRes] = await Promise.all([
      fetch(
        `${base}/weather?${q({ lat: String(geo.lat), lon: String(geo.lon) })}`,
        { signal: AbortSignal.timeout(OWM_TIMEOUT_MS) },
      ),
      fetch(
        `${base}/forecast?${q({ lat: String(geo.lat), lon: String(geo.lon) })}`,
        { signal: AbortSignal.timeout(OWM_TIMEOUT_MS) },
      ),
    ])

    let current: OWMCurrent | null = null
    if (currentRes.ok) {
      try {
        current = (await currentRes.json()) as OWMCurrent
      } catch { /* ignore */ }
    }

    let forecast: OWMForecastResponse | null = null
    if (forecastRes.ok) {
      try {
        forecast = (await forecastRes.json()) as OWMForecastResponse
      } catch { /* ignore */ }
    }

    if (!current && !forecast) {
      return NextResponse.json({ city: geo.city, weatherBlock: '' })
    }

    const weatherBlock = buildWeatherBlock(geo.city, current, forecast)
    return NextResponse.json({ city: geo.city, weatherBlock })
  } catch {
    return NextResponse.json({ city: '', weatherBlock: '' })
  }
}
