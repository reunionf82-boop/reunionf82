'use client'

import Image from 'next/image'
import { useCallback, useState } from 'react'

export interface SocialShareButtonsProps {
  url?: string
  title?: string
  size?: number
  className?: string
}

const ICON_SOURCES: { id: string; label: string; src: string }[] = [
  { id: 'link', label: '링크 복사', src: '/icons/link.jpeg' },
  { id: 'kakao', label: '카카오톡', src: '/icons/kakao.jpeg' },
  { id: 'telegram', label: '텔레그램', src: '/icons/telegram.jpeg' },
  { id: 'line', label: '라인', src: '/icons/line.jpeg' },
  { id: 'whatsapp', label: '왓츠앱', src: '/icons/whatsapp.jpeg' },
  { id: 'native', label: '공유', src: '' }, // Web Share API
]

export default function SocialShareButtons({ url: urlProp, title = '', size = 40, className = '' }: SocialShareButtonsProps) {
  const [copied, setCopied] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const path = typeof window !== 'undefined' ? window.location.pathname + window.location.search : ''
  const url = urlProp || (baseUrl + path)
  const encodedUrl = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }, [url])

  const shareHref: Record<string, string> = {
    kakao: `https://story.kakao.com/share?url=${encodedUrl}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
    line: `https://social-plugins.line.me/lineit/share?url=${encodedUrl}`,
    whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
  }

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.share) {
      await handleCopy()
      return
    }
    try {
      await navigator.share({
        title: title || '공유',
        url,
        text: title || undefined,
      })
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        await handleCopy()
      }
    }
  }, [url, title, handleCopy])

  const nativeShareIconSize = Math.round(size * 0.6)
  const shareIconSvg = (
    <svg xmlns="http://www.w3.org/2000/svg" width={nativeShareIconSize} height={nativeShareIconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" />
    </svg>
  )

  const iconStyle = { width: size, height: size, minWidth: size, minHeight: size }

  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 overflow-visible min-w-0 ${className}`}>
      {ICON_SOURCES.map((item) => {
        if (item.id === 'link') {
          return (
            <button
              key={item.id}
              type="button"
              onClick={handleCopy}
              title={item.label}
              className="flex shrink-0 items-center justify-center rounded-full overflow-hidden text-gray-600 hover:opacity-80 transition-opacity"
              aria-label={item.label}
              style={iconStyle}
            >
              {copied ? (
                <span className="text-xs text-green-600 font-medium px-1">복사됨</span>
              ) : (
                <Image src={item.src} alt={item.label} width={size} height={size} className="object-cover w-full h-full" unoptimized />
              )}
            </button>
          )
        }
        if (item.id === 'native') {
          return (
            <button
              key={item.id}
              type="button"
              onClick={handleNativeShare}
              title={item.label}
              className="flex shrink-0 items-center justify-center rounded-full overflow-hidden hover:opacity-80 transition-opacity bg-gray-200"
              aria-label={item.label}
              style={iconStyle}
            >
              {shareIconSvg}
            </button>
          )
        }
        const href = shareHref[item.id]
        return (
          <a
            key={item.id}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            title={item.label}
            className="flex shrink-0 items-center justify-center rounded-full overflow-hidden hover:opacity-80 transition-opacity"
            aria-label={item.label}
            style={iconStyle}
          >
            <Image src={item.src} alt={item.label} width={size} height={size} className="object-cover w-full h-full" unoptimized />
          </a>
        )
      })}
    </div>
  )
}
