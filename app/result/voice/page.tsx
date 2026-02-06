'use client'

import { Suspense } from 'react'
import VoiceResultContent from './VoiceResultContent'

export default function ResultVoicePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">로딩 중...</div>}>
      <VoiceResultContent />
    </Suspense>
  )
}
