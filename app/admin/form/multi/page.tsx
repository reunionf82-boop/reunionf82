'use client'

import { Suspense } from 'react'
import MultiAdminForm from './MultiAdminForm'

export default function AdminMultiFormPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">로딩 중...</div>}>
      <MultiAdminForm />
    </Suspense>
  )
}
