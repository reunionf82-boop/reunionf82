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
    console.log('OPTIONS 요청 수신, CORS 헤더 반환')
    return new Response(null, { 
      headers: corsHeaders,
      status: 204
    })
  }

  let browser: any = null
  try {
    console.log('=== PDF 생성 요청 수신 ===')
    console.log('요청 메서드:', req.method)
    console.log('요청 URL:', req.url)
    
    const requestBody = await req.json()
    console.log('요청 본문 키:', Object.keys(requestBody))
    console.log('savedResultId:', requestBody.savedResultId)
    console.log('html 길이:', requestBody.html?.length || 0)
    
    const { savedResultId, html, contentName, thumbnailUrl } = requestBody

    if (!savedResultId || !html) {
      console.error('필수 파라미터 누락:', { savedResultId: !!savedResultId, html: !!html })
      return new Response(
        JSON.stringify({ error: 'savedResultId와 html은 필수입니다.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('=== Supabase Edge Function PDF 생성 시작 ===')
    console.log('저장된 결과 ID:', savedResultId)
    console.log('HTML 길이:', html.length)

    // Supabase 클라이언트 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    console.log('Supabase URL 존재:', !!supabaseUrl)
    console.log('Supabase Service Key 존재:', !!supabaseServiceKey)
    
    if (!supabaseUrl || !supabaseServiceKey) {
      const errorMsg = `Supabase 환경 변수가 설정되지 않았습니다. URL: ${!!supabaseUrl}, Key: ${!!supabaseServiceKey}`
      console.error(errorMsg)
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
        console.log('Puppeteer 모듈 로드 시도...')
        const puppeteerModule = await import('https://deno.land/x/puppeteer@16.2.0/mod.ts')
        puppeteer = puppeteerModule.default || puppeteerModule
        console.log('Puppeteer 모듈 로드 성공')
      } catch (e) {
        console.error('Puppeteer import 실패:', e)
        throw new Error(`Puppeteer를 로드할 수 없습니다: ${e.message || String(e)}`)
      }
    }

    // Puppeteer 브라우저 실행
    console.log('Puppeteer 브라우저 실행 시도...')
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
      console.log('Puppeteer 브라우저 실행 성공')
    } catch (launchError: any) {
      console.error('Puppeteer 브라우저 실행 실패:', launchError)
      throw new Error(`브라우저 실행 실패: ${launchError.message || String(launchError)}`)
    }

    const page = await browser.newPage()

    console.log('원본 HTML 길이:', html.length)
    console.log('원본 HTML 처음 500자:', html.substring(0, 500))
    
    // HTML에서 스타일 태그와 본문 분리
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    const styleContent = styleMatch ? styleMatch.join('\n') : ''
    console.log('추출된 스타일 길이:', styleContent.length)
    
    // HTML 본문 추출 (스타일 태그 제거)
    let htmlForPdf = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    console.log('스타일 제거 후 HTML 길이:', htmlForPdf.length)
    
    // HTML 본문이 비어있는지 확인
    if (!htmlForPdf || htmlForPdf.trim().length < 100) {
      console.warn('경고: HTML 본문이 너무 짧습니다. 원본 HTML 사용을 고려합니다.')
      // 원본 HTML을 사용하되 스크립트 태그만 제거
      htmlForPdf = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      console.log('원본 HTML 사용 (스크립트만 제거), 길이:', htmlForPdf.length)
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
    
    console.log('최종 HTML 본문 길이:', htmlForPdf.length)
    console.log('최종 HTML 본문 처음 500자:', htmlForPdf.substring(0, 500))
    
    // 대표 썸네일이 이미 HTML에 포함되어 있는지 확인
    const hasMainThumbnail = htmlForPdf.includes('menu-thumbnail') || htmlForPdf.includes('thumbnail-container')
    console.log('메인 썸네일 포함 여부:', hasMainThumbnail)
    
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

    console.log('생성된 전체 HTML 길이:', fullHtml.length)
    console.log('생성된 전체 HTML 처음 1000자:', fullHtml.substring(0, 1000))
    
    // HTML 콘텐츠 설정
    console.log('HTML 콘텐츠 설정 시작...')
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: 120000
    })
    console.log('HTML 콘텐츠 설정 완료')
    
    // 실제 렌더링된 콘텐츠 확인
    const renderedContent = await page.evaluate(() => {
      return {
        bodyHTML: document.body.innerHTML.substring(0, 500),
        bodyText: document.body.innerText.substring(0, 500),
        bodyLength: document.body.innerHTML.length
      }
    })
    console.log('렌더링된 콘텐츠 정보:', JSON.stringify(renderedContent, null, 2))

    // 모든 이미지와 폰트 로드 대기
    console.log('이미지 및 폰트 로드 대기 시작...')
    
    // 폰트 로드 대기
    await page.evaluateHandle(() => document.fonts.ready)
    console.log('폰트 로드 완료')
    
    // 모든 이미지가 완전히 로드될 때까지 명시적으로 대기
    try {
      await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img')) as HTMLImageElement[]
        console.log(`총 ${images.length}개의 이미지 발견`)
        
        const imageLoadPromises = images.map((img, index) => {
          return new Promise<void>((resolve) => {
            // 이미 완료된 이미지는 즉시 resolve
            if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
              console.log(`이미지 ${index + 1} 이미 로드됨:`, img.src.substring(0, 50))
              resolve()
              return
            }
            
            // 로드 실패한 이미지도 resolve (에러가 있어도 계속 진행)
            if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0) {
              console.warn(`이미지 ${index + 1} 로드 실패:`, img.src.substring(0, 50))
              resolve()
              return
            }
            
            // 타임아웃 설정 (15초)
            const timeout = setTimeout(() => {
              console.warn(`이미지 ${index + 1} 로드 타임아웃:`, img.src.substring(0, 50))
              resolve() // 타임아웃되어도 계속 진행
            }, 15000)
            
            // 로드 성공
            img.onload = () => {
              clearTimeout(timeout)
              console.log(`이미지 ${index + 1} 로드 성공:`, img.src.substring(0, 50))
              resolve()
            }
            
            // 로드 실패
            img.onerror = () => {
              clearTimeout(timeout)
              console.warn(`이미지 ${index + 1} 로드 에러:`, img.src.substring(0, 50))
              resolve() // 에러가 있어도 계속 진행
            }
            
            // 이미 src가 있는데 complete가 false인 경우 재설정하여 로드 강제
            if (img.src && !img.complete) {
              const originalSrc = img.src
              img.src = ''
              setTimeout(() => {
                img.src = originalSrc
              }, 0)
            }
          })
        })
        
        await Promise.all(imageLoadPromises)
        console.log('모든 이미지 로드 처리 완료')
      })
      console.log('이미지 로드 확인 완료')
    } catch (error) {
      console.warn('이미지 로드 확인 중 오류, 계속 진행:', error)
    }
    
    // 추가 안정화 대기 시간 (렌더링 완료 보장)
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // 콘텐츠가 실제로 렌더링되었는지 확인
    const hasContent = await page.evaluate(() => {
      const body = document.body
      const hasText = body.innerText && body.innerText.trim().length > 0
      const hasImages = document.querySelectorAll('img').length > 0
      const bodyHeight = body.scrollHeight
      console.log('콘텐츠 확인:', { hasText, hasImages, bodyHeight })
      return hasText || hasImages || bodyHeight > 100
    })
    
    if (!hasContent) {
      console.warn('경고: 콘텐츠가 렌더링되지 않은 것으로 보입니다. 추가 대기 시간...')
      await new Promise(resolve => setTimeout(resolve, 5000))
    }
    
    console.log('이미지 및 폰트 로드 대기 완료')
    
    // 스타일 강제 적용
    console.log('스타일 강제 적용 시작...')
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
    console.log('스타일 강제 적용 완료')

    // 최종 콘텐츠 확인 및 렌더링 상태 체크
    console.log('최종 콘텐츠 렌더링 상태 확인...')
    const renderStatus = await page.evaluate(() => {
      const body = document.body
      const bodyText = body.innerText || ''
      const bodyHTML = body.innerHTML || ''
      const images = document.querySelectorAll('img')
      const imageStatus = Array.from(images).map((img: HTMLImageElement) => ({
        src: img.src.substring(0, 100),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      }))
      
      return {
        hasText: bodyText.trim().length > 0,
        textLength: bodyText.trim().length,
        hasHTML: bodyHTML.length > 0,
        htmlLength: bodyHTML.length,
        imageCount: images.length,
        imageStatus: imageStatus,
        bodyHeight: body.scrollHeight,
        bodyOffsetHeight: body.offsetHeight
      }
    })
    
    console.log('렌더링 상태:', JSON.stringify(renderStatus, null, 2))
    
    if (renderStatus.textLength === 0 && renderStatus.htmlLength < 100) {
      console.error('경고: 콘텐츠가 거의 없습니다. HTML이 제대로 렌더링되지 않았을 수 있습니다.')
    }
    
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
    
    console.log('페이지 높이:', pageHeight, 'px')
    
    // 최소 높이 확인 (콘텐츠가 있는지 확인)
    if (pageHeight < 100) {
      console.warn('경고: 페이지 높이가 너무 작습니다. 콘텐츠가 렌더링되지 않았을 수 있습니다.')
      // 추가 대기 시간
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // 다시 높이 확인
      const retryHeight = await page.evaluate(() => {
        return Math.max(
          document.body.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.scrollHeight,
          document.documentElement.offsetHeight
        )
      })
      console.log('재시도 후 페이지 높이:', retryHeight, 'px')
    }
    
    const MAX_PAGE_HEIGHT_PX = 54000
    
    // PDF 생성
    let pdfBuffer: Uint8Array
    
    try {
      if (pageHeight > MAX_PAGE_HEIGHT_PX) {
        throw new Error('페이지 높이 초과')
      }
      
      // PDF 생성 옵션 최적화
      pdfBuffer = await Promise.race([
        page.pdf({
          width: '896px',
          height: `${Math.max(pageHeight, 800)}px`, // 최소 높이 보장
          printBackground: true,
          preferCSSPageSize: true,
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
      console.log('단일 페이지 PDF 생성 성공, 크기:', pdfBuffer.length, 'bytes')
      
      // PDF 버퍼가 비어있는지 확인
      if (pdfBuffer.length < 1000) {
        throw new Error('PDF 버퍼가 너무 작습니다 (콘텐츠 없음)')
      }
    } catch (error: any) {
      console.warn('단일 페이지 생성 실패, 페이지 분할 모드로 전환:', error.message)
      
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
      console.log('페이지 분할 모드 PDF 생성 완료, 크기:', pdfBuffer.length, 'bytes')
      
      // PDF 버퍼가 비어있는지 확인
      if (pdfBuffer.length < 1000) {
        throw new Error('PDF 버퍼가 너무 작습니다 (콘텐츠 없음)')
      }
    }

    console.log('PDF 생성 완료, 크기:', pdfBuffer.length, 'bytes')

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
      console.error('Supabase PDF 업로드 에러:', uploadError)
      return new Response(
        JSON.stringify({ error: uploadError.message || 'PDF 업로드에 실패했습니다.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName)

    console.log('=== Supabase Edge Function PDF 생성 및 업로드 완료 ===')
    console.log('PDF URL:', urlData.publicUrl)

    return new Response(
      JSON.stringify({
        success: true,
        url: urlData.publicUrl,
        path: fileName
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('=== Supabase Edge Function PDF 생성 오류 ===')
    console.error('에러 타입:', typeof error)
    console.error('에러 이름:', error?.name)
    console.error('에러 메시지:', error?.message || String(error))
    console.error('에러 스택:', error?.stack || 'N/A')
    console.error('전체 에러 객체:', JSON.stringify(error, Object.getOwnPropertyNames(error)))
    
    // 브라우저가 열려있으면 종료
    if (browser) {
      try {
        console.log('브라우저 종료 시도...')
        await browser.close()
        console.log('브라우저 종료 완료')
      } catch (closeError) {
        console.error('브라우저 종료 실패:', closeError)
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
