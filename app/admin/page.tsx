'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getContents, deleteContent } from '@/lib/supabase-admin'

export default function AdminPage() {
  const router = useRouter()
  const [contents, setContents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState<boolean | null>(null)
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3-flash-preview')
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('nara')
  const [fortuneViewMode, setFortuneViewMode] = useState<'batch' | 'realtime'>('batch')
  const [useSequentialFortune, setUseSequentialFortune] = useState<boolean>(false)

  useEffect(() => {
    checkAuth()
  }, [])

  useEffect(() => {
    if (authenticated === true) {
      loadContents()
      loadSettings()
    }
  }, [authenticated])

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
      setAuthenticated(false)
      router.push('/admin/login')
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/admin/auth/login', { method: 'DELETE' })
      router.push('/admin/login')
    } catch (error) {
    }
  }

  const loadSettings = async () => {
    try {
      // 캐시 방지를 위해 cache: 'no-store' 옵션 추가
      const response = await fetch('/api/admin/settings/get', {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
      if (!response.ok) {
        throw new Error('설정 조회 실패')
      }
      const data = await response.json()
      // 디버그 정보 확인
      if (data._debug) {
      }
      // 모델 설정 (DB에서 가져온 값으로 무조건 업데이트)
      const loadedModel = data.model || 'gemini-3-flash-preview'
      setSelectedModel(loadedModel)
      // 화자 설정 (DB에서 가져온 값으로 무조건 업데이트)
      const loadedSpeaker = data.speaker || 'nara'
      setSelectedSpeaker(loadedSpeaker)
}

