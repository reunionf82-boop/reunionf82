'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ContentListPage() {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [selectedContent, setSelectedContent] = useState<string>('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [useSequentialFortune, setUseSequentialFortune] = useState<boolean>(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (authenticated === true) {
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

      setAuthenticated(false)
      router.push('/admin/login')
    }
  }

  const loadSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings/get')
      const data = await response.json()
      if (data.use_sequential_fortune !== undefined) {
        setUseSequentialFortune(data.use_sequential_fortune)
      }
    } catch (error) {

    } finally {
      setLoading(false)
    }
  }

  const handleToggleFortuneMode = async () => {
    const newValue = !useSequentialFortune
    setSaving(true)
    try {
      const response = await fetch('/api/admin/settings/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          use_sequential_fortune: newValue
        }),
      })
      const data = await response.json()
      if (data.success) {
        setUseSequentialFortune(newValue)
      } else {

        alert('설정 저장에 실패했습니다.')
      }
    } catch (error) {

      alert('설정 저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleInput = () => {
    if (selectedContent.trim()) {
      setContents([...contents, { id: Date.now(), name: selectedContent }])
      setSelectedContent('')
    }
  }

  const handleModify = () => {
    if (editingIndex !== null && selectedContent.trim()) {
      const updatedContents = contents.map((content, index) =>
        index === editingIndex ? { ...content, name: selectedContent } : content
      )
      setContents(updatedContents)
      setSelectedContent('')
      setEditingIndex(null)
    }
  }

  const handleDelete = () => {
    if (editingIndex !== null) {
      const updatedContents = contents.filter((_, index) => index !== editingIndex)
      setContents(updatedContents)
      setSelectedContent('')
      setEditingIndex(null)
    }
  }

  const handleAdd = () => {
    router.push('/admin')
  }

  const handleContentClick = (content: any, index: number) => {
    setSelectedContent(content.name)
    setEditingIndex(index)
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">인증 확인 중...</div>
      </div>
    )
  }

  if (authenticated === false) {
    return null // 리다이렉트 중
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      {/* 리스트 화면도 더 넓게 사용하기 위해 최대 너비를 확장 */}
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">컨텐츠 리스트</h1>
          <p className="text-gray-400">컨텐츠를 관리하세요</p>
          
          {/* 병렬점사/직렬점사 토글 버튼 */}
          <div className="mt-6 bg-gray-800 rounded-lg p-6 border-2 border-gray-600">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="text-xl font-bold text-white mb-2">점사 모드 설정</h3>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {useSequentialFortune 
                    ? '직렬점사: 상품메뉴 구성 전체를 한 번에 점사 요청합니다.' 
                    : '병렬점사: 대메뉴 단위로 순차적 점사 요청하며, 이전 대메뉴의 컨텍스트를 유지합니다.'}
                </p>
              </div>
              <div className="ml-6 flex items-center gap-3">
                <span className={`text-sm font-medium ${!useSequentialFortune ? 'text-pink-400' : 'text-gray-400'}`}>
                  병렬
                </span>
                <button
                  onClick={handleToggleFortuneMode}
                  disabled={loading || saving}
                  className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors duration-200 ${
                    useSequentialFortune ? 'bg-pink-500' : 'bg-gray-600'
                  } ${loading || saving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-90'}`}
                >
                  <span
                    className={`inline-block h-8 w-8 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${
                      useSequentialFortune ? 'translate-x-11' : 'translate-x-1'
                    }`}
                  />
                </button>
                <span className={`text-sm font-medium ${useSequentialFortune ? 'text-pink-400' : 'text-gray-400'}`}>
                  직렬
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 입력 필드와 버튼들 */}
        <div className="bg-white rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={selectedContent}
              onChange={(e) => setSelectedContent(e.target.value)}
              className="flex-1 bg-white rounded-lg px-4 py-3 text-black placeholder-gray-400 focus:outline-none"
              placeholder=""
            />
            <button
              onClick={handleInput}
              className="bg-gray-500 hover:bg-gray-600 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200"
            >
              입력
            </button>
            <button
              onClick={handleModify}
              disabled={editingIndex === null}
              className="bg-gray-500 hover:bg-gray-600 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              수정
            </button>
            <button
              onClick={handleDelete}
              disabled={editingIndex === null}
              className="bg-gray-500 hover:bg-gray-600 text-white font-medium px-6 py-3 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              삭제
            </button>
            <button
              onClick={handleAdd}
              className="bg-white border border-black text-black font-bold text-xl w-12 h-12 rounded-lg flex items-center justify-center transition-colors duration-200 hover:bg-gray-100"
            >
              +
            </button>
          </div>
        </div>

        {/* 컨텐츠 목록 */}
        <div className="space-y-2">
          {contents.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              컨텐츠가 없습니다. 위의 입력 필드에 컨텐츠를 입력하고 "입력" 버튼을 클릭하세요.
            </div>
          ) : (
            contents.map((content, index) => (
              <div
                key={content.id}
                onClick={() => handleContentClick(content, index)}
                className={`bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors ${
                  editingIndex === index ? 'ring-2 ring-pink-500' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-white">{content.name}</span>
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

