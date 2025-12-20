// Cloudways Node.js 서버 (점사 AI 백엔드)
// 이 파일을 Cloudways의 public_html 폴더에 업로드하세요

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
    // 타임아웃을 20분(1200초)으로 넉넉하게 설정
    req.setTimeout(1200000); // 20분
    res.setTimeout(1200000);

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

        // 만세력 데이터 파싱
        let parsedManseRyeok = null;
        if (manse_ryeok_json) {
            try {
                parsedManseRyeok = JSON.parse(manse_ryeok_json);
            } catch (e) {
                console.error('만세력 JSON 파싱 실패:', e);
            }
        }

        // 프롬프트 생성 (Supabase Edge Function과 동일한 로직)
        // 여기서는 간단한 예시만 제공하고, 실제로는 supabase/functions/jeminai/index.ts의 프롬프트 생성 로직을 복사해야 합니다
        let prompt = `${role_prompt}\n\n${restrictions || ''}\n\n`;
        
        // 사용자 정보 추가
        if (user_info) {
            prompt += `내담자 정보:\n`;
            if (user_info.name) prompt += `- 이름: ${user_info.name}\n`;
            if (user_info.gender) prompt += `- 성별: ${user_info.gender}\n`;
            if (user_info.birth_date) prompt += `- 생년월일: ${user_info.birth_date}\n`;
            if (user_info.birth_hour) prompt += `- 태어난 시: ${user_info.birth_hour}\n`;
        }

        // 만세력 정보 추가
        if (manse_ryeok_text) {
            prompt += `\n만세력 정보:\n${manse_ryeok_text}\n`;
        }

        // 메뉴 및 소제목 정보 추가
        prompt += `\n점사 항목:\n`;
        menu_items.forEach((menuItem, menuIndex) => {
            prompt += `\n${menuIndex + 1}. ${menuItem.title}\n`;
            if (menuItem.subtitles) {
                menuItem.subtitles.forEach((subtitle, subIndex) => {
                    prompt += `  ${menuIndex + 1}-${subIndex + 1}. ${subtitle.title}\n`;
                });
            }
        });

        // 소제목별 해석 요청
        prompt += `\n위 항목들을 순서대로 상세히 해석해주세요. HTML 형식으로 작성해주세요.`;

        console.log('프롬프트 생성 완료, 길이:', prompt.length);
        console.log('스트리밍 시작...');

        // 스트리밍 방식으로 생성
        const result = await geminiModel.generateContentStream(prompt);

        // 헤더 설정 (스트리밍 전송용)
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('Transfer-Encoding', 'chunked');

        // start 이벤트 전송
        res.write('data: {"type":"start"}\n\n');

        let accumulatedText = '';
        let chunkCount = 0;

        // 스트림 읽기
        for await (const chunk of result.stream) {
            chunkCount++;
            const chunkText = chunk.text();
            accumulatedText += chunkText;

            // chunk 이벤트 전송
            res.write(`data: ${JSON.stringify({ type: 'chunk', text: chunkText })}\n\n`);

            // 100개 청크마다 진행 상황 로그
            if (chunkCount % 100 === 0) {
                console.log(`전송된 청크: ${chunkCount}개, 누적 텍스트 길이: ${accumulatedText.length}자`);
            }
        }

        // done 이벤트 전송
        res.write(`data: ${JSON.stringify({ type: 'done', html: accumulatedText })}\n\n`);
        res.end();

        console.log(`스트리밍 완료, 총 청크: ${chunkCount}개, 총 텍스트 길이: ${accumulatedText.length}자`);

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
