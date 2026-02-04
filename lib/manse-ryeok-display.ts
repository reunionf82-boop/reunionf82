/**
 * 리절트 페이지와 동일한 만세력 표시용 유틸 (헤더 파싱, 오행 스타일 적용).
 * 음성상담 MVP 등에서 동일한 만세력 UI를 사용할 때 공유.
 */

/** 결과 제목(캡션) 파싱: [이름 : 양력 ... 음력 ... 시] → { name, solar, lunar, branch, timeRange, timeDisplay } */
export function parsePrettyResultTitle(rawTitle: string): {
  name: string
  solar: string
  lunar: string
  branch: string
  timeRange: string
  /** 지지(子시), 숫자(14시), 모름 등 헤더에 그대로 쓸 시간 문자열 */
  timeDisplay: string
  raw: string
} | null {
  const raw = (rawTitle || '').trim()
  if (!raw) return null

  const unwrapped = raw.replace(/^\s*\[/, '').replace(/\]\s*$/, '').trim()
  const colonIdx = unwrapped.indexOf(':')
  if (colonIdx < 0) return null

  const name = unwrapped.slice(0, colonIdx).trim()
  const rest = unwrapped.slice(colonIdx + 1).trim()

  const solarMatch = rest.match(/양력\s*([0-9]{4}년\s*\d{1,2}월\s*\d{1,2}일)/)
  const lunarMatch = rest.match(/음력\s*([0-9]{4}년\s*\d{1,2}월\s*\d{1,2}일)/)
  const timeMatch = rest.match(/([子丑寅卯辰巳午未申酉戌亥])\s*시\s*\(([^)]+)\)/)
  const numTimeMatch = rest.match(/(\d{1,2})\s*시/)
  const branch = timeMatch?.[1] || ''
  const timeRange = timeMatch?.[2]?.replace(/\s+/g, ' ').trim() || ''

  let timeDisplay = ''
  if (timeMatch) {
    timeDisplay = `${branch}시${timeRange ? ` (${timeRange})` : ''}`
  } else if (numTimeMatch) {
    timeDisplay = `${numTimeMatch[1]}시`
  } else if (/모름/.test(rest)) {
    timeDisplay = '모름'
  }

  if (!name || !solarMatch || !lunarMatch) return null

  return {
    name,
    solar: solarMatch[1] || '',
    lunar: lunarMatch[1] || '',
    branch,
    timeRange,
    timeDisplay,
    raw: rawTitle,
  }
}

/** 만세력 테이블 HTML에서 캡션 텍스트 추출 (테이블 상단 캡션 태그) */
export function extractManseCaptionFromTable(tableHtml: string): string | null {
  if (!tableHtml) return null
  const m = tableHtml.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i)
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null
}

/** 캡션 제거한 테이블 HTML 반환 (헤더를 별도로 쓸 때 중복 방지) */
export function stripManseCaption(tableHtml: string): string {
  if (!tableHtml) return ''
  return tableHtml.replace(/<caption[^>]*>[\s\S]*?<\/caption>/i, '').trim()
}

/** 리절트 스타일 헤더 라인 HTML 생성 */
export function buildManseHeaderLineHtml(parsed: {
  name: string
  solar: string
  lunar: string
  branch: string
  timeRange: string
  timeDisplay?: string
}): string {
  const timeLabel = parsed.branch ? `${parsed.branch}시` : '시간'
  const timeText =
    parsed.timeDisplay !== undefined && parsed.timeDisplay !== ''
      ? parsed.timeDisplay
      : parsed.timeRange
        ? `(${parsed.timeRange})`
        : ''
  return (
    '<div class="manse-header-line">' +
    `<div class="manse-header-name">${parsed.name}</div>` +
    '<div class="manse-header-badges">' +
    `<span class="manse-header-badge"><strong>양력</strong> ${parsed.solar}</span>` +
    `<span class="manse-header-badge"><strong>음력</strong> ${parsed.lunar}</span>` +
    `<span class="manse-header-badge"><strong>${timeLabel}</strong> ${timeText}</span>` +
    '</div></div>'
  )
}

/** 만세력 HTML에 오행 스타일 적용 (리절트 페이지와 동일) */
export function applyManseStyles(html: string): string {
  if (!html) return ''

  const elementMap: Record<string, string> = {
    '甲': 'wood', '乙': 'wood', '갑': 'wood', '을': 'wood',
    '丙': 'fire', '丁': 'fire', '병': 'fire', '정': 'fire',
    '戊': 'earth', '己': 'earth', '무': 'earth', '기': 'earth',
    '庚': 'metal', '辛': 'metal', '경': 'metal', '신': 'metal',
    '壬': 'water', '癸': 'water', '임': 'water', '계': 'water',
    '寅': 'wood', '卯': 'wood', '인': 'wood', '묘': 'wood',
    '巳': 'fire', '午': 'fire', '사': 'fire', '오': 'fire',
    '辰': 'earth', '戌': 'earth', '丑': 'earth', '未': 'earth',
    '진': 'earth', '술': 'earth', '축': 'earth', '미': 'earth',
    '申': 'metal', '酉': 'metal', '유': 'metal',
    '子': 'water', '亥': 'water', '자': 'water', '해': 'water',
    '木': 'wood', '목': 'wood',
    '火': 'fire', '화': 'fire',
    '土': 'earth', '토': 'earth',
    '金': 'metal', '금': 'metal',
    '水': 'water', '수': 'water',
  }

  const ganziChars = new Set([
    '甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸',
    '子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥',
    '갑', '을', '병', '정', '무', '기', '경', '신', '임', '계',
    '자', '축', '인', '묘', '진', '사', '오', '미', '유', '술', '해',
  ])

  const normalFontRows = ['십성', '지장간', '십이운성', '십이신살']
  const twoLineRows = ['십성', '지장간', '십이운성', '십이신살']

  if (typeof document === 'undefined') return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const table = doc.querySelector('table')
  if (!table) return html

  const rows = table.querySelectorAll('tr')
  rows.forEach((row) => {
    const cells = row.querySelectorAll('td')
    if (cells.length === 0) return

    const firstCellText = cells[0]?.textContent?.trim() || ''
    const isNormalFontRow = normalFontRows.some((keyword) => firstCellText.includes(keyword))
    const isTwoLineRow = twoLineRows.some((keyword) => firstCellText.includes(keyword))

    cells.forEach((cell, cellIndex) => {
      const text = cell.textContent?.trim() || ''
      if (!text) return
      if (cellIndex === 0) return

      if (isNormalFontRow) {
        if (isTwoLineRow) {
          const idx = text.indexOf('(')
          if (idx > 0 && text.endsWith(')')) {
            const kor = text.slice(0, idx).trim()
            const hanja = text.slice(idx).trim()
            cell.innerHTML = `<span class="manse-two-line"><span class="manse-two-line-kor">${kor}</span><span class="manse-two-line-hanja">${hanja}</span></span>`
          } else {
            cell.textContent = text
          }
        }
        return
      }

      let mainElement: string | null = null
      let hasGanzi = false
      for (const char of text) {
        const element = elementMap[char]
        const isGanzi = ganziChars.has(char)
        if (element && !mainElement) mainElement = element
        if (isGanzi) hasGanzi = true
      }

      if (mainElement || hasGanzi) {
        const elementClass = mainElement ? `manse-element-${mainElement}` : ''
        const ganziClass = hasGanzi ? 'manse-ganzi-char' : ''
        cell.innerHTML = `<span class="${elementClass} ${ganziClass}">${text}</span>`
      }
    })
  })

  return table.outerHTML
}

/**
 * 리절트와 동일한 만세력 블록 HTML 생성 (헤더 + 컨테이너 + 오행 스타일 적용 테이블)
 */
export function buildResultStyleManseBlock(tableHtml: string): string {
  if (!tableHtml) return ''
  const caption = extractManseCaptionFromTable(tableHtml)
  const tableOnly = stripManseCaption(tableHtml)
  const styledTable = applyManseStyles(tableOnly)
  const headerHtml = caption ? (() => {
    const title = (caption.trim().startsWith('[') ? caption : `[${caption}]`).trim()
    const parsed = parsePrettyResultTitle(title)
    return parsed ? buildManseHeaderLineHtml(parsed) : ''
  })() : ''
  return headerHtml + '<div class="manse-ryeok-container">' + styledTable + '</div>'
}
