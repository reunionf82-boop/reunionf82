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