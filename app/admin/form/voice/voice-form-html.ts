/** HTML 보호 스타일 주입 및 이미지 URL 추출 (TSX 파서 혼동 방지를 위해 .ts로 분리) */

const PROTECTION_STYLE =
  '<style>html,body,*{user-select:none;-webkit-user-select:none}img,video{user-drag:none}</style>'

export function buildProtectedHtml(html: string): string {
  if (!html || !html.trim())
    return '<!doctype html><html><head>' + PROTECTION_STYLE + '</head><body></body></html>'
  const headRe = new RegExp('\\x3chead[^>]*>', 'i')
  const htmlRe = new RegExp('\\x3chtml[^>]*>', 'i')
  if (headRe.test(html)) return html.replace(headRe, (m) => m + '\n' + PROTECTION_STYLE)
  if (htmlRe.test(html)) return html.replace(htmlRe, (m) => m + '\n<head>' + PROTECTION_STYLE + '</head>')
  return '<!doctype html><html><head>' + PROTECTION_STYLE + '</head><body>' + html + '</body></html>'
}

const IMG_SRC_REGEX = new RegExp('\\x3cimg[^>]+src=["\']([^"\']+)["\'][^>]*>', 'gi')

export function extractImageUrlsFromHtml(htmlContent: string): string[] {
  const extracted: string[] = []
  let match
  while ((match = IMG_SRC_REGEX.exec(htmlContent)) !== null) extracted.push(match[1])
  return extracted
}
