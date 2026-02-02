'use client'

import { useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function GlobalProtection() {
  const pathname = usePathname()
  const isAdmin = pathname?.startsWith('/admin') ?? false

  const isEditableTarget = useCallback((target: EventTarget | null) => {
    if (!target || !(target instanceof HTMLElement)) return false
    const tagName = target.tagName
    return (
      tagName === 'INPUT' ||
      tagName === 'TEXTAREA' ||
      target.isContentEditable
    )
  }, [])

  useEffect(() => {
    if (isAdmin) return // 관리자 화면에서는 우클릭·드래그 금지 미적용
    const handleContextMenu = (event: MouseEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleSelectStart = (event: Event) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleCut = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return
      event.preventDefault()
    }
    const handleDragStart = (event: DragEvent) => {
      const target = event.target
      if (target instanceof HTMLElement) {
        const tagName = target.tagName
        if (tagName === 'IMG' || tagName === 'VIDEO') {
          event.preventDefault()
        }
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      if (!event.ctrlKey && !event.metaKey) return
      const key = event.key.toLowerCase()
      if (['c', 'x', 's', 'p', 'u', 'i'].includes(key)) {
        event.preventDefault()
      }
    }

    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('selectstart', handleSelectStart, true)
    document.addEventListener('copy', handleCopy, true)
    document.addEventListener('cut', handleCut, true)
    document.addEventListener('dragstart', handleDragStart, true)
    document.addEventListener('keydown', handleKeyDown, true)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('selectstart', handleSelectStart, true)
      document.removeEventListener('copy', handleCopy, true)
      document.removeEventListener('cut', handleCut, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [isEditableTarget, isAdmin])

  return null
}
