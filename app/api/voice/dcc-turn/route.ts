/**
 * STT(리턴제로 VITO / 네이버 클로바) + Claude + Cartesia 한 턴 처리
 * POST body: { contentId, sessionId, audioBase64?, transcript?, conversationHistory? }
 * - audioBase64 있으면 STT(VITO 우선, 미설정 시 네이버 클로바) → 사용자 발화 텍스트
 * - transcript 있으면 그대로 사용. Claude + Cartesia TTS로 응답.
 * 반환: batch → { userTranscript, assistantText, audioBase64 } / streaming → NDJSON stream
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase-admin-client'
import WebSocket from 'ws'

export const maxDuration = 300

/** 리턴제로 VITO STT: 토큰 발급 후 스트리밍 전사 WS로 PCM 전송. 공식 문서: https://developers.rtzr.ai/docs/stt-streaming/websocket/ */
const VITO_AUTH_URL = 'https://openapi.vito.ai/v1/authenticate'
const VITO_STREAMING_URL = 'wss://openapi.vito.ai/v1/transcribe:streaming'
const VITO_SAMPLE_RATE = 16000
const VITO_PCM_CHUNK_BYTES = 4096

/** 네이버 클로바 (VITO 미설정 시 fallback). */
const NAVER_CLOVA_STT_URL_DEFAULT = 'https://clovaspeech-gw.ncloud.com/recog/v1/stt'
const NAVER_OPENAPI_STT_URL = 'https://naveropenapi.apigw.ntruss.com/recog/v1/stt'
const STT_LEADING_SILENCE_MS = 500
const STT_WAV_SAMPLE_RATE = 16000
const STT_WAV_BYTES_PER_SAMPLE = 2
const CARTESIA_URL = 'https://api.cartesia.ai/tts/bytes'
const CARTESIA_WS_URL = 'wss://api.cartesia.ai/tts/websocket'
const CARTESIA_VERSION = '2025-04-16'

function isRetryableSttError(status: number, _body: string): boolean {
  return status === 408 || status === 429 || status === 503 || status === 504
}

function isRetryableClaudeError(status: number, body: string): boolean {
  if (status === 429 || status === 503 || status === 504) return true
  try {
    const o = JSON.parse(body) as { error?: { type?: string } }
    return o?.error?.type === 'rate_limit_error' || o?.error?.type === 'overloaded_error'
  } catch {
    return false
  }
}

const STT_RETRY_MAX = 3
const STT_RETRY_DELAYS_MS = [800, 2000, 4000]
/** Clova 응답 지연·대용량 오디오 대비 (ms). 7초 넘게 걸리다 끊기는 경우 완화 */
const STT_FETCH_TIMEOUT_MS = 35000

/**
 * WAV 버퍼 앞에 무음 패딩을 붙여 첫 단어 인식 누락을 줄임.
 * 입력이 44바이트 WAV 헤더 + PCM이면, 무음(0) + 기존 PCM으로 새 WAV를 만들어 반환.
 */
function prependLeadingSilenceToWav(wavBuffer: Buffer, silenceMs: number, sampleRate: number, bytesPerSample: number): Buffer {
  if (silenceMs <= 0 || wavBuffer.length <= 44) return wavBuffer
  const silenceBytes = Math.floor((sampleRate * silenceMs / 1000) * bytesPerSample)
  const pcmStart = 44
  const pcmLength = wavBuffer.length - pcmStart
  const newDataSize = silenceBytes + pcmLength
  const newBuffer = Buffer.alloc(44 + newDataSize)
  newBuffer.write('RIFF', 0)
  newBuffer.writeUInt32LE(36 + newDataSize, 4)
  newBuffer.write('WAVE', 8)
  newBuffer.write('fmt ', 12)
  newBuffer.writeUInt32LE(16, 16)
  newBuffer.writeUInt16LE(1, 20)
  newBuffer.writeUInt16LE(1, 22)
  newBuffer.writeUInt32LE(sampleRate, 24)
  newBuffer.writeUInt32LE(sampleRate * bytesPerSample, 28)
  newBuffer.writeUInt16LE(bytesPerSample, 32)
  newBuffer.writeUInt16LE(16, 34)
  newBuffer.write('data', 36)
  newBuffer.writeUInt32LE(newDataSize, 40)
  newBuffer.fill(0, 44, 44 + silenceBytes)
  wavBuffer.copy(newBuffer, 44 + silenceBytes, pcmStart, wavBuffer.length)
  return newBuffer
}

/** 리턴제로 VITO: client_id/client_secret으로 액세스 토큰 발급 (6시간 유효). */
async function getVitoAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  const res = await fetch(VITO_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`VITO authenticate failed: ${res.status} ${text.slice(0, 200)}`)
  }
  const data = (await res.json()) as { access_token?: string }
  if (!data?.access_token) throw new Error('VITO access_token missing')
  return data.access_token
}

/** 리턴제로 VITO: PCM 버퍼(16kHz LINEAR16)를 스트리밍 전사 WS로 보내 인식 텍스트 반환. RTZR 문서: sample_rate, encoding, use_itn, EOS 종료. */
function transcribeWithVito(pcmBuffer: Buffer, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      sample_rate: String(VITO_SAMPLE_RATE),
      encoding: 'LINEAR16',
      use_itn: 'true',
      use_disfluency_filter: 'true',
      use_profanity_filter: 'false',
    })
    const url = `${VITO_STREAMING_URL}?${params.toString()}`
    const vitoWs = new WebSocket(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const parts: string[] = []
    let settled = false
    const finish = (err?: Error) => {
      if (settled) return
      settled = true
      try { vitoWs.close() } catch (_) {}
      if (err) reject(err)
      else resolve(parts.join(' ').replace(/\s+/g, ' ').trim())
    }
    vitoWs.on('open', () => {
      for (let i = 0; i < pcmBuffer.length; i += VITO_PCM_CHUNK_BYTES) {
        const chunk = pcmBuffer.subarray(i, Math.min(i + VITO_PCM_CHUNK_BYTES, pcmBuffer.length))
        if (chunk.length > 0) vitoWs.send(chunk)
      }
      vitoWs.send('EOS')
    })
    vitoWs.on('message', (data: Buffer | string) => {
      try {
        const raw = typeof data === 'string' ? data : data.toString('utf8')
        const result = JSON.parse(raw) as { final?: boolean; alternatives?: Array<{ text?: string }> }
        if (result?.final && result?.alternatives?.[0]?.text) parts.push(result.alternatives[0].text.trim())
      } catch (_) {}
    })
    vitoWs.on('error', (err) => finish(err))
    vitoWs.on('close', () => {
      if (!settled) finish()
    })
    setTimeout(() => {
      if (!settled) finish(new Error('VITO transcribe:streaming timeout'))
    }, 25000)
  })
}

const CLAUDE_RETRY_MAX = 2
const CLAUDE_RETRY_DELAYS_MS = [2000, 5000]
/** Claude 입력 토큰 절약·rate_limit 예방: 대화 이력 최근 N턴(1턴=user+assistant 2메시지)만 사용 */
const CLAUDE_HISTORY_MAX_MESSAGES = 40
/** 시스템 컨텍스트(만세력 등) 최대 길이. 초과 시 잘라서 rate_limit 예방 */
const CONTEXT_BLOCK_MAX_CHARS = 6000
/** 스트리밍 턴: Cartesia가 모든 청크 처리할 때까지 대기 최대 시간(ms). 무료 2분+1분 연장 시 공수가 2분 근처에서 끊기지 않도록 3분으로 설정 */
const DCC_CARTESIA_WAIT_MAX_MS = 180000

/** Cartesia 스트리밍: 쉼표/2~3단어 단위로 잘라 첫 소리 빨리 (제미나이급 티키타카). 공백 유지. */
function chunkTextForTts(text: string, wordsPerChunk = 2): string[] {
  const t = text.trim()
  if (!t) return []
  // 쉼표·마침표에서 먼저 끊어서 첫 청크를 더 작게 만듦
  const parts: string[] = []
  const splitRe = /([,，.。!?]\s*)/g
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = splitRe.exec(t)) !== null) {
    const segment = t.slice(lastIndex, m.index + m[0].length).trim()
    if (segment) parts.push(segment)
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < t.length) {
    const segment = t.slice(lastIndex).trim()
    if (segment) parts.push(segment)
  }
  const chunks: string[] = []
  if (parts.length === 0) {
    const words = t.split(/\s+/)
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const slice = words.slice(i, i + wordsPerChunk).join(' ')
      chunks.push(i === 0 ? slice : ' ' + slice)
    }
    return chunks
  }
  for (let p = 0; p < parts.length; p++) {
    const part = parts[p]
    const words = part.split(/\s+/).filter(Boolean)
    for (let i = 0; i < words.length; i += wordsPerChunk) {
      const slice = words.slice(i, i + wordsPerChunk).join(' ')
      chunks.push(chunks.length === 0 ? slice : ' ' + slice)
    }
  }
  return chunks
}

const CARTESIA_SAMPLE_RATE = 24000
const CARTESIA_NUM_CHANNELS = 1
const CARTESIA_BITS = 16

/** 맞장구: 유저 말 끝 → 클로드 본문 전에 Cartesia에 먼저 재생해 클로드 생성 시간을 벌고, 곧바로 반응하는 느낌을 줌 */
const DCC_FILLER_PHRASES = [
  // 1. 생각과 정리를 암시하는 멘트 (가장 무난함)
  '음... 잠시만요.',
  '아, 잠시만요.',
  '네, 잠깐만 기다려주세요.',
  '음... 조금만요.',
  '네, 잠시만 생각할게요.',
  '어떤 의미인지 잠시 정리해 볼게요.',
  '방금 하신 말씀을 잠깐 정리해 볼까요.',
  '음, 제 생각을 조금 가다듬어 볼게요.',
  '어떻게 말씀드릴지 잠깐 고민해 볼게요.',
  '네, 차분히 한 번 정리해 보겠습니다.',
  '음... 어떤 방향이 좋을지 잠시 볼게요.',
  '방금 주신 이야기를 잠시 되짚어 볼게요.',
  '네, 속으로 잠깐만 정리해 보겠습니다.',
  '잠시만요, 생각을 조금 모아볼게요.',
  '음, 이 부분은 잠시 고민이 필요하네요.',
  '어떻게 풀어가면 좋을지 잠깐 짚어볼게요.',
  '네, 찬찬히 한 번 생각해 보겠습니다.',
  '잠시만요, 머릿속으로 조금 그려볼게요.',
  '음, 방금 하신 말씀 잠시 새겨볼게요.',
  '어떤 맥락인지 잠깐만 살펴볼게요.',
  // 2. 상황 파악과 확인을 암시하는 멘트 (전문가 느낌)
  '제가 한 번 찬찬히 들여다볼게요.',
  '네, 그 부분 잠시만 확인해 볼게요.',
  '잠시만요, 조금 더 깊이 살펴볼게요.',
  '자, 어디 한 번 천천히 살펴볼까요.',
  '음, 이 상황을 잠시만 짚고 넘어갈게요.',
  '네, 조금만 더 자세히 들여다보겠습니다.',
  '잠시만요, 찬찬히 한 번 읽어내 볼게요.',
  '음, 어떤 상황인지 잠깐만 훑어볼게요.',
  '자, 잠시만 집중해서 살펴볼게요.',
  '네, 제가 한 번 조심스럽게 살펴볼게요.',
  '잠시만요, 이 부분을 조금 더 파악해 볼게요.',
  '음, 잠시만요. 조금 더 들여다보고 싶네요.',
  '네, 잠깐만 시간을 두고 살펴볼게요.',
  '자, 천천히 한 번 풀어볼까요.',
  '잠시만요, 조금 더 확실히 짚어볼게요.',
  '네, 잠깐만 살펴볼게요.',
  '음... 잠깐만 짚어볼게요.',
  '네, 잠시 머물러 볼게요.',
  '아, 조금만 기다려 주시겠어요?',
  '아... 네, 잠시만요.',
]

/** 맞장구 재생 예상 길이(ms). 이 시간 + 1초 후에 본문 TTS 시작 */
const DCC_FILLER_DURATION_MS = 2500

/** PCM 버퍼 → WAV base64 (청크마다 헤더 붙이면 틱틱 소리 나서, 버퍼 모아서 한 번만 씀) */
function pcmBufferToWavBase64(pcm: Buffer, sampleRate = CARTESIA_SAMPLE_RATE, numChannels = CARTESIA_NUM_CHANNELS, bitsPerSample = CARTESIA_BITS): string {
  if (pcm.length === 0) return ''
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8)
  const blockAlign = numChannels * (bitsPerSample / 8)
  const dataSize = pcm.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(numChannels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm]).toString('base64')
}

/** 단일 PCM base64 → WAV base64 (batch/fallback용) */
function pcmBase64ToWavBase64(pcmBase64: string, sampleRate = CARTESIA_SAMPLE_RATE, numChannels = CARTESIA_NUM_CHANNELS, bitsPerSample = CARTESIA_BITS): string {
  return pcmBufferToWavBase64(Buffer.from(pcmBase64, 'base64'), sampleRate, numChannels, bitsPerSample)
}

/** 스트리밍 시 이 바이트 이상 모아서 한 PCM 청크 전송. 자주 보낼수록 끊김 감소 (0.08초) */
const STREAMING_PCM_FLUSH_BYTES = Math.floor((CARTESIA_SAMPLE_RATE * (CARTESIA_BITS / 8) * CARTESIA_NUM_CHANNELS) * 0.08)

/** 공수 시 LLM이 말할 오늘의 토큰 — 사용자별 24시간 동일 유지 */
const FORTUNE_COLORS = ['빨간색', '주황색', '노란색', '초록색', '파란색', '남색', '보라색', '분홍색', '하늘색', '민트색', '흰색', '검정색', '회색'] as const
const FORTUNE_DIRECTIONS = ['동', '서', '남', '북', '북동', '북서', '남동', '남서'] as const
const FORTUNE_SPACES = [
  '현관 오른쪽', '현관 왼쪽', '지하철 4번 출구', '지하철 7번 출구', '카페 가장 구석 자리', '카페 창가 자리', '사무실 복도 끝', '엘리베이터 앞', '버스 정류장 벤치', '공원 입구',
  '편의점 냉장고 앞', '서점 2층 창가', '병원 대기실 구석', '학교 운동장 서쪽', '아파트 단지 정문', '주차장 맨 끝', '식당 창가 쪽', '도서관 1층 로비', '헬스장 락커룸 앞', '세탁실 문 옆',
  '베란다 남쪽 끝', '거실 소파 왼쪽', '침대 머리맡', '부엌 싱크대 앞', '화장실 거울 앞', '회의실 맨 뒤', '지하 1층 계단口', '옥상 동쪽 난간', '정류장 그늘', '건물 뒤쪽 비상구',
  '지하철 1번 출구', '지하철 2번 출구', '지하철 3번 출구', '지하철 5번 출구', '지하철 6번 출구', '지하철 8번 출구', '지하철 9번 출구', '지하철 10번 출구', '버스 앞문', '버스 뒷문',
  '기차역 플랫폼 끝', '공항 탑승구 앞', '병원 1층 로비', '병원 약국 앞', '은행 창구 3번', '우체국 택배 창구', '마트 야채 코너', '마트 냉동실 앞', '백화점 1층 화장품', '백화점 지하 식품관',
  '영화관 5관 입구', '영화관 맨 뒷줄', 'PC방 창가 자리', '독서실 2열 3번', '스터디카페 1인석', '코인노래방 5번 룸', '당구장 구석 테이블', '볼링장 1번 레인', '수영장 그늘 휴식처', '골프 연습장 맨 끝',
  '교회 오른쪽 통로', '사찰 대웅전 앞', '묘지 입구', '산 정상 바위', '해변 서쪽 끝', '강변 산책로 벤치', '호수 둘레길 2km 지점', '등산로 중간 쉼터', '농구장 서쪽 골대', '테니스장 2번 코트',
  '주유소 세차장', '주유소 편의점 입구', '세차장 대기실', '정비소 대기실', '주차 타워 5층', '지하 주차장 B2', '아파트 놀이터 그네 옆', '아파트 단지 뒤쪽', '빌라 1층 현관', '단독주택 마당 우물 옆',
  '회사 복도 끝 화분 앞', '회사 회의실 A', '회사 휴게실 자동판매기 앞', '회사 화장실 앞', '회사 계단 2층과 3층 사이', '재택 책상 왼쪽 서랍', '재택 베드룸 창문가', '재택 발코니 화분 앞', '카페 테이크아웃 카운터', '카페 바 테이블',
  '편의점 라면 냄비 앞', '편의점 와인 냉장고', '편의점 문 앞 담배대', '대형마트 장바구니 대기열', '대형마트 계산대 12번', '시장 입구 첫 번째 줄', '시장 골목 안쪽', '노점 옆 보도', '지하상가 중간 광장', '지하상가 화장실 근처',
  '학교 정문 우체통 앞', '학교 운동장 관람석', '학교 급식실 맨 뒤', '학교 도서관 열람실', '학교 화장실 2층', '학교 교문 왼쪽', '학원 복도 3번 강의실 앞', '학원 자습실 창가', '도서관 신문 읽는 칸', '도서관 만화 코너',
  '병원 주차장 입구', '병원 엘리베이터 홀', '약국 대기 의자', '한의원 침상 3번', '치과 대기실 창가', '안경점 검안실', '피부과 대기실', '산부인과 복도', '정형외과 물리치료실', '내과 진료실 2번',
  '은행 ATM 코너', '증권사 VIP 라운지', '보험사 상담실', '관공서 1층 민원실', '구청 창구 5번', '동사무소 게시판 앞', '파출소 앞', '소방서 정문', '우체국 우편함 앞', '주민센터 대기 의자',
  '호텔 로비 소파', '호텔 엘리베이터 앞', '호텔 레스토랑 입구', '호텔 수영장 옆 휴식공간', '모텔 주차장', '게스트하우스 부엌', '캠핑장 텐트 옆', '펜션 정원 의자', '민박 2층 복도', '리조트 스키장 로비',
  '식당 대기석', '식당 창가 맨 끝', '식당 화장실 통로', '패스트푸드 2층', '분식집 카운터', '고깃집 환기구 아래', '횟집 회 테이블', '술집 바 스툴', '브런치카페 테라스', '베이커리 진열대 끝',
  '미용실 샴푸 침대', '네일샵 2번 테이블', '마사지샵 대기 의자', '사우나 찜질방', '목욕탕 탈의실', '헬스장 러닝머신 5번', '요가원 맨 앞', '필라테스 기구 옆', '수영장 어린이 풀 옆', '탁구장 2번 테이블',
  '공연장 1층 왼쪽 통로', '공연장 2층 중앙', '영화관 1관 5번째 줄', '갤러리 2번 전시실', '박물관 고문서실', '미술관 카페 테라스', '동물원 사자 우리 앞', '수족관 터널 입구', '놀이공원 회전목마 옆', '워터파크 그늘 쉼터',
  '역 플랫폼 2번 차량 앞', '역 개찰구 왼쪽', '역 대합실 벤치', '버스 터미널 5번 승강장', '고속버스 휴게실', '공항 출국장 대기', '항구 부두 3번', '배 대기실', '주차장 1층 A구역', '주차장 2층 B구역',
  '편의점 24시간 무인결제대', '세탁소 옷 걸이 앞', '이발소 거울 앞', '수선집 대기 의자', '꽃집 냉장고 앞', '반려동물샵 사료 진열대', '서점 베스트셀러 코너', '문구점 필기구 진열대', '악기점 피아노 앞', '스포츠용품점 러닝화 코너',
  '공원 화장실 옆', '공원 분수대 주변', '공원 벤치 3번', '공원 놀이기구 앞', '산책로 500m 지점', '자전거 도로 휴게 벤치', '스케이트장 코너', '축구장 페널티 박스', '야구장 3루석', '실내체육관 관람석',
  '오피스텔 로비', '오피스텔 엘리베이터', '원룸 싱크대 앞', '원룸 책상 의자', '고시원 복도', '고시원 공용 부엌', '기숙사 1층 로비', '기숙사 세탁실', '대학 강의동 101호 앞', '대학 중앙도서관 3층',
  '백화점 옥상 정원', '백화점 지하 2층 주차장 연결', '아울렛 1번 건물', '아울렛 푸드코트', '면세점 입구', '홈플러스 식품관', '이마트 전자제품 코너', '코스트코 시식 코너', '트레이더스 와인 냉장고', '쿠팡 로켓배송 보관함',
  '부동산 창구', '보험 설계사 사무실', '법률사무소 대기실', '회계사무소 서류함 앞', '광고사 회의실', '인쇄소 대기 의자', '사진관 배경 앞', '웨딩홀 리허설실', '장례식장 조문 대기', '성당 오른쪽 통로',
  '체육관 샤워실', '실내 수영장 2번 레인', '클라이밍장 초급 벽', '스쿼시장 1번 코트', '배드민턴장 네트 옆', '탁구장 관람석', '당구장 카운터', '볼링장 신발 대여처', '게임장 뽑기기계 앞', '오락실 DDR 기계 옆',
  '노래방 2인 룸', '바 비디오 볼 앞', '클럽 무대 왼쪽', '라이브카페 스탠딩', '재즈바 색소폰 앞', '호프집 TV 아래', '와인바 시그니처 와인 진열', '칵테일바 바텐더 앞', '루프탑 바 난간', '펍 다트판 옆',
  '공장 창고 2번 통로', '창고 맨 안쪽', '물류센터 피킹존', '배송 hub 분류대', '건설현장 오두막', '현장 판넬 앞', '연구실 냉장고 옆', '실험실 후드 앞', '서버실 2번 랙', '창고 적재함 3층',
  '농장 비닐하우스 입구', '농장 저장창고', '축사 2번 칸', '온실 화분 진열대', '과수원 사과나무 10번', '논둑 그늘', '밭 두둑 끝', '시골 마을 회관', '시골 정자', '산골 샘물 앞',
  '해변 파라솔 아래', '해변 바닷가 돌밭', '선착장 배 묶인 곳', '등대 아래', '방파제 끝', '갯벌 입구', '해수욕장 샤워장', '비치발리볼 네트 옆', '요트 선실', '수상 스키 대기처',
  '스키장 리프트 대기', '스키장 초급 슬로프', '스노보드 하프파이프', '빙상장 코너', '썰매장 언덕 위', '눈썰매장 대기 줄', '온천 탕 옆 휴식처', '찜질방 한증막', '족욕 코너', '스파 마사지 테이블',
  '쇼핑몰 중앙 광장', '쇼핑몰 푸드코트 끝', '쇼핑몰 키즈카페 입구', '쇼핑몰 영화관 로비', '쇼핑몰 지하 1층 연결', '아케이드 게임기 앞', '토이샵 레고 코너', '가전제품 매장 TV 벽', '가구점 소파 쇼룸', '인테리어샵 조명 코너',
  '정류장 비 오는 날 그늘', '정류장 의자 2번', '택시 승강장 맨 앞', '전동킥보드 주차장', '자전거 거치대 1번', '공유주차장 A-05', '주유소 화장실 옆', '고속도로 휴게소 남쪽', '휴게소 푸드코트', '휴게소 야외 벤치',
  '공항 입국장 2번 게이트', '공항 수하물 수취대', '공항 면세점 화장품', '공항 라운지 샤워실', '기차 기내 5번 칸', 'KTX 창가석', 'SRT 2층', '무궁화호 복도', '버스 맨 뒷자리', '시외버스 중간 휴게',
  '교회 성가대 단상', '교회 주차장 뒤', '절 대웅전 계단', '절 산신각', '성당 исповедальня 앞', '성당 오르간 아래', '기독교 서점', '불교 서점', '점집 입구', '무속인 집 대청',
] as const
const FORTUNE_OBJECTS = [
  '깨끗한 거울', '새 양말', '노란 포스트잇', '탄산수', '맑은 물 한 잔', '낡은 영수증', '손톱깎이', '손거울', '이어폰', '빨간 펜', '흰 손수건', '초록 식물', '파란 노트', '동전 한 푼', '열쇠 고리', '손목시계', '목걸이', '반지', '책갈피', '우산',
  '지갑', '휴대폰 케이스', '머그컵', '알람시계', '캔들', '향수병', '사진 한 장', '종이비행기', '빈 봉투', '볼펜 세 개', '손전등', '라벨 떨어진 병', '나뭇잎 한 장', '빨간 리본', '흰 티셔츠', '검정 가방', '노란 우비', '초록 머리끈', '파란 수건', '보라색 양산',
  '민트색 쿠션', '분홍색 립글로스', '주황색 스카프', '남색 블루투스 스피커', '하늘색 파우치', '회색 스웨터', '흰색 수건', '검정색 지갑', '금속 열쇠', '유리 컵', '도자기 그릇', '나무 젓가락', '플라스틱 빗', '고무줄', '철사 옷걸이', '실 뭉치', '바늘', '가위', '풀 한 통', '스테이플러',
  '클립 한 묶음', '자석', '돋보기', '줄자', '각도기', '컴퍼스', '지우개', '형광펜', '사인펜', '만년필', '샤프', '크레용', '물감 튜브', '붓', '팔레트', '캔버스', '스케치북', '일기장', '수첩', '달력',
  '알람 시계', '스탑워치', '손목 밴드', '안경', '선글라스', '렌즈 케이스', '귀걸이 한 쌍', '팔찌', '헤어핀', '빗', '머리끈', '손거울', '화장품 파우더', '립밤', '손톱 polish', '면봉', '화장지', '손소독제', '마스크 한 장', '붕대',
  '온도계', '혈압계', '알약 한 알', '비타민 통', '찜질팩', '밴드', '연고 튜브', '물 한 병', '보온병', '아이스팩', '담요', '쿠션', '베개', '이불', '수건', '세탁 세제', '섬유유연제', '빨래집게', '빨랫대', '다리미',
  '전기 담요', '핫팩', '손난로', '선풍기', '제습기', '가습기', '공기청정기 필터', '전등 갓', '전구', '멀티탭', '충전기', '보조배터리', '케이블', '어댑터', 'USB 메모리', 'SD 카드', '이어폰 케이스', '블루투스 이어폰', '스마트워치', '태블릿 거치대',
  '키보드', '마우스', '모니터 받침', '책받침', '책꽂이', '파일 보관함', '서류 봉투', '클립보드', '명함함', '우표 한 장', '엽서', '편지지', '봉투', '스티커 한 장', '마스킹 테이프', '양면 테이프', '포장지', '리본', '상자', '비닐봉지',
  '과일 그릇', '사과 한 알', '바나나', '오렌지', '포도 한 송이', '딸기', '수박 한 조각', '키위', '멜론', '참외', '복숭아', '자두', '배', '감', '대추', '밤', '호두', '땅콩', '캐슈넛', '아몬드',
  '빵 한 조각', '쿠키', '초콜릿', '사탕', '껌', '젤리', '마시멜로', '과자 봉지', '라면 한 봉지', '시리얼', '우유 팩', '요거트', '치즈 한 조각', '버터', '잼 병', '꿀', '소금 통', '후추', '식용유', '간장',
  '컵라면', '전자레인지용 용기', '냄비 뚜껑', '프라이팬', '도마', '식기', '수저', '포크', '나이프', '와인잔', '맥주잔', '찻잔', '티스푼', '국자', '뒤집개', '채', '칼', '캔 오프너', '병따개', '티백',
  '화분', '화분 흙', '물뿌리개', '가위', '삽', '장갑', '씨앗 봉지', '비료', '제초제', '스프레이', '꽃다발', '화병', '드라이플라워', '선인장', '다육이', '허브', '바질', '로즈마리', '민트', '라벤더',
  '고양이 사료', '강아지 간식', '물병', '목걸이', '하네스', '배변패드', '장난감', '스크래쳐', '캣타워', '방석', '이불', '털 브러시', '샴푸', '간이 화장실', '이동장', '사료 그릇', '물 그릇', '산책줄', '배변봉투', '목욕 수건',
  '공 한 개', '인형', '레고 블록', '퍼즐 조각', '보드게임', '카드 한 벌', '주사위', '모노폴리 돈', '체스 말', '바둑돌', '장기 말', '오목 알', '윷', '고스톱 패', '포켓몬 카드', '뽑기 티켓', '풍선', '비눗방울', '연', '팽이',
  '기타', '피아노 건반', '하모니카', '탬버린', '마이크', '이펙터', '악보', '메트로놈', '스탠드', '앰프', '케이블', '피크', '손가락 패드', '리드', '드럼 스틱', '심벌즈', '트라이앵글', '마라카스', '캐스터네츠', '플루트',
  '책 한 권', '만화책', '소설', '시집', '에세이', '전공서적', '사전', '백과사전', '여행 가이드', '지도', '아트북', '포토북', '앨범', '다이어리', '플래너', '수첩', '메모장', '포스트잇 팩', '클립보드', '책갈피 끈',
  '운동화', '슬리퍼', '부츠', '샌들', '로퍼', '스니커즈', '등산화', '장갑', '모자', '스카프', '벨트', '양말 한 켤레', '넥타이', '핀', '브로치', '시계 밴드', '가방 끈', '지퍼', '단추', 'safety pin',
  '바늘 실', '재봉틀', '재킷', '코트', '점퍼', '가디건', '니트', '블라우스', '셔츠', '티셔츠', '바지', '스커트', '원피스', '정장', '트레이닝복', '수영복', '레깅스', '속옷', '양말', '스타킹',
] as const

/** KST 기준 다음 자정(00:00)의 타임스탬프(ms). 자정이 지나면 새로 지정 가능 */
function getNextMidnightKstMs(): number {
  const now = new Date()
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000
  const kstDay = new Date(kstMs)
  const y = kstDay.getUTCFullYear()
  const m = kstDay.getUTCMonth()
  const d = kstDay.getUTCDate()
  return Date.UTC(y, m, d + 1) - 9 * 60 * 60 * 1000
}

type FortuneTokenEntry = { number: number; color: string; direction: string; space: string; object: string; expiresAt: number }
const fortuneTokenStore = new Map<string, FortuneTokenEntry>()

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function getOrCreateFortuneTokens(userKey: string): FortuneTokenEntry | null {
  if (!userKey || typeof userKey !== 'string' || !userKey.trim()) return null
  const key = userKey.trim()
  const now = Date.now()
  let entry = fortuneTokenStore.get(key)
  if (entry && entry.expiresAt > now) return entry
  entry = {
    number: Math.floor(Math.random() * 10), // 0~9
    color: pick(FORTUNE_COLORS),
    direction: pick(FORTUNE_DIRECTIONS),
    space: pick(FORTUNE_SPACES),
    object: pick(FORTUNE_OBJECTS),
    expiresAt: getNextMidnightKstMs(), // 자정 지나면 갱신
  }
  fortuneTokenStore.set(key, entry)
  return entry
}

type ConversationMessage = { role: 'user' | 'assistant'; content: string }

const sessionHistory = new Map<string, ConversationMessage[]>()
/** 세션별 '공수(오늘의 운세)' 전달 여부. [시작] 턴에서 인사·공수 후 한 번만 true. 새 질문 시 공수 반복 금지, 재요청 시에만 다시 말함 */
const sessionsWithFortuneDelivered = new Set<string>()

function getOrCreateHistory(sessionId: string): ConversationMessage[] {
  let h = sessionHistory.get(sessionId)
  if (!h) {
    h = []
    sessionHistory.set(sessionId, h)
  }
  return h
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { contentId, sessionId, audioBase64, transcript: userTranscriptOverride, conversationHistory: clientHistory, userName: bodyUserName, contextText: bodyContextText, phone: bodyPhone } = body as {
      contentId?: number
      sessionId?: string
      audioBase64?: string
      transcript?: string
      conversationHistory?: ConversationMessage[]
      userName?: string
      /** 클라이언트에서 구성한 컨텍스트(KST·내담자 정보·만세력 등). 무료속성 아닐 때 주입 */
      contextText?: string
      /** 24시간 동일 공수 토큰용 사용자 키(휴대폰 등). 있으면 오늘의 숫자·컬러·방위·공간·오브제를 사용자별로 고정 */
      phone?: string
    }

    if (!contentId || !sessionId) {
      return NextResponse.json({ success: false, error: 'contentId, sessionId 필요' }, { status: 400 })
    }

    const supabase = getAdminSupabaseClient()
    const { data: content, error: contentError } = await supabase
      .from('contents')
      .select('voice_cartesia_config, voice_persona_prompt, voice_counselor_name, voice_initial_greet_prompt')
      .eq('id', contentId)
      .single()

    if (contentError || !content) {
      return NextResponse.json({ success: false, error: '콘텐츠를 찾을 수 없습니다.' }, { status: 404 })
    }

    let cartesiaConfig: {
      voice_id?: string
      speed?: number
      volume?: number
      /** TTS 기본 감정 (단일, generation_config.emotion). 없으면 emotions[0] 사용 */
      emotion?: string
      emotions?: string[]
      tts_mode?: 'batch' | 'streaming'
    } = {}
    try {
      const raw = (content as any).voice_cartesia_config
      if (raw) {
        cartesiaConfig = typeof raw === 'string' ? JSON.parse(raw) : raw
      }
    } catch {
      /* ignore */
    }

    const voiceId = cartesiaConfig.voice_id || '304fdbd8-65e6-40d6-ab78-f9d18b9efdf9'
    /** Speed: 어드민 voice_cartesia_config.speed 슬라이더와 연결. 미설정 시 1 */
    const speed = Math.max(0.6, Math.min(1.5, cartesiaConfig.speed ?? 1))
    const volume = Math.max(0.5, Math.min(2, cartesiaConfig.volume ?? 1))
    const emotions = Array.isArray(cartesiaConfig.emotions) && cartesiaConfig.emotions.length > 0
      ? cartesiaConfig.emotions
      : ['calm', 'content', 'sympathetic']
    const primaryEmotion = (cartesiaConfig.emotion && cartesiaConfig.emotion.trim()) || emotions[0] || 'calm'
    const ttsMode = cartesiaConfig.tts_mode === 'streaming' ? 'streaming' : 'batch'

    /** 침묵깨기: 클라이언트가 지정한 문장만 캐릭터 목소리로 TTS (STT/Claude 생략) */
    const silenceBreakText = (body as { silenceBreakText?: string }).silenceBreakText
    if (typeof silenceBreakText === 'string' && silenceBreakText.trim()) {
      const assistantText = silenceBreakText.trim()
      const cartesiaKey = process.env.CARTESIA_API_KEY
      if (!cartesiaKey) {
        return NextResponse.json({ success: false, error: 'CARTESIA_API_KEY 미설정' }, { status: 500 })
      }
      if (ttsMode === 'streaming') {
        const encoder = new TextEncoder()
        const contextId = `dcc-sb-${sessionId}-${Date.now()}`
        const basePayload = {
          model_id: 'sonic-3',
          voice: { mode: 'id' as const, id: voiceId },
          language: 'ko',
          generation_config: { speed, volume, emotion: primaryEmotion },
          output_format: { container: 'raw' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
          context_id: contextId,
          max_buffer_delay_ms: 1500,
        }
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'userTranscript', text: '' }) + '\n'))
            const enqueueAudio = (pcmBuffer: Buffer) => {
              if (!pcmBuffer?.length) return
              try {
                controller.enqueue(encoder.encode(JSON.stringify({
                  type: 'audio' as const,
                  base64: pcmBuffer.toString('base64'),
                  format: 'pcm_s16le' as const,
                  sampleRate: CARTESIA_SAMPLE_RATE,
                }) + '\n'))
              } catch (_) {}
            }
            let pcmBuffer = Buffer.alloc(0)
            const flushPcm = () => {
              if (pcmBuffer.length > 0) {
                enqueueAudio(pcmBuffer)
                pcmBuffer = Buffer.alloc(0)
              }
            }
            const pushPcm = (pcm: Buffer) => {
              if (!pcm?.length) return
              pcmBuffer = Buffer.concat([pcmBuffer, pcm])
              while (pcmBuffer.length >= STREAMING_PCM_FLUSH_BYTES) {
                const toFlush = pcmBuffer.subarray(0, STREAMING_PCM_FLUSH_BYTES)
                pcmBuffer = pcmBuffer.subarray(STREAMING_PCM_FLUSH_BYTES)
                enqueueAudio(Buffer.from(toFlush))
              }
            }
            const finish = () => {
              try {
                flushPcm()
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', assistantText }) + '\n'))
                controller.close()
              } catch (_) {}
            }
            const ws = new WebSocket(CARTESIA_WS_URL, {
              headers: {
                'Cartesia-Version': CARTESIA_VERSION,
                Authorization: `Bearer ${cartesiaKey}`,
              },
            })
            ws.on('open', () => {
              ws.send(JSON.stringify({ ...basePayload, transcript: assistantText, continue: false }))
            })
            ws.on('message', (raw: Buffer | string) => {
              const text = typeof raw === 'string' ? raw : raw.toString('utf-8')
              try {
                const msg = JSON.parse(text) as { type?: string; data?: string; done?: boolean }
                if (msg.type === 'chunk' && typeof msg.data === 'string') {
                  const pcm = Buffer.from(msg.data, 'base64')
                  if (pcm.length > 0) pushPcm(pcm)
                  flushPcm()
                  return
                }
                if (msg.type === 'done') {
                  flushPcm()
                  ws.close()
                  finish()
                }
              } catch {
                if (Buffer.isBuffer(raw) && raw.length > 0) pushPcm(raw)
              }
            })
            ws.on('error', () => finish())
            ws.on('close', () => finish())
            setTimeout(() => {
              if (ws.readyState !== ws.CLOSED && ws.readyState !== ws.CLOSING) ws.close()
              finish()
            }, 60000)
          },
        })
        return new NextResponse(stream, {
          headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' },
        })
      }
      const ttsBody = {
        model_id: 'sonic-3',
        transcript: assistantText,
        voice: { mode: 'id' as const, id: voiceId },
        language: 'ko',
        generation_config: { speed, volume, emotion: primaryEmotion },
        output_format: { container: 'wav' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
      }
      const cartesiaRes = await fetch(CARTESIA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cartesia-Version': CARTESIA_VERSION,
          Authorization: `Bearer ${cartesiaKey}`,
        },
        body: JSON.stringify(ttsBody),
      })
      if (!cartesiaRes.ok) {
        const errText = await cartesiaRes.text()
        console.error('[dcc-turn] 502 Cartesia (silence break):', cartesiaRes.status, errText?.slice(0, 200))
        return NextResponse.json({ success: false, error: 'Cartesia TTS 실패: ' + errText }, { status: 502 })
      }
      const audioArrayBuffer = await cartesiaRes.arrayBuffer()
      const audioBase64Out = Buffer.from(audioArrayBuffer).toString('base64')
      return NextResponse.json({
        success: true,
        userTranscript: '',
        assistantText,
        audioBase64: audioBase64Out,
      })
    }

    let userTranscript = userTranscriptOverride
    if (userTranscript == null && audioBase64) {
      const vitoClientId = (process.env.VITO_CLIENT_ID || process.env.RETURNZERO_VITO_CLIENT_ID || '').trim()
      const vitoClientSecret = (process.env.VITO_CLIENT_SECRET || process.env.RETURNZERO_VITO_CLIENT_SECRET || '').trim()
      const useVito = Boolean(vitoClientId && vitoClientSecret)

      if (useVito) {
        const audioBuf = Buffer.from(audioBase64, 'base64')
        const isWav = audioBuf.length >= 44 && audioBuf[0] === 0x52 && audioBuf[1] === 0x49 && audioBuf[2] === 0x46 && audioBuf[3] === 0x46
        const wavWithSilence = isWav
          ? prependLeadingSilenceToWav(audioBuf, STT_LEADING_SILENCE_MS, STT_WAV_SAMPLE_RATE, STT_WAV_BYTES_PER_SAMPLE)
          : audioBuf
        const pcmBuf = isWav ? wavWithSilence.subarray(44) : wavWithSilence
        if (pcmBuf.length === 0) {
          userTranscript = ''
        } else {
          try {
            const token = await getVitoAccessToken(vitoClientId, vitoClientSecret)
            userTranscript = await transcribeWithVito(pcmBuf, token)
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            console.error('[dcc-turn] 502 VITO(STT):', msg)
            return NextResponse.json(
              { success: false, error: '음성 인식을 처리하지 못했습니다. 다시 말씀해 주세요.' },
              { status: 502 }
            )
          }
        }
      } else {
      const sttClientId = (process.env.NAVER_CLOVA_STT_CLIENT_ID || process.env.NAVER_CLOVA_CLIENT_ID || '').trim()
      const sttClientSecret = (process.env.NAVER_CLOVA_STT_CLIENT_SECRET || process.env.NAVER_CLOVA_CLIENT_SECRET || '').trim()
      const useOpenApi = Boolean(sttClientId && sttClientSecret)
      const secretKey = (process.env.NAVER_CLOVA_SPEECH_SECRET_KEY || process.env.NAVER_CLOVA_STT_SECRET_KEY || '').trim()

      if (!useOpenApi && !secretKey) {
        return NextResponse.json(
          {
            success: false,
            error:
              'STT 인증 미설정. VITO(리턴제로): VITO_CLIENT_ID + VITO_CLIENT_SECRET 또는 네이버 클로바: NAVER_CLOVA_STT_CLIENT_ID/SECRET 또는 NAVER_CLOVA_SPEECH_SECRET_KEY.',
          },
          { status: 500 }
        )
      }

      const sttBaseUrl = useOpenApi
        ? NAVER_OPENAPI_STT_URL
        : (process.env.NAVER_CLOVA_SPEECH_INVOKE_URL || '').trim() || NAVER_CLOVA_STT_URL_DEFAULT
      const sttUrl = sttBaseUrl.includes('?') ? `${sttBaseUrl.replace(/\?.*$/, '')}?lang=Kor` : `${sttBaseUrl}?lang=Kor`
      const audioBuf = Buffer.from(audioBase64, 'base64')
      const isWav = audioBuf.length >= 44 && audioBuf[0] === 0x52 && audioBuf[1] === 0x49 && audioBuf[2] === 0x46 && audioBuf[3] === 0x46
      const bodyBuf = isWav
        ? prependLeadingSilenceToWav(audioBuf, STT_LEADING_SILENCE_MS, STT_WAV_SAMPLE_RATE, STT_WAV_BYTES_PER_SAMPLE)
        : audioBuf
      let lastBody = ''
      for (let attempt = 0; attempt <= STT_RETRY_MAX; attempt++) {
        if (attempt > 0) {
          const delay = STT_RETRY_DELAYS_MS[attempt - 1] ?? 2000
          await new Promise((r) => setTimeout(r, delay))
        }
        const ac = new AbortController()
        const timeoutId = setTimeout(() => ac.abort(), STT_FETCH_TIMEOUT_MS)
        const useBearer = !useOpenApi && attempt === 1
        const headers: Record<string, string> = useOpenApi
          ? {
              'X-NCP-APIGW-API-KEY-ID': sttClientId,
              'X-NCP-APIGW-API-KEY': sttClientSecret,
              'Content-Type': 'application/octet-stream',
            }
          : {
              'X-CLOVASPEECH-API-KEY': secretKey,
              'Content-Type': 'application/octet-stream',
              ...(useBearer ? { Authorization: `Bearer ${secretKey}` } : {}),
            }
        try {
          const res = await fetch(sttUrl, {
            method: 'POST',
            headers,
            body: new Uint8Array(bodyBuf),
            signal: ac.signal,
          })
          clearTimeout(timeoutId)
          lastBody = await res.text()
          if (res.ok) {
            try {
              const out = JSON.parse(lastBody) as { text?: string }
              userTranscript = typeof out?.text === 'string' ? out.text.trim() : ''
            } catch {
              userTranscript = ''
            }
            if (!userTranscript && bodyBuf.length > 44) {
              const approxSec = (bodyBuf.length - 44) / (STT_WAV_SAMPLE_RATE * STT_WAV_BYTES_PER_SAMPLE)
              console.warn('[dcc-turn] Naver Clova STT returned empty text. audioBytes:', bodyBuf.length, 'approxSec:', approxSec.toFixed(2))
            }
            break
          }
          const is401 = res.status === 401
          const shouldRetry = is401 ? attempt < STT_RETRY_MAX : isRetryableSttError(res.status, lastBody)
          if (attempt === STT_RETRY_MAX || !shouldRetry) {
            const userMessage = isRetryableSttError(res.status, lastBody)
              ? '음성 인식이 일시적으로 지연되었습니다. 잠시 후 다시 말씀해 주세요.'
              : '음성 인식을 처리하지 못했습니다. 다시 말씀해 주세요.'
            if (res.status === 401) {
              console.error(
                '[dcc-turn] 502 Naver Clova STT: 401',
                useOpenApi
                  ? '(naveropenapi Client ID/Secret. 애플리케이션 등록에서 CLOVA Speech Recognition 사용 권한 확인)'
                  : `Invalid secret. Secret key length: ${secretKey.length} (스트리밍 도메인 키는 REST 미지원. 단문 인식 도메인 키 또는 naveropenapi Client ID/Secret 사용)`
              )
            } else {
              console.error('[dcc-turn] 502 Naver Clova STT:', res.status, lastBody?.slice(0, 300))
            }
            return NextResponse.json({ success: false, error: userMessage }, { status: 502 })
          }
        } catch (e) {
          clearTimeout(timeoutId)
          const isNetworkError = e instanceof TypeError && String(e.message || '').toLowerCase().includes('fetch failed')
          lastBody = (e instanceof Error && e.name === 'AbortError') ? 'Request timeout' : String(e)
          if (attempt === STT_RETRY_MAX) {
            console.error('[dcc-turn] 502 Naver Clova STT: timeout or network', lastBody)
            return NextResponse.json(
              { success: false, error: '음성 인식이 일시적으로 지연되었습니다. 잠시 후 다시 말씀해 주세요.' },
              { status: 502 }
            )
          }
          if (isNetworkError) {
            console.warn('[dcc-turn] Naver Clova STT network error, retrying...', attempt + 1, '/', STT_RETRY_MAX)
          }
        }
      }
      }
    }

    if (userTranscript?.trim()) {
      console.log('[dcc-turn] STT:', userTranscript.trim().slice(0, 100) + (userTranscript.length > 100 ? '...' : ''))
    }
    if (!userTranscript || typeof userTranscript !== 'string' || !userTranscript.trim()) {
      // 무음/인식 실패 시 400 대신 no-op 반환 (클라이언트가 끊기지 않도록)
      if (ttsMode === 'streaming') {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'userTranscript', text: '' }) + '\n'))
            controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', assistantText: '' }) + '\n'))
            controller.close()
          },
        })
        return new NextResponse(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-store',
          },
        })
      }
      return NextResponse.json({ success: true, userTranscript: '', assistantText: '', audioBase64: '' })
    }

    const rawHistory = (clientHistory && Array.isArray(clientHistory) && clientHistory.length > 0) ? clientHistory : getOrCreateHistory(sessionId)
    const history = rawHistory
      .filter((m): m is ConversationMessage => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-CLAUDE_HISTORY_MAX_MESSAGES)
    if (history.length > 0) {
      console.log('[dcc-turn] conversation history:', history.length, 'messages → Claude')
    }
    const persona = String((content as any).voice_persona_prompt || '').trim()
    const counselorName = String((content as any).voice_counselor_name || '').trim()
    const initialGreetPromptRaw = String((content as any).voice_initial_greet_prompt || '').trim()
    const userName = typeof bodyUserName === 'string' ? bodyUserName.trim() : ''
    const initialGreetPrompt = initialGreetPromptRaw.replace(/\{\{userName\}\}/g, userName)
    const specialTags = emotions.filter((e) => typeof e === 'string' && e.startsWith('[') && e.endsWith(']'))
    const emotionHint = `\n[음성 톤] ${primaryEmotion}.${specialTags.length > 0 ? ` [TTS 연출] 필요 시 답변에 ${specialTags.join(', ')} 를 넣으면 TTS가 웃음·공감 등을 표현합니다. 자연스럽게 1~2곳만 사용하세요.` : ''}`

    const lengthRule = persona
      ? `- 답변 분량과 말투는 위 [페르소나]를 따르세요. 신점·공수 등이라면 '모든 걸 아는 것처럼' 구체적으로 풀어서 말하고, 지침에 적힌 7단계·인과관계·비방 등을 자연스럽게 이어가세요. 단답형이 아닌, 페르소나에 맞는 충분한 말을 하세요.`
      : `- 최대한 짧고 명확하게, 한두 문장 단위로 대답해 줘. 긴 설명은 나눠서 말해도 돼.`
    // 티키타카: 첫 단어를 즉시 뱉어 TTS가 빨리 시작되도록 (제미나이급 꼼수)
    const firstWordRule = `- 모든 답변은 반드시 "네," "아," "음," "그렇군요," "그래요," 중 하나로 시작한 뒤 본론을 말하세요.`
    const emotionTagRule = `- 답변에 특수 태그(TTS 연출)를 자연스럽게 포함하세요. 태그는 반드시 대괄호로 감싸서 사용합니다.
- TTS 연출용 특수 태그: [laughter], [sigh], [gasp], [um], [uh], [hmm], [clears throat], [cough]. 아래 [TTS 연출]에 안내된 것만 사용하세요.
- 과하지 않게 1~2곳만 사용하고, 문장 앞이나 중간에 배치하세요.`
    const rawContext = typeof bodyContextText === 'string' ? bodyContextText.trim() : ''
    const userKey = typeof bodyPhone === 'string' ? bodyPhone.trim() : ''
    const fortuneTokens = getOrCreateFortuneTokens(userKey)
    const fortuneBlock = fortuneTokens
      ? `

### 오늘의 공수 토큰 (반드시 기억하고, 공수·인사 시 아래 값을 그대로 말할 것. 동일 사용자에게 24시간 동안 이 값들을 변경하지 말 것)
- 오늘의 숫자: ${fortuneTokens.number}
- 오늘의 컬러: ${fortuneTokens.color}
- 오늘의 방위: ${fortuneTokens.direction}
- 오늘의 공간: ${fortuneTokens.space}
- 오늘의 오브제: ${fortuneTokens.object}
`
      : ''
    const maxContextChars = CONTEXT_BLOCK_MAX_CHARS - fortuneBlock.length - 20 // 여유로 앞쪽만 자름
    const truncatedContext = rawContext.length <= maxContextChars ? rawContext : rawContext.slice(0, maxContextChars) + '\n(이하 생략)'
    const fullContext = (truncatedContext + fortuneBlock).trim()
    const contextBlock = fullContext ? `\n\n${fullContext}` : ''
    const isStartTurn = userTranscript.trim() === '[시작]'
    const systemPrompt = `당신은 한국어로 대답하는 음성 상담사입니다.
${persona ? `[페르소나]\n${persona}\n` : ''}
${counselorName ? `상담사 이름: ${counselorName}. 자신을 이 이름으로 소개하고 대화하세요.\n` : ''}
${lengthRule}
${firstWordRule}
${emotionTagRule}
- 답변은 음성으로 읽기 좋게, 자연스러운 구어체로 작성하세요.
- [맥락 유지 - 필수] 대화 이력(이전 턴들)은 하나의 연속된 대화입니다. 반드시 이전 맥락을 이어받아 응답하세요.
  - 사용자가 방금 한 말만 보지 말고, 위에 주어진 전체 대화 이력을 읽고 같은 주제·상황으로 이어서 답하세요.
  - 예: 사용자가 "와이프랑 여행 못 갔어" → 당신이 "다음엔 여행 가보세요" → 사용자가 "어디로 가는 게 좋을까?"라고 하면, "여행"을 어디로 가면 좋을지 구체적으로 추천하세요. "어떤 방향이냐"고 되묻지 마세요.
  - 사용자가 이전 턴에서 이미 말한 내용을 기반으로 질문했으면, 그 맥락을 알고 있다고 보고 바로 구체적으로 답하세요. "말해 봐요", "어떤 걸 말하는지"처럼 되묻지 마세요.
- 필요한 경우 감정이나 웃음을 담아 말할 수 있습니다.${emotionHint}${contextBlock}${!isStartTurn && sessionsWithFortuneDelivered.has(sessionId) ? `

[중요] 이 세션에서 이미 공수(오늘의 운세)를 전달했다. 사용자가 새 질문을 할 때는 이미 내린 공수를 반복하지 말 것. 사용자가 "공수 다시 말해줘", "공수 다시 말해달라", "아까 공수 다시 들려줘" 등으로 분명히 다시 말해달라고 요청할 때만 공수 내용을 다시 말할 것.` : ''}`

    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (!anthropicKey) {
      return NextResponse.json({ success: false, error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })
    }

    // [시작] = 상담 입장 시 AI가 먼저 인사하도록 지시 (페르소나 + 초대 인사 지침 준수, 분량은 지침대로)
    const userMessage = isStartTurn
      ? (initialGreetPrompt
          ? `[상담 시작] 사용자가 방금 입장했습니다. 아래 [초대 인사 지침]을 반드시 따르세요. 지침에 분량(예: 약 20초)이나 첫방문/재방문 구분이 있으면 그에 맞춰 말하세요. 분량이 적혀 있으면 그 길이를 넘지 말고 그 안에서 마무리하세요.\n[초대 인사 지침]\n${initialGreetPrompt}`
          : '[상담 시작] 사용자가 방금 입장했습니다. 짧고 친절하게 한 문장으로만 먼저 인사해 주세요.')
      : userTranscript

    const messages: { role: 'user' | 'assistant'; content: string }[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage },
    ]

    const claudeBody = {
      model: 'claude-sonnet-4-6',
      max_tokens: 8192, // 초대 인사·긴 답변 시 중간 잘림 방지. 제미나이 권장 2048+ (256/512면 말하다 뚝 끊김)
      stream: true,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      cache_control: { type: 'ephemeral' as const, ttl: '5m' as const },
    }

    let claudeRes: Response | null = null
    for (let attempt = 0; attempt <= CLAUDE_RETRY_MAX; attempt++) {
      if (attempt > 0) {
        const delay = CLAUDE_RETRY_DELAYS_MS[attempt - 1] ?? 2000
        await new Promise((r) => setTimeout(r, delay))
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(claudeBody),
      })
      if (res.ok) {
        claudeRes = res
        break
      }
      const errBody = await res.text()
      if (attempt === CLAUDE_RETRY_MAX || !isRetryableClaudeError(res.status, errBody)) {
        let userMessage: string
        if (res.status === 400) {
          try {
            const errJson = JSON.parse(errBody) as { error?: { message?: string } }
            const msg = errJson?.error?.message ?? ''
            if (/credit balance is too low|insufficient credit|billing/i.test(msg)) {
              userMessage = '상담 서비스 크레딧이 부족합니다. 관리자에게 문의하거나 결제·플랜을 확인해 주세요.'
            } else {
              userMessage = '상담 응답을 처리하지 못했습니다. 다시 말씀해 주세요.'
            }
          } catch {
            userMessage = '상담 응답을 처리하지 못했습니다. 다시 말씀해 주세요.'
          }
        } else {
          userMessage = isRetryableClaudeError(res.status, errBody)
            ? '상담 응답이 바쁩니다. 잠시 후 다시 말씀해 주세요.'
            : '상담 응답을 처리하지 못했습니다. 다시 말씀해 주세요.'
        }
        console.error('[dcc-turn] 502 Claude:', res.status, errBody?.slice(0, 500))
        return NextResponse.json({ success: false, error: userMessage }, { status: 502 })
      }
    }
    if (!claudeRes) {
      console.error('[dcc-turn] 502 Claude: no response after retries')
      return NextResponse.json({ success: false, error: '상담 응답을 처리하지 못했습니다. 다시 말씀해 주세요.' }, { status: 502 })
    }
    const cartesiaKey = process.env.CARTESIA_API_KEY
    if (!cartesiaKey) {
      return NextResponse.json({ success: false, error: 'CARTESIA_API_KEY 미설정' }, { status: 500 })
    }

    let assistantText = ''
    const streamBody = claudeRes.body
    if (!streamBody) {
      console.error('[dcc-turn] 502 Claude: no stream body')
      return NextResponse.json({ success: false, error: 'Claude 스트림 없음' }, { status: 502 })
    }
    // ── 스트리밍: Claude 토큰 → Cartesia WS 즉시 전송 (진짜 티키타카) ──
    if (ttsMode === 'streaming') {
      const encoder = new TextEncoder()
      /** 연결마다 context_id를 새로 씀(재연결 시에도) */
      const basePayloadNoContext = {
        model_id: 'sonic-3' as const,
        voice: { mode: 'id' as const, id: voiceId },
        language: 'ko' as const,
        generation_config: { speed, volume, emotion: primaryEmotion },
        output_format: { container: 'raw' as const, encoding: 'pcm_s16le' as const, sample_rate: CARTESIA_SAMPLE_RATE },
        max_buffer_delay_ms: 1500,
      }

      /** 청크당 최대 길이. 너무 긴 한 덩어리는 Cartesia/연결 불안정 원인될 수 있어 분할 */
      const MAX_CHUNK_CHARS = 280
      const extractChunk = (text: string) => {
        if (!text) return { chunk: '', rest: '' }
        const leadTrim = text.length - text.trimStart().length
        const trimmed = text.trimStart()
        if (!trimmed) return { chunk: '', rest: text }
        const punctIdx = trimmed.search(/[,，.。!?]/)
        if (punctIdx >= 0) {
          const len = punctIdx + 1
          const end = leadTrim + (len <= MAX_CHUNK_CHARS ? len : MAX_CHUNK_CHARS)
          return { chunk: text.slice(0, end), rest: text.slice(end) }
        }
        if (trimmed.length >= 12) {
          const spaceAt = trimmed.indexOf(' ', 11)
          if (spaceAt >= 0) {
            const len = spaceAt + 1
            const end = leadTrim + (len <= MAX_CHUNK_CHARS ? len : MAX_CHUNK_CHARS)
            return { chunk: text.slice(0, end), rest: text.slice(end) }
          }
        }
        if (trimmed.length > MAX_CHUNK_CHARS) {
          return { chunk: text.slice(0, leadTrim + MAX_CHUNK_CHARS), rest: text.slice(leadTrim + MAX_CHUNK_CHARS) }
        }
        return { chunk: '', rest: text }
      }

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(JSON.stringify({ type: 'userTranscript', text: userTranscript.trim() }) + '\n'))
          /** 스트리밍: 클라이언트 AudioStreamer가 raw PCM만 받으므로 base64는 PCM 그대로, format 명시 */
          const enqueueAudio = (pcmBuffer: Buffer) => {
            if (!pcmBuffer || pcmBuffer.length === 0) return
            try {
              controller.enqueue(encoder.encode(JSON.stringify({
                type: 'audio' as const,
                base64: pcmBuffer.toString('base64'),
                format: 'pcm_s16le' as const,
                sampleRate: CARTESIA_SAMPLE_RATE,
              }) + '\n'))
            } catch (_) {}
          }
          const finish = () => {
            try {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'done', assistantText }) + '\n'))
              controller.close()
            } catch (_) {}
          }
          let finished = false
          const KEEPALIVE_MS = 15000
          const keepaliveInterval = setInterval(() => {
            if (finished) return
            try {
              controller.enqueue(encoder.encode(JSON.stringify({ type: 'keepalive' }) + '\n'))
            } catch (_) {}
          }, KEEPALIVE_MS)
          const resolveOnce = () => {
            if (finished) return
            finished = true
            clearInterval(keepaliveInterval)
            if (pcmBuffer.length > 0) {
              enqueueAudio(pcmBuffer)
              pcmBuffer = Buffer.alloc(0)
            }
            finish()
          }

          let currentContextId = `dcc-${sessionId}-${Date.now()}`
          let currentWs = new WebSocket(CARTESIA_WS_URL, {
            headers: {
              'Cartesia-Version': CARTESIA_VERSION,
              Authorization: `Bearer ${cartesiaKey}`,
            },
          })
          let wsOpen = false
          const pendingSends: string[] = []
          let sentFinalChunk = false
          let reconnecting = false
          let fillerSentAt: number | null = null
          let wsSentCount = 0
          let wsDoneCount = 0

          let pcmBuffer = Buffer.alloc(0)
          const flushPcm = () => {
            if (pcmBuffer.length > 0) {
              enqueueAudio(pcmBuffer)
              pcmBuffer = Buffer.alloc(0)
            }
          }
          const pushPcm = (pcm: Buffer) => {
            if (pcm.length === 0) return
            pcmBuffer = Buffer.concat([pcmBuffer, pcm])
            while (pcmBuffer.length >= STREAMING_PCM_FLUSH_BYTES) {
              const toFlush = pcmBuffer.subarray(0, STREAMING_PCM_FLUSH_BYTES)
              pcmBuffer = pcmBuffer.subarray(STREAMING_PCM_FLUSH_BYTES)
              enqueueAudio(Buffer.from(toFlush))
            }
          }

          const isAllDone = () => sentFinalChunk && wsDoneCount >= wsSentCount

          const attachWsHandlers = (ws: WebSocket, label: string) => {
            ws.on('message', (raw: Buffer | string) => {
              if (ws !== currentWs) return
              const text = typeof raw === 'string' ? raw : raw.toString('utf-8')
              try {
                const msg = JSON.parse(text) as { type?: string; data?: string }
                if (msg.type === 'chunk' && typeof msg.data === 'string') {
                  const pcm = Buffer.from(msg.data, 'base64')
                  if (pcm.length > 0) pushPcm(pcm)
                  flushPcm()
                  return
                }
                if (msg.type === 'done') {
                  wsDoneCount++
                  flushPcm()
                  if (isAllDone()) {
                    ws.close()
                    // 다음 틱으로 미룸: 같은 배치로 도착한 chunk가 아직 처리 안 됐을 수 있음.
                    // 먼저 모든 chunk를 enqueue한 뒤 스트림을 닫아야 클라이언트 TTS가 끊기지 않음.
                    setImmediate(() => {
                      if (finished) return
                      if (isAllDone()) resolveOnce()
                    })
                  }
                  return
                }
              } catch {
                if (Buffer.isBuffer(raw) && raw.length > 0) pushPcm(raw)
              }
            })
            ws.on('error', () => {
              if (ws !== currentWs) return
              // LLM이 아직 스트리밍 중(sentFinalChunk false)이면 스트림을 닫지 않음.
              // 다음 sendCartesia에서 readyState !== 1이면 재연결 로직이 동작함.
              setImmediate(() => {
                if (!finished && sentFinalChunk) resolveOnce()
              })
            })
            ws.on('close', () => {
              if (ws !== currentWs) return
              wsOpen = false
              // resolveOnce() 호출하지 않음: Cartesia가 모든 done 전에 연결을 끊으면
              // 여기서 종료하면 미전달 오디오가 있는데 클라이언트에 done이 가서 TTS가 끊김.
              // 스트림 종료는 done 핸들러의 isAllDone() 또는 30초 타임아웃에서만 수행.
            })
          }

          const flushPendingSends = (ws: WebSocket) => {
            if (pendingSends.length === 0) return
            fillerSentAt = Date.now()
            try {
              for (const m of pendingSends) {
                ws.send(m)
                wsSentCount++
              }
            } catch (_) {}
            pendingSends.length = 0
          }

          const sendCartesia = (transcript: string, isFinal: boolean) => {
            if (isFinal) sentFinalChunk = true
            const payload = { ...basePayloadNoContext, context_id: currentContextId, transcript, continue: !isFinal }
            const msg = JSON.stringify(payload)
            if (currentWs.readyState !== 1 /* OPEN */) {
              pendingSends.push(msg)
              if (!reconnecting) {
                reconnecting = true
                currentContextId = `dcc-${sessionId}-${Date.now()}`
                wsSentCount = 0
                wsDoneCount = 0
                const newWs = new WebSocket(CARTESIA_WS_URL, {
                  headers: {
                    'Cartesia-Version': CARTESIA_VERSION,
                    Authorization: `Bearer ${cartesiaKey}`,
                  },
                })
                currentWs = newWs
                attachWsHandlers(newWs, '재연결')
                newWs.on('open', () => {
                  wsOpen = true
                  reconnecting = false
                  flushPendingSends(newWs)
                })
              }
              return
            }
            try {
              currentWs.send(msg)
              wsSentCount++
            } catch (_) {}
          }

          const initialWs = currentWs
          attachWsHandlers(initialWs, '초기')
          initialWs.on('open', () => {
            if (currentWs !== initialWs) return
            wsOpen = true
            flushPendingSends(initialWs)
          })
          setTimeout(() => {
            if (currentWs.readyState !== currentWs.CLOSED && currentWs.readyState !== currentWs.CLOSING) currentWs.close()
            resolveOnce()
          }, 300000)

          ;(async () => {
            const reader = streamBody.getReader()
            const decoder = new TextDecoder()
            let buffer = ''
            let pendingText = ''
            let sentAny = false
            let firstDelta = true
            try {
            for (;;) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() ?? ''
              for (const line of lines) {
                if (!line.startsWith('data: ')) continue
                const data = line.slice(6).trim()
                if (data === '[DONE]') continue
                try {
                  const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
                  if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
                    const text = parsed.delta.text
                    if (firstDelta) {
                      process.stdout.write('\n[dcc-turn] LLM(실시간) ')
                      firstDelta = false
                    }
                    process.stdout.write(text)
                    assistantText += text
                    pendingText += text
                    for (;;) {
                      const { chunk, rest } = extractChunk(pendingText)
                      if (!chunk) break
                      pendingText = rest
                      const trimmed = chunk.trim()
                      if (!trimmed) continue
                      if (fillerSentAt !== null) {
                        const wait = fillerSentAt + DCC_FILLER_DURATION_MS + 1000 - Date.now()
                        if (wait > 0) await new Promise<void>(r => setTimeout(r, wait))
                        fillerSentAt = null
                      }
                      const toSend = sentAny ? ` ${trimmed}` : trimmed
                      sentAny = true
                      sendCartesia(toSend, false)
                    }
                  }
                } catch {
                  /* ignore */
                }
              }
            }
            const finalText = pendingText.trim()
            if (finalText) {
              const toSend = sentAny ? ` ${finalText}` : finalText
              sendCartesia(toSend, true)
            } else {
              sentFinalChunk = true
              try {
                if (currentWs.readyState === 1) {
                  currentWs.send(JSON.stringify({ ...basePayloadNoContext, context_id: currentContextId, transcript: '', continue: false }))
                }
              } catch (_) {}
            }
            assistantText = assistantText.trim()
            if (assistantText) {
              if (isStartTurn) sessionsWithFortuneDelivered.add(sessionId)
              history.push({ role: 'user', content: userTranscript })
              history.push({ role: 'assistant', content: assistantText })
              if (history.length > 50) history.splice(0, history.length - 50)
              const sessionArr = getOrCreateHistory(sessionId)
              sessionArr.push({ role: 'user', content: userTranscript })
              sessionArr.push({ role: 'assistant', content: assistantText })
              if (sessionArr.length > 50) sessionArr.splice(0, sessionArr.length - 50)
              // 다시보기용: TTS 오디오 전부 전달 전에 텍스트를 먼저 보내서, 연결이 끊겨도 텍스트가 저장되도록 함
              try {
                controller.enqueue(encoder.encode(JSON.stringify({ type: 'assistantText', text: assistantText }) + '\n'))
              } catch (_) {}
            }
            if (isAllDone()) {
              setImmediate(() => {
                if (!finished && isAllDone()) resolveOnce()
              })
            } else {
              // 긴 인사·공수는 청크 수가 많아 Cartesia가 모두 처리하기까지 30초를 넘길 수 있음. DCC_CARTESIA_WAIT_MAX_MS까지 대기.
              setTimeout(() => {
                if (!finished) {
                  try { if (currentWs.readyState === 1 || currentWs.readyState === 0) currentWs.close() } catch (_) {}
                  setImmediate(() => {
                    if (!finished) resolveOnce()
                  })
                }
              }, DCC_CARTESIA_WAIT_MAX_MS)
            }
            } catch (e) {
              // Claude 스트림 read 실패(연결 끊김·클라이언트 abort 등). 즉시 닫지 말고
              // 이미 보낸 청크에 대한 Cartesia 오디오가 나갈 시간을 주고 DCC_CARTESIA_WAIT_MAX_MS 후 종료.
              console.error('[dcc-turn] Claude 스트림 읽기 중단:', e instanceof Error ? e.message : String(e))
              if (!finished) {
                setTimeout(() => {
                  if (!finished) resolveOnce()
                }, DCC_CARTESIA_WAIT_MAX_MS)
              }
            }
          })().catch((err) => {
            console.error('[dcc-turn] async IIFE reject:', err instanceof Error ? err.message : String(err))
            if (!finished) {
              setTimeout(() => {
                if (!finished) resolveOnce()
              }, DCC_CARTESIA_WAIT_MAX_MS)
            }
          })
        },
      })

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store',
        },
      })
    }

    const reader = streamBody.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let firstDelta = true
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const parsed = JSON.parse(data) as { type?: string; delta?: { type?: string; text?: string } }
            if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta' && parsed.delta?.text) {
              if (firstDelta) {
                process.stdout.write('\n[dcc-turn] LLM(실시간) ')
                firstDelta = false
              }
              const t = parsed.delta.text
              assistantText += t
              process.stdout.write(t)
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    assistantText = assistantText.trim()

    if (!assistantText) {
      console.error('[dcc-turn] 502 Claude: empty assistant text (batch path)')
      return NextResponse.json({ success: false, error: 'Claude 응답이 비어 있습니다.' }, { status: 502 })
    }

    if (isStartTurn) sessionsWithFortuneDelivered.add(sessionId)
    history.push({ role: 'user', content: userTranscript })
    history.push({ role: 'assistant', content: assistantText })
    if (history.length > 50) history.splice(0, history.length - 50)
    const sessionArrBatch = getOrCreateHistory(sessionId)
    sessionArrBatch.push({ role: 'user', content: userTranscript })
    sessionArrBatch.push({ role: 'assistant', content: assistantText })
    if (sessionArrBatch.length > 50) sessionArrBatch.splice(0, sessionArrBatch.length - 50)

    const ttsBody = {
      model_id: 'sonic-3',
      transcript: assistantText,
      voice: { mode: 'id', id: voiceId },
      language: 'ko',
      generation_config: {
        speed,
        volume,
        emotion: primaryEmotion,
      },
      output_format: { container: 'wav', encoding: 'pcm_s16le', sample_rate: CARTESIA_SAMPLE_RATE },
    }

    const cartesiaRes = await fetch(CARTESIA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cartesia-Version': CARTESIA_VERSION,
        Authorization: `Bearer ${cartesiaKey}`,
      },
      body: JSON.stringify(ttsBody),
    })

    if (!cartesiaRes.ok) {
      const errText = await cartesiaRes.text()
      console.error('[dcc-turn] 502 Cartesia:', cartesiaRes.status, errText?.slice(0, 300))
      return NextResponse.json({ success: false, error: 'Cartesia TTS 실패: ' + errText }, { status: 502 })
    }

    const audioArrayBuffer = await cartesiaRes.arrayBuffer()
    const audioBase64Out = Buffer.from(audioArrayBuffer).toString('base64')

    return NextResponse.json({
      success: true,
      userTranscript: userTranscript.trim(),
      assistantText,
      audioBase64: audioBase64Out,
    })
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || '서버 오류' }, { status: 500 })
  }
}
