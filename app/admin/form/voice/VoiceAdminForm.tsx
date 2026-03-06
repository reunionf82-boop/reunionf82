'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useVoiceForm, isDefaultOption, isChargeOption } from './useVoiceForm'

const addCacheBusting = (url: string | null | undefined): string => {
  if (!url || !url.trim()) return ''
  return url.split('?')[0] + '?t=' + Date.now()
}

const VOICE_STYLES = [
  { value: 'calm', label: '차분하게' },
  { value: 'bright', label: '밝게' },
  { value: 'firm', label: '단호하게' },
  { value: 'empathetic', label: '공감적으로' },
  { value: 'warm', label: '다정하게' },
]

const VOICE_NAMES = [
  { value: 'Aoede', label: 'Aoede (여성향)' },
  { value: 'Charon', label: 'Charon (여성향)' },
  { value: 'Fenrir', label: 'Fenrir (남성향)' },
  { value: 'Kore', label: 'Kore (여성향)' },
  { value: 'Puck', label: 'Puck (남성향)' },
]

const VOICE_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini (분당 약 20원)' },
  { id: 'openai', label: 'OpenAI GPT (분당 약 270원)' },
  { id: 'xai', label: 'xAI Grok (분당 약 70원)' },
  { id: 'deepgram-claude-cartesia', label: '리턴제로+Claude4.6+Cartesia (분당 약 60원)' },
]

/** OpenAI Realtime API 음성 (GPT 전용) */
const VOICE_GPT_NAMES = [
  { value: 'alloy', label: 'Alloy (합금, 중성적·균형)' },
  { value: 'echo', label: 'Echo (에코, 선명·명료)' },
  { value: 'fable', label: 'Fable (동화, 이야기 같은 부드러움)' },
  { value: 'onyx', label: 'Onyx (흑옥, 깊고 낮은)' },
  { value: 'nova', label: 'Nova (초신성, 밝고 선명)' },
  { value: 'shimmer', label: 'Shimmer (반짝임, 밝고 가벼운)' },
  { value: 'ash', label: 'Ash (재, 차분하고 담백)' },
  { value: 'ballad', label: 'Ballad (발라드, 감성적·서정적)' },
  { value: 'coral', label: 'Coral (산호, 따뜻하고 부드러운)' },
  { value: 'sage', label: 'Sage (현자, 지혜롭고 차분한)' },
  { value: 'verse', label: 'Verse (운율, 리듬감 있는)' },
  { value: 'cedar', label: 'Cedar (삼나무, 차분하고 깊은, 추천)' },
  { value: 'marin', label: 'Marin (바다, 부드럽고 선명한, 추천)' },
]

/** xAI Grok Voice Agent 음성 */
const VOICE_XAI_NAMES = [
  { value: 'ara', label: 'Ara (따뜻함, 친근함)' },
  { value: 'rex', label: 'Rex (자신감, 전문적)' },
  { value: 'eve', label: 'Eve' },
  { value: 'sal', label: 'Sal (부드러움, 균형)' },
  { value: 'gork', label: 'Gork' },
]

/** Cartesia 감정 드롭다운 (단일 선택, TTS API에 전달) — 이미지 UI와 동일 */
const CARTESIA_EMOTION_DROPDOWN: { value: string; label: string; emoji: string }[] = [
  { value: 'neutral', label: 'Neutral (뉴트럴)', emoji: '😐' },
  { value: 'calm', label: 'Calm (차분함)', emoji: '😌' },
  { value: 'content', label: 'Content (만족함)', emoji: '😊' },
  { value: 'excited', label: 'Excited (신남)', emoji: '🤩' },
  { value: 'sad', label: 'Sad (슬픔)', emoji: '😔' },
  { value: 'angry', label: 'Angry (화남)', emoji: '😠' },
  { value: 'scared', label: 'Scared (두려움)', emoji: '😱' },
]
/** Cartesia Sonic-3 감정 태그 (id: API값, label: 한국어). 상담/운세에 적합한 것 포함 */
const CARTESIA_EMOTIONS: { value: string; label: string }[] = [
  { value: 'neutral', label: '중립 (neutral)' },
  { value: 'calm', label: '차분함 (calm)' },
  { value: 'content', label: '만족/편안 (content)' },
  { value: 'peaceful', label: '평화로움 (peaceful)' },
  { value: 'serene', label: '고요함 (serene)' },
  { value: 'sympathetic', label: '공감 (sympathetic)' },
  { value: 'grateful', label: '감사 (grateful)' },
  { value: 'affectionate', label: '다정함 (affectionate)' },
  { value: 'trust', label: '신뢰 (trust)' },
  { value: 'contemplative', label: '숙고 (contemplative)' },
  { value: 'mysterious', label: '신비로움 (mysterious)' },
  { value: 'confident', label: '자신감 (confident)' },
  { value: 'proud', label: '자부심 (proud)' },
  { value: 'determined', label: '결연함 (determined)' },
  { value: 'happy', label: '행복 (happy)' },
  { value: 'excited', label: '흥분 (excited)' },
  { value: 'enthusiastic', label: '열정 (enthusiastic)' },
  { value: 'curious', label: '호기심 (curious)' },
  { value: 'anticipation', label: '기대 (anticipation)' },
  { value: 'amazed', label: '놀람 (amazed)' },
  { value: 'surprised', label: '당황 (surprised)' },
  { value: 'joking/comedic', label: '유머 (joking/comedic)' },
  { value: 'flirtatious', label: '유혹 (flirtatious)' },
  { value: 'sad', label: '슬픔 (sad)' },
  { value: 'dejected', label: '낙담 (dejected)' },
  { value: 'melancholic', label: '우울 (melancholic)' },
  { value: 'disappointed', label: '실망 (disappointed)' },
  { value: 'hurt', label: '상처 (hurt)' },
  { value: 'apologetic', label: '사과 (apologetic)' },
  { value: 'hesitant', label: '주저 (hesitant)' },
  { value: 'anxious', label: '불안 (anxious)' },
  { value: 'scared', label: '두려움 (scared)' },
  { value: 'angry', label: '화남 (angry)' },
  { value: 'frustrated', label: '좌절 (frustrated)' },
  { value: 'resigned', label: '체념 (resigned)' },
  { value: 'confused', label: '혼란 (confused)' },
  { value: 'bored', label: '지루함 (bored)' },
  { value: 'tired', label: '지침 (tired)' },
  { value: 'distant', label: '냉담 (distant)' },
  { value: 'skeptical', label: '회의적 (skeptical)' },
  { value: 'nostalgic', label: '향수 (nostalgic)' },
  { value: 'wistful', label: '그리움 (wistful)' },
  { value: 'guilty', label: '죄책감 (guilty)' },
  { value: 'insecure', label: '불안정 (insecure)' },
  { value: 'rejected', label: '거절당함 (rejected)' },
  { value: 'elated', label: '황홀 (elated)' },
  { value: 'euphoric', label: '황홀경 (euphoric)' },
  { value: 'triumphant', label: '승리감 (triumphant)' },
  { value: 'mad', label: '광기 (mad)' },
  { value: 'outraged', label: '분노 (outraged)' },
  { value: 'agitated', label: '동요 (agitated)' },
  { value: 'threatened', label: '위협 (threatened)' },
  { value: 'disgusted', label: '혐오 (disgusted)' },
  { value: 'contempt', label: '경멸 (contempt)' },
  { value: 'envious', label: '질투 (envious)' },
  { value: 'sarcastic', label: '비꼼 (sarcastic)' },
  { value: 'ironic', label: '아이러니 (ironic)' },
  { value: 'panicked', label: '공황 (panicked)' },
  { value: 'alarmed', label: '경악 (alarmed)' },
]
/** Cartesia 특수 태그 (Nonverbalisms) — TTS가 말할 때 웃음·한숨·놀람 등 표현. 있는 건 다 넣어두면 좋음 */
const CARTESIA_SPECIAL_TAGS = [
  { value: '[laughter]', label: '웃음 [laughter]' },
  { value: '[sigh]', label: '한숨 [sigh]' },
  { value: '[gasp]', label: '놀람/헐떡임 [gasp]' },
  { value: '[um]', label: '말 막힘 [um]' },
  { value: '[uh]', label: '말 막힘 [uh]' },
  { value: '[hmm]', label: '흠 [hmm]' },
  { value: '[clears throat]', label: '목청 [clears throat]' },
  { value: '[cough]', label: '기침 [cough]' },
]
/** 감정/특수 태그 전체 값 (All 체크/해제 및 기본값용) */
const ALL_EMOTION_VALUES = [
  ...CARTESIA_SPECIAL_TAGS.map((t) => t.value),
  ...CARTESIA_EMOTIONS.map((t) => t.value),
]

/** DB 저장값이 라디오 id와 동일/동등한지 판별 (gpt-realtime, gpt-4o-realtime-preview-2024-12-17 등 변형 포함) */
function voiceModelMatchesRadio(stored: string, radioId: string): boolean {
  const s = String(stored || '').trim()
  if (s === radioId) return true
  if (radioId === 'gpt-4o-realtime-preview') {
    return /^gpt(-4o)?-realtime(-preview)?(-\d{4}-\d{2}-\d{2})?$/i.test(s) || s.startsWith('gpt-4o-realtime')
  }
  if (radioId === 'gemini-2.5-flash-native-audio-preview-12-2025') {
    return s.startsWith('gemini-2') || s.includes('gemini-2.5-flash')
  }
  return false
}

function getProviderFromModel(model: string, providerField?: string): string {
  if (providerField) return providerField
  if (/^gpt/i.test(model)) return 'openai'
  if (/^grok/i.test(model)) return 'xai'
  return 'gemini'
}

export default function VoiceAdminForm() {
  const h = useVoiceForm()
  const [cartesiaDeleteConfirm, setCartesiaDeleteConfirm] = useState<{ gender: 'female' | 'male'; index: number } | null>(null)
  const [advisorVideoUrlInput, setAdvisorVideoUrlInput] = useState('')

  if (h.authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">인증 확인 중...</div>
      </div>
    )
  }
  if (h.authenticated === false) return null

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="w-full mx-auto px-6 py-8">
        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-violet-400 hover:underline text-sm mb-2 inline-block">&larr; 관리자 리스트</Link>
            <h1 className="text-2xl font-bold">음성형 컨텐츠 {h.id ? '수정' : '추가'}</h1>
          </div>
          <div className="flex gap-3">
            {h.id && !h.duplicateId && (
              <button type="button" onClick={() => h.setShowDeleteConfirm(true)}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2 rounded-lg">
                삭제
              </button>
            )}
            <button type="button" onClick={() => { if (h.isDirty) h.setShowCancelConfirm(true); else h.goBack(); }}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg">
              취소
            </button>
            <button type="button" onClick={h.handleSave} disabled={h.saving}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg">
              {h.saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* 보이스 테스트 리셋 (동작 확인용) */}
        {h.id && !h.duplicateId && (
          <div className="mb-6 p-4 bg-amber-900/30 border border-amber-700 rounded-xl">
            <p className="text-amber-200 text-sm font-medium mb-2">보이스 테스트 데이터 리셋</p>
            <p className="text-gray-400 text-xs mb-3">
              이 컨텐츠(ID: {h.id})에 대한 무료시작·무료연장·방문횟수·만료 플래그·잔여시간/잔여금액 관련 데이터를 브라우저 저장소에서 삭제합니다. 테스트용 전화번호를 입력하면 DB 잔액/잔여시간도 초기화됩니다.
            </p>
            <button
              type="button"
              onClick={async () => {
                try {
                  const cid = String(h.id)
                  const phone = window.prompt('테스트용 전화번호(예: 010-1234-5678)를 입력하면 DB 잔액/잔여시간도 초기화됩니다. 건너뛰려면 취소를 누르세요.')
                  if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem('voice_entered_by_100')
                    sessionStorage.removeItem('voice_time_expired')
                    sessionStorage.removeItem('payment_voice_time_option')
                    sessionStorage.removeItem('payment_voice_total_seconds')
                    sessionStorage.removeItem('payment_voice_minutes')
                    sessionStorage.removeItem('voice_session_charge_type')
                    sessionStorage.removeItem('voice_came_to_form')
                    sessionStorage.removeItem('voice_pay_amount')
                    sessionStorage.removeItem('payment_phone')
                    sessionStorage.removeItem('payment_oid')
                    if (sessionStorage.getItem('payment_content_id') === cid) sessionStorage.removeItem('payment_content_id')
                    if (sessionStorage.getItem('result_content_id') === cid) sessionStorage.removeItem('result_content_id')
                  }
                  if (typeof localStorage !== 'undefined') {
                    localStorage.removeItem(`voice_free_extend_${cid}`)
                    localStorage.removeItem(`voice_free_start_${cid}`)
                    if (localStorage.getItem('voice_content_id') === cid) localStorage.removeItem('voice_content_id')
                    localStorage.removeItem('voice_payment_oid')
                    localStorage.removeItem('voice_last_phone')
                    const prefix = `voice:visits:${cid}:`
                    const toRemove: string[] = []
                    for (let i = 0; i < localStorage.length; i++) {
                      const k = localStorage.key(i)
                      if (k?.startsWith(prefix)) toRemove.push(k)
                    }
                    toRemove.forEach((k) => localStorage.removeItem(k))
                  }
                  if (phone && phone.trim()) {
                    try {
                      await fetch('/api/voice/balance', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'drain_balance', contentId: parseInt(cid, 10), phone: phone.trim() }),
                      })
                    } catch { /* ignore */ }
                  }
                  alert('보이스 테스트 데이터가 완전 초기화되었습니다.\n\n• 1분 무료 연장 확인: 폼에서 「무료시작」 버튼으로 진입하세요.\n• 잔여시간/잔여금액 표시가 초기화되었습니다.')
                } catch (e) {
                  alert('리셋 중 오류: ' + (e as Error)?.message)
                }
              }}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium"
            >
              이 컨텐츠 보이스 테스트 리셋
            </button>
          </div>
        )}

        {/* 취소 확인 커스텀 모달 */}
        {h.showCancelConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => h.setShowCancelConfirm(false)}>
            <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-600 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-200 mb-6">변경 사항을 취소하시겠습니까?</p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => h.setShowCancelConfirm(false)}
                  className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-medium">아니오</button>
                <button type="button" onClick={() => { h.setShowCancelConfirm(false); h.goBack(); }}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium">예</button>
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 팝업 */}
        {h.showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => !h.deletingContent && h.setShowDeleteConfirm(false)}>
            <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-600 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-200 mb-6">
                &quot;{h.form.content_name || '이 컨텐츠'}&quot;를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => h.setShowDeleteConfirm(false)} disabled={h.deletingContent}
                  className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white font-medium">취소</button>
                <button type="button" onClick={h.handleDelete} disabled={h.deletingContent}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium">
                  {h.deletingContent ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cartesia 보이스 행 삭제 확인 팝업 */}
        {cartesiaDeleteConfirm != null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => setCartesiaDeleteConfirm(null)}>
            <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-600 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-200 mb-6">이 보이스를 정말 삭제할까요?</p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setCartesiaDeleteConfirm(null)} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-medium">취소</button>
                <button
                  type="button"
                  onClick={() => {
                    h.removeCartesiaVoice(cartesiaDeleteConfirm.gender, cartesiaDeleteConfirm.index)
                    setCartesiaDeleteConfirm(null)
                  }}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium"
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 저장 완료 커스텀 토스트 */}
        {h.showSaveSuccess && (
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium shadow-lg">
            저장되었습니다.
          </div>
        )}

        {h.loading ? (
          <div className="text-gray-400">로딩 중...</div>
        ) : (
          <div className="space-y-6">
            {/* 0. 결제코드 (맨 처음) */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">결제코드</h2>
              <div>
                <label className="block text-sm text-gray-300 mb-1">결제코드 (자동 부여)</label>
                <input
                  value={h.id && !h.duplicateId ? h.form.payment_code : (h.nextPaymentCode || '로딩 중...')}
                  readOnly disabled
                  className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-400 cursor-not-allowed" />
                <p className="mt-1 text-xs text-gray-500">
                  {h.id && !h.duplicateId
                    ? '결제 코드는 자동으로 부여되며 변경할 수 없습니다.'
                    : h.nextPaymentCode
                      ? `다음 결제 코드: ${h.nextPaymentCode} (저장 시 자동 부여)`
                      : '결제 코드를 조회하는 중...'}
                </p>
              </div>
            </section>

            {/* 1. 음성대화 모델 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">음성대화 모델</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-2">제공사 선택</label>
                  <div className="grid grid-cols-2 gap-2">
                    {VOICE_PROVIDERS.map((p) => {
                      const isSelected = h.form.voice_provider === p.id
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            h.setForm((f) => ({
                              ...f,
                              voice_provider: p.id,
                              voice_model: p.id === 'gemini' ? 'gemini-live-2.5-flash-native-audio'
                                : p.id === 'openai' ? 'gpt-4o-realtime-preview'
                                  : p.id === 'xai' ? 'grok-beta'
                                    : 'deepgram-claude-cartesia',
                            }))
                          }}
                          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${isSelected
                            ? 'bg-violet-600/20 border-violet-500 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:border-gray-600'
                            }`}
                        >
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-violet-400' : 'border-gray-500'}`}>
                            {isSelected && <div className="w-2 h-2 rounded-full bg-violet-400" />}
                          </div>
                          {p.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Gemini: 모델명 + 음성 성별 / 말투 / 보이스 이름 */}
                {h.form.voice_provider === 'gemini' && (
                  <div className="space-y-3 p-3 bg-gray-900/50 rounded-lg border border-gray-600">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">모델명</label>
                      <input
                        value={h.form.voice_model}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_model: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                      />
                      <p className="text-xs text-gray-500 mt-0.5">기본값: gemini-live-2.5-flash-native-audio</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">음성 성별</label>
                        <div className="flex gap-4 h-[38px] items-center">
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="voice_gender" checked={h.form.voice_gender === 'female'} onChange={() => h.setForm((f) => ({ ...f, voice_gender: 'female' }))} />
                            <span>여성</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name="voice_gender" checked={h.form.voice_gender === 'male'} onChange={() => h.setForm((f) => ({ ...f, voice_gender: 'male' }))} />
                            <span>남성</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">말투/성향</label>
                        <select value={h.form.voice_style} onChange={(e) => h.setForm((f) => ({ ...f, voice_style: e.target.value }))}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm">
                          {VOICE_STYLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">보이스 이름</label>
                        <select value={h.form.voice_name} onChange={(e) => h.setForm((f) => ({ ...f, voice_name: e.target.value }))}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm">
                          {VOICE_NAMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* OpenAI GPT: 모델명 + 음성 + Temperature */}
                {h.form.voice_provider === 'openai' && (
                  <div className="space-y-3 p-3 bg-gray-900/50 rounded-lg border border-gray-600">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">모델명</label>
                      <input
                        value={h.form.voice_model}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_model: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">GPT 전용 음성</label>
                      <select
                        value={h.form.voice_gpt_name}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_gpt_name: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                      >
                        {VOICE_GPT_NAMES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Temperature ({h.form.voice_temperature})</label>
                      <input
                        type="range" min={0.6} max={1.2} step={0.05}
                        value={h.form.voice_temperature}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_temperature: parseFloat(e.target.value) }))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* xAI Grok: 모델명 + 음성 + Temperature */}
                {h.form.voice_provider === 'xai' && (
                  <div className="space-y-3 p-3 bg-gray-900/50 rounded-lg border border-gray-600">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">모델명</label>
                      <input
                        value={h.form.voice_model}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_model: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                        placeholder="예: grok-beta"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Grok 전용 음성</label>
                      <select
                        value={h.form.voice_gpt_name}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_gpt_name: e.target.value }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                      >
                        {VOICE_XAI_NAMES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Temperature ({h.form.voice_temperature})</label>
                      <input
                        type="range" min={0.6} max={1.2} step={0.05}
                        value={h.form.voice_temperature}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_temperature: parseFloat(e.target.value) }))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                )}

                {/* 리턴제로+Claude+Cartesia (voice_provider=deepgram-claude-cartesia): 성별 + 보이스 목록(추가/삭제) + 속도/볼륨/감정 */}
                {h.form.voice_provider === 'deepgram-claude-cartesia' && (
                  <div className="space-y-4 p-3 bg-gray-900/50 rounded-lg border border-gray-600">
                    <div className="flex flex-wrap items-end gap-4">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">성별</label>
                        <div className="flex gap-4 h-[38px] items-center">
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="radio"
                              name="cartesia_gender"
                              checked={h.form.voice_cartesia_config.gender === 'female'}
                              onChange={() => {
                                const list = h.form.voice_cartesia_config.voices_female
                                const firstId = list[0]?.id ?? ''
                                h.updateCartesiaConfig({ gender: 'female', voice_id: firstId })
                              }}
                            />
                            <span>여성</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="radio"
                              name="cartesia_gender"
                              checked={h.form.voice_cartesia_config.gender === 'male'}
                              onChange={() => {
                                const list = h.form.voice_cartesia_config.voices_male
                                const firstId = list[0]?.id ?? ''
                                h.updateCartesiaConfig({ gender: 'male', voice_id: firstId })
                              }}
                            />
                            <span>남성</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs text-gray-400 mb-1">사용할 보이스 선택</label>
                        <select
                          value={h.form.voice_cartesia_config.voice_id}
                          onChange={(e) => h.updateCartesiaConfig({ voice_id: e.target.value })}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                        >
                          {(h.form.voice_cartesia_config.gender === 'female' ? h.form.voice_cartesia_config.voices_female : h.form.voice_cartesia_config.voices_male).map((v) => (
                            <option key={v.id} value={v.id}>{v.label || v.id || '(이름 없음)'}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">말하기 방식</label>
                        <div className="flex gap-4 h-[38px] items-center">
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="radio"
                              name="cartesia_tts_mode"
                              checked={h.form.voice_cartesia_config.tts_mode === 'batch'}
                              onChange={() => h.updateCartesiaConfig({ tts_mode: 'batch' })}
                            />
                            <span>한번에 말하기</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                              type="radio"
                              name="cartesia_tts_mode"
                              checked={h.form.voice_cartesia_config.tts_mode === 'streaming'}
                              onChange={() => h.updateCartesiaConfig({ tts_mode: 'streaming' })}
                            />
                            <span>스트리밍 말하기</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">여성 보이스 목록 (추가/삭제 가능)</label>
                      <div className="space-y-2">
                        {h.form.voice_cartesia_config.voices_female.map((v, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input
                              value={v.label}
                              onChange={(e) => h.updateCartesiaVoiceEntry('female', idx, 'label', e.target.value)}
                              className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                              placeholder="라벨 (한국어)"
                            />
                            <input
                              value={v.id}
                              onChange={(e) => h.updateCartesiaVoiceEntry('female', idx, 'id', e.target.value)}
                              className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm font-mono text-xs"
                              placeholder="Voice ID (UUID)"
                            />
                            <button type="button" onClick={() => h.previewCartesiaVoice(v.id)} className="shrink-0 px-2 py-1 rounded bg-violet-600/80 hover:bg-violet-500 text-white text-xs">미리 듣기</button>
                            <button type="button" onClick={() => setCartesiaDeleteConfirm({ gender: 'female', index: idx })} className="shrink-0 px-2 py-1 rounded bg-red-600/80 hover:bg-red-500 text-white text-xs">삭제</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => h.addCartesiaVoice('female')} className="text-sm text-violet-400 hover:text-violet-300">+ 여성 보이스 추가</button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">남성 보이스 목록 (추가/삭제 가능)</label>
                      <div className="space-y-2">
                        {h.form.voice_cartesia_config.voices_male.map((v, idx) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <input
                              value={v.label}
                              onChange={(e) => h.updateCartesiaVoiceEntry('male', idx, 'label', e.target.value)}
                              className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                              placeholder="라벨 (한국어)"
                            />
                            <input
                              value={v.id}
                              onChange={(e) => h.updateCartesiaVoiceEntry('male', idx, 'id', e.target.value)}
                              className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm font-mono text-xs"
                              placeholder="Voice ID (UUID)"
                            />
                            <button type="button" onClick={() => h.previewCartesiaVoice(v.id)} className="shrink-0 px-2 py-1 rounded bg-violet-600/80 hover:bg-violet-500 text-white text-xs">미리 듣기</button>
                            <button type="button" onClick={() => setCartesiaDeleteConfirm({ gender: 'male', index: idx })} className="shrink-0 px-2 py-1 rounded bg-red-600/80 hover:bg-red-500 text-white text-xs">삭제</button>
                          </div>
                        ))}
                        <button type="button" onClick={() => h.addCartesiaVoice('male')} className="text-sm text-violet-400 hover:text-violet-300">+ 남성 보이스 추가</button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-end gap-4">
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-gray-400 mb-1">속도 Speed ({h.form.voice_cartesia_config.speed})</label>
                        <input
                          type="range" min={0.6} max={1.5} step={0.05}
                          value={h.form.voice_cartesia_config.speed}
                          onChange={(e) => h.updateCartesiaConfig({ speed: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex-1 min-w-[120px]">
                        <label className="block text-xs text-gray-400 mb-1">볼륨 Volume ({h.form.voice_cartesia_config.volume})</label>
                        <input
                          type="range" min={0.5} max={2} step={0.05}
                          value={h.form.voice_cartesia_config.volume}
                          onChange={(e) => h.updateCartesiaConfig({ volume: parseFloat(e.target.value) })}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="flex-1 min-w-[180px]">
                        <label className="block text-xs text-gray-400 mb-1">emotion</label>
                        <select
                          value={h.form.voice_cartesia_config.emotion ?? ''}
                          onChange={(e) => h.updateCartesiaConfig({ emotion: e.target.value || 'calm' })}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select emotion</option>
                          {CARTESIA_EMOTION_DROPDOWN.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.emoji} {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {/* 특수 태그 — TTS가 말할 때 웃음·공감 등 표현 (있는 건 다 넣어두면 좋음) */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">특수 태그 (TTS 연출)</label>
                      <p className="text-gray-500 text-xs mb-2">체크한 태그를 답변에 넣으면 TTS가 말할 때 웃음·한숨·놀람 등을 표현합니다. 필요한 건 모두 켜두는 것을 권장합니다.</p>
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => h.updateCartesiaConfig({ emotions: CARTESIA_SPECIAL_TAGS.map((t) => t.value) })}
                          className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
                        >
                          전체 선택
                        </button>
                        <button
                          type="button"
                          onClick={() => h.updateCartesiaConfig({ emotions: [] })}
                          className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium"
                        >
                          전체 해제
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-3 p-2 bg-gray-800 rounded border border-gray-600">
                        {CARTESIA_SPECIAL_TAGS.map((t) => {
                          const checked = h.form.voice_cartesia_config.emotions.includes(t.value)
                          return (
                            <label key={t.value} className="flex items-center gap-2 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const specialOnly = h.form.voice_cartesia_config.emotions.filter((x) =>
                                    CARTESIA_SPECIAL_TAGS.some((s) => s.value === x)
                                  )
                                  const next = e.target.checked
                                    ? [...specialOnly, t.value]
                                    : specialOnly.filter((x) => x !== t.value)
                                  h.updateCartesiaConfig({ emotions: next })
                                }}
                                className="rounded"
                              />
                              <span>{t.label}</span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* 1. 컨텐츠명/썸네일/가격/NEW·배포 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">컨텐츠명 &middot; 썸네일 &middot; 가격</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">컨텐츠명</label>
                  <input value={h.form.content_name} onChange={(e) => h.setForm((f) => ({ ...f, content_name: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white" placeholder="예: 애기동자 음성상담" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">상담사명</label>
                  <input value={h.form.voice_counselor_name} onChange={(e) => h.setForm((f) => ({ ...f, voice_counselor_name: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white" placeholder="예: 별님아씨" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">대표 가격 (원) - 시간 상품 중 대표로 표시할 가격</label>
                  <input type="number" value={h.form.price} onChange={(e) => h.setForm((f) => ({ ...f, price: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white" />
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={h.form.is_new} onChange={(e) => h.setForm((f) => ({ ...f, is_new: e.target.checked }))} className="rounded" />
                    <span className="text-sm">NEW</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" title="8006과 동일: 본인정보 숨김, 만세력 비표시, 음성모델 유저정보 미전달">
                    <input type="checkbox" checked={h.form.apply_ppoing_attributes} onChange={(e) => h.setForm((f) => ({ ...f, apply_ppoing_attributes: e.target.checked }))} className="rounded" />
                    <span className="text-sm">무료속성</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={h.form.show_exposed} onChange={(e) => h.setForm((f) => ({ ...f, show_exposed: e.target.checked }))} className="rounded" />
                    <span className="text-sm">배포(노출)</span>
                  </label>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm text-gray-300 mb-1">이미지 썸네일 (WebP 자동변환, 드래그&amp;드롭 가능)</label>
                <div
                  className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors cursor-pointer"
                  onDragOver={h.handleDragOver}
                  onDrop={(e) => h.handleFileDrop(e, 'book_cover_thumbnail', 'image/')}
                >
                  <div className="flex gap-2 items-center">
                    <input type="file" accept="image/*" className="hidden" id="voice-thumb-file"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'book_cover_thumbnail').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                    <label htmlFor="voice-thumb-file" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">이미지 업로드</label>
                    <span className="text-xs text-gray-500">또는 이미지를 여기에 드래그&amp;드롭</span>
                  </div>
                  {h.form.book_cover_thumbnail && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="relative">
                        <img src={addCacheBusting(h.form.book_cover_thumbnail)} alt="썸네일" className="w-16 h-16 object-cover rounded-lg border border-gray-600" />
                        <button type="button" onClick={() => h.requestFileDelete('book_cover_thumbnail', '이미지 썸네일')}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center z-10">&times;</button>
                      </div>
                      <a href={h.form.book_cover_thumbnail} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm truncate max-w-xs">크게보기</a>
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-3">
                <label className="block text-sm text-gray-300 mb-1">동영상 썸네일 (선택, 드래그&amp;드롭 가능)</label>
                <div
                  className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors"
                  onDragOver={h.handleDragOver}
                  onDrop={(e) => h.handleFileDrop(e, 'book_cover_thumbnail_video', 'video/')}
                >
                  <div className="flex gap-2 flex-wrap items-center">
                    <input type="file" accept=".mp4,.webm,.mov,video/*" className="hidden" id="voice-thumb-video-file"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'book_cover_thumbnail_video').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                    <label htmlFor="voice-thumb-video-file" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">동영상 업로드</label>
                    <input value={h.form.book_cover_thumbnail_video} onChange={(e) => h.setForm((f) => ({ ...f, book_cover_thumbnail_video: e.target.value }))}
                      className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="또는 URL 입력 / 파일 드래그&amp;드롭" />
                  </div>
                  {h.form.book_cover_thumbnail_video && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="relative group cursor-pointer"
                        onClick={(e) => { const v = e.currentTarget.querySelector('video'); if (!v) return; if (v.paused) { v.muted = false; v.play().catch(() => {}) } else { v.pause(); v.currentTime = 0 } }}>
                        <video
                          src={h.form.book_cover_thumbnail_video}
                          muted preload="metadata"
                          className="w-16 h-16 object-cover rounded-lg border border-gray-600 bg-black"
                        />
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30 group-hover:bg-black/40 transition pointer-events-none">
                          <svg className="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); h.requestFileDelete('book_cover_thumbnail_video', '동영상 썸네일') }}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center z-10">&times;</button>
                      </div>
                      <a href={h.form.book_cover_thumbnail_video} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm truncate">크게보기</a>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 2. 음성대화 설정 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">음성대화 설정</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">애기동자 상담사 동영상 (여러 개 등록 가능 · 랜덤 순차 재생, MP4 드래그&amp;드롭 가능, 썸네일 우측 상단 X로 삭제)</label>
                  <div
                    className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors"
                    onDragOver={h.handleDragOver}
                    onDrop={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (h.uploadingAdvisorVideo) return
                      const file = e.dataTransfer.files?.[0]
                      if (!file) return
                      const ext = file.name.split('.').pop()?.toLowerCase() || ''
                      if (!['mp4', 'webm', 'mov'].includes(ext) && !file.type.startsWith('video/')) {
                        alert('동영상 파일만 가능합니다.')
                        return
                      }
                      try { await h.appendVideoByFile(file) } catch (err: unknown) { alert((err as Error)?.message || '업로드 실패') }
                    }}
                  >
                    <div className="flex gap-2 flex-wrap items-center mb-3">
                      <input type="file" accept=".mp4,.webm,.mov,video/*" className="hidden" id="voice-advisor-video"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) h.appendVideoByFile(f).catch((err: Error) => alert(err.message)); e.target.value = '' }} disabled={h.uploadingAdvisorVideo} />
                      <label htmlFor="voice-advisor-video" className={`px-4 py-2 rounded-lg text-sm transition ${h.uploadingAdvisorVideo ? 'bg-gray-600 cursor-wait' : 'bg-gray-700 hover:bg-gray-600 cursor-pointer'}`}>
                        {h.uploadingAdvisorVideo ? 'Supabase 업로드 중...' : 'MP4 업로드'}
                      </label>
                      <input
                        type="text"
                        value={advisorVideoUrlInput}
                        onChange={(e) => setAdvisorVideoUrlInput(e.target.value)}
                        className="flex-1 min-w-[200px] bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                        placeholder="URL 입력 후 Enter로 추가 · URL보기 시 여기에 표시"
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          const url = advisorVideoUrlInput.trim()
                          if (url) { h.appendVideoUrl(url); setAdvisorVideoUrlInput('') }
                        }}
                      />
                    </div>
                    {h.form.voice_advisor_video_urls.length > 0 && (
                      <div className="flex flex-wrap gap-4">
                        {h.form.voice_advisor_video_urls.map((url, idx) => (
                          <div key={idx} className="shrink-0 flex flex-col items-center gap-1">
                            <div className="relative w-24 h-24">
                              <div
                                className="absolute inset-0 rounded-lg border border-gray-600 bg-black overflow-hidden group cursor-pointer"
                                onClick={(e) => { const v = (e.currentTarget.querySelector('video') as HTMLVideoElement); if (v) { if (v.paused) { v.muted = false; v.play().catch(() => {}) } else { v.pause(); v.currentTime = 0 } } }}
                              >
                                <video src={url} muted preload="metadata" className="w-full h-full object-cover" />
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition pointer-events-none">
                                  <svg className="w-8 h-8 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                </div>
                              </div>
                              <button
                                type="button"
                                aria-label="동영상 삭제"
                                onClick={(e) => { e.stopPropagation(); h.removeVideoUrl(idx) }}
                                className="absolute top-0 right-0 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center z-10 -translate-y-1/2 translate-x-1/2"
                              >
                                &times;
                              </button>
                            </div>
                            <div className="flex gap-1.5">
                              <a href={url} target="_blank" rel="noopener noreferrer" className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs">크게보기</a>
                              <button type="button" onClick={() => setAdvisorVideoUrlInput(url)} className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs">URL보기</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                {/* Gemini 전용: Pitch, Speaking Rate, Volume Gain */}
                {h.form.voice_provider === 'gemini' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Pitch (음높이, semitones)</label>
                      <input type="number" step={0.5} min={-20} max={20}
                        value={h.form.voice_pitch === '' ? '' : h.form.voice_pitch}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_pitch: e.target.value === '' ? '' : parseFloat(e.target.value) || '' }))}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                        placeholder="-20~20 (차분:-0.5~-1.5, 밝음:+2)" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Speaking Rate (발화 속도)</label>
                      <input type="number" step={0.05} min={0.25} max={4}
                        value={h.form.voice_speaking_rate === '' ? '' : h.form.voice_speaking_rate}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_speaking_rate: e.target.value === '' ? '' : parseFloat(e.target.value) || '' }))}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                        placeholder="0.25~4 (별님아씨 추천 0.8~0.9)" />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Volume Gain (dB)</label>
                      <input type="number" step={0.5} min={-96} max={16}
                        value={h.form.voice_volume_gain === '' ? '' : h.form.voice_volume_gain}
                        onChange={(e) => h.setForm((f) => ({ ...f, voice_volume_gain: e.target.value === '' ? '' : parseFloat(e.target.value) || '' }))}
                        className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                        placeholder="-96~16 (속삭임 시 +2 등)" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm text-gray-300 mb-1">페르소나 프롬프트</label>
                  <textarea value={h.form.voice_persona_prompt} onChange={(e) => h.setForm((f) => ({ ...f, voice_persona_prompt: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[120px]" placeholder="애기동자 페르소나/말투/제한 사항 등" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">침묵깨기 타이머 (초)</label>
                  <p className="text-gray-400 text-xs mb-1">재촉형, 관찰형, 환기형 순. 예: 3,5,5</p>
                  <input
                    value={h.form.voice_silence_break_config}
                    onChange={(e) => h.setForm((f) => ({ ...f, voice_silence_break_config: e.target.value.trim() || '3,5,5' }))}
                    className="w-40 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    placeholder="3,5,5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-200 mb-1">음성 이용 최초 인사 (접속 시 AI에 주입)</label>
                  <p className="text-gray-400 text-xs mb-2">접속 후 AI가 먼저 말할 내용입니다. 반드시 여기에 입력한 프롬프트만 사용됩니다. <code className="bg-gray-700 px-1 rounded">{'{{userName}}'}</code> 있으면 내담자 이름으로 치환됩니다.</p>
                  <div className="mb-2 p-3 bg-violet-950/40 border border-violet-700/60 rounded-lg">
                    <p className="text-xs font-semibold text-violet-200 mb-1.5">권장 예시 (복사해서 아래 칸에 붙여 넣으세요)</p>
                    <p className="text-gray-300 text-sm whitespace-pre-wrap break-words">내담자 &quot;{`{{userName}}`}&quot;님이 접속했습니다. 먼저 따뜻하게 인사한 후 신점으로 약 20초가량 오늘의 운세 중 특이한 부분만 공수를 내려주시오. 단, 당일 첫방문에만 적용하시오. 재방문시는 인사만 하시오.</p>
                  </div>
                  <textarea value={h.form.voice_initial_greet_prompt} onChange={(e) => h.setForm((f) => ({ ...f, voice_initial_greet_prompt: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[100px] mb-2" placeholder="위 권장 예시를 복사해 넣거나, 직접 작성하세요." />
                  <label className="block text-sm text-gray-300 mb-1 mt-3">재접속 시 (추가 결제 후)</label>
                  <textarea value={h.form.voice_resumed_greet_prompt} onChange={(e) => h.setForm((f) => ({ ...f, voice_resumed_greet_prompt: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[80px]" placeholder="재접속 시 인사 지시 (예: 다시 오셨군요, 이어서 상담해 주세요 등)" />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">시작소리 (MP3, 드래그&amp;드롭 가능)</label>
                  <div
                    className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors"
                    onDragOver={h.handleDragOver}
                    onDrop={(e) => h.handleFileDrop(e, 'voice_start_sound_url', 'audio/')}
                  >
                    <div className="flex gap-2 flex-wrap items-center">
                      <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" className="hidden" id="voice-start-sound"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'voice_start_sound_url').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                      <label htmlFor="voice-start-sound" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">MP3 업로드</label>
                      <input value={h.form.voice_start_sound_url} onChange={(e) => h.setForm((f) => ({ ...f, voice_start_sound_url: e.target.value }))}
                        className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="URL 입력 또는 파일 드래그&amp;드롭" />
                    </div>
                    {h.form.voice_start_sound_url && (
                      <div className="mt-2 flex items-center gap-2">
                        <audio src={h.form.voice_start_sound_url} controls className="max-w-full h-8" />
                        <button type="button" onClick={() => h.requestFileDelete('voice_start_sound_url', '시작소리')}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">&times;</button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">종료소리 (MP3, 드래그&amp;드롭 가능)</label>
                  <p className="text-xs text-gray-500 mb-1">시간이 0이 되면 TTS를 끊고 이 소리를 재생한 뒤 자동 저장됩니다.</p>
                  <div
                    className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors"
                    onDragOver={h.handleDragOver}
                    onDrop={(e) => h.handleFileDrop(e, 'voice_end_sound_url', 'audio/')}
                  >
                    <div className="flex gap-2 flex-wrap items-center">
                      <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" className="hidden" id="voice-end-sound"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'voice_end_sound_url').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                      <label htmlFor="voice-end-sound" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">MP3 업로드</label>
                      <input value={h.form.voice_end_sound_url} onChange={(e) => h.setForm((f) => ({ ...f, voice_end_sound_url: e.target.value }))}
                        className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="URL 입력 또는 파일 드래그&amp;드롭" />
                    </div>
                    {h.form.voice_end_sound_url && (
                      <div className="mt-2 flex items-center gap-2">
                        <audio src={h.form.voice_end_sound_url} controls className="max-w-full h-8" />
                        <button type="button" onClick={() => h.requestFileDelete('voice_end_sound_url', '종료소리')}
                          className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">&times;</button>
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm text-gray-300">대화중 소리</label>
                    <button type="button" onClick={h.addConversationSound}
                      className="text-sm text-violet-400 hover:text-violet-300 font-medium">+ 소리 추가</button>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">라벨로 어떤 소리인지 적고, MP3 URL 또는 드래그&amp;드롭으로 등록하세요.</p>
                  <div className="space-y-3">
                    {h.form.voice_conversation_sounds.map((sound, idx) => (
                      <div
                        key={idx}
                        className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors bg-gray-900/50"
                        onDragOver={h.handleDragOver}
                        onDrop={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          const file = e.dataTransfer.files?.[0]
                          if (file && (file.type.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a'].includes((file.name.split('.').pop() || '').toLowerCase()))) {
                            h.handleConversationSoundFileUpload(idx, file).catch((err: Error) => alert(err?.message || '업로드 실패'))
                          }
                        }}
                      >
                        <div className="flex gap-3 flex-wrap items-start">
                          <div className="w-32 shrink-0">
                            <label className="block text-xs text-gray-400 mb-1">라벨</label>
                            <input
                              value={sound.label}
                              onChange={(e) => h.updateConversationSound(idx, 'label', e.target.value)}
                              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                              placeholder="예: 방울 소리"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <label className="block text-xs text-gray-400 mb-1">URL 또는 파일</label>
                            <div className="flex gap-2">
                              <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" className="hidden" id={`voice-conv-sound-${idx}`}
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleConversationSoundFileUpload(idx, f).catch((err: Error) => alert(err?.message)); e.target.value = '' }} />
                              <label htmlFor={`voice-conv-sound-${idx}`} className="px-3 py-1.5 bg-gray-700 rounded-lg cursor-pointer text-xs hover:bg-gray-600 transition shrink-0">MP3 업로드</label>
                              <input
                                value={sound.url}
                                onChange={(e) => h.updateConversationSound(idx, 'url', e.target.value)}
                                className="flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                                placeholder="URL 또는 파일 드래그&amp;드롭"
                              />
                            </div>
                          </div>
                          <button type="button" onClick={() => h.removeConversationSound(idx)}
                            className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-5">×</button>
                        </div>
                        {sound.url && (
                          <div className="mt-2 flex items-center gap-2">
                            <audio src={sound.url} controls className="max-w-full h-8" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">대화중 소리 발현 확률 (%)</label>
                  <input type="number" min={0} max={100} value={h.form.voice_conversation_sound_probability_pct}
                    onChange={(e) => h.setForm((f) => ({ ...f, voice_conversation_sound_probability_pct: parseInt(e.target.value, 10) || 0 }))}
                    className="w-24 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white" />
                </div>
              </div>
            </section>

            {/* 3. 시간 상품 관리: 기본시간 / 충전시간(복수, 추가·삭제·추천상품) */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">시간 상품</h2>

              {/* 3-1. 기본시간: 무료시작 시 폼에서 주어지는 시간 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-emerald-400 mb-2">기본시간</h3>
                <p className="text-xs text-gray-500 mb-2">폼에서 무료시작 시 주어지는 시간 (0원이면 무료, 유료 전환 시 가격 설정). 부여 시간은 결과 페이지에서 120초 고정.</p>
                {h.form.voice_time_options.map((opt, idx) =>
                  isDefaultOption(opt) ? (
                    <div key={idx} className="flex gap-3 items-end bg-gray-900 p-3 rounded-lg">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-400 mb-1">라벨</label>
                        <input value={opt.label} onChange={(e) => h.updateTimeOption(idx, 'label', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" placeholder="예: 5분(무료)" />
                      </div>
                      <div className="w-28">
                        <label className="block text-xs text-gray-400 mb-1">가격(원)</label>
                        <input type="number" min={0} value={opt.price} onChange={(e) => h.updateTimeOption(idx, 'price', parseInt(e.target.value, 10) || 0)}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                      </div>
                    </div>
                  ) : null
                )}
              </div>

              {/* 3-2. 충전시간: 복수 개 추가·삭제, 추천상품 체크. 차감주기·차감금액은 모든 충전 상품에 공통 적용 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-amber-400">충전시간</h3>
                  <button type="button" onClick={h.addTimeOption} className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1 rounded-lg">+ 추가</button>
                </div>
                <p className="text-xs text-gray-500 mb-2">라벨·가격(원). 추천상품 체크 시 폼에서 디폴트 라디오 선택. (캐시 차감이므로 시간 설정 없음)</p>
                {/* 공통 차감 단위: 모든 충전 상품에 적용 */}
                {(() => {
                  const firstCharge = h.form.voice_time_options.find((o: any) => o?.type === 'charge')
                  const rateSeconds = firstCharge != null ? Number((firstCharge as any).rate_seconds) || 12 : 12
                  const rateWon = firstCharge != null ? Number((firstCharge as any).rate_won) || 19 : 19
                  return (
                    <div className="bg-gray-900/80 p-3 rounded-lg mb-3 border border-gray-700">
                      <p className="text-gray-500 text-xs mb-2">※ 차감 주기·차감 캐시 (충전시간 상품 공통): 선차감 후 주기마다 차감</p>
                      <div className="flex gap-3 items-end">
                        <div className="w-20">
                          <label className="block text-xs text-gray-400 mb-1">차감 주기(초)</label>
                          <input type="number" min={1} value={rateSeconds} onChange={(e) => h.updateChargeRateCommon('rate_seconds', Math.max(1, parseInt(e.target.value, 10) || 12))}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                        </div>
                        <span className="text-gray-500 pb-1.5">초당</span>
                        <div className="w-24">
                          <label className="block text-xs text-gray-400 mb-1">차감 금액(원)</label>
                          <input type="number" min={1} value={rateWon} onChange={(e) => h.updateChargeRateCommon('rate_won', Math.max(1, parseInt(e.target.value, 10) || 19))}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                        </div>
                        <span className="text-gray-500 text-sm pb-1.5">캐시 차감</span>
                      </div>
                    </div>
                  )
                })()}
                <div className="space-y-3">
                {h.form.voice_time_options.map((opt, idx) =>
                  isChargeOption(opt) ? (
                    <div key={idx} className="bg-gray-900 p-3 rounded-lg">
                      <div className="flex gap-3 items-end flex-wrap">
                        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
                          <input type="checkbox" checked={!!(opt as any).recommended} onChange={(e) => h.updateTimeOption(idx, 'recommended', e.target.checked)}
                            className="rounded border-gray-500 bg-gray-800 text-amber-500" />
                          <span className="text-xs text-amber-400">추천상품</span>
                        </label>
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs text-gray-400 mb-1">라벨</label>
                          <input value={opt.label ?? ''} onChange={(e) => h.updateTimeOption(idx, 'label', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" placeholder="예: 1000원 충전" />
                        </div>
                        <div className="w-28">
                          <label className="block text-xs text-gray-400 mb-1">가격(원)</label>
                          <input type="number" min={0} value={opt.price} onChange={(e) => h.updateTimeOption(idx, 'price', parseInt(e.target.value, 10) || 1000)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" placeholder="1000" />
                        </div>
                        <button type="button" onClick={() => h.removeTimeOption(idx)} className="text-red-400 hover:text-red-300 text-sm px-2 py-1 shrink-0">&times; 삭제</button>
                      </div>
                    </div>
                  ) : null
                )}
                </div>
              </div>
            </section>

            {/* 4. 요약/소개/추천/상품메뉴구성 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">요약 &middot; 소개 &middot; 추천 &middot; 상품메뉴구성</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">요약</label>
                  <textarea value={h.form.summary} onChange={(e) => h.setForm((f) => ({ ...f, summary: e.target.value }))} rows={1}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-none" placeholder="요약을 입력하세요" />
                </div>
                {(['introduction', 'recommendation', 'menu_composition'] as const).map((field) => {
                  const labels = { introduction: '소개', recommendation: '추천', menu_composition: '상품 메뉴 구성' }
                  return (
                    <div key={field}>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-300">{labels[field]}</label>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => h.handleOpenContentImagesModal(field)} className="text-gray-400 hover:text-pink-500 text-sm">이미지</button>
                          <button type="button" onClick={() => h.handleOpenHtmlPreview(field, labels[field] + ' 미리보기')} className="text-gray-400 hover:text-pink-500 text-sm">미리보기</button>
                        </div>
                      </div>
                      <textarea value={h.form[field]} onChange={(e) => h.setForm((f) => ({ ...f, [field]: e.target.value }))} rows={8}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-y" placeholder={labels[field] + ' (HTML 가능)'} />
                    </div>
                  )
                })}
              </div>
            </section>

            {/* 하단 저장/취소 버튼 */}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => { if (h.isDirty) h.setShowCancelConfirm(true); else h.goBack(); }}
                className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg">
                취소
              </button>
              <button type="button" onClick={h.handleSave} disabled={h.saving}
                className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg">
                {h.saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}

        {/* 이미지 모달 */}
        {h.showContentImagesModal && h.currentImageType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-3xl bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                <div>
                  <h2 className="text-sm font-bold text-white">
                    {h.currentImageType === 'introduction' ? '소개' : h.currentImageType === 'recommendation' ? '추천' : '상품 메뉴 구성'} 이미지 등록
                  </h2>
                  <p className="text-xs text-gray-400 mt-1">이미지 URL을 HTML에 넣어주세요. {h.contentImages.filter(Boolean).length}개</p>
                </div>
                <button type="button" onClick={h.handleCloseContentImagesModal} className="text-gray-300 hover:text-white text-sm font-semibold px-3 py-1 rounded-md">닫기</button>
              </div>
              <div className="p-4">
                <div className="flex items-start gap-2 overflow-x-auto pb-2 flex-wrap">
                  {h.contentImages.map((imageUrl, index) => (
                    <div key={index} className="flex-shrink-0 w-24">
                      {imageUrl ? (
                        <div className="space-y-2">
                          <div className="relative w-24 h-24">
                            <input type="file" accept="image/*" className="hidden" id={'voice-cimg-r-' + h.currentImageType + '-' + index} disabled={h.uploadingContentImageIndex === index}
                              onChange={async (e) => { const f = e.target.files?.[0]; if (f) await h.handleContentImageUpload(f, index); e.target.value = '' }} />
                            <label htmlFor={'voice-cimg-r-' + h.currentImageType + '-' + index} className="block w-full h-full cursor-pointer">
                              <img src={addCacheBusting(imageUrl)} alt="" className="w-full h-full object-cover bg-gray-800 border border-gray-700 rounded-lg" />
                            </label>
                            <button type="button" onClick={() => h.handleRemoveContentImage(index)} className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center z-10">&times;</button>
                          </div>
                          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(imageUrl); alert('URL 복사됨') } catch { alert('URL: ' + imageUrl) } }}
                            className="w-full py-1 px-2 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">복사</button>
                        </div>
                      ) : (
                        <div className="w-full h-24">
                          <input type="file" accept="image/*" className="hidden" id={'voice-cimg-a-' + h.currentImageType + '-' + index} disabled={h.uploadingContentImageIndex !== null}
                            onChange={async (e) => { const f = e.target.files?.[0]; if (f) await h.handleContentImageUpload(f, index); e.target.value = '' }} />
                          <label htmlFor={'voice-cimg-a-' + h.currentImageType + '-' + index}
                            className="block w-full h-full bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-pink-500 text-gray-400 text-xs">클릭</label>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="flex-shrink-0 w-24 h-24">
                    <input type="file" accept="image/*" className="hidden" id={'voice-cimg-n-' + h.currentImageType} disabled={h.uploadingContentImageIndex !== null}
                      onChange={async (e) => { const f = e.target.files?.[0]; if (f) await h.handleContentImageUpload(f, h.contentImages.length); e.target.value = '' }} />
                    <label htmlFor={'voice-cimg-n-' + h.currentImageType}
                      className="block w-full h-full bg-gray-800 border-2 border-dashed border-gray-600 rounded-lg flex items-center justify-center cursor-pointer hover:border-pink-500 text-white text-2xl">+</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HTML 미리보기 모달 */}
        {h.showHtmlPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className={'bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl h-[90vh] flex flex-col ' + (h.htmlPreviewMode === 'mobile' ? 'w-full max-w-sm' : 'w-full max-w-4xl')}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
                <h2 className="text-lg font-bold text-white">{h.htmlPreviewTitle}</h2>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
                    <button type="button" onClick={() => h.setHtmlPreviewMode('pc')} className={'px-3 py-1.5 text-xs font-semibold rounded ' + (h.htmlPreviewMode === 'pc' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}>PC</button>
                    <button type="button" onClick={() => h.setHtmlPreviewMode('mobile')} className={'px-3 py-1.5 text-xs font-semibold rounded ' + (h.htmlPreviewMode === 'mobile' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white')}>모바일</button>
                  </div>
                  <button type="button" onClick={() => h.setShowHtmlPreview(false)} className="text-gray-300 hover:text-white text-sm font-semibold px-3 py-1 rounded-md">닫기</button>
                </div>
              </div>
              <div className={'flex-1 p-4 bg-white flex justify-center overflow-auto ' + (h.htmlPreviewMode === 'mobile' ? 'max-w-[375px] mx-auto' : '')}>
                <iframe ref={h.htmlPreviewIframeRef} srcDoc={h.htmlPreviewContent} className="w-full h-full border-0" title={h.htmlPreviewTitle} sandbox="allow-same-origin allow-scripts" style={{ border: 'none' }} />
              </div>
            </div>
          </div>
        )}

        {/* 삭제 확인 팝업 */}
        {h.deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-sm bg-gray-800 border border-gray-600 rounded-xl p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-2">파일 삭제</h3>
              <p className="text-gray-300 text-sm mb-5">
                <span className="text-red-400 font-semibold">{h.deleteConfirm.label}</span> 파일을 삭제하시겠습니까?<br />
                <span className="text-gray-500 text-xs">Supabase 스토리지에서도 삭제됩니다.</span>
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={h.cancelFileDelete} disabled={h.deleting}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium disabled:opacity-50">취소</button>
                <button type="button" onClick={h.confirmFileDelete} disabled={h.deleting}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold disabled:opacity-50">
                  {h.deleting ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
