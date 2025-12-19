import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 프로덕션 환경에서는 puppeteer-core + @sparticuz/chromium 사용
// 개발 환경에서는 puppeteer 사용
const isProduction = process.env.NODE_ENV === 'production'

let puppeteer: any
let chromium: any

if (isProduction) {
  // 프로덕션: puppeteer-core + @sparticuz/chromium
  puppeteer = require('puppeteer-core')
  chromium = require('@sparticuz/chromium')
} else {
  // 개발: puppeteer (Chromium 포함)
  puppeteer = require('puppeteer')
}

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 300 // 5분 타임아웃

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

export async function POST(request: NextRequest) {
  let browser: any = null
  try {
    const body = await request.json()
    const { savedResultId, html, contentName, thumbnailUrl } = body

    if (!savedResultId || !html) {
      return NextResponse.json(
        { error: 'savedResultId와 html은 필수입니다.' },
        { status: 400 }
      )
    }

    console.log('=== 서버 사이드 PDF 생성 시작 ===')
    console.log('저장된 결과 ID:', savedResultId)
    console.log('HTML 길이:', html.length)
    console.log('환경:', isProduction ? 'production' : 'development')
    console.log('Puppeteer 모드:', isProduction && chromium ? 'puppeteer-core + @sparticuz/chromium' : 'puppeteer')

    // Puppeteer 브라우저 실행 (프로덕션 환경 대응)
    let launchOptions: any
    
    try {
      if (isProduction && chromium) {
        // 프로덕션 환경(Vercel 등): @sparticuz/chromium 사용
        console.log('프로덕션 환경: @sparticuz/chromium 사용')
        
        // Chromium 폰트 로드 (Vercel 환경에서 필요할 수 있음)
        try {
          if (typeof chromium.font === 'function') {
            await chromium.font()
            console.log('Chromium 폰트 로드 완료')
          }
        } catch (fontError) {
          console.warn('Chromium 폰트 로드 실패 (무시):', fontError)
        }
        
        // Chromium WebGL 비활성화 (Vercel 환경 최적화)
        // setGraphicsMode는 속성이므로 함수 호출이 아닌 속성 할당
        try {
          if ('setGraphicsMode' in chromium && typeof chromium.setGraphicsMode !== 'function') {
            (chromium as any).setGraphicsMode = false
            console.log('Chromium setGraphicsMode 비활성화 완료')
          }
        } catch (graphicsModeError) {
          console.warn('setGraphicsMode 설정 실패 (무시):', graphicsModeError)
        }
        
        const executablePath = await chromium.executablePath()
        console.log('Chromium 실행 경로:', executablePath)
        
        // Chromium args 확인
        const chromiumArgs = chromium.args || []
        console.log('Chromium 기본 args:', chromiumArgs)
        
        launchOptions = {
          args: [
            ...chromiumArgs,
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-first-run',
            '--no-sandbox',
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
            '--disable-features=VizDisplayCompositor'
          ],
          defaultViewport: chromium.defaultViewport || { width: 1280, height: 720 },
          executablePath: executablePath,
          headless: chromium.headless !== false ? 'new' : false,
          ignoreHTTPSErrors: true
        }
      } else {
        // 개발 환경: 일반 puppeteer 사용
        console.log('개발 환경: puppeteer 사용')
        launchOptions = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        }
      }
      
      console.log('Puppeteer 실행 옵션:', JSON.stringify(launchOptions, null, 2))
      console.log('Puppeteer 브라우저 실행 시도...')
      browser = await puppeteer.launch(launchOptions)
      console.log('Puppeteer 브라우저 실행 성공')
    } catch (launchError: any) {
      console.error('=== Puppeteer 브라우저 실행 실패 ===')
      console.error('에러 타입:', typeof launchError)
      console.error('에러 메시지:', launchError?.message)
      console.error('에러 스택:', launchError?.stack)
      console.error('전체 에러 객체:', JSON.stringify(launchError, Object.getOwnPropertyNames(launchError)))
      throw new Error(`Puppeteer 브라우저 실행 실패: ${launchError?.message || String(launchError)}`)
    }

    const page = await browser.newPage()

    // HTML에서 스타일 태그와 본문 분리
    const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi)
    const styleContent = styleMatch ? styleMatch.join('\n') : ''
    
    // HTML 본문 추출 (스타일 태그 제거)
    let htmlForPdf = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    
    // TTS 버튼 완전 제거 (여러 패턴으로 시도)
    // 1. tts-button-container div 제거
    htmlForPdf = htmlForPdf.replace(/<div[^>]*class="[^"]*tts-button[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    // 2. tts-button-container 클래스를 가진 모든 요소 제거
    htmlForPdf = htmlForPdf.replace(/<[^>]*class="[^"]*tts-button-container[^"]*"[^>]*>[\s\S]*?<\/[^>]*>/gi, '')
    // 3. id="ttsButton" 버튼 제거
    htmlForPdf = htmlForPdf.replace(/<button[^>]*id="ttsButton"[^>]*>[\s\S]*?<\/button>/gi, '')
    // 4. class에 tts-button이 포함된 버튼 제거
    htmlForPdf = htmlForPdf.replace(/<button[^>]*class="[^"]*tts-button[^"]*"[^>]*>[\s\S]*?<\/button>/gi, '')
    // 5. "점사 듣기" 텍스트가 포함된 버튼 제거
    htmlForPdf = htmlForPdf.replace(/<button[^>]*>[\s\S]*?점사\s*듣기[\s\S]*?<\/button>/gi, '')
    // 6. "점사 듣기" 텍스트가 포함된 div 제거
    htmlForPdf = htmlForPdf.replace(/<div[^>]*>[\s\S]*?점사\s*듣기[\s\S]*?<\/div>/gi, '')
    
    // 대표 썸네일이 이미 HTML에 포함되어 있는지 확인
    // 클라이언트에서 전송한 HTML에 이미 대표 썸네일이 있으면 서버에서 추가하지 않음
    const hasMainThumbnail = htmlForPdf.includes('menu-thumbnail') || htmlForPdf.includes('thumbnail-container')
    
    // 완전한 HTML 문서 생성 (클라이언트에서 전송한 스타일 포함)
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
    /* menu-section 스타일 (result 페이지와 동일) */
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
    /* 타이틀 밑 대표 썸네일 전체 폭 스타일 (container padding 무시) */
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
    /* 대제목 썸네일 (menu-thumbnail) 스타일 강제 적용 (result 페이지와 동일) */
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
    /* 북커버 썸네일 스타일 (result 페이지와 동일) */
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
    /* 엔딩북커버 썸네일 스타일 (result 페이지와 동일) */
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
    /* 소제목 썸네일 컨테이너 스타일 강제 적용 (가운데 정렬) */
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
    /* 소제목 썸네일 이미지 스타일 강제 적용 (result 페이지와 동일) */
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
    /* 모든 이미지에 기본 스타일 적용 */
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
    console.log('HTML 콘텐츠 설정 시작...')
    await page.setContent(fullHtml, {
      waitUntil: 'networkidle0',
      timeout: 120000 // 2분으로 증가
    })
    console.log('HTML 콘텐츠 설정 완료')

    // 모든 이미지와 폰트 로드 대기
    console.log('이미지 및 폰트 로드 대기 시작...')
    await page.evaluateHandle(() => document.fonts.ready)
    await new Promise(resolve => setTimeout(resolve, 3000)) // 3초로 증가
    console.log('이미지 및 폰트 로드 대기 완료')
    
    // 스타일 강제 적용 (JavaScript로 직접 적용)
    console.log('스타일 강제 적용 시작...')
    await page.evaluate(() => {
      // 타이틀 밑 대표 썸네일 (thumbnail-container) 전체 폭 적용 (container padding 무시)
      const thumbnailContainers = document.querySelectorAll('.thumbnail-container')
      thumbnailContainers.forEach((container: Element) => {
        const htmlContainer = container as HTMLElement
        // container의 padding(32px * 2 = 64px)을 무시하여 전체 폭 차지
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
      
      // 대제목 썸네일 (menu-thumbnail) 스타일 강제 적용 (result 페이지와 동일)
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
      
      // 북커버 썸네일 스타일 강제 적용 (result 페이지와 동일)
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
      
      // 엔딩북커버 썸네일 스타일 강제 적용 (result 페이지와 동일)
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
      
      // 소제목 썸네일 컨테이너 스타일 강제 적용 (가운데 정렬)
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
        
        // 소제목 썸네일 이미지 스타일 강제 적용 (result 페이지와 동일)
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
      
      // TTS 버튼 완전 제거 (혹시 남아있을 수 있음)
      // 모든 가능한 TTS 버튼 패턴 제거
      const ttsSelectors = [
        '.tts-button-container',
        '.tts-button',
        '#ttsButton',
        'button[id*="tts"]',
        'button[class*="tts"]',
        'div[class*="tts-button"]',
        'button:has-text("점사 듣기")',
        'div:has-text("점사 듣기")'
      ]
      
      ttsSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector)
          elements.forEach(el => el.remove())
        } catch (e) {
          // 셀렉터가 유효하지 않으면 무시
        }
      })
      
      // "점사 듣기" 텍스트가 포함된 모든 요소 제거
      const allElements = document.querySelectorAll('*')
      allElements.forEach(el => {
        if (el.textContent && el.textContent.includes('점사 듣기')) {
          // 버튼이나 div인 경우에만 제거
          if (el.tagName === 'BUTTON' || el.tagName === 'DIV' || el.classList.contains('tts-button') || el.classList.contains('tts-button-container')) {
            el.remove()
          }
        }
      })
    })
    console.log('스타일 강제 적용 완료')

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
    
    // PDF 표준 최대 페이지 크기: 14,400mm (약 54,000px, 96 DPI 기준)
    // 하지만 Puppeteer는 실제로 더 긴 페이지도 생성할 수 있음
    // PDF 뷰어 호환성을 위해 14,400mm 제한을 권장하지만, 시도는 해볼 수 있음
    const MAX_PAGE_HEIGHT_MM = 14400
    const MAX_PAGE_HEIGHT_PX = 54000 // 약 54,000px (96 DPI 기준)
    
    // 대제목 위치 파악 (필요시 페이지 분할용)
    const menuSections = await page.evaluate(() => {
      const sections = Array.from(document.querySelectorAll('.menu-section'))
      return sections.map((section: Element) => {
        const el = section as HTMLElement
        return {
          y: el.offsetTop,
          height: el.offsetHeight
        }
      })
    })
    
    console.log('대제목 개수:', menuSections.length)
    
    // PDF 생성 시도 (단일 긴 페이지)
    // Puppeteer는 커스텀 크기의 단일 페이지 PDF를 생성할 수 있음
    // 하지만 PDF 표준 제약으로 인해 매우 긴 페이지는 문제가 될 수 있음
    let pdfBuffer: Buffer
    
    try {
      // 먼저 단일 긴 페이지로 시도
      console.log('=== 단일 긴 페이지 PDF 생성 시도 ===')
      console.log('페이지 높이:', pageHeight, 'px')
      
      // 페이지 높이가 너무 크면 바로 분할 모드로
      if (pageHeight > MAX_PAGE_HEIGHT_PX) {
        console.log('페이지 높이가 제한을 초과하여 분할 모드로 전환')
        throw new Error('페이지 높이 초과')
      }
      
      pdfBuffer = await Promise.race([
        page.pdf({
          width: '896px', // HTML 폭과 동일
          height: `${pageHeight}px`, // 실제 페이지 높이
          printBackground: true,
          preferCSSPageSize: true, // CSS 페이지 크기 사용
          margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
          }
        }),
        new Promise<Buffer>((_, reject) => 
          setTimeout(() => reject(new Error('PDF 생성 타임아웃 (60초)')), 60000)
        )
      ])
      console.log('단일 페이지 PDF 생성 성공, 크기:', pdfBuffer.length, 'bytes')
    } catch (error: any) {
      console.warn('단일 페이지 생성 실패, 페이지 분할 모드로 전환:', error.message)
      
      // 단일 페이지 생성 실패 시, HTML 폭을 유지하면서 여러 페이지로 나누기
      // Puppeteer는 width를 지정하면 해당 폭을 유지하면서 자동으로 페이지를 나눔
      console.log('=== 페이지 분할 모드 PDF 생성 시작 ===')
      pdfBuffer = await Promise.race([
        page.pdf({
          width: '896px', // HTML 폭 유지
          printBackground: true,
          preferCSSPageSize: false,
          format: 'A4', // A4 높이 기준으로 자동 페이지 나눔 (폭은 896px 유지)
          margin: {
            top: '0',
            right: '0',
            bottom: '0',
            left: '0'
          },
          displayHeaderFooter: false
        }),
        new Promise<Buffer>((_, reject) => 
          setTimeout(() => reject(new Error('PDF 생성 타임아웃 (60초)')), 60000)
        )
      ])
      console.log('페이지 분할 모드 PDF 생성 완료, 크기:', pdfBuffer.length, 'bytes')
    }

    console.log('PDF 생성 완료, 크기:', pdfBuffer.length, 'bytes')

    // 브라우저 종료
    await browser.close()
    browser = null

    // 200MB 제한 확인
    const maxSize = 200 * 1024 * 1024
    if (pdfBuffer.length > maxSize) {
      return NextResponse.json(
        { error: `PDF 파일 크기가 200MB를 초과합니다 (${(pdfBuffer.length / 1024 / 1024).toFixed(2)}MB)` },
        { status: 400 }
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
      return NextResponse.json(
        { error: uploadError.message || 'PDF 업로드에 실패했습니다.' },
        { status: 500 }
      )
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from('pdfs')
      .getPublicUrl(fileName)

    console.log('=== 서버 사이드 PDF 생성 및 업로드 완료 ===')
    console.log('PDF URL:', urlData.publicUrl)

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      path: fileName
    })
  } catch (error: any) {
    console.error('=== 서버 사이드 PDF 생성 오류 ===')
    console.error('에러 타입:', typeof error)
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
    
    return NextResponse.json(
      { 
        error: '서버 오류가 발생했습니다.', 
        details: error?.message || String(error),
        stack: process.env.NODE_ENV === 'development' ? error?.stack : undefined
      },
      { status: 500 }
    )
  }
}
