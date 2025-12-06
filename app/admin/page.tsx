'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getContents, deleteContent } from '@/lib/supabase-admin'

export default function AdminPage() {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash')
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('nara')

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (authenticated === true) {
      loadContents()
      loadSettings()
    }
  }, [authenticated])

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/auth/check')
      const data = await response.json()
      if (data.authenticated) {
        setAuthenticated(true)
      } else {
        setAuthenticated(false)
        router.push('/admin/login')
      }
    } catch (error) {
      console.error('인증 확인 실패:', error)
      setAuthenticated(false)
      router.push('/admin/login')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/login', { method: 'DELETE' })
      router.push('/admin/login')
    } catch (error) {
      console.error('로그아웃 실패:', error)
    }
  }

  const loadSettings = async () => {
    try {
      // 캐시 방지를 위해 cache: 'no-store' 옵션 추가
      const response = await fetch('/api/admin/settings/get', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      if (!response.ok) {
        throw new Error('설정 조회 실패')
      }
      const data = await response.json()
      
      console.log('=== 설정 로드 응답 ===')
      console.log('전체 응답:', data)
      console.log('모델:', data.model)
      console.log('화자:', data.speaker)
      console.log('현재 상태 - 모델:', selectedModel, '화자:', selectedSpeaker)
      
      // 모델 설정 (DB에서 가져온 값으로 무조건 업데이트)
      const loadedModel = data.model || 'gemini-2.5-flash'
      console.log('로드된 모델:', loadedModel, '현재 모델:', selectedModel)
      console.log('모델 상태 업데이트:', selectedModel, '->', loadedModel)
      setSelectedModel(loadedModel)
      console.log('관리자 페이지: Supabase에서 모델 로드:', loadedModel)
      
      // 화자 설정 (DB에서 가져온 값으로 무조건 업데이트)
      const loadedSpeaker = data.speaker || 'nara'
      console.log('로드된 화자:', loadedSpeaker, '현재 화자:', selectedSpeaker)
      console.log('화자 상태 업데이트:', selectedSpeaker, '->', loadedSpeaker)
      setSelectedSpeaker(loadedSpeaker)
      console.log('=== 관리자 컨텐츠 리스트: 선택된 화자 로드 ===')
      console.log('선택된 화자:', loadedSpeaker)
      console.log('화자 옵션:')
      console.log('  - nara: 나라 (여성)')
      console.log('  - mijin: 미진 (여성)')
      console.log('  - nhajun: 나준 (여성)')
      console.log('  - ndain: 다인 (여성)')
      console.log('  - jinho: 진호 (남성)')
      console.log('==========================================')
    } catch (error) {
      console.error('설정 로드 실패:', error)
      // 에러 발생 시에도 기본값으로 변경하지 않고 현재 값 유지
      console.log('에러 발생, 현재 설정 유지 - 모델:', selectedModel, '화자:', selectedSpeaker)
    }
  }

  const loadContents = async () => {
    try {
      const data = await getContents()
      // id 내림차순으로 정렬 (최신순)
      const sortedData = (data || []).sort((a, b) => (b.id || 0) - (a.id || 0))
      setContents(sortedData)
    } catch (error) {
      console.error('컨텐츠 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleModelChange = async (model: string) => {
    const modelDisplayName = model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : model
    console.log('=== 관리자 페이지: 모델 변경 ===')
    console.log('선택된 모델:', modelDisplayName, `(${model})`)
    
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model }),
      })
      
      if (!response.ok) {
        throw new Error('모델 저장 실패')
      }
      
      const result = await response.json()
      console.log('저장 응답:', result)
      
      // 저장 응답에서 실제 저장된 값으로 상태 업데이트
      if (result.model) {
        setSelectedModel(result.model)
        console.log('저장된 모델로 상태 업데이트:', result.model)
        console.log('Supabase에 저장 완료:', result.model)
        console.log('==============================')
      }
    } catch (error) {
      console.error('모델 저장 실패:', error)
      alert('모델 저장에 실패했습니다. 콘솔을 확인해주세요.')
    }
  }

  const handleAdd = () => {
    // 선택된 화자 정보를 URL 파라미터로 전달
    router.push(`/admin/form?speaker=${selectedSpeaker}`)
  }

  const handleContentClick = (content: any) => {
    router.push(`/admin/form?id=${content.id}`)
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">인증 확인 중...</div>
      </div>
    )
  }

  if (authenticated === false) {
    return null // 리다이렉트 중
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 관리 화면을 더 넓게 사용하기 위해 max-w 제한 제거 및 좌우 여백 약간만 유지 */}
      <div className="w-full mx-auto px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">관리자 컨텐츠 리스트</h1>
            <p className="text-gray-400">컨텐츠를 관리하세요</p>
          </div>
          <button
            onClick={handleLogout}
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors duration-200"
          >
            로그아웃
          </button>
        </div>

        {/* 버튼들 */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={handleAdd}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold px-6 py-3 rounded-lg transition-colors duration-200"
          >
            추가
          </button>
          
          {/* 모델 선택 토글 */}
          <div className="flex items-center gap-2 ml-auto bg-gray-800 rounded-lg p-1 border border-gray-700">
            {/* TTS 화자 선택 드롭다운 */}
            <select
              value={selectedSpeaker}
              onChange={async (e) => {
                const speaker = e.target.value
                const speakerNames: { [key: string]: string } = {
                  'nara': '나라 (여성)',
                  'mijin': '미진 (여성)',
                  'nhajun': '나준 (여성)',
                  'ndain': '다인 (여성)',
                  'jinho': '진호 (남성)'
                }
                const speakerDisplayName = speakerNames[speaker] || speaker
                
                console.log('=== 관리자 컨텐츠 리스트: 화자 변경 ===')
                console.log('이전 화자:', selectedSpeaker, `(${speakerNames[selectedSpeaker] || selectedSpeaker})`)
                console.log('새 화자:', speaker, `(${speakerDisplayName})`)
                
                try {
                  const response = await fetch('/api/admin/settings/save', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ speaker }),
                  })
                  
                  if (!response.ok) {
                    throw new Error('화자 저장 실패')
                  }
                  
                  const result = await response.json()
                  console.log('저장 응답:', result)
                  
                  // 저장 응답에서 실제 저장된 값으로 상태 업데이트
                  if (result.speaker) {
                    setSelectedSpeaker(result.speaker)
                    console.log('저장된 화자로 상태 업데이트:', result.speaker)
                    console.log('Supabase에 화자 저장 완료:', result.speaker, `(${speakerDisplayName})`)
                    console.log('==============================')
                  }
                } catch (error) {
                  console.error('화자 저장 실패:', error)
                  alert('화자 저장에 실패했습니다. 콘솔을 확인해주세요.')
                }
              }}
              className="bg-gray-800 border border-gray-700 rounded-md px-4 py-2 text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pink-500 h-[36px] mr-2"
            >
              <option value="nara">나라 (여성)</option>
              <option value="mijin">미진 (여성)</option>
              <option value="nhajun">나준 (여성)</option>
              <option value="ndain">다인 (여성)</option>
              <option value="jinho">진호 (남성)</option>
            </select>
            <button
              onClick={() => handleModelChange('gemini-2.5-flash')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                selectedModel === 'gemini-2.5-flash'
                  ? 'bg-pink-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Gemini 2.5 Flash
            </button>
            <button
              onClick={() => handleModelChange('gemini-2.5-pro')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                selectedModel === 'gemini-2.5-pro'
                  ? 'bg-pink-500 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Gemini 2.5 Pro
            </button>
          </div>
        </div>

        {/* 컨텐츠 목록 */}
        <div className="space-y-2">
          {loading ? (
            <div className="text-center text-gray-400 py-12">로딩 중...</div>
          ) : contents.length === 0 ? (
            <div className="text-center text-gray-400 py-12">컨텐츠가 없습니다.</div>
          ) : (
            contents.map((content, index) => (
              <div
                key={content.id}
                onClick={() => handleContentClick(content)}
                className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700"
              >
                <div className="flex items-center justify-between">
                  <span className="text-white">{content.content_name || '이름 없음'}</span>
                  <span className="text-gray-400 text-sm">#{index + 1}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

