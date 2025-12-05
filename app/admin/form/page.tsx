'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import AdminForm from '@/components/AdminForm'

function AdminFormContent() {
  const router = useRouter()
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    checkAuth()
  }, [])

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
      console.error('인증 확인 실패:', error)
      setAuthenticated(false)
      router.push('/admin/login')
    }
  }

  if (authenticated === null) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-gray-400">인증 확인 중...</div>
      </div>
    )
  }

  if (authenticated === false) {
    return null // 리다이렉트 중
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* 관리 폼 화면도 더 넓게 사용하기 위해 max-w 제한 제거 */}
      <div className="w-full mx-auto px-6 py-8">
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

