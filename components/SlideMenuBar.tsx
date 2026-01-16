'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getContents } from '@/lib/supabase-admin'
import TermsPopup from './TermsPopup'
import PrivacyPopup from './PrivacyPopup'

interface SlideMenuBarProps {
  isOpen: boolean
  onClose: () => void
  streamingFinished?: boolean // 점사 완료 여부
}

export default function SlideMenuBar({ isOpen, onClose, streamingFinished = true }: SlideMenuBarProps) {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [paidContents, setPaidContents] = useState<any[]>([])
  const [loadingContents, setLoadingContents] = useState(false) // 초기값을 false로 변경 (프리로딩 시작 전에는 로딩 중이 아님)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['설백야', '고객지원']))
  const [activeSection, setActiveSection] = useState<'menu' | 'faq' | 'inquiry'>('menu')
  const [selectedContentId, setSelectedContentId] = useState<number | null>(null)
  const [showTermsPopup, setShowTermsPopup] = useState(false)
  const [showPrivacyPopup, setShowPrivacyPopup] = useState(false)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  
  // 문의하기 폼 상태
  const [inquiryForm, setInquiryForm] = useState({
    name: '',
    phone: '010-',
    email: '',
    content: '',
    agreeTerms: false,
    agreePrivacy: false
  })
  const [submittingInquiry, setSubmittingInquiry] = useState(false)

  // 프리로딩: 컴포넌트 마운트 시 로그인 확인 후 설백야 콘텐츠 프리로딩
  useEffect(() => {
    const preloadPaidContents = async () => {
      try {
        // 로그인 여부 확인 (saved-results API 호출)
        const savedResponse = await fetch('/api/saved-results/list', { cache: 'no-store' })
        if (savedResponse.ok) {
          // 로그인된 경우: 설백야 콘텐츠 프리로딩 (로딩 표시 없이 백그라운드에서 실행)
          loadPaidContents(true) // silent 모드로 프리로딩
        }
      } catch (error) {
        // 로그인 확인 실패 시 프리로딩하지 않음 (메뉴 열 때 로드)
        console.error('[설백야 프리로딩] 로그인 확인 실패:', error)
      }
    }
    
    preloadPaidContents()
  }, []) // 컴포넌트 마운트 시 한 번만 실행

  // 컨텐츠 목록 로드 및 초기화
  useEffect(() => {
    if (isOpen) {
      // 메뉴가 열릴 때마다 초기화 - 설백야 카테고리는 기본이 펼침
      setActiveSection('menu')
      // 설백야 카테고리는 항상 기본 펼침 상태로 설정
      setExpandedCategories(new Set(['설백야', '고객지원']))
      setSelectedContentId(null)
      
      // 이미 로드된 데이터가 없고, 현재 로딩 중이 아닐 때만 로드
      // (프리로딩이 완료되어 paidContents가 있으면 로드하지 않음)
      if (paidContents.length === 0 && !loadingContents) {
        loadPaidContents()
      }
    }
  }, [isOpen]) // isOpen만 의존성 배열에 포함 (무한 루프 방지)

  // 브라우저 뒤로가기로 메뉴 닫기
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isOpen) return

    // 메뉴가 열릴 때 히스토리 엔트리 추가
    window.history.pushState({ slideMenuBar: true }, '', window.location.href)

    const handlePopState = (e: PopStateEvent) => {
      // 뒤로가기 이벤트 발생 시 메뉴 닫기
      if (isOpen) {
        onClose()
      }
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isOpen, onClose])

  const loadPaidContents = async (silent = false) => { // silent 파라미터 추가
    try {
      if (!silent) { // silent 모드가 아닐 때만 로딩 상태 표시
        setLoadingContents(true)
      }
      
      // 1. 모든 컨텐츠 가져오기
      const allContents = await getContents()
      setContents(allContents || [])
      
      // 2. 결제한 내역 가져오기 (saved_results)
      const savedResponse = await fetch('/api/saved-results/list', { cache: 'no-store' })
      if (savedResponse.ok) {
        const savedData = await savedResponse.json()
        const savedTitles = new Set((savedData.data || []).map((item: any) => item.title))
        
        // 3. 결제한 내역의 title과 content_name을 매칭하여 결제한 컨텐츠만 필터링
        const paid = (allContents || []).filter((content: any) => 
          savedTitles.has(content.content_name)
        )
        setPaidContents(paid)
      } else {
        setPaidContents([])
      }
    } catch (error) {
      console.error('컨텐츠 로드 실패:', error)
      setPaidContents([])
    } finally {
      // silent 모드여도 로딩 완료 상태로 설정 (다음 로드 시 중복 방지)
      setLoadingContents(false)
    }
  }

  // 카테고리 토글
  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  // 컨텐츠 클릭 (설백야 카테고리만 점사 중 제한)
  const handleContentClick = (contentId: number, category: string) => {
    // 설백야 카테고리만 점사 중 제한
    if (!streamingFinished && category === '설백야') {
      alert('점사중이니 완료될때까지 기다려주세요')
      return
    }
    
    if (typeof window !== 'undefined') {
      const content = paidContents.find(c => c.id === contentId) || contents.find(c => c.id === contentId)
      if (content) {
        // 현재 콘텐츠 ID 확인
        const currentContentId = sessionStorage.getItem('form_content_id')
        
        // 같은 콘텐츠면 전환하지 않음 (불필요한 리로딩 방지)
        if (currentContentId === String(contentId) && window.location.pathname === '/form') {
          onClose() // 메뉴만 닫기
          return
        }
        
        // sessionStorage에 새 콘텐츠 정보 저장
        sessionStorage.setItem('form_title', content.content_name || '')
        sessionStorage.setItem('form_content_id', String(contentId))
        
        // 프론트폼 화면이면 페이지 리로드하여 새 콘텐츠로 전환
        if (window.location.pathname === '/form') {
          window.location.reload() // 같은 페이지에서 콘텐츠 전환
        } else {
          router.push('/form') // 다른 페이지에서 폼으로 이동
        }
        onClose()
      }
    }
  }

  // 전화번호 하이픈 자동 입력
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // 숫자만 추출
    let digits = e.target.value.replace(/[^0-9]/g, '')

    // 010은 고정
    if (!digits.startsWith('010')) {
      digits = '010' + digits.replace(/^010/, '')
    }

    // 길이 제한: 010 + 8자리 = 11자리
    digits = digits.slice(0, 11)

    // 표시 포맷: 010- / 010-1234 / 010-1234-5678
    let formatted = '010-'
    if (digits.length > 3) {
      const rest = digits.slice(3)
      if (rest.length <= 4) {
        formatted = `010-${rest}`
      } else {
        formatted = `010-${rest.slice(0, 4)}-${rest.slice(4, 8)}`
      }
    }

    setInquiryForm({ ...inquiryForm, phone: formatted })
  }

  // 문의하기 폼 제출
  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!inquiryForm.name.trim() || !inquiryForm.phone.trim() || !inquiryForm.email.trim() || !inquiryForm.content.trim()) {
      alert('모든 필드를 입력해주세요.')
      return
    }

    if (!inquiryForm.agreeTerms || !inquiryForm.agreePrivacy) {
      alert('이용약관 및 개인정보 수집 및 이용에 동의해주세요.')
      return
    }

    setSubmittingInquiry(true)
    try {
      const response = await fetch('/api/inquiry/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inquiryForm.name.trim(),
          phone: inquiryForm.phone.trim(),
          email: inquiryForm.email.trim(),
          content: inquiryForm.content.trim()
        })
      })

      const data = await response.json()
      if (response.ok && data.success) {
        setInquiryForm({
          name: '',
          phone: '010-',
          email: '',
          content: '',
          agreeTerms: false,
          agreePrivacy: false
        })
        setShowSuccessPopup(true)
        // 2초 후 자동으로 메뉴로 돌아가기
        setTimeout(() => {
          setShowSuccessPopup(false)
          setActiveSection('menu')
        }, 2000)
      } else {
        alert(data.error || '문의 접수에 실패했습니다.')
      }
    } catch (error) {
      alert('문의 접수 중 오류가 발생했습니다.')
    } finally {
      setSubmittingInquiry(false)
    }
  }

  // FAQ 데이터
  const faqData = [
    {
      question: '포춘82 결제(코인)와 재유니온 결제가 다른가요?',
      answer: '포춘82와 재유니온은 별도로 운영되고 있습니다. 서로 호환되지 않으며 개인정보 및 이용내역도 별도로 관리되고 있습니다.'
    },
    {
      question: '생년월일을 잘못 입력했는데 수정이 가능한가요?',
      answer: '유료 서비스인 경우 한번 입력한 정보는 수정 또는 변경이 불가합니다'
    },
    {
      question: '연락처나 비밀번호가 기억이 안나요.',
      answer: '해당 정보는 다시보기 시 본인 확인을 위해 필요한 부분이며 개인정보 보호를 위해 별도로 관리해주시기 바랍니다. 부득이하게 분실하셨을 경우 고객센터에 문의바랍니다.'
    },
    {
      question: '결제한 콘텐츠를 다시 보고 싶어요.',
      answer: '나의 이용내역에서 확인이 가능합니다. 60일간 이용이 가능합니다.'
    }
  ]

  return (
    <>
      {/* 오버레이 */}
      <div 
        className={`fixed inset-0 bg-black/60 z-[9998] transition-opacity duration-500 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />

      {/* 슬라이드 메뉴바 */}
      <div 
        className={`fixed top-0 right-0 w-full max-w-md bg-white shadow-2xl z-[9999] transform transition-transform duration-500 ease-in-out rounded-bl-2xl ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          height: 'auto',
          maxHeight: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">메뉴</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-pink-100 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-pink-700"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 메뉴 내용 */}
        <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 64px)', minHeight: 0 }}>
          {/* 메뉴 섹션 (기본) */}
          {activeSection === 'menu' && (
            <div className="p-6 space-y-4">
              {/* 설백야 카테고리 */}
              <div>
                <button
                  onClick={() => toggleCategory('설백야')}
                  className="w-full flex items-center justify-between py-3 px-4 bg-pink-50 rounded-lg hover:bg-pink-100 transition-colors"
                >
                  <span className="font-bold text-gray-900">설백야</span>
                  <svg
                    className={`w-5 h-5 text-gray-600 transition-transform ${
                      expandedCategories.has('설백야') ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedCategories.has('설백야') && (
                  <div className="mt-2 space-y-1 pl-4">
                    {loadingContents ? (
                      <div className="text-sm text-gray-500 py-2">로딩 중...</div>
                    ) : paidContents.length === 0 ? (
                      <div className="text-sm text-gray-500 py-2">결제한 컨텐츠가 없습니다.</div>
                    ) : (
                      paidContents.map((content) => (
                        <button
                          key={content.id}
                          onClick={() => handleContentClick(content.id, '설백야')}
                          className={`w-full text-left py-2.5 px-4 rounded-lg text-sm transition-colors ${
                            selectedContentId === content.id
                              ? 'bg-pink-600 text-white border-2 border-pink-600'
                              : 'bg-white text-gray-700 border-2 border-transparent hover:bg-pink-50 hover:border-pink-200'
                          }`}
                        >
                          {content.content_name || '이름 없음'}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 고객지원 카테고리 */}
              <div>
                <button
                  onClick={() => toggleCategory('고객지원')}
                  className="w-full flex items-center justify-between py-3 px-4 bg-pink-50 rounded-lg hover:bg-pink-100 transition-colors"
                >
                  <span className="font-bold text-gray-900">고객지원</span>
                  <svg
                    className={`w-5 h-5 text-gray-600 transition-transform ${
                      expandedCategories.has('고객지원') ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {expandedCategories.has('고객지원') && (
                  <div className="mt-2 space-y-1 pl-4">
                    <button
                      onClick={() => {
                        setActiveSection('faq')
                        setExpandedCategories(new Set(['고객지원']))
                      }}
                      className="w-full text-left py-2.5 px-4 rounded-lg text-sm bg-white text-gray-700 border-2 border-transparent hover:bg-pink-50 hover:border-pink-200 transition-colors"
                    >
                      자주하는 질문
                    </button>
                    <button
                      onClick={() => {
                        setActiveSection('inquiry')
                        setExpandedCategories(new Set(['고객지원']))
                      }}
                      className="w-full text-left py-2.5 px-4 rounded-lg text-sm bg-white text-gray-700 border-2 border-transparent hover:bg-pink-50 hover:border-pink-200 transition-colors"
                    >
                      문의하기
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 자주하는 질문 섹션 */}
          {activeSection === 'faq' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4 mb-4">
                <button
                  onClick={() => setActiveSection('menu')}
                  className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-sm font-semibold">이전</span>
                </button>
                <h3 className="text-lg font-bold text-gray-900">자주하는 질문</h3>
              </div>
              <div className="space-y-4">
                {faqData.map((faq, index) => (
                  <div key={index} className="bg-white border border-pink-200 rounded-lg p-4 shadow-sm">
                    <h4 className="font-semibold text-gray-900 mb-2 text-sm">{faq.question}</h4>
                    <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{faq.answer}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 문의하기 섹션 */}
          {activeSection === 'inquiry' && (
            <div className="p-6">
              <div className="flex items-center gap-4 mb-6">
                <button
                  onClick={() => setActiveSection('menu')}
                  className="flex items-center gap-2 text-pink-600 hover:text-pink-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span className="text-sm font-semibold">이전</span>
                </button>
                <h3 className="text-lg font-bold text-gray-900">문의하기</h3>
              </div>
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                {/* 이름 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">이름</label>
                  <input
                    type="text"
                    value={inquiryForm.name}
                    onChange={(e) => setInquiryForm({ ...inquiryForm, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="이름을 입력해주세요"
                    required
                  />
                </div>

                {/* 휴대폰 번호 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">휴대폰 번호</label>
                  <input
                    type="tel"
                    value={inquiryForm.phone}
                    onChange={handlePhoneChange}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="010-1234-5678"
                    maxLength={13}
                    required
                  />
                </div>

                {/* 이메일 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">이메일</label>
                  <input
                    type="email"
                    value={inquiryForm.email}
                    onChange={(e) => setInquiryForm({ ...inquiryForm, email: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500"
                    placeholder="example@email.com"
                    required
                  />
                </div>

                {/* 문의내용 */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    문의내용
                    <span className="text-xs text-gray-500 font-normal ml-2">
                      ({inquiryForm.content.length} / 800자)
                    </span>
                  </label>
                  <textarea
                    value={inquiryForm.content}
                    onChange={(e) => {
                      if (e.target.value.length <= 800) {
                        setInquiryForm({ ...inquiryForm, content: e.target.value })
                      }
                    }}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 resize-none"
                    rows={6}
                    placeholder="문의내용을 입력해주세요"
                    required
                  />
                  {inquiryForm.content.length >= 800 && (
                    <p className="text-xs text-red-500 mt-1">최대 800자까지 입력 가능합니다.</p>
                  )}
                </div>

                {/* 이용약관 동의 */}
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="agreeTerms"
                    checked={inquiryForm.agreeTerms}
                    onChange={(e) => setInquiryForm({ ...inquiryForm, agreeTerms: e.target.checked })}
                    className="mt-1 w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
                  />
                  <label htmlFor="agreeTerms" className="text-sm text-gray-700 flex-1">
                    서비스 이용 약관에 동의{' '}
                    <button
                      type="button"
                      onClick={() => setShowTermsPopup(true)}
                      className="text-pink-600 hover:text-pink-700 underline font-semibold"
                    >
                      [이용약관보기]
                    </button>
                  </label>
                </div>

                {/* 개인정보 수집 및 이용동의 */}
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="agreePrivacy"
                    checked={inquiryForm.agreePrivacy}
                    onChange={(e) => setInquiryForm({ ...inquiryForm, agreePrivacy: e.target.checked })}
                    className="mt-1 w-4 h-4 text-pink-600 border-gray-300 rounded focus:ring-pink-500"
                  />
                  <label htmlFor="agreePrivacy" className="text-sm text-gray-700 flex-1">
                    개인정보 수집 및 이용동의{' '}
                    <button
                      type="button"
                      onClick={() => setShowPrivacyPopup(true)}
                      className="text-pink-600 hover:text-pink-700 underline font-semibold"
                    >
                      [고지내용보기]
                    </button>
                  </label>
                </div>

                {/* 제출 버튼 */}
                <button
                  type="submit"
                  disabled={submittingInquiry || !inquiryForm.agreeTerms || !inquiryForm.agreePrivacy}
                  className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
                >
                  {submittingInquiry ? '문의 접수 중...' : '문의내용 저장'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* 이용약관 팝업 */}
      <TermsPopup isOpen={showTermsPopup} onClose={() => setShowTermsPopup(false)} />

      {/* 개인정보처리방침 팝업 */}
      <PrivacyPopup isOpen={showPrivacyPopup} onClose={() => setShowPrivacyPopup(false)} />

      {/* 문의 접수 성공 팝업 */}
      {showSuccessPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001] p-4">
          <div className="bg-white rounded-xl max-w-md w-full shadow-2xl transform transition-all duration-300 ease-out">
            <div className="p-6 text-center">
              <div className="mb-4">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">문의가 접수되었습니다</h3>
                <p className="text-gray-600">빠른 시일 내에 답변드리겠습니다.</p>
              </div>
              <button
                onClick={() => {
                  setShowSuccessPopup(false)
                  setActiveSection('menu')
                }}
                className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
