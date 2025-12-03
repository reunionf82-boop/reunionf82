'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getContents, getSelectedModel, saveSelectedModel } from '@/lib/supabase-admin'

export default function AdminPage() {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash')

  useEffect(() => {
    loadContents()
    loadSelectedModel()
  }, [])

  const loadSelectedModel = async () => {
    try {
      const model = await getSelectedModel()
      setSelectedModel(model)
      console.log('관리자 페이지: Supabase에서 모델 로드:', model)
    } catch (error) {
      console.error('모델 로드 실패:', error)
      // 기본값 사용
      setSelectedModel('gemini-2.5-flash')
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
      await saveSelectedModel(model)
      setSelectedModel(model)
      console.log('Supabase에 저장 완료:', model)
      console.log('==============================')
    } catch (error) {
      console.error('모델 저장 실패:', error)
      alert('모델 저장에 실패했습니다. 콘솔을 확인해주세요.')
    }
  }

  const handleAdd = () => {
    router.push('/admin/form')
  }

  const handleContentClick = (content: any) => {
    router.push(`/admin/form?id=${content.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 관리 화면을 더 넓게 사용하기 위해 max-w 제한 제거 및 좌우 여백 약간만 유지 */}
      <div className="w-full mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">관리자 컨텐츠 리스트</h1>
          <p className="text-gray-400">컨텐츠를 관리하세요</p>
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

