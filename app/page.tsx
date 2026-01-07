'use client'

import { useState, useEffect } from 'react'
import ServiceCard from '@/components/ServiceCard'
import { getContents } from '@/lib/supabase-admin'

export default function Home() {
  const [services, setServices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadServices()
  }, [])

  const loadServices = async () => {
    try {
      const data = await getContents()
      // Supabase 데이터를 ServiceCard 형식으로 변환
      const convertedServices = (data || []).map((content: any) => ({
        id: content.id,
        title: content.content_name || '이름 없음',
        description: content.introduction || '',
        summary: content.summary || '',
        price: content.price || '',
        isNew: content.is_new || false,
        isFree: !content.price || content.price === '' || content.price === '0',
        thumbnailUrl: content.thumbnail_url || '',
      }))
      setServices(convertedServices)
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white flex flex-col">
      <main className="container mx-auto px-4 py-8 flex-1">
        {loading ? (
          <div className="text-center text-gray-400 py-12">로딩 중...</div>
        ) : services.length === 0 ? (
          <div className="text-center text-gray-400 py-12">컨텐츠가 없습니다.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        )}
      </main>

      <footer className="bg-gray-800 text-white text-center py-6 mt-auto">
        <p className="text-sm">
          Copyrights © 2022 All Rights Reserved by Techenjoy Inc.
        </p>
      </footer>
    </div>
  )
}

