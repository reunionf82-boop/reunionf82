'use client'

import { Suspense } from 'react'
import VoiceAdminForm from './VoiceAdminForm'

export default function AdminVoiceFormPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">로딩 중...</div>}>
      <VoiceAdminForm />
    </Suspense>
  )
}
