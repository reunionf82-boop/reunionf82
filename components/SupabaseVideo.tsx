'use client'

import { useState, useRef, useEffect } from 'react'

interface SupabaseVideoProps {
  thumbnailImageUrl: string // 이미지 썸네일 URL (동영상 로딩 전 표시)
  videoBaseName: string // 동영상 파일명 (확장자 제외, WebM)
  className?: string
  objectFit?: 'cover' | 'contain'
}

export default function SupabaseVideo({
  thumbnailImageUrl,
  videoBaseName,
  className = '',
  objectFit = 'cover',
}: SupabaseVideoProps) {
  const [isVideoLoaded, setIsVideoLoaded] = useState(false)
  const [isVideoReady, setIsVideoReady] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const normalizeVideoBaseName = (input: string): string => {
    if (!input) return ''
    let s = String(input).trim()
    // full URL -> path
    try {
      if (s.startsWith('http://') || s.startsWith('https://')) {
        const u = new URL(s)
        s = u.pathname || s
      }
    } catch {
      // ignore
    }
    // remove query/hash if present
    s = s.split('?')[0].split('#')[0]
    // if includes thumbnails/ take the part after it
    if (s.includes('thumbnails/')) {
      s = s.split('thumbnails/').pop() || s
    }
    // keep last path segment
    if (s.includes('/')) {
      s = s.split('/').pop() || s
    }
    // remove extension
    s = s.replace(/\.webm$/i, '')
    return s
  }

  // videoBaseName은 데이터가 섞여 들어올 수 있어(경로/확장자 포함 등) 정규화해서 사용
  const fileName = normalizeVideoBaseName(videoBaseName)
  
  // Supabase Storage URL 기본 경로 가져오기
  const getBucketUrl = (): string => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    if (supabaseUrl) {
      return `${supabaseUrl}/storage/v1/object/public/thumbnails`
    }
    // thumbnailImageUrl에서 기본 경로 추출
    if (thumbnailImageUrl && thumbnailImageUrl.includes('/storage/v1/object/public/thumbnails/')) {
      const parts = thumbnailImageUrl.split('/storage/v1/object/public/thumbnails/')
      return `${parts[0]}/storage/v1/object/public/thumbnails`
    }
    return ''
  }

  const BUCKET_URL = getBucketUrl()

  // 이미지 썸네일의 비율을 가져와서 컨테이너에 적용
  useEffect(() => {
    const img = imgRef.current
    if (img && thumbnailImageUrl) {
      const handleImageLoad = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const ratio = img.naturalWidth / img.naturalHeight
          setAspectRatio(`${ratio}`)
        }
      }
      
      if (img.complete) {
        handleImageLoad()
      } else {
        img.addEventListener('load', handleImageLoad)
        return () => {
          img.removeEventListener('load', handleImageLoad)
        }
      }
    }
  }, [thumbnailImageUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleCanPlay = () => {
      setIsVideoReady(true)
      // 동영상의 비율도 확인
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const ratio = video.videoWidth / video.videoHeight
        setAspectRatio(`${ratio}`)
      }
    }

    const handleLoadedData = () => {
      setIsVideoLoaded(true)
      setIsVideoReady(true)
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const ratio = video.videoWidth / video.videoHeight
        setAspectRatio(`${ratio}`)
      }
    }

    const handleLoadStart = () => {
      setIsVideoLoaded(true)
    }

    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('loadstart', handleLoadStart)

    // 동영상 로딩 시작 (fileName이 비었으면 로드하지 않음)
    if (fileName) {
      video.load()

      // 일부 브라우저에서 자동재생/로딩 타이밍이 꼬이면 canplay 이벤트가 늦게 오거나 안 오는 경우가 있어
      // 짧게 몇 번 play()를 재시도해 초기 재생 성공률을 높인다.
      const tryPlay = () => {
        try {
          video.muted = true
          const p = video.play()
          if (p && typeof (p as any).catch === 'function') {
            ;(p as any).catch(() => {})
          }
        } catch {
          // ignore
        }
      }
      const t1 = window.setTimeout(tryPlay, 150)
      const t2 = window.setTimeout(tryPlay, 450)
      const t3 = window.setTimeout(tryPlay, 900)

      return () => {
        window.clearTimeout(t1)
        window.clearTimeout(t2)
        window.clearTimeout(t3)
      }
    }

    return () => {
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('loadstart', handleLoadStart)
    }
  }, [fileName, BUCKET_URL, thumbnailImageUrl])

  // className에 h-auto가 포함되어 있으면 반응형 모드 (이미지 비율 유지)
  const isResponsive = className.includes('h-auto')
  const fitClass = objectFit === 'contain' ? 'object-contain' : 'object-cover'
  const fitStyle: React.CSSProperties = { width: '100%', height: '100%', objectFit }
  
  return (
    <div 
      ref={containerRef} 
      className={`relative ${isResponsive ? 'w-full' : 'w-full h-full'} ${className}`} 
      style={isResponsive && aspectRatio ? { width: '100%', aspectRatio: aspectRatio } : isResponsive ? { width: '100%' } : { width: '100%', height: '100%' }}
    >
      {/* 로딩 중: 이미지 썸네일 표시 (비디오 위에 오버레이) */}
      {!isVideoReady && thumbnailImageUrl && (
        <img
          ref={imgRef}
          src={thumbnailImageUrl}
          alt="동영상 썸네일"
          className={`absolute inset-0 w-full h-full ${fitClass}`}
          style={fitStyle}
        />
      )}

      {/* 동영상: display:none(hidden)로 숨기면 로딩이 멈추는 브라우저가 있어 opacity로만 제어 */}
      <video
        ref={videoRef}
        className={`absolute inset-0 w-full h-full ${fitClass}`}
        style={{
          ...fitStyle,
          opacity: isVideoReady ? 1 : 0,
          visibility: isVideoReady ? 'visible' : 'hidden',
        }}
        poster={thumbnailImageUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
      >
        {fileName ? <source src={`${BUCKET_URL}/${fileName}.webm`} type="video/webm" /> : null}
        죄송합니다. 동영상을 지원하지 않는 브라우저입니다.
      </video>
    </div>
  )
}
