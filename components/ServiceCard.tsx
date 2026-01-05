'use client'

import { useRouter } from 'next/navigation'
import { getSelectedModel } from '@/lib/supabase-admin'

interface Service {
  title: string
  description: string
  price: string
  summary?: string
  isNew?: boolean
  isFree?: boolean
  thumbnailUrl?: string
}

interface ServiceCardProps {
  service: Service
}

// 가격 포맷팅 함수 (3자리마다 콤마 삽입)
const formatPrice = (price: string): string => {
  if (!price) return '0'
  // 숫자만 추출
  const numbers = price.replace(/[^0-9]/g, '')
  if (!numbers) return '0'
  // 3자리마다 콤마 삽입
  return parseInt(numbers).toLocaleString('ko-KR')
}

export default function ServiceCard({ service }: ServiceCardProps) {
  const router = useRouter()

  const handleReunionClick = async () => {
    // Supabase에서 선택된 모델 가져오기
    try {
      const selectedModel = await getSelectedModel()
      console.log('ServiceCard: Supabase에서 모델 가져옴:', selectedModel)
      
      // sessionStorage에 데이터 저장 (URL 파라미터 대신)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('form_title', service.title)
        sessionStorage.setItem('form_model', selectedModel)
        // 썸네일 URL도 저장하여 form 페이지에서 즉시 사용
        if (service.thumbnailUrl) {
          sessionStorage.setItem('form_thumbnail_url', service.thumbnailUrl)
        }
      }
      
      // 깔끔한 URL로 이동
      router.push('/form')
    } catch (error) {
      console.error('모델 로드 실패, 기본값 사용:', error)
      
      // sessionStorage에 데이터 저장
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('form_title', service.title)
        sessionStorage.setItem('form_model', 'gemini-3-flash-preview')
        // 썸네일 URL도 저장하여 form 페이지에서 즉시 사용
        if (service.thumbnailUrl) {
          sessionStorage.setItem('form_thumbnail_url', service.thumbnailUrl)
        }
      }
      
      // 깔끔한 URL로 이동
      router.push('/form')
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-sm transition-shadow duration-300 overflow-hidden border border-gray-200 flex flex-col">
      {/* 일러스트레이션 영역 */}
      <div className="relative h-48 bg-gradient-to-br from-yellow-50 via-pink-50 to-orange-50 flex items-center justify-center overflow-hidden">
        {/* 19금 로고 */}
        <div className="absolute top-2 right-2 z-10">
          <img 
            src="/19logo.svg" 
            alt="19금"
            className="w-12 h-12"
          />
        </div>
        {service.thumbnailUrl ? (
          <img 
            src={service.thumbnailUrl} 
            alt={service.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <>
            {/* 배경 장식 */}
            <div className="absolute inset-0">
              <div className="absolute left-0 top-0 w-24 h-24 bg-green-200 rounded-full opacity-30 blur-2xl"></div>
              <div className="absolute right-0 bottom-0 w-32 h-32 bg-pink-200 rounded-full opacity-30 blur-2xl"></div>
            </div>
            {/* 카페 테이블과 커플 일러스트레이션 */}
            <div className="relative z-10 flex items-end justify-center h-full pb-4">
              <div className="flex items-end space-x-2">
                {/* 남성 캐릭터 */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-20 bg-blue-100 rounded-t-full rounded-b-lg flex items-center justify-center">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                      <span className="text-2xl">👨</span>
                    </div>
                  </div>
                </div>
                {/* 테이블과 디저트 */}
                <div className="flex flex-col items-center">
                  <div className="w-20 h-4 bg-gray-800 rounded-full mb-2"></div>
                  <div className="w-8 h-16 bg-gradient-to-t from-pink-200 via-white to-yellow-100 rounded-lg flex flex-col items-center justify-end pb-1">
                    <div className="w-3 h-3 bg-red-400 rounded-full mb-1"></div>
                  </div>
                </div>
                {/* 여성 캐릭터 */}
                <div className="flex flex-col items-center">
                  <div className="w-16 h-20 bg-orange-100 rounded-t-full rounded-b-lg flex items-center justify-center">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
                      <span className="text-2xl">👩</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* 배경 장식 요소 */}
            <div className="absolute left-2 top-4 text-green-400 text-2xl opacity-60">🌿</div>
            <div className="absolute right-2 top-6 text-pink-400 text-xl opacity-60">🌹</div>
            <div className="absolute right-8 top-12 w-12 h-12 bg-yellow-200 rounded-lg opacity-40"></div>
          </>
        )}
      </div>

      {/* 텍스트 영역 */}
      <div className="p-5 flex-1 flex flex-col">
        {service.isNew && (
          <span className="inline-block bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded mb-3 w-fit">
            NEW
          </span>
        )}
        <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">
          {service.title}
        </h3>
        {service.summary && (
          <p className="text-gray-600 text-sm mb-4 leading-relaxed flex-1 line-clamp-3">
            {service.summary}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          {service.isFree ? (
            <span className="text-xl font-bold text-green-600">무료</span>
          ) : (
            <span className="text-xl font-bold text-gray-900">
              {formatPrice(service.price)}원
            </span>
          )}
          <button 
            onClick={handleReunionClick}
            className="bg-pink-500 hover:bg-pink-600 text-white font-semibold py-2.5 px-6 rounded-lg transition-all duration-300 shadow-sm hover:shadow-md whitespace-nowrap"
          >
            재회보기
          </button>
        </div>
      </div>
    </div>
  )
}

