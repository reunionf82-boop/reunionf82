// Cloudways Node.js 서버 (점사 AI 백엔드) - 완전 버전
// Supabase Edge Function의 모든 로직을 포함한 완전한 버전
// 이 파일을 Cloudways의 public_html 폴더에 업로드하세요

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const app = express();

// dotenv 지원 (환경 변수 로드)
try {
  require('dotenv').config();
} catch (e) {
}

// 1. 보안 설정 (Vercel에서 오는 요청만 허용)
app.use(cors({
    origin: '*', // 프로덕션에서는 특정 도메인으로 제한: ['https://reunion.fortune82.com']
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // 큰 요청 본문 허용

// 2. 타임아웃 무제한 설정 (핵심!)
app.timeout = 0;

// 3. API 키 설정 (환경 변수 또는 직접 입력)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_JEMINAI_API_URL || '여기에_Gemini_API_키를_입력하세요';

if (!GEMINI_API_KEY || GEMINI_API_KEY === '여기에_Gemini_API_키를_입력하세요') {
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// OPTIONS 요청 처리 (CORS preflight)
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(204);
});

// 프롬프트 생성 함수 (Supabase Edge Function과 동일)
function buildPrompt(body) {
  const {
    role_prompt,
    restrictions,
    menu_subtitles,
    user_info,
    partner_info,
    menu_items,
    model = 'gemini-3-flash-preview',
    manse_ryeok_table,
    manse_ryeok_text,
    manse_ryeok_json,
    day_gan_info,
    isSecondRequest,
    completedSubtitles,
    completedSubtitleIndices
  } = body;

  // 한국의 현재 날짜/시간
  const now = new Date();
  const koreaFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const koreaDateString = koreaFormatter.format(now);
  const koreaYearFormatter = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  });
  const currentYear = parseInt(koreaYearFormatter.format(now));

  const menuItemsInfo = menu_items ? menu_items.map((item, idx) => {
    const menuTitle = typeof item === 'string' ? item : (item.value || item.title || '');
    const menuThumbnail = typeof item === 'object' ? (item.thumbnail || '') : '';
    return {
      index: idx,
      title: menuTitle,
      thumbnail: menuThumbnail
    };
  }) : [];

  // 프롬프트 생성 (Supabase Edge Function과 동일한 로직)
  let prompt = `
${isSecondRequest ? `
🚨🚨🚨 **중요: 2차 요청입니다. 절대 처음부터 다시 시작하지 마세요!** 🚨🚨🚨

**이미 완료된 소제목 목록 (절대 포함하지 마세요!):**
${completedSubtitles && completedSubtitles.length > 0 ? completedSubtitles.map((sub, idx) => {
  const subtitleText = typeof sub === 'string' ? sub : (sub.subtitle || sub.title || `소제목 ${idx + 1}`);
  return `- ${subtitleText} (이미 완료됨, 건너뛰세요)`;
}).join('\n') : '없음'}

**⚠️⚠️⚠️ 반드시 준수할 사항 (매우 중요!):** ⚠️⚠️⚠️
1. **위에 나열된 완료된 소제목은 절대 포함하지 마세요.** 이미 해석이 완료되었으므로 건너뛰세요.
2. **처음부터 다시 시작하지 마세요.** 아래에 나열된 남은 메뉴/소제목만 해석하세요.
3. **이전 요청의 HTML 구조나 내용을 반복하지 마세요.** 오직 남은 소제목만 새로 생성하세요.
4. **메뉴 제목이나 썸네일을 다시 생성하지 마세요.** 남은 소제목의 해석 내용만 생성하세요.
5. **완료된 소제목의 HTML을 생성하지 마세요.** 오직 남은 소제목만 HTML로 작성하세요.
6. **완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 HTML에 포함하지 마세요!**

이전 요청에서 타임아웃으로 인해 일부만 완료되었으므로, 남은 부분만 이어서 해석합니다.
**🚨🚨🚨 다시 강조: 위에 나열된 완료된 소제목은 건너뛰고, 아래 남은 소제목만 해석하세요! 처음부터 다시 시작하지 마세요! 🚨🚨🚨**
` : ''}
당신은 ${role_prompt}입니다.

---

# [입력 데이터]

**만세력 정보:**
${manse_ryeok_text || '만세력 텍스트 없음'}

${manse_ryeok_table ? `**만세력 테이블:**\n${manse_ryeok_table}` : ''}

${day_gan_info ? `**일간 정보:**\n- 한글명: ${day_gan_info.fullName}\n- 간지: ${day_gan_info.gan}\n- 한자: ${day_gan_info.hanja}\n- 오행: ${day_gan_info.ohang}` : ''}

${restrictions ? `금칙사항: ${restrictions}` : ''}

사용자 정보:
- 이름: ${user_info.name}
${user_info.gender ? `- 성별: ${user_info.gender}` : ''}
- 생년월일/생시는 보안상 제공하지 않습니다.
${partner_info ? `
이성 정보:
- 이름: ${partner_info.name}
${partner_info.gender ? `- 성별: ${partner_info.gender}` : ''}
- 생년월일/생시는 보안상 제공하지 않습니다.
` : ''}

---

**중요: 현재 날짜 정보**
- 오늘은 ${koreaDateString}입니다.
- 현재 연도는 ${currentYear}년입니다.
- 해석할 때 반드시 이 날짜 정보를 기준으로 하세요. 과거 연도(예: 2024년)를 언급하지 마세요.

${isSecondRequest ? `
**⚠️ 아래에 나열된 남은 소제목만 해석하세요. 위에 나열된 완료된 소제목은 절대 포함하지 마세요!**
` : ''}

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요:

${menuItemsInfo.map((menuItem, menuIdx) => {
  const menuNumber = menuIdx + 1;
  const subtitlesForMenu = menu_subtitles.filter((sub, idx) => {
    const match = sub.subtitle.match(/^(\d+)-(\d+)/);
    return match ? parseInt(match[1]) === menuNumber : false;
  });
  
  if (isSecondRequest && subtitlesForMenu.length === 0) {
    return '';
  }
  
  return `
메뉴 ${menuNumber}: ${menuItem.title}
${menuItem.thumbnail ? `썸네일 URL: ${menuItem.thumbnail}` : ''}

${isSecondRequest ? `**⚠️ 이 메뉴의 아래 소제목들만 해석하세요. 위에 나열된 완료된 소제목은 건너뛰세요!**` : ''}

이 메뉴의 소제목들:
${subtitlesForMenu.map((sub, subIdx) => {
    const globalSubIdx = menu_subtitles.findIndex((s) => s.subtitle === sub.subtitle);
    const tool = menu_subtitles[globalSubIdx]?.interpretation_tool || '';
    const charCount = menu_subtitles[globalSubIdx]?.char_count || 500;
    const thumbnail = menu_subtitles[globalSubIdx]?.thumbnail || '';
    return `
  ${sub.subtitle}
  - 해석도구: ${tool}
  - 글자수 제한: ${charCount}자 이내
  ${thumbnail ? `- 썸네일 URL: ${thumbnail} (반드시 HTML에 포함하세요!)` : ''}
`;
  }).join('\n')}
`;
}).filter((menuText) => menuText.trim().length > 0).join('\n\n')}

각 메뉴별로 다음 HTML 형식으로 결과를 작성해주세요:
${isSecondRequest ? `
🚨🚨🚨 **2차 요청 주의사항 (반드시 준수):** 🚨🚨🚨
1. **위에 나열된 남은 메뉴/소제목만 HTML로 작성하세요.**
2. **이전에 완료된 메뉴나 소제목은 절대 포함하지 마세요.**
3. **처음부터 다시 시작하지 마세요.**
4. **메뉴 제목이나 썸네일을 다시 생성하지 마세요. 남은 소제목의 해석 내용만 생성하세요.**
5. **이전 요청의 HTML 구조를 반복하지 마세요.**
6. **완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 HTML에 포함하지 마세요!**
` : ''}

<div class="menu-section">
  <h2 class="menu-title">[메뉴 제목]</h2>
  ${menuItemsInfo.some((m) => m.thumbnail) ? '<img src="[썸네일 URL]" alt="[메뉴 제목]" class="menu-thumbnail" />' : ''}
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[소제목]</h3>
    ${menu_subtitles.some((s) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[소제목 썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div>
  </div>
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[다음 소제목]</h3>
    ${menu_subtitles.some((s) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[소제목 썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용 (HTML 형식, 글자수 제한 준수)]</div>
  </div>
  
  ...
</div>

중요:
1. 각 메뉴는 <div class="menu-section">으로 구분
2. 메뉴 제목은 <h2 class="menu-title">으로 표시
3. 썸네일이 있으면 <img src="[URL]" alt="[제목]" class="menu-thumbnail" />로 표시
4. 각 소제목은 <div class="subtitle-section">으로 구분
5. 소제목 제목은 <h3 class="subtitle-title">으로 표시하되, 소제목 끝에 반드시 마침표(.)를 추가하세요. 예: <h3 class="subtitle-title">1-1. 나의 타고난 '기본 성격'과 '가치관'.</h3>
6. **소제목 썸네일이 제공된 경우 (위 소제목 목록에 "썸네일 URL"이 표시된 경우), 반드시 <h3 class="subtitle-title"> 태그 바로 다음에 <div class="subtitle-thumbnail-container"><img src="[썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>를 포함하세요. 썸네일이 없으면 포함하지 마세요.**
7. 해석 내용은 <div class="subtitle-content"> 안에 HTML 형식으로 작성
8. 각 content는 해당 subtitle의 char_count를 초과하지 않도록 주의
${isSecondRequest ? '9. 🚨🚨🚨 **2차 요청: 아래에 나열된 남은 메뉴/소제목만 포함하세요. 이전에 완료된 내용은 절대 포함하지 마세요. 처음부터 다시 시작하지 말고, 남은 소제목부터만 해석하세요. 메뉴 제목이나 썸네일을 다시 생성하지 마세요. 오직 남은 소제목의 해석 내용만 생성하세요. 위에 나열된 완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 포함하지 마세요!** 🚨🚨🚨' : '9. 모든 메뉴와 소제목을 순서대로 포함'}
10. 소제목 제목에 마침표가 없으면 자동으로 마침표를 추가하세요 (TTS 재생 시 자연스러운 구분을 위해)
11. 소제목 제목과 해석 내용 사이에 빈 줄이나 공백을 절대 넣지 마세요. <h3 class="subtitle-title"> 태그와 <div class="subtitle-content"> 태그 사이에 줄바꿈이나 공백 문자를 넣지 말고 바로 붙여서 작성하세요. 단, 썸네일이 있는 경우 <h3> 태그와 썸네일 사이, 썸네일과 <div class="subtitle-content"> 사이에는 줄바꿈이 있어도 됩니다. 예: <h3 class="subtitle-title">1-1. 소제목.</h3><div class="subtitle-thumbnail-container"><img src="[URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div><div class="subtitle-content">본문 내용</div>
`;

  return prompt;
}

// HTML 정리 함수
function cleanHtml(html) {
  let cleanHtml = html.trim();
  
  // 코드 블록 제거
  const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/);
  if (htmlBlockMatch) {
    cleanHtml = htmlBlockMatch[1].trim();
  } else {
    const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      cleanHtml = codeBlockMatch[1].trim();
    }
  }

  // HTML 정리
  cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2');
  cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2');
  cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
  cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3');
  cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2');
  cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2');
  cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3');
  cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3');
  cleanHtml = cleanHtml.replace(/\*\*/g, '');

  return cleanHtml;
}

// 4. 점사 API 엔드포인트
app.post('/chat', async (req, res) => {
    // 타임아웃을 30분(1800초)으로 넉넉하게 설정
    req.setTimeout(1800000); // 30분
    res.setTimeout(1800000);

    try {
        const {
            role_prompt,
            restrictions,
            menu_subtitles,
            menu_items = [],
            user_info,
            partner_info,
            model = 'gemini-3-flash-preview',
            manse_ryeok_table,
            manse_ryeok_text,
            manse_ryeok_json,
            day_gan_info,
            isSecondRequest = false,
            completedSubtitles = [],
            completedSubtitleIndices = []
        } = req.body;

        if (!role_prompt || !menu_subtitles || !Array.isArray(menu_subtitles) || menu_subtitles.length === 0) {
            return res.status(400).json({ error: 'Invalid request format' });
        }

        // 모델 선택
        const selectedModel = model || 'gemini-3-flash-preview';
        
        // 모델별 최대 출력 토큰 설정
        const maxOutputTokens = 65536;
        
        // Gemini 모델 설정
        const geminiModel = genAI.getGenerativeModel({
            model: selectedModel,
            generationConfig: {
                temperature: 0.2,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: maxOutputTokens,
            },
            safetySettings: [
                {
                    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
                {
                    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    threshold: HarmBlockThreshold.BLOCK_NONE,
                },
            ],
        });

        // 프롬프트 생성
        const prompt = buildPrompt(req.body);

        // 스트리밍 방식으로 생성
        const result = await geminiModel.generateContentStream(prompt);

        // 헤더 설정 (스트리밍 전송용 - Server-Sent Events)
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');

        // start 이벤트 전송
        res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

        let accumulatedText = '';
        let chunkCount = 0;

        // 스트림 읽기
        for await (const chunk of result.stream) {
            chunkCount++;
            const chunkText = chunk.text();
            accumulatedText += chunkText;

            // chunk 이벤트 전송
            res.write(`data: ${JSON.stringify({ 
                type: 'chunk', 
                text: chunkText,
                accumulatedLength: accumulatedText.length
            })}\n\n`);

            // 100개 청크마다 진행 상황 로그
            if (chunkCount % 100 === 0) {
            }
        }

        // HTML 정리
        const cleanHtmlText = cleanHtml(accumulatedText);

        // done 이벤트 전송
        res.write(`data: ${JSON.stringify({ 
            type: 'done',
            html: cleanHtmlText,
            finishReason: 'STOP'
        })}\n\n`);
        res.end();

    } catch (error) {
        
        // 에러 이벤트 전송
        if (!res.headersSent) {
            res.status(500).json({
                error: '서버 에러 발생',
                message: error.message
            });
        } else {
            res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
            res.end();
        }
    }
});

// 5. 헬스 체크 엔드포인트
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 6. 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
});
