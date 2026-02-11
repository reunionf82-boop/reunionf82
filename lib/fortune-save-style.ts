/**
 * 점사 결과 저장 시 사용하는 스타일 적용 HTML 생성 (서버/클라이언트 공통)
 * result 페이지 saveResultToLocal과 동일한 스타일을 적용한다.
 */
export function buildStyledFortuneHtml(
  content: Record<string, any> | null,
  html: string,
  startTime?: number | null
): string {
  const fontFace = content?.font_face || ''
  const menuFontSize = content?.menu_font_size || 16
  const menuFontBold = content?.menu_font_bold || false
  const subtitleFontSize = content?.subtitle_font_size || 14
  const subtitleFontBold = content?.subtitle_font_bold || false
  const detailMenuFontSize = content?.detail_menu_font_size || 12
  const detailMenuFontBold = content?.detail_menu_font_bold || false
  const bodyFontSize = content?.body_font_size || 11
  const bodyFontBold = content?.body_font_bold || false
  const menuColor = content?.menu_color || ''
  const subtitleColor = content?.subtitle_color || ''
  const detailMenuColor = content?.detail_menu_color || ''
  const bodyColor = content?.body_color || ''

  const completeStyle = `
<style>
${fontFace ? fontFace : ''}
.jeminai-results .menu-title {
  font-size: ${menuFontSize}px !important;
  font-weight: ${menuFontBold ? 'bold' : 'normal'} !important;
  line-height: 1.6 !important;
  ${menuColor ? `color: ${menuColor} !important;` : ''}
}
.jeminai-results .subtitle-title {
  font-size: ${subtitleFontSize}px !important;
  font-weight: ${subtitleFontBold ? 'bold' : 'normal'} !important;
  ${subtitleColor ? `color: ${subtitleColor} !important;` : ''}
}
.jeminai-results .detail-menu-title {
  font-size: ${detailMenuFontSize}px !important;
  font-weight: ${detailMenuFontBold ? 'bold' : 'normal'} !important;
  ${detailMenuColor ? `color: ${detailMenuColor} !important;` : ''}
}
.jeminai-results .subtitle-content {
  font-size: ${bodyFontSize}px !important;
  font-weight: ${bodyFontBold ? 'bold' : 'normal'} !important;
  margin-bottom: 2em !important;
  line-height: 1.8 !important;
  ${bodyColor ? `color: ${bodyColor} !important;` : ''}
}
.jeminai-results .detail-menu-content {
  font-size: ${bodyFontSize}px !important;
  font-weight: ${bodyFontBold ? 'bold' : 'normal'} !important;
  line-height: 1.8 !important;
  margin-bottom: 0 !important;
  ${bodyColor ? `color: ${bodyColor} !important;` : ''}
}
.jeminai-results .detail-menu-container {
  margin-bottom: 2em !important;
}
.jeminai-results .detail-menu-section {
  margin-bottom: 2em !important;
}
.jeminai-results .detail-menu-section:last-child {
  margin-bottom: 0 !important;
}
.jeminai-results .subtitle-section {
  padding-top: 24px;
  padding-bottom: 24px;
  position: relative;
}
.jeminai-results .subtitle-section:not(:last-child)::after {
  content: '';
  display: block;
  width: 300px;
  height: 2px;
  background: linear-gradient(to right, transparent, #e5e7eb, transparent);
  margin: 24px auto 0;
}
.jeminai-results .subtitle-section:last-child {
  padding-top: 24px;
  padding-bottom: 24px;
}
.loading-dots {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.loading-dots .dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #ec4899;
  opacity: 0.3;
  animation: dot-bounce 1s infinite;
}
.loading-dots .dot:nth-child(2) { animation-delay: 0.15s; }
.loading-dots .dot:nth-child(3) { animation-delay: 0.3s; }
@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
  40% { transform: translateY(-4px); opacity: 1; }
}
</style>
`
  return completeStyle + (html || '')
}
