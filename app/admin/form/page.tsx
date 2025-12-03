'use client'

import { Suspense } from 'react'
import AdminForm from '@/components/AdminForm'

function AdminFormContent() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">관리자 페이지</h1>
          <p className="text-gray-400">서비스 카드를 관리하세요</p>
        </div>

        <AdminForm />
      </div>
    </div>
  )
}

export default function AdminFormPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">로딩 중...</div>}>
      <AdminFormContent />
    </Suspense>
  )
}

