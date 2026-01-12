'use client'

interface AlertPopupProps {
  isOpen: boolean
  message: string
  onClose: () => void
}

export default function AlertPopup({ isOpen, message, onClose }: AlertPopupProps) {
  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4 transition-opacity duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full transition-transform duration-200 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 내용 */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-base text-gray-900 whitespace-pre-line leading-relaxed text-center">
              {message}
            </p>
          </div>
        </div>
        
        {/* 버튼 */}
        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
