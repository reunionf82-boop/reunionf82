// Cloudways Node.js 서버 (점사 AI 백엔드)
// 이 파일을 Cloudways의 public_html 폴더에 업로드하세요

// 환경 변수 로드 (.env 파일)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

const app = express();

// 1. 보안 설정 (Vercel에서 오는 요청만 허용)
// 나중에 실제 Vercel 도메인으로 바꾸면 더 좋습니다
app.use(cors({
    origin: '*', // 프로덕션에서는 특정 도메인으로 제한: ['https://reunion.fortune82.com']
    methods: ['POST', 'GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' })); // 큰 요청 본문 허용

// 2. 타임아웃 무제한 설정 (핵심!)
app.timeout = 0;

// 3. API 키 설정 (환경 변수 또는 직접 입력)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '여기에_Gemini_API_키를_입력하세요';

if (!GEMINI_API_KEY || GEMINI_API_KEY === '여기에_Gemini_API_키를_입력하세요') {
    console.error('⚠️ GEMINI_API_KEY가 설정되지 않았습니다!');
    console.error('환경 변수로 설정하거나 코드에 직접 입력하세요.');
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// OPTIONS 요청 처리 (CORS preflight)
app.options('*', (req, res) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.sendStatus(204);
});

// 4. 점사 API 엔드포인트
app.post('/chat', async (req, res) => {
    // 타임아웃을 30분(1800초)으로 넉넉하게 설정
    req.setTimeout(1800000); // 30분
    res.setTimeout(1800000);

    console.log('=== 점사 API 요청 수신 ===');
    console.log('요청 본문 키:', Object.keys(req.body));
    
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

        console.log('모델:', model);
        console.log('메뉴 소제목 개수:', menu_subtitles?.length);
        console.log('2차 요청 여부:', isSecondRequest);

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

        // 만세력 데이터 파싱 및 확인
        let parsedManseRyeok = null;
        if (manse_ryeok_json) {
            try {
                parsedManseRyeok = JSON.parse(manse_ryeok_json);
            } catch (e) {
                console.error('만세력 JSON 파싱 실패:', e);
            }
        }

        const hasManseRyeokData = !!(parsedManseRyeok || manse_ryeok_text || manse_ryeok_table);

        // 프롬프트 생성 (Next.js API 라우트와 동일한 로직)
        const menuItemsInfo = menu_items ? menu_items.map((item, idx) => {
            const menuTitle = typeof item === 'string' ? item : (item.value || item.title || '');
            const menuThumbnail = typeof item === 'object' ? (item.thumbnail || '') : '';
            return {
                index: idx,
                title: menuTitle,
                thumbnail: menuThumbnail
            };
        }) : [];

        // 한국의 현재 날짜/시간 가져오기 (Asia/Seoul, UTC+9)
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

        // 상세메뉴가 있는 소제목이 있는지 미리 확인
        const hasDetailMenusInSubtitles = menu_subtitles.some((s) => s.detailMenus && s.detailMenus.length > 0);
        console.log('프롬프트 생성 전 체크: 상세메뉴가 있는 소제목 존재 여부:', hasDetailMenusInSubtitles);

        const prompt = `
${isSecondRequest ? `
🚨🚨🚨 **중요: 2차 요청입니다. 절대 처음부터 다시 시작하지 마세요!** 🚨🚨🚨
**이전 요청에서 이미 완료된 메뉴/소제목은 절대 포함하지 마세요.**
**아래에 나열된 남은 메뉴/소제목만 해석하세요.**
**메뉴 제목이나 썸네일을 다시 생성하지 마세요. 오직 남은 소제목의 해석 내용만 생성하세요.**
**다시 강조: 처음부터 다시 시작하지 마세요!**

---
` : ''}
당신은 ${role_prompt}입니다.

---
# ⚠️ 입력 데이터 (계산된 불변의 값 - 그대로 복사하여 사용)

${manse_ryeok_text ? `${manse_ryeok_text}` : '(만세력 텍스트 데이터 없음 - 해석 불가)'}

${manse_ryeok_json ? `
**JSON 형식 만세력 데이터 (구조화):**
\`\`\`json
${manse_ryeok_json}
\`\`\`
` : ''}

${day_gan_info ? `
**일간(日干) 정보:** ${day_gan_info.fullName} (천간: ${day_gan_info.gan}(${day_gan_info.hanja}), 오행: ${day_gan_info.ohang})
` : ''}

${hasManseRyeokData ? `
**중요:** 위 데이터만 사용하세요. 생년월일/띠/출생지는 보안상 제공되지 않았으며, 임의로 추정하거나 계산하는 행위는 금지됩니다.
` : ''}

${!hasManseRyeokData ? `
⚠️⚠️⚠️ 만세력 데이터가 없습니다. 어떤 해석도 하지 말고, "만세력 데이터가 없어 해석할 수 없습니다"라고만 답하세요.
` : ''}

---
# 🛑 분석 절차 (반드시 순서대로 수행할 것)

**STEP 1: 데이터 검증 (내부 확인만)**
- 위 [입력 데이터]에 적힌 년주/월주/일주/시주를 확인하되, 출력하지 마세요.
- 내부적으로만 기억하고 바로 해석으로 넘어가세요.
- "분석 대상 명식: ..." 같은 텍스트를 출력하지 마세요.
- 생년월일을 다시 계산하거나 다른 글자를 가져오지 마세요.

**STEP 2: 글자 기반 팩트 추출**
- STEP 1에서 확인한 글자들만 사용하여 합(合), 충(沖), 형(刑), 공망 여부 등 팩트만 나열하세요. (해석 금지)

**STEP 3: 심층 해석**
- STEP 2에서 뽑은 팩트를 근거로 해석하세요.
- [입력 데이터]에 없는 신살/오행/연도/띠/출생지 등은 언급 금지.

---
# 예시 (Few-shot)

**입력된 만세력:**
- 일주: 병인(丙寅)
- 월주: 경신(庚申)

**나쁜 답변 (X):**
- "1980년생 원숭이띠로..." (생년월일 유추 금지)
- "사주에 물이 많아서..." (입력 데이터에 없는 오행 언급 금지)

**좋은 답변 (O):**
- "제공된 명식을 보면 일주 병화(丙火)와 월주 경금(庚金)이 편재 관계입니다. 지지에서 인신충(寅申沖)이 발생하여 ... [이후 입력 글자 기반 해석]"

---

${restrictions ? `주의사항: ${restrictions}` : ''}

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

${isSecondRequest ? `
**⚠️ 아래에 나열된 남은 소제목만 해석하세요. 위에 나열된 완료된 소제목은 절대 포함하지 마세요!**
` : ''}

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요.


${menuItemsInfo.map((menuItem, menuIdx) => {
  const menuNumber = menuIdx + 1;
  const subtitlesForMenu = menu_subtitles.filter((sub, idx) => {
    const match = sub.subtitle.match(/^(\d+)-(\d+)/);
    return match ? parseInt(match[1]) === menuNumber : false;
  });
  
  // 2차 요청일 때는 남은 소제목이 있는 메뉴만 표시
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
    const detailMenus = menu_subtitles[globalSubIdx]?.detailMenus || [];
    // 관리자 form에서 설정한 char_count 값을 사용
    const charCount = menu_subtitles[globalSubIdx]?.char_count;
    if (!charCount || charCount <= 0) {
        console.error(`❌ 소제목 "${sub.subtitle}"의 char_count가 설정되지 않았거나 0 이하입니다. char_count: ${charCount}`);
        // 기본값을 사용하지 않고 명시적으로 에러 표시
    }
    const thumbnail = menu_subtitles[globalSubIdx]?.thumbnail || '';
    const detailMenuCharCount = menu_subtitles[globalSubIdx]?.detail_menu_char_count || 500;
    
    // 상세메뉴가 있는 경우 특별한 강조
    if (detailMenus.length > 0) {
        console.log(`[프롬프트 생성] 소제목 "${sub.subtitle}"에 상세메뉴 ${detailMenus.length}개 포함됨`);
        
        // 상세메뉴 목록 텍스트 생성
        let detailMenuListText = '';
        detailMenus.forEach((dm, dmIdx) => {
            const dmCharCount = dm.char_count || detailMenuCharCount;
            const dmTool = dm.interpretation_tool || '';
            detailMenuListText += '  ' + (dmIdx + 1) + '. 제목: "' + (dm.detailMenu || '') + '"\n';
            if (role_prompt) {
                detailMenuListText += '     **역할:** 당신은 ' + role_prompt + '입니다. 이 상세메뉴를 해석할 때 이 역할을 유지하세요.\n';
            }
            if (restrictions) {
                detailMenuListText += '     **주의사항:** ' + restrictions + '\n';
            }
            if (dmTool) {
                detailMenuListText += '     **해석도구:** ' + dmTool + '\n';
            }
            detailMenuListText += '     - 글자수: ' + dmCharCount + '자 이내\n';
        });
        
        const thumbnailText = thumbnail ? '- 썸네일 URL: ' + thumbnail + '\n' : '';
        
        return `
  ════════════════════════════════════════════════════════════
  🔥🔥🔥 상세메뉴 필수 포함 소제목 🔥🔥🔥
  ════════════════════════════════════════════════════════════
  
  소제목: ${sub.subtitle}
  
  소제목 해석:
  ${role_prompt ? `**역할:** 당신은 ${role_prompt}입니다.\n  ` : ''}
  ${restrictions ? `**주의사항:** ${restrictions}\n  ` : ''}
  ${tool ? `**해석도구:** ${tool}\n  ` : ''}
  - 글자수: ${charCount ? `${charCount}자 이내` : '글자수 제한 없음'}
  ${thumbnailText}
  
  상세메뉴 해석 목록:
${detailMenuListText}
  
  ════════════════════════════════════════════════════════════`;
    } else {
        return `
  ${sub.subtitle}
  ${role_prompt ? `**역할:** 당신은 ${role_prompt}입니다.\n  ` : ''}
  ${restrictions ? `**주의사항:** ${restrictions}\n  ` : ''}
  ${tool ? `**해석도구:** ${tool}\n  ` : ''}
  - 글자수: ${charCount ? `${charCount}자 이내` : '글자수 제한 없음'}
  ${thumbnail ? `- 썸네일 URL: ${thumbnail}` : ''}`;
    }
  }).join('\n')}
`;
}).filter((menuText) => menuText.trim().length > 0).join('\n\n')}

각 메뉴별로 다음 HTML 구조로 결과를 작성해주세요:

<div class="menu-section">
  <h2 class="menu-title">[메뉴 제목]</h2>
  ${menuItemsInfo.some((m) => m.thumbnail) ? '<img src="[썸네일 URL]" alt="[메뉴 제목]" class="menu-thumbnail" />' : ''}
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[소제목]</h3>
    ${menu_subtitles.some((s) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[소제목 썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
    <div class="subtitle-content">[해석 내용]</div>
  </div>
  
  <div class="subtitle-section">
    <h3 class="subtitle-title">[다음 소제목]</h3>
    <div class="subtitle-content">[해석 내용]</div>
    <div class="detail-menu-section">
      <div class="detail-menu-title">[상세메뉴 제목]</div>
      <div class="detail-menu-content">[상세메뉴 해석 내용]</div>
    </div>
  </div>
  
  ...
</div>

**중요한 HTML 형식 지시사항:**
- 문단 간 한 줄 띄기가 필요한 경우, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요.
- HTML에서는 일반 텍스트의 줄바꿈이나 공백만으로는 화면에 빈 줄이 표시되지 않습니다.
- 문단 사이에 빈 줄을 표시하려면: <p>첫 번째 문단</p><br><p>두 번째 문단</p> 또는 <p>첫 번째 문단<br><br>두 번째 문단</p> 형태로 작성하세요.
- 해석도구에서 "문단간 한줄띄기" 지시가 있으면, 반드시 <br> 또는 <p> 태그로 표현하세요.

`;

        console.log('프롬프트 생성 완료, 길이:', prompt.length);
        console.log('스트리밍 시작...');

        // 완료된 메뉴/소제목 파싱 함수
        const parseCompletedSubtitles = (html, allMenuSubtitles) => {
            const completedSubtitles = [];
            const completedMenus = [];
            
            console.log('=== parseCompletedSubtitles 시작 ===');
            console.log('HTML 길이:', html.length);
            console.log('전체 소제목 개수:', allMenuSubtitles.length);
            
            // HTML에서 모든 소제목 섹션 추출
            const subtitleSectionStartRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi;
            const subtitleSectionMatches = [];
            let match;
            while ((match = subtitleSectionStartRegex.exec(html)) !== null) {
                subtitleSectionMatches.push(match);
            }
            
            const subtitleSections = [];
            
            // 각 subtitle-section의 시작 위치에서 닫는 태그까지 찾기
            for (let i = 0; i < subtitleSectionMatches.length; i++) {
                const match = subtitleSectionMatches[i];
                const startIndex = match.index;
                const startTag = match[0];
                
                let depth = 1;
                let currentIndex = startIndex + startTag.length;
                let endIndex = -1;
                
                while (currentIndex < html.length && depth > 0) {
                    const nextOpenDiv = html.indexOf('<div', currentIndex);
                    const nextCloseDiv = html.indexOf('</div>', currentIndex);
                    
                    if (nextCloseDiv === -1) break;
                    
                    if (nextOpenDiv !== -1 && nextOpenDiv < nextCloseDiv) {
                        depth++;
                        currentIndex = nextOpenDiv + 4;
                    } else {
                        depth--;
                        if (depth === 0) {
                            endIndex = nextCloseDiv + 6;
                            break;
                        }
                        currentIndex = nextCloseDiv + 6;
                    }
                }
                
                if (endIndex > startIndex) {
                    const section = html.substring(startIndex, endIndex);
                    subtitleSections.push(section);
                }
            }
            
            console.log('추출된 subtitle-section 개수:', subtitleSections.length);
            
            // 각 소제목이 완료되었는지 확인
            allMenuSubtitles.forEach((subtitle, index) => {
                const menuMatch = subtitle.subtitle.match(/^(\d+)-(\d+)/);
                if (!menuMatch) return;
                
                const menuNumber = parseInt(menuMatch[1]);
                const subtitleNumber = parseInt(menuMatch[2]);
                
                const subtitleTitleEscaped = subtitle.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const subtitleTitlePattern1 = new RegExp(
                    `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${subtitleTitleEscaped}([\\s\\S]*?)</h3>`,
                    'i'
                );
                const subtitleTitleWithoutDot = subtitle.subtitle.replace(/\./g, '');
                const subtitleTitlePattern2 = new RegExp(
                    `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${subtitleTitleWithoutDot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([\\s\\S]*?)</h3>`,
                    'i'
                );
                const numberPattern = new RegExp(
                    `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)${menuNumber}-${subtitleNumber}([\\s\\S]*?)</h3>`,
                    'i'
                );
                const h3TextPattern = new RegExp(
                    `<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>([\\s\\S]*?)</h3>`,
                    'i'
                );
                
                const subtitleContentPattern = /<div[^>]*class="subtitle-content"[^>]*>[\s\S]*?<\/div>/i;
                
                let found = false;
                for (const section of subtitleSections) {
                    let titleMatches = subtitleTitlePattern1.test(section) || 
                                     subtitleTitlePattern2.test(section) || 
                                     numberPattern.test(section);
                    
                    if (!titleMatches) {
                        const h3Match = section.match(h3TextPattern);
                        if (h3Match) {
                            const h3Text = h3Match[1].replace(/<[^>]+>/g, '').trim();
                            if (h3Text.includes(subtitle.subtitle) || 
                                h3Text.includes(subtitleTitleWithoutDot) ||
                                h3Text.includes(`${menuNumber}-${subtitleNumber}`)) {
                                titleMatches = true;
                            }
                        }
                    }
                    
                    if (titleMatches && subtitleContentPattern.test(section)) {
                        const contentMatch = section.match(/<div[^>]*class="[^"]*subtitle-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                        if (contentMatch && contentMatch[1].trim().length > 10) {
                            if (!completedSubtitles.includes(index)) {
                                completedSubtitles.push(index);
                                if (!completedMenus.includes(menuNumber - 1)) {
                                    completedMenus.push(menuNumber - 1);
                                }
                                found = true;
                                console.log(`소제목 ${index} (${subtitle.subtitle}) 완료 감지`);
                                break;
                            }
                        }
                    }
                }
                
                if (!found) {
                    console.log(`소제목 ${index} (${subtitle.subtitle}) 미완료`);
                }
            });
            
            console.log('=== parseCompletedSubtitles 완료 ===');
            console.log('완료된 소제목:', completedSubtitles.length, '개');
            console.log('완료된 소제목 인덱스:', completedSubtitles);
            
            return { completedSubtitles, completedMenus };
        };

        // 스트리밍 방식으로 생성
        let result;
        try {
            result = await geminiModel.generateContentStream(prompt);
        } catch (streamInitError) {
            console.error('스트림 생성 실패:', streamInitError);
            console.error('에러 메시지:', streamInitError?.message || String(streamInitError));
            console.error('에러 스택:', streamInitError?.stack || 'N/A');
            
            if (!res.headersSent) {
                return res.status(500).json({
                    error: '스트림 생성 실패',
                    message: streamInitError?.message || '스트림을 생성하는 중 오류가 발생했습니다.'
                });
            } else {
                res.write(`data: ${JSON.stringify({ type: 'error', error: streamInitError?.message || '스트림을 생성하는 중 오류가 발생했습니다.' })}\n\n`);
                res.end();
                return;
            }
        }

        // 헤더 설정 (스트리밍 전송용)
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');

        // start 이벤트 전송
        res.write('data: {"type":"start"}\n\n');

        let accumulatedText = '';
        let chunkCount = 0;
        let lastCompletionCheckChunk = 0;
        const COMPLETION_CHECK_INTERVAL = 50;
        let allSubtitlesCompletedEarly = false;
        let streamErrorOccurred = false;
        let streamErrorMessage = '';

        // 스트림 읽기
        try {
            for await (const chunk of result.stream) {
                try {
                    chunkCount++;
                    let chunkText = '';
                    
                    // chunk.text() 메서드가 있는지 확인
                    if (chunk && typeof chunk.text === 'function') {
                        chunkText = chunk.text();
                    } else if (chunk && typeof chunk === 'string') {
                        chunkText = chunk;
                    } else if (chunk && chunk.text) {
                        chunkText = chunk.text;
                    } else {
                        console.warn(`청크 ${chunkCount}: 텍스트를 추출할 수 없음, chunk 타입: ${typeof chunk}`);
                        continue;
                    }
                    
                    if (!chunkText || chunkText.trim().length === 0) {
                        continue;
                    }
                    
                    accumulatedText += chunkText;

                    // chunk 이벤트 전송
                    res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText, accumulatedLength: accumulatedText.length })}\n\n`);

                    // 100개 청크마다 진행 상황 로그
                    if (chunkCount % 100 === 0) {
                        console.log(`전송된 청크: ${chunkCount}개, 누적 텍스트 길이: ${accumulatedText.length}자`);
                    }
                } catch (chunkError) {
                    console.error(`청크 ${chunkCount} 처리 중 에러:`, chunkError);
                    // 개별 청크 에러는 로그만 남기고 계속 진행
                    continue;
                }

            // 모든 소제목 완료 여부 주기적 체크 (50번째 청크마다)
            if (chunkCount - lastCompletionCheckChunk >= COMPLETION_CHECK_INTERVAL && accumulatedText.trim().length > 100) {
                // HTML 코드 블록 제거
                let htmlForParsing = accumulatedText.trim();
                const htmlBlockMatch = htmlForParsing.match(/```html\s*([\s\S]*?)\s*```/);
                if (htmlBlockMatch) {
                    htmlForParsing = htmlBlockMatch[1].trim();
                } else {
                    const codeBlockMatch = htmlForParsing.match(/```\s*([\s\S]*?)\s*```/);
                    if (codeBlockMatch) {
                        htmlForParsing = codeBlockMatch[1].trim();
                    }
                }
                
                // 완료된 메뉴/소제목 파싱
                const { completedSubtitles } = parseCompletedSubtitles(htmlForParsing, menu_subtitles);
                const allSubtitlesCompleted = completedSubtitles.length === menu_subtitles.length;
                
                if (allSubtitlesCompleted) {
                    console.log(`✅ [청크 ${chunkCount}] 모든 소제목이 완료되었습니다! 스트림을 즉시 중단합니다.`);
                    console.log(`완료된 소제목: ${completedSubtitles.length}/${menu_subtitles.length}개`);
                    console.log(`accumulatedText 길이: ${accumulatedText.length}자`);
                    
                    allSubtitlesCompletedEarly = true;
                    break; // for await 루프를 즉시 종료하여 스트림 읽기 중단
                } else {
                    lastCompletionCheckChunk = chunkCount;
                }
            }
            }
        } catch (streamError) {
            console.error('스트림 읽기 중 에러 발생:', streamError);
            console.error('에러 메시지:', streamError?.message || String(streamError));
            console.error('에러 스택:', streamError?.stack || 'N/A');
            console.error(`에러 발생 시점 - 청크: ${chunkCount}개, 누적 텍스트: ${accumulatedText.length}자`);
            
            streamErrorOccurred = true;
            streamErrorMessage = streamError?.message || '스트림을 읽는 중 오류가 발생했습니다.';
            
            // 스트림 에러가 발생했지만 이미 일부 데이터가 있으면 계속 진행
            if (accumulatedText.trim().length > 0) {
                console.log('일부 데이터가 수집되었으므로 계속 진행합니다.');
                // 에러가 발생했지만 데이터가 있으면 경고만 전송하고 계속 진행
                res.write(`data: ${JSON.stringify({ type: 'warning', message: '스트림 파싱 중 일부 에러가 발생했지만 수집된 데이터를 계속 전송합니다.' })}\n\n`);
            } else {
                // 데이터가 없으면 에러 전송
                if (!res.headersSent) {
                    res.status(500).json({
                        error: '스트림 파싱 에러',
                        message: streamErrorMessage
                    });
                } else {
                    res.write(`data: ${JSON.stringify({ type: 'error', error: streamErrorMessage })}\n\n`);
                    res.end();
                }
                return;
            }
        }

        // HTML 정리
        let cleanHtml = accumulatedText.trim();
        const htmlBlockMatch = cleanHtml.match(/```html\s*([\s\S]*?)\s*```/);
        if (htmlBlockMatch) {
            cleanHtml = htmlBlockMatch[1].trim();
        } else {
            const codeBlockMatch = cleanHtml.match(/```\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                cleanHtml = codeBlockMatch[1].trim();
            }
        }
        
        cleanHtml = cleanHtml.replace(/(<\/h3>)\s+(<div class="subtitle-content">)/g, '$1$2');
        cleanHtml = cleanHtml.replace(/(<\/h3[^>]*>)\s+(<div[^>]*class="subtitle-content"[^>]*>)/g, '$1$2');
        cleanHtml = cleanHtml.replace(/(<br\s*\/?>\s*){2,}/gi, '<br>');
        cleanHtml = cleanHtml.replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3');
        cleanHtml = cleanHtml.replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2');
        cleanHtml = cleanHtml.replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2');
        cleanHtml = cleanHtml.replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3');
        cleanHtml = cleanHtml.replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3');
        cleanHtml = cleanHtml.replace(/\*\*/g, '');

        // finishReason 확인 (response에서 가져오기)
        let finishReason = 'STOP';
        let isTruncated = false;
        
        try {
            const response = await result.response;
            finishReason = response.candidates?.[0]?.finishReason || 'STOP';
            
            // finishReason이 MAX_TOKENS인 경우에도 실제로 모든 소제목이 완료되었는지 확인
            if (finishReason === 'MAX_TOKENS') {
                console.log('=== MAX_TOKENS 감지: 실제 점사 완료 여부 확인 ===');
                const { completedSubtitles } = parseCompletedSubtitles(cleanHtml, menu_subtitles);
                const allSubtitlesCompleted = completedSubtitles.length === menu_subtitles.length;
                
                console.log(`전체 소제목: ${menu_subtitles.length}개`);
                console.log(`완료된 소제목: ${completedSubtitles.length}개`);
                console.log(`모든 소제목 완료 여부: ${allSubtitlesCompleted ? '✅ 예' : '❌ 아니오'}`);
                
                if (allSubtitlesCompleted) {
                    console.log('✅ 점사가 모두 완료되었습니다. MAX_TOKENS는 점사 완료 후 추가 생성이 발생한 것으로 보입니다.');
                    console.log('✅ isTruncated를 false로 설정하고 finishReason을 STOP으로 변경합니다.');
                    isTruncated = false;
                    finishReason = 'STOP';
                } else {
                    console.log('❌ 일부 소제목이 미완료 상태입니다. MAX_TOKENS로 인한 잘림으로 처리합니다.');
                    isTruncated = true;
                }
                console.log('=== MAX_TOKENS 확인 완료 ===');
            }
        } catch (responseError) {
            console.error('응답 대기 중 에러:', responseError);
            // 에러가 발생해도 계속 처리
        }

        // 조기 완료 처리된 경우 isTruncated를 false로 설정
        if (allSubtitlesCompletedEarly) {
            isTruncated = false;
            finishReason = 'STOP';
            console.log('✅ 조기 완료 처리: isTruncated=false, finishReason=STOP');
        }

        // done 이벤트 전송 (스트림 에러가 발생했어도 수집된 데이터는 전송)
        const donePayload = {
            type: 'done',
            html: cleanHtml,
            isTruncated: isTruncated,
            finishReason: finishReason
        };
        if (streamErrorOccurred) {
            donePayload.streamError = streamErrorMessage;
        }
        res.write(`data: ${JSON.stringify(donePayload)}\n\n`);
        res.end();

        console.log(`스트리밍 완료, 총 청크: ${chunkCount}개, 총 텍스트 길이: ${accumulatedText.length}자`);
        console.log(`finishReason: ${finishReason}, isTruncated: ${isTruncated}`);
        console.log(`조기 완료 여부: ${allSubtitlesCompletedEarly ? '예' : '아니오'}`);
        if (streamErrorOccurred) {
            console.log(`⚠️ 스트림 에러 발생했지만 데이터 전송 완료: ${streamErrorMessage}`);
        }

    } catch (error) {
        console.error('에러 발생:', error);
        console.error('에러 스택:', error.stack);
        
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
    console.log(`✅ 점사 AI 백엔드 서버가 ${PORT}번 포트에서 실행 중...`);
    console.log(`📡 엔드포인트: http://localhost:${PORT}/chat`);
    console.log(`🔑 GEMINI_API_KEY 설정 여부: ${GEMINI_API_KEY && GEMINI_API_KEY !== '여기에_Gemini_API_키를_입력하세요' ? '✅ 설정됨' : '❌ 설정 안 됨'}`);
});
