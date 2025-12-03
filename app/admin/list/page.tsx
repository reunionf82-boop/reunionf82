'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function ContentListPage() {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [selectedContent, setSelectedContent] = useState<string>('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

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

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">컨텐츠 리스트</h1>
          <p className="text-gray-400">컨텐츠를 관리하세요</p>
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

