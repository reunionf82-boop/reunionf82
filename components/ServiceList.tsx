'use client'

interface Service {
  title: string
  description: string
  price: string
  isNew?: boolean
  isFree?: boolean
  thumbnail?: string
}

interface ServiceListProps {
  services: Service[]
  onDelete: (index: number) => void
}

export default function ServiceList({ services, onDelete }: ServiceListProps) {
  return (
    <div className="bg-gray-800 rounded-lg p-6 shadow-xl">
      <h2 className="text-xl font-bold mb-4">서비스 목록</h2>
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {services.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-8">
            추가된 서비스가 없습니다
          </p>
        ) : (
          services.map((service, index) => (
            <div
              key={index}
              className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-pink-500 transition-colors"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-semibold text-white text-sm flex-1">
                  {service.title}
                </h3>
                <button
                  onClick={() => onDelete(index)}
                  className="text-red-400 hover:text-red-300 text-sm ml-2"
                >
                  삭제
                </button>
              </div>
              <p className="text-gray-400 text-xs mb-2 line-clamp-2">
                {service.description}
              </p>
              <div className="flex items-center gap-2">
                {service.isNew && (
                  <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded">
                    NEW
                  </span>
                )}
                {service.isFree ? (
                  <span className="text-green-400 text-xs font-semibold">무료</span>
                ) : (
                  <span className="text-gray-300 text-xs font-semibold">
                    {service.price}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}














