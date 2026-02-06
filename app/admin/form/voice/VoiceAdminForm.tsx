'use client'

import Link from 'next/link'
import { useVoiceForm } from './useVoiceForm'

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

export default function VoiceAdminForm() {
  const h = useVoiceForm()

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
            {/* 0. 음성대화 모델 + 결제코드 (나란히) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h2 className="font-bold mb-4">음성대화 모델</h2>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Gemini Live 모델명</label>
                  <input value={h.form.voice_model} onChange={(e) => h.setForm((f) => ({ ...f, voice_model: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="gemini-2.5-flash-native-audio-preview-12-2025" />
                  <p className="mt-1 text-xs text-gray-500">native-audio 지원 모델만 사용 가능합니다.</p>
                </div>
              </section>
              <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <h2 className="font-bold mb-4">결제코드</h2>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">결제코드 (자동 부여)</label>
                  <input
                    value={h.id && !h.duplicateId ? h.form.payment_code : (h.nextPaymentCode || '로딩 중...')}
                    readOnly disabled
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-gray-400 cursor-not-allowed" />
                  <p className="mt-1 text-xs text-gray-500">
                    {h.id && !h.duplicateId
                      ? '결제 코드는 자동으로 부여되며 변경할 수 없습니다.'
                      : h.nextPaymentCode
                        ? `다음 결제 코드: ${h.nextPaymentCode} (저장 시 자동 부여)`
                        : '결제 코드를 조회하는 중...'}
                  </p>
                </div>
              </section>
            </div>

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
                      <a href={h.form.book_cover_thumbnail} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm truncate max-w-xs">미리보기</a>
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
                      <a href={h.form.book_cover_thumbnail_video} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm truncate">동영상 미리보기</a>
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
                  <label className="block text-sm text-gray-300 mb-1">애기동자 상담사 등록 (MP4, 드래그&amp;드롭 가능)</label>
                  <div
                    className="border-2 border-dashed border-gray-600 hover:border-violet-500 rounded-lg p-4 transition-colors"
                    onDragOver={h.handleDragOver}
                    onDrop={(e) => h.handleFileDrop(e, 'voice_advisor_video_url', 'video/')}
                  >
                    <div className="flex gap-2 flex-wrap items-center">
                      <input type="file" accept=".mp4,.webm,.mov,video/*" className="hidden" id="voice-advisor-video"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) h.handleFileUpload(f, 'voice_advisor_video_url').catch((err: Error) => alert(err.message)); e.target.value = '' }} />
                      <label htmlFor="voice-advisor-video" className="px-4 py-2 bg-gray-700 rounded-lg cursor-pointer text-sm hover:bg-gray-600 transition">MP4 업로드</label>
                      <input value={h.form.voice_advisor_video_url} onChange={(e) => h.setForm((f) => ({ ...f, voice_advisor_video_url: e.target.value }))}
                        className="flex-1 min-w-0 bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="URL 입력 또는 파일 드래그&amp;드롭" />
                    </div>
                    {h.form.voice_advisor_video_url && (
                      <div className="mt-2 flex items-center gap-3">
                        <div className="relative group cursor-pointer"
                          onClick={(e) => { const v = e.currentTarget.querySelector('video'); if (!v) return; if (v.paused) { v.muted = false; v.play().catch(() => {}) } else { v.pause(); v.currentTime = 0 } }}>
                          <video
                            src={h.form.voice_advisor_video_url}
                            muted preload="metadata"
                            className="w-16 h-16 object-cover rounded-lg border border-gray-600 bg-black"
                          />
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30 group-hover:bg-black/40 transition pointer-events-none">
                            <svg className="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                          </div>
                        </div>
                        <a href={h.form.voice_advisor_video_url} target="_blank" rel="noopener noreferrer" className="text-violet-400 text-sm">동영상 미리보기</a>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">음성 성별</label>
                    <div className="flex gap-4 h-[42px] items-center">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="voice_gender" checked={h.form.voice_gender === 'female'} onChange={() => h.setForm((f) => ({ ...f, voice_gender: 'female' }))} />
                        <span>여성</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="radio" name="voice_gender" checked={h.form.voice_gender === 'male'} onChange={() => h.setForm((f) => ({ ...f, voice_gender: 'male' }))} />
                        <span>남성</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">말투/성향</label>
                    <select value={h.form.voice_style} onChange={(e) => h.setForm((f) => ({ ...f, voice_style: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                      {VOICE_STYLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-300 mb-1">보이스 이름</label>
                    <select value={h.form.voice_name} onChange={(e) => h.setForm((f) => ({ ...f, voice_name: e.target.value }))}
                      className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white">
                      {VOICE_NAMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
                {/* 음성 파라미터: Pitch, Speaking Rate, Volume Gain (API 지원 시 적용, 현재는 프롬프트로 전달) */}
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
                <div>
                  <label className="block text-sm text-gray-300 mb-1">페르소나 프롬프트</label>
                  <textarea value={h.form.voice_persona_prompt} onChange={(e) => h.setForm((f) => ({ ...f, voice_persona_prompt: e.target.value }))}
                    className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white min-h-[120px]" placeholder="애기동자 페르소나/말투/제한 사항 등" />
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

            {/* 3. 시간 상품 관리 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold">시간 상품</h2>
                <button type="button" onClick={h.addTimeOption} className="bg-violet-600 hover:bg-violet-700 text-white text-sm px-3 py-1 rounded-lg">+ 추가</button>
              </div>
              <div className="space-y-3">
                {h.form.voice_time_options.map((opt, idx) => (
                  <div key={idx} className="flex gap-3 items-end bg-gray-900 p-3 rounded-lg">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">라벨</label>
                      <input value={opt.label} onChange={(e) => h.updateTimeOption(idx, 'label', e.target.value)}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" placeholder="예: 5분" />
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-gray-400 mb-1">시간(분)</label>
                      <input type="number" min={1} value={opt.minutes} onChange={(e) => h.updateTimeOption(idx, 'minutes', parseInt(e.target.value, 10) || 1)}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                    </div>
                    <div className="w-28">
                      <label className="block text-xs text-gray-400 mb-1">가격(원)</label>
                      <input type="number" min={0} value={opt.price} onChange={(e) => h.updateTimeOption(idx, 'price', parseInt(e.target.value, 10) || 0)}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-sm" />
                    </div>
                    {h.form.voice_time_options.length > 1 && (
                      <button type="button" onClick={() => h.removeTimeOption(idx)} className="text-red-400 hover:text-red-300 text-sm px-2 py-1">&times;</button>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* 4. 요약/소개/추천/상품메뉴구성 */}
            <section className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h2 className="font-bold mb-4">요약 &middot; 소개 &middot; 추천 &middot; 상품메뉴구성</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">요약</label>
                  <textarea value={h.form.summary} onChange={(e) => h.setForm((f) => ({ ...f, summary: e.target.value }))} rows={4}
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 resize-y" placeholder="요약을 입력하세요" />
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
