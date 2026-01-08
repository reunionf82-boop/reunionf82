'use client'

import { useState, useRef, DragEvent, useEffect } from 'react'
import { uploadThumbnailFile, getThumbnailUrl } from '@/lib/supabase-admin'

interface ThumbnailModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (url: string) => void
  currentThumbnail?: string
  thumbnailType?: 'image' | 'video' // 이미지 또는 동영상 타입
  currentVideoBaseName?: string // 동영상 파일명 (확장자 제외)
}

export default function ThumbnailModal({ isOpen, onClose, onSelect, currentThumbnail, thumbnailType = 'image', currentVideoBaseName: propVideoBaseName }: ThumbnailModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null) // 선택한 파일의 미리보기만 저장
  const [fileType, setFileType] = useState<'image' | 'video' | null>(null) // 파일 타입 저장
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [currentVideoBaseName, setCurrentVideoBaseName] = useState<string | null>(null) // 현재 동영상 파일명 저장
  const fileInputRef = useRef<HTMLInputElement>(null)

  // currentThumbnail이 이미지인지 동영상인지 판단
  const getFileTypeFromUrl = (url: string | null | undefined): 'image' | 'video' | null => {
    if (!url) return null
    const lowerUrl = url.toLowerCase()
    if (lowerUrl.includes('.webm')) {
      return 'video'
    }
    return 'image'
  }


  // 모달이 열릴 때 초기화 및 동영상 파일 상태 확인
  useEffect(() => {
    if (isOpen) {
      setSelectedFile(null)
      setFilePreviewUrl(null)
      setFileType(null)
      setShowDeleteConfirm(false)
      // 동영상 파일 선택은 초기화하지 않음 (업로드 중일 수 있음)
      // setSelectedWebmFile(null)
      // setSelectedMp4File(null)
      
      // 동영상 타입이면 파일명 설정
      if (thumbnailType === 'video') {
        const videoBaseName = currentThumbnail || currentVideoBaseName
        if (videoBaseName) {
          setCurrentVideoBaseName(videoBaseName)
        }
      } else {
        // 이미지 타입일 때만 초기화
        setCurrentVideoBaseName(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, currentThumbnail, thumbnailType])

  // currentThumbnail이 변경될 때 파일 선택 초기화 (모달이 열려있는 동안)
  useEffect(() => {
    if (isOpen && currentThumbnail !== undefined && thumbnailType === 'video') {
      setSelectedFile(null)
      setFilePreviewUrl(null)
      setFileType(null)
      
      // 동영상 타입이고 currentThumbnail이 있으면 파일명 설정
      if (currentThumbnail) {
        setCurrentVideoBaseName(currentThumbnail)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentThumbnail, isOpen, thumbnailType])

  // Supabase Storage URL 가져오기
  const getBucketUrl = (): string => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (supabaseUrl) {
      return `${supabaseUrl}/storage/v1/object/public/thumbnails`
    }
    return ''
  }
  
  const bucketUrl = getBucketUrl()
  
  // WebM 파일 URL 생성
  const webmVideoBaseName = propVideoBaseName || currentVideoBaseName || (thumbnailType === 'video' && currentThumbnail && !currentThumbnail.includes('http') && !currentThumbnail.includes('/') ? currentThumbnail : null)
  const webmVideoUrl = webmVideoBaseName && bucketUrl ? `${bucketUrl}/${webmVideoBaseName}.webm` : null
  
  // 동영상 타입일 때 썸네일 이미지 URL 자동 생성
  const getThumbnailImageUrl = () => {
    if (thumbnailType === 'video' && webmVideoBaseName && !currentThumbnail?.includes('http') && !currentThumbnail?.includes('/')) {
      // 동영상 파일명만 있는 경우 썸네일 이미지 URL 생성
      return getThumbnailUrl(`${webmVideoBaseName}.jpg`)
    }
    return currentThumbnail
  }
  
  // previewUrl 계산: 선택한 파일이 있으면 파일 미리보기, 동영상 타입이면 썸네일 이미지 URL, 없으면 currentThumbnail 사용
  const thumbnailImageUrl = getThumbnailImageUrl()
  const previewUrl = filePreviewUrl || thumbnailImageUrl || null
  // 동영상 파일을 선택했을 때는 fileType을 우선 사용
  const previewFileType = fileType || (thumbnailType === 'video' && webmVideoUrl ? 'video' : (thumbnailType === 'video' ? 'image' : getFileTypeFromUrl(currentThumbnail)))

  const handleFileSelect = (file: File) => {
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type === 'video/webm'
    
    if (file && (isImage || isVideo)) {
      setSelectedFile(file)
      setFileType(isVideo ? 'video' : 'image')
      
      if (isImage) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setFilePreviewUrl(reader.result as string)
        }
        reader.readAsDataURL(file)
      } else if (isVideo) {
        // 동영상의 경우 Object URL 생성
        const videoUrl = URL.createObjectURL(file)
        setFilePreviewUrl(videoUrl)
      }
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
      // 동영상 타입일 때는 WebM만 허용
      if (thumbnailType === 'video') {
        const fileName = file.name.toLowerCase()
        const isWebm = fileName.endsWith('.webm')
        if (isWebm) {
          handleFileSelect(file)
        } else {
          alert('WebM 파일만 업로드할 수 있습니다.')
        }
      } else {
        handleFileSelect(file)
      }
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

  // 동영상의 첫 프레임을 캡처하여 이미지로 변환
  const captureVideoFrame = async (videoFile: File): Promise<File | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      
      if (!ctx) {
        resolve(null)
        return
      }

      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      
      video.onloadedmetadata = () => {
        video.currentTime = 0.1 // 첫 프레임으로 이동 (0.1초)
      }

      video.onseeked = () => {
        try {
          // 비디오 크기에 맞춰 canvas 설정
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          
          // 첫 프레임을 canvas에 그리기
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
          
          // canvas를 Blob으로 변환
          canvas.toBlob((blob) => {
            if (blob) {
              // Blob을 File 객체로 변환
              const fileName = videoFile.name.replace(/\.webm$/i, '.jpg')
              const imageFile = new File([blob], fileName, { type: 'image/jpeg' })
              resolve(imageFile)
            } else {
              resolve(null)
            }
          }, 'image/jpeg', 0.95) // JPEG 품질 95%
        } catch (error) {
          resolve(null)
        }
      }

      video.onerror = () => {
        resolve(null)
      }

      // Object URL 생성 및 비디오 로드
      const videoUrl = URL.createObjectURL(videoFile)
      video.src = videoUrl
      
      // 정리 함수
      const cleanup = () => {
        URL.revokeObjectURL(videoUrl)
      }
      
      // 성공 또는 실패 시 정리
      video.addEventListener('loadedmetadata', () => {
        setTimeout(cleanup, 1000) // 1초 후 정리
      })
    })
  }

  const handleRegister = async () => {
    if (!selectedFile) return

    setUploading(true)
    try {
      const result = await uploadThumbnailFile(selectedFile)
      // 동영상인 경우 파일명(확장자 제외)을 반환, 이미지인 경우 URL 반환
      const valueToSelect = result.fileType === 'video' && result.videoBaseName 
        ? result.videoBaseName 
        : result.url
      
      if (!valueToSelect || valueToSelect.trim() === '') {
        throw new Error('업로드된 파일의 정보를 받지 못했습니다.')
      }
      
      // 동영상인 경우 첫 프레임을 캡처하여 썸네일 이미지로 업로드
      let thumbnailImageUrl = ''
      if (result.fileType === 'video' && selectedFile.type === 'video/webm') {
        try {
          const thumbnailImage = await captureVideoFrame(selectedFile)
          if (thumbnailImage) {
            const thumbnailResult = await uploadThumbnailFile(thumbnailImage)
            thumbnailImageUrl = thumbnailResult.url
          }
        } catch (error) {
          // 썸네일 생성 실패해도 계속 진행
          console.warn('썸네일 이미지 생성 실패:', error)
        }
      }
      
      // 부모 컴포넌트에 알림 (동영상인 경우 썸네일 이미지 URL도 함께 전달)
      if (result.fileType === 'video' && thumbnailImageUrl) {
        // 썸네일 이미지 URL을 콜백으로 전달하기 위해 커스텀 이벤트 또는 콜백 사용
        // onSelect는 동영상 파일명만 전달하고, 썸네일 이미지는 별도로 처리
        onSelect(valueToSelect)
        // 썸네일 이미지 URL을 부모 컴포넌트에 전달하기 위해 이벤트 발생
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('thumbnailImageCaptured', { 
            detail: { thumbnailImageUrl } 
          }))
        }
      } else {
        onSelect(valueToSelect)
      }
      
      // 동영상인 경우 파일 상태 확인 및 모달 유지
      if (result.fileType === 'video' && result.videoBaseName) {
        // 업로드된 파일명 저장 (기존 파일명과 병합)
        const newBaseName = result.videoBaseName
        setCurrentVideoBaseName(newBaseName)
        
        // 파일 선택 초기화
        setSelectedFile(null)
        setFilePreviewUrl(null)
        setFileType(null)
        // Object URL 정리
        if (filePreviewUrl && fileType === 'video') {
          URL.revokeObjectURL(filePreviewUrl)
        }
        // 동영상 업로드 후에도 모달 닫기
        onClose()
        // 초기화
        setSelectedFile(null)
        setFilePreviewUrl(null)
        setFileType(null)
      } else {
        onClose()
        // 초기화
        setSelectedFile(null)
        setFilePreviewUrl(null)
        setFileType(null)
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || '알 수 없는 오류가 발생했습니다.'
      alert(`파일 업로드에 실패했습니다.\n${errorMessage}`)
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
          // 동영상인 경우 WebM 파일 삭제
          if (thumbnailType === 'video') {
            const videoBaseName = currentThumbnail.includes('.') 
              ? currentThumbnail.split('/').pop()?.replace(/\.webm$/i, '') || currentThumbnail
              : currentThumbnail
            const webmPath = `thumbnails/${videoBaseName}.webm`
            const response = await fetch(`/api/admin/thumbnail/delete?filePath=${encodeURIComponent(webmPath)}`, {
              method: 'DELETE'
            })
            // 삭제 실패해도 계속 진행
            if (!response.ok) {
              // 에러 무시
            }
          } else {
            const filePath = extractFilePath(currentThumbnail)
            if (filePath) {
              const response = await fetch(`/api/admin/thumbnail/delete?filePath=${encodeURIComponent(filePath)}`, {
                method: 'DELETE'
              })
              // 삭제 실패해도 계속 진행
              if (!response.ok) {
                // 에러 무시
              }
            }
          }
        } catch (error) {
          // 삭제 실패해도 계속 진행
        }
      }

      // 새 썸네일 업로드
      const result = await uploadThumbnailFile(selectedFile)
      // 동영상인 경우 파일명(확장자 제외)을 반환, 이미지인 경우 URL 반환
      const valueToSelect = result.fileType === 'video' && result.videoBaseName 
        ? result.videoBaseName 
        : result.url
      
      if (!valueToSelect || valueToSelect.trim() === '') {
        throw new Error('업로드된 파일의 정보를 받지 못했습니다.')
      }
      
      // 부모 컴포넌트에 알림
      onSelect(valueToSelect)
      
      // 동영상인 경우 파일 상태 확인 및 모달 유지
      if (result.fileType === 'video' && result.videoBaseName) {
        // 업로드된 파일명 저장
        setCurrentVideoBaseName(result.videoBaseName)
        
        // 파일 선택 초기화
        setSelectedFile(null)
        setFilePreviewUrl(null)
        setFileType(null)
        // Object URL 정리
        if (filePreviewUrl && fileType === 'video') {
          URL.revokeObjectURL(filePreviewUrl)
        }
        // 동영상 업로드 후에도 모달 닫기
        onClose()
      } else {
        onClose()
        // 초기화
        setSelectedFile(null)
        setFilePreviewUrl(null)
        setFileType(null)
      }
    } catch (error: any) {
      const errorMessage = error?.message || error?.error?.message || '알 수 없는 오류가 발생했습니다.'
      alert(`파일 수정에 실패했습니다.\n${errorMessage}`)
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
        // 동영상 타입인 경우 WebM 파일 삭제
        if (thumbnailType === 'video') {
          const videoBaseName = currentThumbnail
          // currentThumbnail이 URL이 아닌 파일명(확장자 제외)인 경우
          const webmFileName = videoBaseName.includes('.') 
            ? videoBaseName.split('/').pop()?.replace(/\.webm$/i, '') || videoBaseName
            : videoBaseName
          
          // WebM 파일 삭제 (API 라우트 사용)
          const webmPath = `thumbnails/${webmFileName}.webm`
          const response = await fetch(`/api/admin/thumbnail/delete?filePath=${encodeURIComponent(webmPath)}`, {
            method: 'DELETE'
          })
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: '파일 삭제에 실패했습니다.' }))
            throw new Error(errorData.error || '파일 삭제에 실패했습니다.')
          }
        } else {
          // 이미지 타입인 경우 기존 로직 사용
          const filePath = extractFilePath(currentThumbnail)
          if (filePath) {
            // API 라우트 사용
            const response = await fetch(`/api/admin/thumbnail/delete?filePath=${encodeURIComponent(filePath)}`, {
              method: 'DELETE'
            })
            
            if (!response.ok) {
              const errorData = await response.json().catch(() => ({ error: '파일 삭제에 실패했습니다.' }))
              throw new Error(errorData.error || '파일 삭제에 실패했습니다.')
            }
          } else {
            alert('파일 경로를 찾을 수 없습니다.')
            return
          }
        }
        
        onSelect('')
        onClose()
        setFilePreviewUrl(null)
        setShowDeleteConfirm(false)
        // 동영상 관련 상태도 초기화
        setCurrentVideoBaseName(null)
      } catch (error: any) {
        alert(`썸네일 삭제에 실패했습니다.\n${error?.message || '알 수 없는 오류가 발생했습니다.'}`)
      } finally {
        setUploading(false)
      }
    } else {
      // 확인 팝업 표시
      setShowDeleteConfirm(true)
    }
  }

  const handleClose = () => {
    // Object URL 정리
    if (filePreviewUrl && fileType === 'video') {
      URL.revokeObjectURL(filePreviewUrl)
    }
    setSelectedFile(null)
    setFilePreviewUrl(null)
    setFileType(null)
    setShowDeleteConfirm(false)
    setIsDragging(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-[90vw] max-w-4xl flex flex-col">
        {/* 동영상 업로드 영역: WebM만 지원 */}
        {thumbnailType === 'video' ? (
          <div className="relative w-full" style={{ paddingBottom: '62.5%' }}>
            <div
              className={`absolute inset-0 border-2 border-dashed ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              } rounded-lg m-4 flex items-center justify-center cursor-pointer transition-colors ${
                previewUrl && previewFileType === 'video' ? 'border-green-500 bg-green-50' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={handleAreaClick}
            >
              {previewUrl && (previewFileType === 'video' || (webmVideoBaseName && webmVideoUrl)) ? (
                <video
                  src={previewFileType === 'video' && filePreviewUrl ? filePreviewUrl : (webmVideoUrl || previewUrl)}
                  className="max-w-full max-h-full object-contain"
                  controls
                  muted
                />
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt="썸네일 미리보기"
                  className="max-w-full max-h-full object-contain"
                />
              ) : (
                <div className="text-gray-400 text-center px-4">
                  <div className="text-lg font-semibold mb-2">WebM 동영상</div>
                  <div className="text-sm">WebM 파일을 드래그하거나 클릭하여 업로드</div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/webm"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          </div>
        ) : (
          /* 이미지 업로드 영역 - 16:10 비율 */
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
              previewFileType === 'video' ? (
                <video
                  src={previewUrl}
                  className="max-w-full max-h-full object-contain"
                  controls
                  muted
                />
              ) : (
                <img
                  src={previewUrl}
                  alt="썸네일 미리보기"
                  className="max-w-full max-h-full object-contain"
                />
              )
            ) : (
              <div className="text-gray-400 text-center px-4">
                {/* 안내문구 제거 */}
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
        )}

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
