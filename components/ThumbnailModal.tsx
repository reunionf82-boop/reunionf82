'use client'

import { useState, useRef, DragEvent, useEffect } from 'react'
import { uploadThumbnailFile, deleteThumbnail } from '@/lib/supabase-admin'

interface ThumbnailModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
  currentThumbnail?: string
}

export default function ThumbnailModal({ isOpen, onClose, onSelect, currentThumbnail }: ThumbnailModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null) // 선택한 파일의 미리보기만 저장
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 모달이 열릴 때 초기화
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null)
      setFilePreviewUrl(null)
      setShowDeleteConfirm(false)
    }
  }, [isOpen])

  // currentThumbnail이 변경될 때 파일 선택 초기화 (모달이 열려있는 동안)
  useEffect(() => {
    if (isOpen && currentThumbnail !== undefined) {
      setSelectedFile(null)
      setFilePreviewUrl(null)
    }
  }, [currentThumbnail, isOpen])

  // previewUrl 계산: 선택한 파일이 있으면 파일 미리보기, 없으면 currentThumbnail 사용
  const previewUrl = filePreviewUrl || currentThumbnail || null

  const handleFileSelect = (file: File) => {
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setFilePreviewUrl(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleAreaClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleRegister = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      const url = await uploadThumbnailFile(selectedFile)
      if (!url || url.trim() === '') {
        throw new Error('업로드된 파일의 URL을 받지 못했습니다.')
      }
      onSelect(url)
      onClose()
      // 초기화
      setSelectedFile(null)
      setFilePreviewUrl(null)
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || '알 수 없는 오류가 발생했습니다.'
      alert(`썸네일 업로드에 실패했습니다.\n${errorMessage}`)
    } finally {
      setUploading(false)
    }
  }

  const extractFilePath = (url: string): string => {
    // Supabase Storage URL 형식: https://xxx.supabase.co/storage/v1/object/public/thumbnails/filename
    // 또는 상대 경로: thumbnails/filename
    try {
      if (url.includes('/storage/v1/object/public/thumbnails/')) {
        const parts = url.split('/storage/v1/object/public/thumbnails/')
        if (parts.length > 1) {
          return `thumbnails/${parts[1]}`
        }
      } else if (url.includes('thumbnails/')) {
        // 이미 thumbnails/ 포함된 경우
        if (!url.startsWith('thumbnails/')) {
          const parts = url.split('thumbnails/')
          return `thumbnails/${parts[1]}`
        }
        return url
      }
      // URL에서 파일명만 추출
      const urlParts = url.split('/')
      const fileName = urlParts[urlParts.length - 1].split('?')[0] // 쿼리 파라미터 제거
      return `thumbnails/${fileName}`
    } catch (error) {
      return ''
    }
  }

  const handleModify = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      // 기존 썸네일이 있으면 삭제
      if (currentThumbnail) {
        try {
          const filePath = extractFilePath(currentThumbnail)
          if (filePath) {
            await deleteThumbnail(filePath)
          }
        } catch (error) {
          // 삭제 실패해도 계속 진행
        }
      }

      // 새 썸네일 업로드
      const url = await uploadThumbnailFile(selectedFile)
      if (!url || url.trim() === '') {
        throw new Error('업로드된 파일의 URL을 받지 못했습니다.')
      }
      onSelect(url)
      onClose()
      // 초기화
      setSelectedFile(null)
      setFilePreviewUrl(null)
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || '알 수 없는 오류가 발생했습니다.'
      alert(`썸네일 수정에 실패했습니다.\n${errorMessage}`)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!currentThumbnail) return

    if (showDeleteConfirm) {
      // 실제 삭제 실행
      setUploading(true)
      try {
        const filePath = extractFilePath(currentThumbnail)
        if (filePath) {
          await deleteThumbnail(filePath)
          onSelect('')
          onClose()
          setFilePreviewUrl(null)
          setShowDeleteConfirm(false)
        } else {
          alert('파일 경로를 찾을 수 없습니다.')
        }
      } catch (error) {
        alert('썸네일 삭제에 실패했습니다.')
      } finally {
        setUploading(false)
      }
    } else {
      // 확인 팝업 표시
      setShowDeleteConfirm(true)
    }
  }

  const handleClose = () => {
    setSelectedFile(null)
    setFilePreviewUrl(null)
    setShowDeleteConfirm(false)
    setIsDragging(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[90vw] max-w-4xl flex flex-col">
        {/* 썸네일 영역 - 16:10 비율 */}
        <div className="relative w-full" style={{ paddingBottom: '62.5%' }}>
          <div
            className={`absolute inset-0 border-2 border-dashed ${
              isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
            } rounded-lg m-4 flex items-center justify-center cursor-pointer transition-colors`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={handleAreaClick}
          >
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="썸네일 미리보기"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-gray-400 text-center px-4">
                <div className="text-lg">썸네일을 이 영역으로 드래그&드롭 하거나</div>
                <div className="text-lg">클릭하여 썸네일을 불러오세요</div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        </div>

        {/* 하단 버튼 영역 */}
        <div className="bg-black p-4 flex justify-center gap-4">
          <button
            onClick={handleRegister}
            disabled={!selectedFile || uploading}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold px-8 py-3 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            등록
          </button>
          <button
            onClick={handleDelete}
            disabled={!currentThumbnail || uploading}
            className="bg-gray-600 hover:bg-gray-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            삭제
          </button>
          <button
            onClick={handleClose}
            className="bg-gray-600 hover:bg-gray-500 text-white font-semibold px-8 py-3 rounded-lg transition-colors duration-200"
          >
            취소
          </button>
        </div>

        {/* 삭제 확인 팝업 */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-bold mb-4">썸네일 삭제</h3>
              <p className="text-gray-600 mb-6">
                정말로 썸네일을 삭제하시겠습니까?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDelete}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  삭제
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
