import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Deno용 Puppeteer - Supabase Edge Functions 환경에 맞게 수정
// 참고: Supabase Edge Functions는 Deno 런타임을 사용하므로 Deno용 Puppeteer 필요
// 주의: Supabase Edge Functions는 Puppeteer 실행에 제한이 있을 수 있음
let puppeteer: any = null

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

serve(async (req) => {
  // CORS preflight 요청 처리
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      headers: corsHeaders,
      status: 204
    })
  }

  let browser: any = null
  try {
    const requestBody = await req.json()
    const { savedResultId, html, contentName, thumbnailUrl } = requestBody

    if (!savedResultId || !html) {
      return new Response(
        JSON.stringify({ error: 'savedResultId와 html은 필수입니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !supabaseServiceKey) {
      const errorMsg = `Supabase 환경 변수가 설정되지 않았습니다. URL: ${!!supabaseUrl}, Key: ${!!supabaseServiceKey}`
      throw new Error(errorMsg)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Puppeteer 동적 로드 (함수 내에서)
    if (!puppeteer) {
      try {
        const puppeteerModule = await import('https://deno.land/x/puppeteer@16.2.0/mod.ts')
        puppeteer = puppeteerModule.default || puppeteerModule
      } catch (e) {
        throw new Error(`Puppeteer를 로드할 수 없습니다: ${e.message || String(e)}`)
      }
    }

    // Puppeteer 브라우저 실행
    try {
      browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-software-rasterizer',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--disable-notifications',
        '--disable-popup-blocking',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--use-mock-keychain'
      ]
      })
    } catch (launchError: any) {
      throw new Error(`브라우저 실행 실패: ${launchError.message || String(launchError)}`)
    }

    const page = await browser.newPage()
    // HTML에서 스타일 태그와 본문 분리
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    const styleContent = styleMatch ? styleMatch.join('\n') : ''
    // HTML 본문 추출 (스타일 태그 제거)
    let htmlForPdf = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // HTML 본문이 비어있는지 확인
    if (!htmlForPdf || htmlForPdf.trim().length < 100) {
      // 원본 HTML을 사용하되 스크립트 태그만 제거
      htmlForPdf = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    }
    
    // TTS 버튼 완전 제거
    htmlForPdf = htmlForPdf.replace(/<div[^>]*class="[^"]*tts-button[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    htmlForPdf = htmlForPdf.replace(/<[^>]*class="[^"]*tts-button-container[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    htmlForPdf = htmlForPdf.replace(/<button[^>]*id="ttsButton"[^>]*>[\s\S]*?<\/button>/gi, '')
    htmlForPdf = htmlForPdf.replace(/<button[^>]*class="[^"]*tts-button[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
    htmlForPdf = htmlForPdf.replace(/<button[^>]*>[\s\S]*?점사\s*듣기[\s\S]*?<\/button>/gi, '')
    htmlForPdf = htmlForPdf.replace(/<div[^>]*>[\s\S]*?점사\s*듣기[\s\S]*?<\/div>/gi, '')
    
    // 스크립트 태그 제거 (PDF에서 실행될 필요 없음)
    htmlForPdf = htmlForPdf.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // 대표 썸네일이 이미 HTML에 포함되어 있는지 확인
    const hasMainThumbnail = htmlForPdf.includes('menu-thumbnail') || htmlForPdf.includes('thumbnail-container')
    // 완전한 HTML 문서 생성
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${contentName || '재회 결과'}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #f9fafb;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
    }
    .container {
      max-width: 896px;
      margin: 0 auto;
      background: #f9fafb;
      padding: 32px 16px;
    }
    .menu-section {
      background: white !important;
      border-radius: 12px !important;
      padding: 24px !important;
      margin-bottom: 24px !important;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important;
    }
    .menu-title {
      font-size: 20px !important;
      font-weight: bold !important;
      margin-bottom: 16px !important;
      color: #111 !important;
    }
    .thumbnail-container {
      width: calc(100% + 64px) !important;
      max-width: calc(100% + 64px) !important;
      margin-left: -32px !important;
      margin-right: -32px !important;
      padding: 0 !important;
      box-sizing: border-box !important;
    }
    .thumbnail-container img {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      object-fit: cover !important;
      display: block !important;
    }
    h1 {
      text-align: center;
      font-size: 30px;
      font-weight: bold;
      margin: 0 0 16px 0;
      color: #111;
    }
    .menu-thumbnail,
    img.menu-thumbnail {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
      border-radius: 8px !important;
      margin-bottom: 24px !important;
      box-sizing: border-box !important;
    }
    .book-cover-thumbnail-container {
      width: 100% !important;
      margin-bottom: 2.5rem !important;
    }
    .book-cover-thumbnail-container img {
      width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
    }
    .ending-book-cover-thumbnail-container {
      width: 100% !important;
      margin-top: 1rem !important;
    }
    .ending-book-cover-thumbnail-container img {
      width: 100% !important;
      height: auto !important;
      object-fit: contain !important;
      display: block !important;
    }
    .subtitle-thumbnail-container {
      display: flex !important;
      justify-content: center !important;
      align-items: center !important;
      width: 50% !important;
      max-width: 50% !important;
      margin-left: auto !important;
      margin-right: auto !important;
      margin-top: 0.5rem !important;
      margin-bottom: 0.5rem !important;
      box-sizing: border-box !important;
    }
    .subtitle-thumbnail-container img {
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      display: block !important;
      border-radius: 8px !important;
      -webkit-border-radius: 8px !important;
      -moz-border-radius: 8px !important;
      object-fit: contain !important;
      box-sizing: border-box !important;
    }
    img {
      max-width: 100% !important;
      height: auto !important;
    }
    ${styleContent}
  </style>
</head>
<body>
  <div class="container">
    ${!hasMainThumbnail && thumbnailUrl ? `<div class="thumbnail-container"><img src="${thumbnailUrl}" alt="${contentName || '재회 결과'}" style="width: 100%; height: auto; object-fit: cover; margin-bottom: 16px;" /></div>` : ''}
    ${htmlForPdf}
  </div>
</body>
</html>
    `
    // HTML 콘텐츠 설정
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: 120000
    })
    // 실제 렌더링된 콘텐츠 확인
    const renderedContent = await page.evaluate(() => {
      return {
        bodyHTML: document.body.innerHTML.substring(0, 500),
        bodyText: document.body.innerText.substring(0, 500),
        bodyLength: document.body.innerHTML.length
      }
    })
    // 모든 이미지와 폰트 로드 대기
    // 폰트 로드 대기
    await page.evaluateHandle(() => document.fonts.ready)
    // 간단한 이미지 로드 확인 (복잡한 로직 제거, networkidle0이 이미 처리함)
    const imageCount = await page.evaluate(() => {
      return document.querySelectorAll('img').length
    })
    // networkidle0이 이미 이미지 로드를 처리했으므로 추가 대기만
    await new Promise(resolve => setTimeout(resolve, 2000))
    // 스타일 강제 적용
    await page.evaluate(() => {
      const thumbnailContainers = document.querySelectorAll('.thumbnail-container')
      thumbnailContainers.forEach((container: Element) => {
        const htmlContainer = container as HTMLElement
        htmlContainer.style.width = 'calc(100% + 64px)'
        htmlContainer.style.maxWidth = 'calc(100% + 64px)'
        htmlContainer.style.marginLeft = '-32px'
        htmlContainer.style.marginRight = '-32px'
        htmlContainer.style.padding = '0'
        htmlContainer.style.boxSizing = 'border-box'
        
        const img = container.querySelector('img')
        if (img) {
          const htmlImg = img as HTMLElement
          htmlImg.style.width = '100%'
          htmlImg.style.maxWidth = '100%'
          htmlImg.style.height = 'auto'
          htmlImg.style.display = 'block'
          htmlImg.style.objectFit = 'contain'
        }
      })
      
      const menuThumbnails = document.querySelectorAll('.menu-thumbnail, img.menu-thumbnail')
      menuThumbnails.forEach((img: Element) => {
        const htmlImg = img as HTMLElement
        htmlImg.style.width = '100%'
        htmlImg.style.height = 'auto'
        htmlImg.style.display = 'block'
        htmlImg.style.objectFit = 'contain'
        htmlImg.style.borderRadius = '8px'
        htmlImg.style.marginBottom = '24px'
        htmlImg.style.maxWidth = '100%'
        htmlImg.style.boxSizing = 'border-box'
      })
      
      const bookCoverContainers = document.querySelectorAll('.book-cover-thumbnail-container')
      bookCoverContainers.forEach((container: Element) => {
        const htmlContainer = container as HTMLElement
        htmlContainer.style.width = '100%'
        htmlContainer.style.marginBottom = '2.5rem'
        
        const img = container.querySelector('img')
        if (img) {
          const htmlImg = img as HTMLElement
          htmlImg.style.width = '100%'
          htmlImg.style.height = 'auto'
          htmlImg.style.objectFit = 'contain'
          htmlImg.style.display = 'block'
        }
      })
      
      const endingBookCoverContainers = document.querySelectorAll('.ending-book-cover-thumbnail-container')
      endingBookCoverContainers.forEach((container: Element) => {
        const htmlContainer = container as HTMLElement
        htmlContainer.style.width = '100%'
        htmlContainer.style.marginTop = '1rem'
        
        const img = container.querySelector('img')
        if (img) {
          const htmlImg = img as HTMLElement
          htmlImg.style.width = '100%'
          htmlImg.style.height = 'auto'
          htmlImg.style.objectFit = 'contain'
          htmlImg.style.display = 'block'
        }
      })
      
      const subtitleContainers = document.querySelectorAll('.subtitle-thumbnail-container')
      subtitleContainers.forEach((container: Element) => {
        const htmlContainer = container as HTMLElement
        htmlContainer.style.display = 'flex'
        htmlContainer.style.justifyContent = 'center'
        htmlContainer.style.alignItems = 'center'
        htmlContainer.style.width = '50%'
        htmlContainer.style.maxWidth = '50%'
        htmlContainer.style.marginLeft = 'auto'
        htmlContainer.style.marginRight = 'auto'
        htmlContainer.style.marginTop = '0.5rem'
        htmlContainer.style.marginBottom = '0.5rem'
        htmlContainer.style.boxSizing = 'border-box'
        
        const img = container.querySelector('img')
        if (img) {
          const htmlImg = img as HTMLElement
          htmlImg.style.width = '100%'
          htmlImg.style.maxWidth = '100%'
          htmlImg.style.height = 'auto'
          htmlImg.style.display = 'block'
          htmlImg.style.borderRadius = '8px'
          htmlImg.style.objectFit = 'contain'
          htmlImg.style.boxSizing = 'border-box'
        }
      })
      
      // TTS 버튼 제거
      const ttsSelectors = [
        '.tts-button-container',
        '.tts-button',
        '#ttsButton',
        'button[id*="tts"]',
        'button[class*="tts"]',
        'div[class*="tts-button"]'
      ]
      
      ttsSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector)
          elements.forEach(el => el.remove())
        } catch (e) {
          // 무시
        }
      })
      
      const allElements = document.querySelectorAll('*')
      allElements.forEach(el => {
        if (el.textContent && el.textContent.includes('점사 듣기')) {
          if (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.classList.contains('tts-button') || el.classList.contains('tts-button-container')) {
            el.remove()
          }
        }
      })
    })
    // 페이지 높이 계산
    const pageHeight = await page.evaluate(() => {
      return Math.max(
        document.body.scrollHeight,
        document.body.offsetHeight,
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight
      )
    })
    const MAX_PAGE_HEIGHT_PX = 54000
    
    // PDF 생성
    let pdfBuffer: Uint8Array
    
    try {
      if (pageHeight > MAX_PAGE_HEIGHT_PX) {
        throw new Error('페이지 높이 초과')
      }
      
      // PDF 생성 옵션 (preferCSSPageSize: false로 변경하여 height 설정이 적용되도록)
      pdfBuffer = await Promise.race([
        page.pdf({
          width: '896px',
          height: `${pageHeight}px`,
          printBackground: true,
          preferCSSPageSize: false,
          displayHeaderFooter: false,
          margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
          }
        }) as Promise<Uint8Array>,
        new Promise<Uint8Array>((_, reject) => 
          setTimeout(() => reject(new Error('PDF 생성 타임아웃 (60초)')), 60000)
        )
      ])
    } catch (error: any) {
      pdfBuffer = await Promise.race([
        page.pdf({
          width: '896px',
          printBackground: true,
          preferCSSPageSize: false,
          format: 'A4',
          displayHeaderFooter: false,
          margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
          }
        }) as Promise<Uint8Array>,
        new Promise<Uint8Array>((_, reject) => 
          setTimeout(() => reject(new Error('PDF 생성 타임아웃 (60초)')), 60000)
        )
      ])
    }
    // 브라우저 종료
    await browser.close()
    browser = null

    // 200MB 제한 확인
    const maxSize = 200 * 1024 * 1024
    if (pdfBuffer.length > maxSize) {
      return new Response(
        JSON.stringify({ error: `PDF 파일 크기가 200MB를 초과합니다 (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Supabase Storage에 업로드
    const fileName = `${savedResultId}.pdf`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('pdfs')
      .upload(fileName, pdfBuffer, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'application/pdf'
      })

    if (uploadError) {
      return new Response(
        JSON.stringify({ error: uploadError.message || 'PDF 업로드에 실패했습니다.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName)
    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        path: fileName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    // 브라우저가 열려있으면 종료
    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
      }
    }
    
    // 상세 에러 정보 반환 (개발 환경에서 디버깅 용이)
    const errorDetails = {
      message: error?.message || '서버 오류가 발생했습니다.',
      name: error?.name || 'UnknownError',
      stack: error?.stack || 'N/A',
      type: typeof error
    }
    
    return new Response(
      JSON.stringify({ 
        error: '서버 오류가 발생했습니다.', 
        details: errorDetails
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
