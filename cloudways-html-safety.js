/**
 * Cloudways 스트리밍 HTML 안전 처리 유틸.
 * 목표:
 * - "완료된 항목" 경계(마커)까지만 자르기
 * - 테이블 내부에서 절대 자르지 않기 (테이블 안으로 다음 내용이 흡수되는 문제 방지)
 * - 최소한의 태그 밸런스 보정(div/table 위주)
 */

const ITEM_START = '<!-- ITEM_START:'
const ITEM_END = '<!-- ITEM_END:'

function stripCodeFences(input) {
  let html = (input || '').toString().trim()
  const htmlBlockMatch = html.match(/```html\s*([\s\S]*?)\s*```/i)
  if (htmlBlockMatch) return htmlBlockMatch[1].trim()
  const codeBlockMatch = html.match(/```\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch) return codeBlockMatch[1].trim()
  return html
}

function normalizeHtmlBasics(html) {
  let out = (html || '').toString()
  out = out.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2')
  out = out.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2')
  out = out.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>')
  // 테이블 앞 불필요한 줄바꿈 제거(기존 유지)
  out = out
    .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
    .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
    .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
    .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
    .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
  out = out.replace(/\*\*/g, '')
  return out
}

function lastIndexOfItemEnd(html) {
  return (html || '').lastIndexOf(ITEM_END)
}

function findSafeCutIndexByMarkers(html) {
  const s = (html || '').toString()
  const idx = lastIndexOfItemEnd(s)
  if (idx < 0) return -1
  const endClose = s.indexOf('-->', idx)
  if (endClose < 0) return -1
  return endClose + 3
}

/**
 * 테이블 내부에 있는지 확인 (table, tr, td, tbody, thead, tfoot 모두 체크)
 * 제안 3: 테이블 관련 태그까지 포함하여 강화
 */
function isInsideUnclosedTable(html, cutIndex) {
  const s = (html || '').toString().slice(0, Math.max(0, cutIndex)).toLowerCase()
  
  // table 태그 체크
  const lastOpenTable = s.lastIndexOf('<table')
  const lastCloseTable = s.lastIndexOf('</table>')
  const isInTable = lastOpenTable > lastCloseTable
  
  if (!isInTable) return false
  
  // 테이블 내부 구조 태그들도 체크 (tr, td, tbody, thead, tfoot)
  const tableTags = {
    'tr': ['<tr', '</tr>'],
    'td': ['<td', '</td>'],
    'th': ['<th', '</th>'],
    'tbody': ['<tbody', '</tbody>'],
    'thead': ['<thead', '</thead>'],
    'tfoot': ['<tfoot', '</tfoot>']
  }
  
  // 테이블이 열려있는 위치부터 cutIndex까지 확인
  const tableStartPos = lastOpenTable
  
  for (const [tagName, [openTag, closeTag]] of Object.entries(tableTags)) {
    const afterTableStart = s.slice(tableStartPos)
    const openCount = (afterTableStart.match(new RegExp(openTag.replace(/[<>]/g, '\\$&'), 'gi')) || []).length
    const closeCount = (afterTableStart.match(new RegExp(closeTag.replace(/[<>]/g, '\\$&'), 'gi')) || []).length
    
    // 닫히지 않은 태그가 있으면 테이블 내부로 판정
    if (openCount > closeCount) {
      return true
    }
  }
  
  // table 자체가 닫히지 않았으면 내부
  return true
}

/**
 * 제안 3: 테이블 내부에서 자르지 않도록 cut 위치를 이동
 * tr/td/tbody 등 하위 태그까지 확인하여 안전한 위치로 이동
 */
function moveCutOutsideTable(html, cutIndex) {
  const s = (html || '').toString()
  let idx = cutIndex
  if (idx < 0) return idx
  if (!isInsideUnclosedTable(s, idx)) return idx

  // 우선: 마지막 열린 <table ...> 의 </table>이 이후에 존재하면 그 뒤로 이동
  const before = s.slice(0, idx).toLowerCase()
  const lastOpen = before.lastIndexOf('<table')
  if (lastOpen >= 0) {
    // 테이블이 닫히는 위치 찾기
    const closePos = s.toLowerCase().indexOf('</table>', lastOpen)
    if (closePos >= 0 && closePos < idx) {
      // 닫히는 위치 이후로 이동
      const afterClose = closePos + '</table>'.length
      
      // 닫힌 이후에도 닫히지 않은 tr/td/tbody가 있는지 확인
      const remaining = s.slice(afterClose, idx).toLowerCase()
      const tableTags = ['tr', 'td', 'th', 'tbody', 'thead', 'tfoot']
      let hasUnclosedTags = false
      
      for (const tag of tableTags) {
        const openTag = `<${tag}`
        const closeTag = `</${tag}>`
        const openCount = (remaining.match(new RegExp(openTag.replace(/[<>]/g, '\\$&'), 'gi')) || []).length
        const closeCount = (remaining.match(new RegExp(closeTag.replace(/[<>]/g, '\\$&'), 'gi')) || []).length
        if (openCount > closeCount) {
          hasUnclosedTags = true
          break
        }
      }
      
      // 닫히지 않은 하위 태그가 없으면 이 위치 사용
      if (!hasUnclosedTags) {
        return afterClose
      }
      
      // 닫히지 않은 태그가 있으면 테이블 시작 전으로 이동
      return lastOpen
    } else if (closePos < 0 || closePos >= idx) {
      // 닫히지 않았거나 cutIndex 이후에 닫히는 경우: 테이블 시작 전으로 되돌려 잘라서 "테이블이 열린 채로 다음 내용이 붙는" 상황 자체를 제거
      return lastOpen
    }
  }
  return idx
}

/**
 * 제안 3: 테이블 관련 태그까지 밸런스 맞추기
 * tr/td/tbody 등도 체크하여 안전하게 닫기
 */
function balanceBasicTags(html) {
  let s = (html || '').toString()

  // table이 열려 있으면 닫기 (중첩/흡수 방지)
  const openTables = (s.match(/<table\b[^>]*>/gi) || []).length
  const closeTables = (s.match(/<\/table>/gi) || []).length
  for (let i = closeTables; i < openTables; i++) {
    s += '</table>'
  }

  // 테이블 내부 태그들도 밸런스 맞추기 (tbody, thead, tfoot, tr, td, th)
  const tableTags = [
    { open: /<tbody\b[^>]*>/gi, close: '</tbody>' },
    { open: /<thead\b[^>]*>/gi, close: '</thead>' },
    { open: /<tfoot\b[^>]*>/gi, close: '</tfoot>' },
    { open: /<tr\b[^>]*>/gi, close: '</tr>' },
    { open: /<td\b[^>]*>/gi, close: '</td>' },
    { open: /<th\b[^>]*>/gi, close: '</th>' }
  ]
  
  for (const { open, close } of tableTags) {
    const openMatches = s.match(open) || []
    const closeMatches = s.match(new RegExp(close.replace(/[<>]/g, '\\$&'), 'gi')) || []
    for (let i = closeMatches.length; i < openMatches.length; i++) {
      s += close
    }
  }

  // div 밸런스 맞추기
  const openDivs = (s.match(/<div\b/gi) || []).length
  const closeDivs = (s.match(/<\/div>/gi) || []).length
  for (let i = closeDivs; i < openDivs; i++) {
    s += '</div>'
  }

  return s
}

/**
 * 제안 4: 2차 요청 이어붙이기 안정화
 * 1차 HTML과 2차 HTML을 안전하게 병합 (중복/깨진 태그 제거)
 */
function mergeSecondRequestHtml(firstHtml, secondHtml) {
  if (!firstHtml) return secondHtml || ''
  if (!secondHtml) return firstHtml || ''
  
  // 2차 HTML에서 중복된 래퍼 태그 제거
  let cleanedSecond = secondHtml.trim()
  
  // 중복 <html>, <body> 제거
  cleanedSecond = cleanedSecond.replace(/^\s*<html[^>]*>/i, '')
  cleanedSecond = cleanedSecond.replace(/<\/html>\s*$/i, '')
  cleanedSecond = cleanedSecond.replace(/^\s*<body[^>]*>/i, '')
  cleanedSecond = cleanedSecond.replace(/<\/body>\s*$/i, '')
  
  // 중복 style 태그 제거 (있을 경우)
  cleanedSecond = cleanedSecond.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
  
  // 첫 번째 HTML 끝에 불완전한 태그가 있으면 정리
  let cleanedFirst = firstHtml.trim()
  cleanedFirst = balanceBasicTags(cleanedFirst)
  
  // 병합
  const merged = cleanedFirst + cleanedSecond
  
  // 최종 밸런스 보정
  return balanceBasicTags(normalizeHtmlBasics(merged))
}

/**
 * 길이 초과 시점에 "완료된 항목"까지만 안전하게 자른 HTML 반환.
 * - 마커가 있으면 마커 기준
 * - 없으면 마지막 </div> 정도로 보수적으로
 * - 테이블 내부 컷 방지 (제안 3)
 * - 마지막에 table/div 밸런스 보정
 */
function safeTrimToCompletedBoundary(rawHtml) {
  let html = normalizeHtmlBasics(stripCodeFences(rawHtml))
  if (!html) return ''

  let cut = findSafeCutIndexByMarkers(html)
  if (cut < 0) {
    // 마커가 없다면 보수적으로 마지막 닫는 </div>까지만
    cut = html.toLowerCase().lastIndexOf('</div>')
    if (cut >= 0) cut += '</div>'.length
  }
  if (cut > 0 && cut < html.length) {
    cut = moveCutOutsideTable(html, cut)
    html = html.slice(0, cut)
  }

  html = balanceBasicTags(html)
  return html
}

module.exports = {
  ITEM_START,
  ITEM_END,
  stripCodeFences,
  normalizeHtmlBasics,
  safeTrimToCompletedBoundary,
  mergeSecondRequestHtml,
  balanceBasicTags,
  isInsideUnclosedTable,
  moveCutOutsideTable,
}
