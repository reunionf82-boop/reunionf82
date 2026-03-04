'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  useMultiForm,
  CARTESIA_VOICES,
  CARTESIA_EMOTION_OPTIONS,
  CARTESIA_SPECIAL_TAGS,
  isMultiDefaultOption,
  isMultiChargeOption,
} from './useMultiForm'

const addCacheBusting = (url: string | null | undefined): string => {
  if (!url || !url.trim()) return ''
  return url.split('?')[0] + '?t=' + Date.now()
}

export default function MultiAdminForm() {
  const h = useMultiForm()
  const [advisorVideoUrlInput1, setAdvisorVideoUrlInput1] = useState('')
  const [advisorVideoUrlInput2, setAdvisorVideoUrlInput2] = useState('')
  const [advisorVideoUrlInput3, setAdvisorVideoUrlInput3] = useState('')

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
        {/* 헤더 — 음성형과 동일 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link href="/admin" className="text-violet-400 hover:underline text-sm mb-2 inline-block">&larr; 관리자 리스트</Link>
            <h1 className="text-2xl font-bold">다자형 컨텐츠 {h.id ? '수정' : '추가'}</h1>
          </div>
          <div className="flex gap-3">
            {h.id && (
              <button type="button" onClick={() => h.setShowDeleteConfirm(true)}
                className="bg-red-600 hover:bg-red-500 text-white font-semibold px-6 py-2 rounded-lg">
                삭제
              </button>
            )}
            <button type="button" onClick={() => { if (h.isDirty) h.setShowCancelConfirm(true); else h.goBack(); }}
              className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-6 py-2 rounded-lg">
              취소
            </button>
            <button type="button" onClick={h.save} disabled={h.saving}
              className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-semibold px-6 py-2 rounded-lg">
              {h.saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>

        {/* 보이스 테스트 리셋 (동작 확인용) — 음성형과 동일 */}
        {h.id && (
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

        {/* 파일 삭제 확인 모달 */}
        {h.deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={h.cancelFileDelete}>
            <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-600 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-200 mb-6">&quot;{h.deleteConfirm.label}&quot;을(를) 삭제하시겠습니까?</p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={h.cancelFileDelete} className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 text-white font-medium">취소</button>
                <button type="button" onClick={() => { h.confirmFileDelete(); }} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-medium">삭제</button>
              </div>
            </div>
          </div>
        )}

        {/* 취소 확인 — 음성형과 동일 스타일 */}
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

        {/* 삭제 확인 — 음성형과 동일 */}
        {h.showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={() => !h.deletingContent && h.setShowDeleteConfirm(false)}>
            <div className="bg-gray-800 rounded-xl shadow-xl border border-gray-600 p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <p className="text-gray-200 mb-6">
                &quot;{h.form.content_name || '이 컨텐츠'}&quot;를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
              </p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => h.setShowDeleteConfirm(false)} disabled={h.deletingContent}
                  className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white font-medium">취소</button>
                <button type="button" onClick={h.deleteContent} disabled={h.deletingContent}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-medium">
                  {h.deletingContent ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 저장 완료 토스트 — 음성형과 동일 */}
        {h.showSaveSuccess && (
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 px-6 py-3 rounded-xl bg-emerald-600 text-white font-medium shadow-lg">
            저장되었습니다.
          </div>
        )}

        {h.loading ? (
          <div className="text-gray-400">로딩 중...</div>
        ) : (
          <div className="space-y-6">
            {/* 0. 결제코드 — 오른쪽에 NEW·무료속성·배포(노출) */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">결제코드</h2>
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-sm text-gray-300 mb-1">결제코드 (자동 부여)</label>
                  <input
                    value={h.id ? h.form.payment_code : (h.nextPaymentCode || '로딩 중...')}
                    readOnly
                    disabled
                    className="w-full max-w-md bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-400 cursor-not-allowed"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    {h.id
                      ? '결제 코드는 자동으로 부여되며 변경할 수 없습니다.'
                      : h.nextPaymentCode
                        ? `다음 결제 코드: ${h.nextPaymentCode} (저장 시 자동 부여)`
                        : '결제 코드를 조회하는 중...'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-4 md:pt-8">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={h.form.is_new}
                      onChange={(e) => h.setForm((f) => ({ ...f, is_new: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">NEW</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer" title="8006과 동일: 본인정보 숨김, 만세력 비표시 등">
                    <input
                      type="checkbox"
                      checked={h.form.apply_ppoing_attributes}
                      onChange={(e) => h.setForm((f) => ({ ...f, apply_ppoing_attributes: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">무료속성</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={h.form.show_exposed}
                      onChange={(e) => h.setForm((f) => ({ ...f, show_exposed: e.target.checked }))}
                      className="rounded"
                    />
                    <span className="text-sm">배포(노출)</span>
                  </label>
                </div>
              </div>
            </section>

            {/* 1. 음성대화 모델 — 고정 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">음성대화 모델</h2>
              <p className="text-amber-400 text-sm font-medium">리턴제로+클로드+카테시아 (고정)</p>
            </section>

            {/* 코어 프롬프트 — 다자형 시스템 지시(DB multi_system_prompt). 비어 있으면 상담 시 기본 동작만 적용 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">코어 프롬프트</h2>
              <p className="text-gray-400 text-sm mb-3">3인 역술가 공통 규칙·턴 구조·화자 태그 규칙. API에서 이 값을 그대로 시스템 프롬프트에 주입합니다. 비워두면 코드 기본값 없이 빈 문자열로 전달됩니다.</p>
              <textarea
                value={h.form.multi_system_prompt}
                onChange={(e) => h.setForm((f) => ({ ...f, multi_system_prompt: e.target.value }))}
                rows={14}
                className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white font-mono text-sm placeholder-gray-500"
                placeholder="예: 당신은 한 명의 AI이지만..."
              />
            </section>

            {/* 2. 컨텐츠명 · 썸네일 · 가격 — 이미지 썸네일 + 동영상 썸네일 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">컨텐츠명 &middot; 썸네일 &middot; 가격</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">컨텐츠명</label>
                  <input
                    value={h.form.content_name}
                    onChange={(e) => h.setForm((f) => ({ ...f, content_name: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    placeholder="예: 3인 다자 신점"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">대표 가격 (원)</label>
                  <input
                    type="text"
                    value={h.form.price}
                    onChange={(e) => h.setForm((f) => ({ ...f, price: e.target.value.replace(/\D/g, '') }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm text-gray-300 mb-1">이미지 썸네일 (드래그&amp;드롭 가능)</label>
                <div
                  className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors"
                  onDragOver={h.handleDragOver}
                  onDrop={(e) => h.handleFileDrop(e, 'book_cover_thumbnail', 'image/')}
                >
                  <div className="flex gap-2 items-center">
                    <input type="file" accept="image/*" className="hidden" id="multi-thumb-file"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'book_cover_thumbnail').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                    <label htmlFor="multi-thumb-file" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">이미지 업로드</label>
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
                    <input type="file" accept=".mp4,.webm,.mov,video/*" className="hidden" id="multi-thumb-video-file"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'book_cover_thumbnail_video').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                    <label htmlFor="multi-thumb-video-file" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">동영상 업로드</label>
                    <input value={h.form.book_cover_thumbnail_video} onChange={(e) => h.setForm((f) => ({ ...f, book_cover_thumbnail_video: e.target.value }))}
                      className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="또는 URL 입력 / 파일 드래그&amp;드롭" />
                  </div>
                  {h.form.book_cover_thumbnail_video && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="relative group cursor-pointer"
                        onClick={(e) => { const v = e.currentTarget.querySelector('video'); if (!v) return; if ((v as HTMLVideoElement).paused) { (v as HTMLVideoElement).muted = false; (v as HTMLVideoElement).play().catch(() => {}); } else { (v as HTMLVideoElement).pause(); (v as HTMLVideoElement).currentTime = 0; } }}>
                        <video src={h.form.book_cover_thumbnail_video} muted preload="metadata" className="w-16 h-16 object-cover rounded-lg border border-gray-600 bg-black" />
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30 group-hover:bg-black/40 transition pointer-events-none">
                          <svg className="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                        </div>
                        <button type="button" onClick={(e) => { e.stopPropagation(); h.requestFileDelete('book_cover_thumbnail_video', '동영상 썸네일'); }}
                          className="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center z-10">&times;</button>
                      </div>
                      <a href={h.form.book_cover_thumbnail_video} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm truncate">크게보기</a>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 3. 3인 페르소나 + 음성 공통(속도/볼륨/감정/특수태그) + 시작·종료소리 + MP4 여러 개 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">3인 페르소나 &middot; 음성대화 설정</h2>
              <p className="text-gray-400 text-sm mb-6">동일한 신점/타로/사주/운세 주제에 대해 서로 다른 관점을 가진 3인. 성별과 카테시아 보이스를 지정하세요.</p>
              <div className="space-y-6">
                {([1, 2, 3] as const).map((n) => {
                  const gender = n === 1 ? h.form.multi_persona_1_gender : n === 2 ? h.form.multi_persona_2_gender : h.form.multi_persona_3_gender
                  const voiceId = n === 1 ? h.form.multi_cartesia_voice_id_1 : n === 2 ? h.form.multi_cartesia_voice_id_2 : h.form.multi_cartesia_voice_id_3
                  const voicesByGender = CARTESIA_VOICES.filter((v) => v.gender === gender)
                  return (
                    <div key={n} className="p-3 bg-gray-900/50 rounded-lg border border-gray-600 space-y-3">
                      <h3 className="text-sm font-semibold text-gray-200">페르소나 {n}</h3>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">표시 이름</label>
                        <input
                          type="text"
                          value={n === 1 ? h.form.multi_persona_1_name : n === 2 ? h.form.multi_persona_2_name : h.form.multi_persona_3_name}
                          onChange={(e) => h.setForm((f) => ({ ...f, ...(n === 1 ? { multi_persona_1_name: e.target.value } : n === 2 ? { multi_persona_2_name: e.target.value } : { multi_persona_3_name: e.target.value }) }))}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
                          placeholder="예: 신점사, 타로사, 사주사 (멀티 화면 이퀄라이저 좌측하단에 표시)"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">시스템 프롬프트</label>
                        <textarea
                          value={n === 1 ? h.form.multi_persona_1_prompt : n === 2 ? h.form.multi_persona_2_prompt : h.form.multi_persona_3_prompt}
                          onChange={(e) => h.setForm((f) => ({ ...f, ...(n === 1 ? { multi_persona_1_prompt: e.target.value } : n === 2 ? { multi_persona_2_prompt: e.target.value } : { multi_persona_3_prompt: e.target.value }) }))}
                          rows={4}
                          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[100px]"
                          placeholder="예: 당신은 신탁의 관점에서 차분하고 직설적으로 해석하는 점술가입니다."
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">성별</label>
                        <div className="flex gap-4 h-[38px] items-center">
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name={`multi_gender_${n}`} checked={gender === 'female'} onChange={() => {
                              const firstFemale = CARTESIA_VOICES.find((v) => v.gender === 'female')?.id ?? ''
                              h.setForm((f) => ({ ...f, ...(n === 1 ? { multi_persona_1_gender: 'female' as const, multi_cartesia_voice_id_1: firstFemale } : n === 2 ? { multi_persona_2_gender: 'female' as const, multi_cartesia_voice_id_2: firstFemale } : { multi_persona_3_gender: 'female' as const, multi_cartesia_voice_id_3: firstFemale }) }))
                            }} />
                            <span>여성</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="radio" name={`multi_gender_${n}`} checked={gender === 'male'} onChange={() => {
                              const firstMale = CARTESIA_VOICES.find((v) => v.gender === 'male')?.id ?? ''
                              h.setForm((f) => ({ ...f, ...(n === 1 ? { multi_persona_1_gender: 'male' as const, multi_cartesia_voice_id_1: firstMale } : n === 2 ? { multi_persona_2_gender: 'male' as const, multi_cartesia_voice_id_2: firstMale } : { multi_persona_3_gender: 'male' as const, multi_cartesia_voice_id_3: firstMale }) }))
                            }} />
                            <span>남성</span>
                          </label>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">카테시아 보이스</label>
                        <select
                          value={voicesByGender.some((v) => v.id === voiceId) ? voiceId : (voicesByGender[0]?.id ?? '')}
                          onChange={(e) => h.setForm((f) => ({ ...f, ...(n === 1 ? { multi_cartesia_voice_id_1: e.target.value } : n === 2 ? { multi_cartesia_voice_id_2: e.target.value } : { multi_cartesia_voice_id_3: e.target.value }) }))}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-white text-sm"
                        >
                          {voicesByGender.map((v) => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                      {/* 페르소나별 상담사 동영상 (멀티 화면에서 해당 화자가 말할 때 랜덤 순차 재생) */}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">상담사 동영상 (여러 개 등록 가능, MP4 드래그&amp;드롭 가능)</label>
                        <div className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-3 transition-colors"
                          onDragOver={h.handleDragOver}
                          onDrop={async (e) => {
                            e.preventDefault(); e.stopPropagation()
                            if (h.uploadingAdvisorVideo) return
                            const file = e.dataTransfer.files?.[0]
                            if (!file) return
                            const ext = (file.name.split('.').pop() || '').toLowerCase()
                            if (!['mp4', 'webm', 'mov'].includes(ext) && !file.type.startsWith('video/')) { alert('동영상 파일만 가능합니다.'); return }
                            try { await h.appendVideoByFile(n, file) } catch (err: unknown) { alert((err as Error)?.message || '업로드 실패') }
                          }}
                        >
                          <div className="flex gap-2 flex-wrap items-center mb-2">
                            <input type="file" accept=".mp4,.webm,.mov,video/*" className="hidden" id={`multi-advisor-video-${n}`}
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) h.appendVideoByFile(n, f).catch((err: Error) => alert(err.message)); e.target.value = '' }} disabled={h.uploadingAdvisorVideo} />
                            <label htmlFor={`multi-advisor-video-${n}`} className={`px-3 py-1.5 rounded-lg text-sm transition ${h.uploadingAdvisorVideo ? 'bg-gray-600 cursor-wait' : 'bg-gray-700 hover:bg-gray-600 cursor-pointer'}`}>
                              {h.uploadingAdvisorVideo ? '업로드 중...' : 'MP4 업로드'}
                            </label>
                            <input type="text"
                              value={n === 1 ? advisorVideoUrlInput1 : n === 2 ? advisorVideoUrlInput2 : advisorVideoUrlInput3}
                              onChange={(e) => { n === 1 ? setAdvisorVideoUrlInput1(e.target.value) : n === 2 ? setAdvisorVideoUrlInput2(e.target.value) : setAdvisorVideoUrlInput3(e.target.value) }}
                              className="flex-1 min-w-[180px] bg-gray-900 border border-gray-600 rounded-lg px-2 py-1.5 text-white text-sm"
                              placeholder="URL 입력 후 Enter로 추가"
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return
                                const url = (n === 1 ? advisorVideoUrlInput1 : n === 2 ? advisorVideoUrlInput2 : advisorVideoUrlInput3).trim()
                                if (url) { h.appendVideoUrl(n, url); n === 1 ? setAdvisorVideoUrlInput1('') : n === 2 ? setAdvisorVideoUrlInput2('') : setAdvisorVideoUrlInput3('') }
                              }}
                            />
                          </div>
                          {(n === 1 ? h.form.multi_advisor_video_urls_1 : n === 2 ? h.form.multi_advisor_video_urls_2 : h.form.multi_advisor_video_urls_3).length > 0 && (
                            <div className="flex flex-wrap gap-3">
                              {(n === 1 ? h.form.multi_advisor_video_urls_1 : n === 2 ? h.form.multi_advisor_video_urls_2 : h.form.multi_advisor_video_urls_3).map((url, idx) => (
                                <div key={idx} className="shrink-0 flex flex-col items-center gap-1">
                                  <div className="relative w-20 h-20">
                                    <div className="absolute inset-0 rounded-lg border border-gray-600 bg-black overflow-hidden group cursor-pointer"
                                      onClick={(e) => { const v = (e.currentTarget.querySelector('video') as HTMLVideoElement); if (v) { if (v.paused) { v.muted = false; v.play().catch(() => {}); } else { v.pause(); v.currentTime = 0; } } }}>
                                      <video src={url} muted preload="metadata" className="w-full h-full object-cover" />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition pointer-events-none">
                                        <svg className="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                                      </div>
                                    </div>
                                    <button type="button" aria-label="동영상 삭제" onClick={(e) => { e.stopPropagation(); h.removeVideoUrl(n, idx); }}
                                      className="absolute top-0 right-0 w-4 h-4 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center justify-center z-10 -translate-y-1/2 translate-x-1/2">&times;</button>
                                  </div>
                                  <a href={url} target="_blank" rel="noopener noreferrer" className="px-1.5 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs">크게보기</a>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* 음성 공통: 속도 / 볼륨 / 감정 / 특수태그 */}
                <div className="p-3 bg-gray-900/50 rounded-lg border border-gray-600 space-y-4">
                  <h3 className="text-sm font-semibold text-gray-200">음성 공통 설정 (속도 &middot; 볼륨 &middot; 감정 &middot; 특수태그)</h3>
                  <div className="flex flex-wrap items-end gap-4">
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-gray-400 mb-1">속도 Speed ({h.form.multi_cartesia_speed})</label>
                      <input type="range" min={0.6} max={1.5} step={0.05} value={h.form.multi_cartesia_speed}
                        onChange={(e) => h.setForm((f) => ({ ...f, multi_cartesia_speed: parseFloat(e.target.value) }))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="flex-1 min-w-[120px]">
                      <label className="block text-xs text-gray-400 mb-1">볼륨 Volume ({h.form.multi_cartesia_volume})</label>
                      <input type="range" min={0.5} max={2} step={0.05} value={h.form.multi_cartesia_volume}
                        onChange={(e) => h.setForm((f) => ({ ...f, multi_cartesia_volume: parseFloat(e.target.value) }))}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer" />
                    </div>
                    <div className="flex-1 min-w-[180px]">
                      <label className="block text-xs text-gray-400 mb-1">emotion</label>
                      <select value={h.form.multi_cartesia_emotion ?? ''} onChange={(e) => h.setForm((f) => ({ ...f, multi_cartesia_emotion: e.target.value || 'calm' }))}
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm">
                        {CARTESIA_EMOTION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.emoji} {opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">특수 태그 (TTS 연출)</label>
                    <p className="text-gray-500 text-xs mb-2">체크한 태그를 답변에 넣으면 TTS가 웃음·한숨·놀람 등을 표현합니다.</p>
                    <div className="flex gap-2 mb-2">
                      <button type="button" onClick={() => h.updateCartesiaEmotions(CARTESIA_SPECIAL_TAGS.map((t) => t.value))} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium">전체 선택</button>
                      <button type="button" onClick={() => h.updateCartesiaEmotions([])} className="px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-white text-xs font-medium">전체 해제</button>
                    </div>
                    <div className="flex flex-wrap gap-3 p-2 bg-gray-800 rounded border border-gray-600">
                      {CARTESIA_SPECIAL_TAGS.map((t) => (
                        <label key={t.value} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={h.form.multi_cartesia_emotions.includes(t.value)}
                            onChange={(e) => {
                              const next = e.target.checked ? [...h.form.multi_cartesia_emotions, t.value] : h.form.multi_cartesia_emotions.filter((x) => x !== t.value)
                              h.updateCartesiaEmotions(next)
                            }}
                            className="rounded" />
                          <span>{t.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 시작소리 / 종료소리 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">시작소리 (MP3, 드래그&amp;드롭 가능)</label>
                    <p className="text-xs text-gray-500 mb-1">시작하면 자동으로 재생되는 소리입니다.</p>
                    <div className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors" onDragOver={h.handleDragOver} onDrop={(e) => h.handleFileDrop(e, 'multi_start_sound_url', 'audio/')}>
                      <div className="flex gap-2 flex-wrap items-center">
                        <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" className="hidden" id="multi-start-sound"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'multi_start_sound_url').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                        <label htmlFor="multi-start-sound" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">MP3 업로드</label>
                        <input value={h.form.multi_start_sound_url} onChange={(e) => h.setForm((f) => ({ ...f, multi_start_sound_url: e.target.value }))}
                          className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="URL 또는 드래그&amp;드롭" />
                      </div>
                      {h.form.multi_start_sound_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <audio src={h.form.multi_start_sound_url} controls className="max-w-full h-8" />
                          <button type="button" onClick={() => h.requestFileDelete('multi_start_sound_url', '시작소리')} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">&times;</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">종료소리 (MP3, 드래그&amp;드롭 가능)</label>
                    <p className="text-xs text-gray-500 mb-1">시간이 0이 되면 이 소리를 재생한 뒤 자동 저장됩니다.</p>
                    <div className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors" onDragOver={h.handleDragOver} onDrop={(e) => h.handleFileDrop(e, 'multi_end_sound_url', 'audio/')}>
                      <div className="flex gap-2 flex-wrap items-center">
                        <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" className="hidden" id="multi-end-sound"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'multi_end_sound_url').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                        <label htmlFor="multi-end-sound" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">MP3 업로드</label>
                        <input value={h.form.multi_end_sound_url} onChange={(e) => h.setForm((f) => ({ ...f, multi_end_sound_url: e.target.value }))}
                          className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="URL 또는 드래그&amp;드롭" />
                      </div>
                      {h.form.multi_end_sound_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <audio src={h.form.multi_end_sound_url} controls className="max-w-full h-8" />
                          <button type="button" onClick={() => h.requestFileDelete('multi_end_sound_url', '종료소리')} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">&times;</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 음성 공통: 속도 / 볼륨 / 감정 / 특수태그 */}

              </div>
            </section>

            {/* 4. 시간 상품 관리: 기본시간 / 충전시간(복수, 추가·삭제·추천상품) - 음성형과 동일 UI */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">시간 상품</h2>

              {/* 4-1. 기본시간: 무료시작 시 폼에서 주어지는 시간 */}
              <div className="mb-6">
                <h3 className="text-sm font-medium text-emerald-400 mb-2">기본시간</h3>
                <p className="text-xs text-gray-500 mb-2">폼에서 무료시작 시 주어지는 시간 (0원이면 무료, 유료 전환 시 가격 설정)</p>
                {h.form.multi_time_options.map((opt, idx) =>
                  isMultiDefaultOption(opt) ? (
                    <div key={idx} className="flex gap-3 items-end bg-gray-900 p-3 rounded-lg">
                      <div className="flex-1">
                        <label className="block text-xs text-gray-400 mb-1">라벨</label>
                        <input value={opt.label} onChange={(e) => h.updateTimeOption(idx, 'label', e.target.value)}
                          className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" placeholder="예: 5분(무료)" />
                      </div>
                      <div className="flex gap-1 items-end">
                        <div className="w-14">
                          <label className="block text-xs text-gray-400 mb-1">분</label>
                          <input type="number" min={0} value={opt.minutes} onChange={(e) => h.updateTimeOption(idx, 'minutes', Math.max(0, parseInt(e.target.value, 10) || 0))}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                        </div>
                        <span className="text-gray-500 pb-1.5">:</span>
                        <div className="w-14">
                          <label className="block text-xs text-gray-400 mb-1">초</label>
                          <input type="number" min={0} max={59} value={opt.seconds ?? 0} onChange={(e) => h.updateTimeOption(idx, 'seconds', Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                        </div>
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

              {/* 4-2. 충전시간: 복수 개 추가·삭제, 추천상품 체크. 차감주기·차감금액은 모든 충전 상품에 공통 적용 */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-amber-400">충전시간</h3>
                  <button type="button" onClick={h.addTimeOption} className="bg-amber-600 hover:bg-amber-700 text-white text-sm px-3 py-1 rounded-lg">+ 추가</button>
                </div>
                <p className="text-xs text-gray-500 mb-2">라벨·분:초·가격. 추천상품 체크 시 폼에서 디폴트 라디오 선택.</p>
                {/* 공통 차감 단위: 모든 충전 상품에 적용 */}
                {(() => {
                  const firstCharge = h.form.multi_time_options.find((o: any) => o?.type === 'charge')
                  const rateSeconds = firstCharge != null ? Number((firstCharge as any).rate_seconds) || 12 : 12
                  const rateWon = firstCharge != null ? Number((firstCharge as any).rate_won) || 19 : 19
                  return (
                    <div className="bg-gray-900/80 p-3 rounded-lg mb-3 border border-gray-700">
                      <p className="text-gray-500 text-xs mb-2">※ 차감 주기·차감 금액 (충전시간 상품 공통): 선차감 후 주기마다 차감</p>
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
                        <span className="text-gray-500 text-sm pb-1.5">원 차감</span>
                      </div>
                    </div>
                  )
                })()}
                <div className="space-y-3">
                {h.form.multi_time_options.map((opt, idx) =>
                  isMultiChargeOption(opt) ? (
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
                        <div className="flex gap-1 items-end">
                          <div className="w-14">
                            <label className="block text-xs text-gray-400 mb-1">분</label>
                            <input type="number" min={0} value={opt.minutes} onChange={(e) => h.updateTimeOption(idx, 'minutes', Math.max(0, parseInt(e.target.value, 10) || 0))}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                          </div>
                          <span className="text-gray-500 pb-1.5">:</span>
                          <div className="w-14">
                            <label className="block text-xs text-gray-400 mb-1">초</label>
                            <input type="number" min={0} max={59} value={opt.seconds ?? 0} onChange={(e) => h.updateTimeOption(idx, 'seconds', Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                          </div>
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

            {/* 5. 요약 · 소개 · 추천 · 상품메뉴구성 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">요약 &middot; 소개 &middot; 추천 &middot; 상품메뉴구성</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">요약</label>
                  <textarea value={h.form.summary} onChange={(e) => h.setForm((f) => ({ ...f, summary: e.target.value }))} rows={1}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-none" placeholder="요약을 입력하세요" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">소개</label>
                  <textarea value={h.form.introduction} onChange={(e) => h.setForm((f) => ({ ...f, introduction: e.target.value }))} rows={6}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-y" placeholder="소개 (HTML 가능)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">추천</label>
                  <textarea value={h.form.recommendation} onChange={(e) => h.setForm((f) => ({ ...f, recommendation: e.target.value }))} rows={6}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-y" placeholder="추천 (HTML 가능)" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">상품 메뉴 구성</label>
                  <textarea value={h.form.menu_composition} onChange={(e) => h.setForm((f) => ({ ...f, menu_composition: e.target.value }))} rows={6}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-y" placeholder="상품 메뉴 구성 (HTML 가능)" />
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
