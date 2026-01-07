// Cloudways Node.js 서버 (점사 AI 백엔드)
// 이 파일을 Cloudways의 public_html 폴더에 업로드하세요

// 환경 변수 로드 (.env 파일)
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');

// SSOT(공통 상수) + HTML 안전 처리 유틸
const {
    COMPLETION_CHECK_INTERVAL_CHUNKS,
    MIN_TEXT_LEN_SUBTITLE,
    MIN_TEXT_LEN_DETAIL,
} = require('./cloudways-streaming-config');
const {
    ITEM_START,
    ITEM_END,
    stripCodeFences,
    normalizeHtmlBasics,
    safeTrimToCompletedBoundary,
    mergeSecondRequestHtml,
} = require('./cloudways-html-safety');

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
            completedSubtitleIndices = [],
            remainingSubtitleIndices = [], // 2차 요청 시 남은 소제목의 원본 인덱스
            isParallelMode = false // 병렬점사 모드 여부
        } = req.body;

        
        // 병렬점사 모드에서는 각 대메뉴의 소제목에 해석도구가 포함되어 있어야 함
        if (isParallelMode && menu_subtitles && menu_subtitles.length > 0) {
            menu_subtitles.slice(0, 3).forEach((sub, idx) => {
                const tool = sub?.interpretation_tool || (typeof sub === 'object' ? sub.interpretation_tool : '');
            });
        }

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
# 🚨🚨🚨 해석도구 준수 (절대적 필수사항) 🚨🚨🚨

**⚠️⚠️⚠️ 매우 중요: 각 소제목과 상세메뉴에 제공된 "해석도구"를 반드시 따라야 합니다! ⚠️⚠️⚠️**

1. **해석도구를 무시하고 제목만 보고 점사하지 마세요!**
2. **해석도구에 명시된 모든 지시사항(테이블 생성, 특수문자 구분자, 형식 등)을 반드시 포함하여 점사하세요!**
3. **해석도구에 "한줄 띄어서", "문단간 한줄띄기", "줄바꿈" 등의 지시가 있으면, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요!**
4. **일반 텍스트의 줄바꿈(\\n)은 HTML에서 빈 줄로 표시되지 않습니다! 반드시 <br> 또는 <p> 태그를 사용하세요!**
5. **해석도구 없이 제목만 보고 짧게 점사하는 것은 절대 금지입니다!**

**🔥 해석도구는 각 소제목/상세메뉴의 필수 해석 가이드입니다. 반드시 따라야 합니다! 🔥**

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
🚨🚨🚨🚨🚨 **절대적 명령: 2차 요청입니다. 처음부터 다시 시작하는 것은 절대 금지입니다!** 🚨🚨🚨🚨🚨

**⚠️⚠️⚠️ 이 요청은 이전 요청의 연속입니다. 아래 완료된 소제목들은 이미 해석이 완료되었으므로 절대 다시 생성하지 마세요! ⚠️⚠️⚠️**

**이미 완료된 소제목 목록 (절대 포함하지 마세요!):**
${completedSubtitles && completedSubtitles.length > 0 ? completedSubtitles.map((sub, idx) => {
  const subtitleText = typeof sub === 'string' ? sub : (sub.subtitle || sub.title || `소제목 ${idx + 1}`);
  return `- ${subtitleText} (이미 완료됨, 절대 건너뛰세요)`;
}).join('\n') : '없음'}

**🚨🚨🚨 절대적 금지 사항 (위반 시 심각한 오류):** 🚨🚨🚨
1. **위에 나열된 완료된 소제목을 절대 포함하지 마세요.** 이미 해석이 완료되었으므로 건너뛰세요.
2. **처음부터 다시 시작하는 것은 절대 금지입니다.** 아래에 나열된 남은 메뉴/소제목만 해석하세요.
3. **이전 요청의 HTML 구조나 내용을 반복하지 마세요.** 오직 남은 소제목만 새로 생성하세요.
4. **메뉴 제목이나 썸네일을 다시 생성하지 마세요.** 남은 소제목의 해석 내용만 생성하세요.
5. **완료된 소제목의 HTML을 생성하지 마세요.** 오직 남은 소제목만 HTML로 작성하세요.
6. **완료된 소제목 목록을 다시 확인하고, 그 소제목들은 절대 HTML에 포함하지 마세요!**
7. **이전에 생성한 메뉴 섹션, 소제목 섹션을 다시 생성하지 마세요.**
8. **HTML 구조를 처음부터 다시 만들지 마세요. 남은 소제목만 추가하세요.**

**이전 요청에서 일부만 완료되었으므로, 남은 부분만 이어서 해석합니다.**
**🚨🚨🚨 다시 강조: 위에 나열된 완료된 소제목은 건너뛰고, 아래 남은 소제목만 해석하세요! 처음부터 다시 시작하지 마세요! 🚨🚨🚨**
` : ''}

${isSecondRequest ? `
**🚨🚨🚨 절대적 명령: 아래에 나열된 남은 소제목만 해석하세요! 🚨🚨🚨**
**위에 나열된 완료된 소제목은 절대 포함하지 마세요!**
**처음부터 다시 시작하지 마세요!**
**이전 요청의 HTML을 반복하지 마세요!**
` : ''}

다음 상품 메뉴 구성과 소제목들을 각각 해석해주세요.


${menuItemsInfo.map((menuItem, menuIdx) => {
  const menuNumber = menuIdx + 1;
  // 2차 요청일 때는 프론트엔드에서 이미 필터링된 menu_subtitles를 그대로 사용
  // (프론트엔드에서 남은 소제목만 보냈으므로 추가 필터링 불필요)
  let subtitlesForMenu = menu_subtitles.filter((sub, idx) => {
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

${isSecondRequest ? `
**🚨 절대 명령: 이 메뉴의 아래 소제목들만 해석하세요! 🚨**
**위에 나열된 완료된 소제목은 절대 건너뛰세요!**
**이 메뉴의 완료된 소제목을 다시 생성하지 마세요!**
` : ''}

이 메뉴의 소제목들:
${subtitlesForMenu.map((sub, subIdx) => {
    // 병렬점사 모드와 직렬점사 모드 분리 처리
    let subtitleData;
    if (isParallelMode) {
        // 병렬점사 모드: sub 객체에 이미 모든 정보가 포함되어 있음
        subtitleData = sub;
        // 디버깅: 해석도구 확인
        console.log(`[프롬프트 생성-병렬점사] 메뉴 ${menuNumber} 소제목 ${subIdx + 1}:`, {
            subtitle: sub?.subtitle || sub,
            hasInterpretationTool: !!(sub?.interpretation_tool),
            interpretationTool: sub?.interpretation_tool ? sub.interpretation_tool.substring(0, 50) + '...' : '없음',
            hasDetailMenus: !!(sub?.detailMenus && sub.detailMenus.length > 0),
            detailMenusCount: sub?.detailMenus?.length || 0
        });
    } else if (isSecondRequest) {
        // 직렬점사 2차 요청: 이미 필터링된 menu_subtitles를 받았으므로 직접 사용
        subtitleData = sub;
    } else {
        // 직렬점사 1차 요청: 원본 menu_subtitles에서 찾기
        subtitleData = menu_subtitles.find((s) => s.subtitle === sub.subtitle) || sub;
    }
    
    // 해석도구 추출 (병렬점사 모드에서는 sub에 직접 포함되어 있어야 함)
    // 여러 경로에서 시도: subtitleData > sub > 원본 menu_subtitles에서 찾기
    let tool = subtitleData?.interpretation_tool || sub?.interpretation_tool || '';
    
    // 병렬점사 모드에서 해석도구가 없으면 원본 menu_subtitles에서 찾기 시도
    if (isParallelMode && !tool) {
        const originalSub = menu_subtitles.find((s) => {
            if (typeof s === 'object' && s.subtitle) {
                return s.subtitle === (sub?.subtitle || sub);
            }
            return s === sub || (typeof sub === 'object' && sub.subtitle && s === sub.subtitle);
        });
        if (originalSub?.interpretation_tool) {
            tool = originalSub.interpretation_tool;
        } else {
        }
    }
    const detailMenus = subtitleData?.detailMenus || sub?.detailMenus || [];
    // 관리자 form에서 설정한 char_count 값을 사용
    const charCount = subtitleData?.char_count || sub?.char_count;
    if (!charCount || charCount <= 0) {
        // 기본값을 사용하지 않고 명시적으로 에러 표시
    }
    const thumbnail = subtitleData?.thumbnail || sub?.thumbnail || '';
    const detailMenuCharCount = subtitleData?.detail_menu_char_count || sub?.detail_menu_char_count || 500;
    
        // 상세메뉴가 있는 경우 특별한 강조
        if (detailMenus.length > 0) {
        
        // 상세메뉴 목록 텍스트 생성
        let detailMenuListText = '';
        detailMenus.forEach((dm, dmIdx) => {
            const dmCharCount = dm.char_count || detailMenuCharCount;
            // 상세메뉴 해석도구 추출 (병렬점사 모드에서는 dm 객체에 직접 포함되어 있어야 함)
            let dmTool = dm?.interpretation_tool || (typeof dm === 'object' ? dm.interpretation_tool : '') || '';
            
                // 병렬점사 모드에서 상세메뉴 해석도구가 없으면 원본에서 찾기 시도
                if (isParallelMode && !dmTool) {
                    // subtitleData의 detailMenus에서 찾기
                    if (subtitleData?.detailMenus && Array.isArray(subtitleData.detailMenus)) {
                        const originalDm = subtitleData.detailMenus.find((odm) => {
                            return odm?.detailMenu === (dm?.detailMenu || dm) || 
                                   (typeof dm === 'object' && dm.detailMenu && odm?.detailMenu === dm.detailMenu);
                        });
                        if (originalDm?.interpretation_tool) {
                            dmTool = originalDm.interpretation_tool;
                        }
                    }
                
                if (!dmTool) {
                }
            }
            
            detailMenuListText += '  ' + (dmIdx + 1) + '. 제목: "' + (dm.detailMenu || '') + '"\n';
            if (role_prompt) {
                detailMenuListText += '     **역할:** 당신은 ' + role_prompt + '입니다. 이 상세메뉴를 해석할 때 이 역할을 유지하세요.\n';
            }
            if (restrictions) {
                detailMenuListText += '     **주의사항:** ' + restrictions + '\n';
            }
            if (dmTool) {
                detailMenuListText += '     🚨🚨🚨 **해석도구 (반드시 따라야 함):** ' + dmTool + ' 🚨🚨🚨\n';
                detailMenuListText += '     \n';
                detailMenuListText += '     ⚠️⚠️⚠️ **중요: 위 해석도구의 모든 지시사항을 반드시 따라야 합니다!** ⚠️⚠️⚠️\n';
                detailMenuListText += '     ⚠️⚠️⚠️ **해석도구에 "한줄 띄어서", "문단간 한줄띄기", "줄바꿈" 등의 지시가 있으면, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요!** ⚠️⚠️⚠️\n';
                detailMenuListText += '     ⚠️ **일반 텍스트의 줄바꿈(\\n)은 HTML에서 빈 줄로 표시되지 않습니다! 반드시 <br> 또는 <p> 태그를 사용하세요!** ⚠️\n';
                detailMenuListText += '     \n';
                detailMenuListText += '     🔥 **해석도구를 무시하고 제목만 보고 점사하지 마세요! 해석도구의 모든 지시사항을 반드시 포함하여 점사하세요!** 🔥\n';
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
  ${tool ? `🚨🚨🚨 **해석도구 (반드시 따라야 함):** ${tool} 🚨🚨🚨\n  ` : ''}
  ${tool ? `\n  ⚠️⚠️⚠️ **중요: 위 해석도구의 모든 지시사항을 반드시 따라야 합니다!** ⚠️⚠️⚠️\n  ` : ''}
  ${tool ? `\n  🚨🚨🚨 **절대 제목을 다시 생성하지 마세요!** 🚨🚨🚨\n  ` : ''}
  ${tool ? `  - 위에 이미 "소제목: ${sub.subtitle}"이 제공되었으므로, HTML의 <h3 class="subtitle-title">에는 오직 "${sub.subtitle}"만 포함하세요!\n  ` : ''}
  ${tool ? `  - 해석도구에 제목 형식(예: "5-5. [각성] 당신은...")이 포함되어 있어도, HTML 제목 태그에는 제공된 "${sub.subtitle}"만 사용하세요!\n  ` : ''}
  ${tool ? `  - 해석도구의 제목 형식은 참고용이며, 실제 HTML 제목은 위에 제공된 "${sub.subtitle}"만 사용하세요!\n  ` : ''}
  ${tool ? `⚠️⚠️⚠️ **해석도구에 "한줄 띄어서", "문단간 한줄띄기", "줄바꿈" 등의 지시가 있으면, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요!** ⚠️⚠️⚠️\n  ` : ''}
  ${tool ? `⚠️ **일반 텍스트의 줄바꿈(\\n)은 HTML에서 빈 줄로 표시되지 않습니다! 반드시 <br> 또는 <p> 태그를 사용하세요!** ⚠️\n  ` : ''}
  ${tool ? `\n  🔥 **해석도구를 무시하고 제목만 보고 점사하지 마세요! 해석도구의 모든 지시사항을 반드시 포함하여 점사하세요!** 🔥\n  ` : ''}
  - 글자수: ${charCount ? `${charCount}자 이내` : '글자수 제한 없음'}
  ${thumbnailText}
  
  ⚠️⚠️⚠️ **아래 나열된 모든 상세메뉴를 반드시 순서대로 모두 포함해야 합니다!** ⚠️⚠️⚠️
  ⚠️⚠️⚠️ **절대 첫 번째 상세메뉴만 포함하지 마세요! 모든 상세메뉴를 포함하세요!** ⚠️⚠️⚠️
  
  상세메뉴 해석 목록 (모두 필수 포함):
${detailMenuListText}
  
  ⚠️⚠️⚠️ **위에 나열된 모든 상세메뉴를 HTML에 반드시 포함하세요!** ⚠️⚠️⚠️
  
  ════════════════════════════════════════════════════════════`;
    } else {
        return `
  ${sub.subtitle}
  ${role_prompt ? `**역할:** 당신은 ${role_prompt}입니다.\n  ` : ''}
  ${restrictions ? `**주의사항:** ${restrictions}\n  ` : ''}
  ${tool ? `🚨🚨🚨 **해석도구 (반드시 따라야 함):** ${tool} 🚨🚨🚨\n  ` : ''}
  ${tool ? `\n  ⚠️⚠️⚠️ **중요: 위 해석도구의 모든 지시사항을 반드시 따라야 합니다!** ⚠️⚠️⚠️\n  ` : ''}
  ${tool ? `\n  🚨🚨🚨 **절대 제목을 다시 생성하지 마세요!** 🚨🚨🚨\n  ` : ''}
  ${tool ? `  - 위에 이미 "${sub.subtitle}"이 제공되었으므로, HTML의 <h3 class="subtitle-title">에는 오직 "${sub.subtitle}"만 포함하세요!\n  ` : ''}
  ${tool ? `  - 해석도구에 제목 형식(예: "5-5. [각성] 당신은...")이 포함되어 있어도, HTML 제목 태그에는 제공된 "${sub.subtitle}"만 사용하세요!\n  ` : ''}
  ${tool ? `  - 해석도구의 제목 형식은 참고용이며, 실제 HTML 제목은 위에 제공된 "${sub.subtitle}"만 사용하세요!\n  ` : ''}
  ${tool ? `⚠️⚠️⚠️ **해석도구에 "한줄 띄어서", "문단간 한줄띄기", "줄바꿈" 등의 지시가 있으면, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요!** ⚠️⚠️⚠️\n  ` : ''}
  ${tool ? `⚠️ **일반 텍스트의 줄바꿈(\\n)은 HTML에서 빈 줄로 표시되지 않습니다! 반드시 <br> 또는 <p> 태그를 사용하세요!** ⚠️\n  ` : ''}
  ${tool ? `\n  🔥 **해석도구를 무시하고 제목만 보고 점사하지 마세요! 해석도구의 모든 지시사항을 반드시 포함하여 점사하세요!** 🔥\n  ` : ''}
  - 글자수: ${charCount ? `${charCount}자 이내` : '글자수 제한 없음'}
  ${thumbnail ? `- 썸네일 URL: ${thumbnail}` : ''}`;
    }
  }).join('\n')}
`;
}).filter((menuText) => menuText.trim().length > 0).join('\n\n')}

${isSecondRequest ? `
**⚠️ 재요청 시 HTML 구조 지시사항 (매우 중요!):**
- **절대 <div class="menu-section">을 생성하지 마세요!** 이미 생성되어 있으므로 재생성하지 마세요.
- **절대 <h2 class="menu-title">을 생성하지 마세요!** 메뉴 제목은 이미 생성되어 있으므로 재생성하지 마세요.
- **절대 썸네일 <img class="menu-thumbnail">을 생성하지 마세요!** 썸네일은 이미 생성되어 있으므로 재생성하지 마세요.
- **오직 남은 소제목의 <div class="subtitle-section">만 생성하세요!**
- 남은 소제목들을 순서대로 <div class="subtitle-section">으로만 작성하세요.

**재요청 시 올바른 HTML 구조:**
<div class="subtitle-section">
  <h3 class="subtitle-title">[남은 소제목 1]</h3>
  ${menu_subtitles.some((s) => s.thumbnail) ? '<div class="subtitle-thumbnail-container"><img src="[소제목 썸네일 URL]" alt="소제목 썸네일" style="width: 100%; height: auto; display: block; border-radius: 8px; object-fit: contain;" /></div>' : ''}
  <div class="subtitle-content">[해석 내용]</div>
</div>

<div class="subtitle-section">
  <h3 class="subtitle-title">[남은 소제목 2]</h3>
  <div class="subtitle-content">[해석 내용]</div>
  <div class="detail-menu-section">
    <div class="detail-menu-title">[상세메뉴 제목]</div>
    <div class="detail-menu-content">[상세메뉴 해석 내용]</div>
  </div>
</div>
` : `
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
`}

**중요한 HTML 형식 지시사항:**
- **🚨🚨🚨 절대 제목을 중복 생성하지 마세요! 🚨🚨🚨**
- 각 소제목의 제목은 위에 이미 제공되었으므로, HTML의 <h3 class="subtitle-title">에는 제공된 제목만 사용하세요!
- 해석도구에 제목 형식이 포함되어 있어도, HTML 제목 태그에는 위에 제공된 원본 제목만 사용하세요!
- 해석도구의 제목 형식은 참고용이며, 실제 HTML 제목은 제공된 원본 제목만 사용하세요!
- 문단 간 한 줄 띄기가 필요한 경우, 반드시 <br> 태그 또는 <p> 태그를 사용하여 표현하세요.
- HTML에서는 일반 텍스트의 줄바꿈이나 공백만으로는 화면에 빈 줄이 표시되지 않습니다.
- 문단 사이에 빈 줄을 표시하려면: <p>첫 번째 문단</p><br><p>두 번째 문단</p> 또는 <p>첫 번째 문단<br><br>두 번째 문단</p> 형태로 작성하세요.
- 해석도구에서 "문단간 한줄띄기" 지시가 있으면, 반드시 <br> 또는 <p> 태그로 표현하세요.
- **⚠️ 테이블은 절대 중첩하지 마세요. 테이블 안에 테이블을 넣지 마세요. 테이블은 독립적으로 사용하세요.**

**🚨 매우 중요한 마커 삽입 요구사항 (제안 2):**
각 소제목(subtitle-section)과 상세메뉴(detail-menu-section)의 시작과 끝에 반드시 주석 마커를 삽입해야 합니다:
- 각 <div class="subtitle-section"> 시작 직전에: <!-- ITEM_START: [소제목번호] -->
- 각 </div> (subtitle-section 닫기) 직후에: <!-- ITEM_END: [소제목번호] -->
- 각 <div class="detail-menu-section"> 시작 직전에: <!-- ITEM_START: [소제목번호]-[상세메뉴번호] -->
- 각 </div> (detail-menu-section 닫기) 직후에: <!-- ITEM_END: [소제목번호]-[상세메뉴번호] -->

예시:
<!-- ITEM_START: 1-1 -->
<div class="subtitle-section">
  <h3 class="subtitle-title">1-1. 소제목 제목</h3>
  <div class="subtitle-content">해석 내용...</div>
</div>
<!-- ITEM_END: 1-1 -->

이 마커는 긴 점사 결과를 안전하게 나누기 위해 필수입니다. 반드시 포함하세요!

`;


        // 완료된 HTML에서 깨진 부분 제거하고 유효한 부분만 반환하는 함수
        const extractValidHtml = (html, completedSubtitleIndices, allMenuSubtitles) => {
            if (!completedSubtitleIndices || completedSubtitleIndices.length === 0) {
                return '';
            }
            
            // HTML에서 모든 subtitle-section 추출
            const subtitleSectionStartRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi;
            const subtitleSectionMatches = [];
            let match;
            while ((match = subtitleSectionStartRegex.exec(html)) !== null) {
                subtitleSectionMatches.push(match);
            }
            
            const validSections = [];
            let lastValidEndIndex = 0;
            
            // 완료된 소제목 인덱스를 순회하며 해당하는 섹션 추출
            for (let i = 0; i < completedSubtitleIndices.length; i++) {
                const subtitleIndex = completedSubtitleIndices[i];
                if (subtitleIndex >= subtitleSectionMatches.length) break;
                
                const match = subtitleSectionMatches[subtitleIndex];
                const startIndex = match.index;
                const startTag = match[0];
                
                // 시작 태그 다음부터 닫는 </div> 찾기 (중첩된 div 고려)
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
                    validSections.push(section);
                    lastValidEndIndex = Math.max(lastValidEndIndex, endIndex);
                }
            }
            
            // menu-section 구조를 유지하기 위해 첫 번째 menu-section부터 마지막 완료된 subtitle-section까지 추출
            const firstMenuSectionMatch = html.match(/<div[^>]*class="[^"]*menu-section[^"]*"[^>]*>/i);
            if (firstMenuSectionMatch && validSections.length > 0) {
                const firstMenuStartIndex = firstMenuSectionMatch.index;
                // 마지막 완료된 subtitle-section의 끝까지 추출
                const validHtml = html.substring(firstMenuStartIndex, lastValidEndIndex);
                
                // 불완전한 태그 제거 (마지막 부분에 깨진 태그가 있을 수 있음)
                // </div> 태그로 올바르게 닫히도록 보장
                let cleanedHtml = validHtml;
                // 마지막 부분의 불완전한 태그 제거
                cleanedHtml = cleanedHtml.replace(/<[^>]*$/, '');
                // 닫히지 않은 태그 제거
                const openDivCount = (cleanedHtml.match(/<div[^>]*>/gi) || []).length;
                const closeDivCount = (cleanedHtml.match(/<\/div>/gi) || []).length;
                for (let i = 0; i < openDivCount - closeDivCount; i++) {
                    cleanedHtml += '</div>';
                }
                
                return cleanedHtml;
            }
            
            return validSections.join('');
        };

        // 완료된 메뉴/소제목 파싱 함수
        const parseCompletedSubtitles = (html, allMenuSubtitles) => {
            const completedSubtitles = [];
            const completedMenus = [];
            
            
            // HTML에서 모든 소제목 섹션 추출 (subtitle-section과 detail-menu-section 모두)
            const sectionStartRegex = /<div[^>]*class="[^"]*(subtitle-section|detail-menu-section)[^"]*"[^>]*>/gi;
            const sectionMatches = [];
            let match;
            while ((match = sectionStartRegex.exec(html)) !== null) {
                sectionMatches.push(match);
            }
            
            const subtitleSections = [];
            
            // 각 section의 시작 위치에서 닫는 태그까지 찾기
            for (let i = 0; i < sectionMatches.length; i++) {
                const match = sectionMatches[i];
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
                
                // detail-menu-section의 경우 detail-menu-title 패턴도 확인
                const detailMenuTitlePattern = /<h3[^>]*class="[^"]*detail-menu-title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i;
                
                // subtitle-content 또는 detail-menu-content 모두 확인
                const subtitleContentPattern = /<div[^>]*class="[^"]*(subtitle-content|detail-menu-content)[^"]*"[^>]*>[\s\S]*?<\/div>/i;
                
                let found = false;
                for (const section of subtitleSections) {
                    // subtitle-section인지 detail-menu-section인지 확인
                    const isDetailMenuSection = section.includes('detail-menu-section');
                    
                    let titleMatches = false;
                    
                    if (isDetailMenuSection) {
                        // detail-menu-section의 경우: detail-menu-title에서 소제목 제목 찾기
                        const detailMenuTitleMatch = section.match(detailMenuTitlePattern);
                        if (detailMenuTitleMatch) {
                            const detailMenuTitleText = detailMenuTitleMatch[1].replace(/<[^>]+>/g, '').trim();
                            // 상세메뉴 제목이 소제목과 일치하는지 확인
                            // 상세메뉴는 평평한 배열이므로 subtitle과 직접 비교
                            if (detailMenuTitleText.includes(subtitle.subtitle) || 
                                detailMenuTitleText.includes(subtitleTitleWithoutDot) ||
                                detailMenuTitleText.includes(`${menuNumber}-${subtitleNumber}`)) {
                                titleMatches = true;
                            }
                        }
                    } else {
                        // subtitle-section의 경우: 기존 로직 사용
                        titleMatches = subtitleTitlePattern1.test(section) || 
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
                    }
                    
                    if (titleMatches && subtitleContentPattern.test(section)) {
                        // 내용이 비어있지 않은지 확인 (최소 10자 이상)
                        // subtitle-content 또는 detail-menu-content 모두 확인
                        const contentMatch = section.match(/<div[^>]*class="[^"]*(subtitle-content|detail-menu-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
                        if (contentMatch && contentMatch[2].trim().length > 10) {
                            if (!completedSubtitles.includes(index)) {
                                completedSubtitles.push(index);
                                if (!completedMenus.includes(menuNumber - 1)) {
                                    completedMenus.push(menuNumber - 1);
                                }
                                found = true;
                                break;
                            }
                        }
                    }
                }
                
                if (!found) {
                }
            });
            
            
            return { completedSubtitles, completedMenus };
        };

        // 스트리밍 방식으로 생성
        let result;
        try {
            result = await geminiModel.generateContentStream(prompt);
        } catch (streamInitError) {
            
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
        const COMPLETION_CHECK_INTERVAL = COMPLETION_CHECK_INTERVAL_CHUNKS;
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
            }

                    // 길이 제한 로직 삭제 (MAX_TOKENS까지 계속 진행)
                } catch (chunkError) {
                    // 개별 청크 에러는 로그만 남기고 계속 진행
                    continue;
                }

            // 모든 소제목 완료 여부 체크 (50청크마다 체크)
            const shouldCheckCompletion = (chunkCount - lastCompletionCheckChunk >= COMPLETION_CHECK_INTERVAL && accumulatedText.trim().length > 100);
            
            if (shouldCheckCompletion) {
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
                // 2차 요청일 때는 필터링된 menu_subtitles를 받았으므로, 
                // 전체 개수는 completedSubtitleIndices + remainingSubtitleIndices로 계산
                let totalCountForCheck = menu_subtitles.length;
                if (isSecondRequest && req.body.remainingSubtitleIndices && completedSubtitleIndices) {
                    totalCountForCheck = completedSubtitleIndices.length + req.body.remainingSubtitleIndices.length;
                }
                const allSubtitlesCompleted = completedSubtitles.length === totalCountForCheck;
                
                if (allSubtitlesCompleted) {
                    
                    allSubtitlesCompletedEarly = true;
                    break; // for await 루프를 즉시 종료하여 스트림 읽기 중단
                } else {
                    lastCompletionCheckChunk = chunkCount;
                }
            }
            }
        } catch (streamError) {
            
            streamErrorOccurred = true;
            streamErrorMessage = streamError?.message || '스트림을 읽는 중 오류가 발생했습니다.';
            
            // 스트림 에러가 발생했지만 이미 일부 데이터가 있으면 계속 진행
            if (accumulatedText.trim().length > 0) {
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

        // 제안 1-4: HTML 정리 및 코드 블록 제거 (cloudways-html-safety.js 함수 사용)
        let cleanHtml = normalizeHtmlBasics(stripCodeFences(accumulatedText));
        

        // finishReason 확인 (response에서 가져오기)
        let finishReason = 'STOP';
        let isTruncated = false;
        let parsedCompletedIndices = []; // 파싱한 완료된 소제목 인덱스 (req.body의 completedSubtitleIndices와 구분)
        
        // 항상 완료된 소제목을 파싱하여 확인 (finishReason과 관계없이)
        
        // 재요청인 경우 req.body의 completedSubtitleIndices 가져오기
        const requestCompletedIndices = req.body.completedSubtitleIndices || [];
        
        // 2차 요청 처리: 프론트엔드에서 이미 필터링된 menu_subtitles를 받았으므로
        // parseCompletedSubtitles는 필터링된 배열 기준으로 체크 (인덱스는 0부터 시작)
        let subtitlesToCheck = menu_subtitles;
        
        if (isSecondRequest) {
            // 2차 요청일 때는 프론트엔드에서 이미 필터링된 menu_subtitles를 받았으므로
            // 추가 필터링 없이 그대로 사용
        }
        
        const parseResult = parseCompletedSubtitles(cleanHtml, subtitlesToCheck);
        
        // 2차 요청인 경우: 필터링된 배열 기준의 인덱스를 원본 인덱스로 변환
        if (isSecondRequest && req.body.remainingSubtitleIndices && req.body.remainingSubtitleIndices.length > 0) {
            // parseResult.completedSubtitles는 필터링된 menu_subtitles 기준 인덱스 (0부터 시작)
            // remainingSubtitleIndices를 사용하여 원본 인덱스로 변환
            const newCompletedIndices = parseResult.completedSubtitles.map(filteredIdx => {
                // filteredIdx는 필터링된 배열의 인덱스 (0부터 시작)
                // remainingSubtitleIndices[filteredIdx]가 원본 인덱스
                if (filteredIdx < req.body.remainingSubtitleIndices.length) {
                    return req.body.remainingSubtitleIndices[filteredIdx];
                }
                return -1; // 잘못된 인덱스
            }).filter(idx => idx >= 0); // 잘못된 인덱스 제거
            
            parsedCompletedIndices = [...requestCompletedIndices, ...newCompletedIndices];
        } else {
            parsedCompletedIndices = parseResult.completedSubtitles;
        }
        
        // 2차 요청일 때는 원본 전체 menu_subtitles 개수와 비교해야 함
        // 하지만 현재는 필터링된 menu_subtitles만 받았으므로, 
        // completedSubtitleIndices + remainingSubtitleIndices = 전체 개수인지 확인
        let totalSubtitlesCount = menu_subtitles.length;
        if (isSecondRequest && req.body.remainingSubtitleIndices && requestCompletedIndices) {
            // 2차 요청일 때는 원본 전체 개수를 계산
            totalSubtitlesCount = requestCompletedIndices.length + req.body.remainingSubtitleIndices.length;
        }
        const allSubtitlesCompleted = parsedCompletedIndices.length === totalSubtitlesCount;
        
        
        try {
            const response = await result.response;
            finishReason = response.candidates?.[0]?.finishReason || 'STOP';
        } catch (responseError) {
            // 에러가 발생해도 계속 처리
        }
        
        // 중간에 잘린 소제목 제거 함수: 안전하게 자른 HTML에서 마지막 subtitle-section이 완전히 닫혔는지 확인
        const removeIncompleteSubtitle = (html, completedIndices) => {
            if (!html || !completedIndices || completedIndices.length === 0) {
                return completedIndices;
            }
            
            // HTML에서 모든 subtitle-section 찾기
            const subtitleSectionRegex = /<div[^>]*class="[^"]*subtitle-section[^"]*"[^>]*>/gi;
            const sectionMatches = [];
            let match;
            while ((match = subtitleSectionRegex.exec(html)) !== null) {
                sectionMatches.push({ index: match.index, tag: match[0] });
            }
            
            if (sectionMatches.length === 0) {
                return completedIndices;
            }
            
            // 마지막 subtitle-section 추출 및 완전히 닫혔는지 확인
            const lastSection = sectionMatches[sectionMatches.length - 1];
            const lastSectionStart = lastSection.index;
            
            // 마지막 subtitle-section의 닫는 </div> 찾기 (depth 체크로 완전히 닫혔는지 확인)
            let depth = 0;
            let foundOpening = false;
            let lastCloseDivIndex = -1;
            let searchIndex = lastSectionStart;
            
            // 마지막 subtitle-section부터 검색 시작
            while (searchIndex < html.length) {
                const nextOpenDiv = html.indexOf('<div', searchIndex);
                const nextCloseDiv = html.indexOf('</div>', searchIndex);
                
                if (nextOpenDiv === -1 && nextCloseDiv === -1) break;
                
                // 더 가까운 태그 선택
                let nextTagIndex = -1;
                let isOpenTag = false;
                
                if (nextOpenDiv === -1) {
                    nextTagIndex = nextCloseDiv;
                    isOpenTag = false;
                } else if (nextCloseDiv === -1) {
                    nextTagIndex = nextOpenDiv;
                    isOpenTag = true;
                } else {
                    if (nextOpenDiv < nextCloseDiv) {
                        nextTagIndex = nextOpenDiv;
                        isOpenTag = true;
                    } else {
                        nextTagIndex = nextCloseDiv;
                        isOpenTag = false;
                    }
                }
                
                if (isOpenTag) {
                    depth++;
                    foundOpening = true;
                    searchIndex = html.indexOf('>', nextTagIndex) + 1;
                } else {
                    depth--;
                    searchIndex = nextCloseDiv + '</div>'.length;
                    
                    // subtitle-section 내부의 div depth가 0이 되면 닫힘 (subtitle-section 자체 포함)
                    if (foundOpening && depth <= 0) {
                        lastCloseDivIndex = searchIndex;
                        break;
                    }
                }
            }
            
            // 마지막 subtitle-section이 완전히 닫히지 않았다면 (중간에 잘림)
            if (lastCloseDivIndex === -1 || lastCloseDivIndex >= html.length || depth > 0) {
                
                // 마지막 subtitle-section이 어느 소제목에 해당하는지 확인
                const lastSectionContent = html.substring(lastSectionStart, Math.min(lastSectionStart + 1000, html.length));
                let lastSubtitleIndex = -1;
                
                menu_subtitles.forEach((subtitle, idx) => {
                    const subtitleEscaped = subtitle.subtitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const pattern = new RegExp(`<h3[^>]*class="[^"]*subtitle-title[^"]*"[^>]*>[\\s\\S]*?${subtitleEscaped}`, 'i');
                    if (pattern.test(lastSectionContent)) {
                        lastSubtitleIndex = idx;
                    }
                });
                
                if (lastSubtitleIndex >= 0 && completedIndices.includes(lastSubtitleIndex)) {
                    return completedIndices.filter(idx => idx !== lastSubtitleIndex);
                } else if (lastSubtitleIndex === -1) {
                    // 마지막 subtitle-section을 찾지 못했지만, 완료 목록의 마지막 항목은 제거 (안전장치)
                    const sortedIndices = [...completedIndices].sort((a, b) => a - b);
                    if (sortedIndices.length > 0) {
                        const lastCompletedIndex = sortedIndices[sortedIndices.length - 1];
                        return completedIndices.filter(idx => idx !== lastCompletedIndex);
                    }
                }
            }
            
            return completedIndices;
        };
        
        // 실제 MAX_TOKENS인 경우에만 HTML 추출 및 재요청 처리
        if (finishReason === 'MAX_TOKENS') {
            if (!allSubtitlesCompleted) {
                isTruncated = true;
                // 제안 1-4: 안전한 자르기 함수 사용 (테이블 내부 자르기 방지 포함)
                cleanHtml = safeTrimToCompletedBoundary(cleanHtml);
                
                // 중간에 잘린 소제목 제거 (중요: 잘린 항목은 재요청 시 다시 생성해야 함)
                parsedCompletedIndices = removeIncompleteSubtitle(cleanHtml, parsedCompletedIndices);
            } else {
                isTruncated = false;
                finishReason = 'STOP';
                parsedCompletedIndices = []; // 모두 완료되었으므로 비움
            }
        } else {
            // finishReason이 STOP인 경우
            if (!allSubtitlesCompleted) {
                // 미완료 소제목이 있으면 재요청 필요
                isTruncated = true;
                finishReason = 'MAX_TOKENS'; // 재요청을 위해 MAX_TOKENS로 설정
                // 제안 1-4: 안전한 자르기 함수 사용 (테이블 내부 자르기 방지 포함)
                cleanHtml = safeTrimToCompletedBoundary(cleanHtml);
                
                // 중간에 잘린 소제목 제거 (중요: 잘린 항목은 재요청 시 다시 생성해야 함)
                parsedCompletedIndices = removeIncompleteSubtitle(cleanHtml, parsedCompletedIndices);
            } else {
                isTruncated = false;
                finishReason = 'STOP';
                parsedCompletedIndices = []; // 모두 완료되었으므로 비움
            }
        }

        // 조기 완료 처리된 경우 (모든 소제목이 이미 완료되었으므로 재요청 불필요)
        if (allSubtitlesCompletedEarly) {
            isTruncated = false;
            finishReason = 'STOP';
            parsedCompletedIndices = []; // 조기 완료는 모든 소제목이 완료된 것이므로 비움
        }

        // partial_done 이벤트 전송 (MAX_TOKENS이고 미완료 소제목이 있고, 1차 요청인 경우)
        if (finishReason === 'MAX_TOKENS' && isTruncated && parsedCompletedIndices && parsedCompletedIndices.length > 0 && !isSecondRequest) {
            // 남은 소제목 인덱스 계산
            const remainingIndices = menu_subtitles
                .map((_, index) => index)
                .filter(index => !parsedCompletedIndices.includes(index));
            
            
            // partial_done 이벤트 전송
            res.write(`data: ${JSON.stringify({
                type: 'partial_done',
                html: cleanHtml,
                completedSubtitleIndices: parsedCompletedIndices,
                completedSubtitles: parsedCompletedIndices,
                remainingSubtitles: remainingIndices
            })}\n\n`);
            
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
        // MAX_TOKENS이고 미완료 소제목이 있으면 완료된 소제목 인덱스 포함 (2차 요청용)
        if (finishReason === 'MAX_TOKENS' && isTruncated && parsedCompletedIndices && parsedCompletedIndices.length > 0) {
            donePayload.completedSubtitleIndices = parsedCompletedIndices;
        }
        
        res.write(`data: ${JSON.stringify(donePayload)}\n\n`);
        res.end();

        if (streamErrorOccurred) {
        }

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
