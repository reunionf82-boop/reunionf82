'use client'

import { useEffect, useState } from 'react'
import ReviewPopup from './ReviewPopup'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

interface MyHistoryPopupProps {
  isOpen: boolean
  onClose: () => void
  streamingFinished?: boolean // 점사 완료 여부
  contentId?: number
}

interface SavedResult {
  id: number
  title: string
  html: string
  saved_at: string
  model?: string
  processing_time?: string
  user_name?: string
  content?: any
  pdf_generated?: boolean
}

export default function MyHistoryPopup({ isOpen, onClose, streamingFinished = true, contentId }: MyHistoryPopupProps) {
  const [phoneNumber1, setPhoneNumber1] = useState('010')
  const [phoneNumber2, setPhoneNumber2] = useState('')
  const [phoneNumber3, setPhoneNumber3] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [savedResults, setSavedResults] = useState<SavedResult[]>([])
  const [showResults, setShowResults] = useState(false)
  const [showReviewPopup, setShowReviewPopup] = useState<{ contentId: number; userName?: string | null; title?: string | null } | null>(null)
  const [reviewEventBannersByContentId, setReviewEventBannersByContentId] = useState<Record<number, { basic: string; details: string[] }>>({})
  const [showDetailBannersModal, setShowDetailBannersModal] = useState<{ contentId: number; details: string[] } | null>(null)
  const [showPdfConfirmPopup, setShowPdfConfirmPopup] = useState<SavedResult | null>(null) // PDF 생성 확인 팝업
  const [pdfGeneratingMap, setPdfGeneratingMap] = useState<Record<number, boolean>>({}) // PDF 생성 중 상태 (result.id별)
  const [pdfProgressMap, setPdfProgressMap] = useState<Record<number, number>>({}) // PDF 생성 진행률 (result.id별, 0-100)
  
  // 로컬 스토리지에서 배너 데이터 가져오기
  const getBannersFromStorage = (): { basic: string; details: string[] } | null => {
    if (typeof window === 'undefined') return null
    try {
      const stored = localStorage.getItem('review_event_banners_data')
      if (stored) {
        const data = JSON.parse(stored)
        // 1시간 이내 데이터만 사용
        if (data.timestamp && Date.now() - data.timestamp < 3600000) {
          return data.banners
        }
      }
    } catch (e) {
      console.error('로컬 스토리지에서 배너 데이터 로드 실패:', e)
    }
    return null
  }
  
  // 로컬 스토리지에 배너 데이터 저장
  const saveBannersToStorage = (banners: { basic: string; details: string[] }) => {
    if (typeof window === 'undefined') return
    try {
      localStorage.setItem('review_event_banners_data', JSON.stringify({
        banners,
        timestamp: Date.now()
      }))
    } catch (e) {
      console.error('로컬 스토리지에 배너 데이터 저장 실패:', e)
    }
  }
  
  const [loginFormBanners, setLoginFormBanners] = useState<{ basic: string; details: string[] }>(() => {
    if (typeof window === 'undefined') return { basic: '', details: [] }
    const cached = getBannersFromStorage()
    return cached || { basic: '', details: [] }
  })
  const [detailBannersLoading, setDetailBannersLoading] = useState(false)
  
  // 로컬 스토리지에서 로딩된 이미지 정보 가져오기
  const getLoadedImagesFromStorage = (): Set<string> => {
    if (typeof window === 'undefined') return new Set<string>()
    try {
      const stored = localStorage.getItem('review_event_loaded_images')
      if (stored) {
        const urls = JSON.parse(stored) as string[]
        return new Set(urls)
      }
    } catch (e) {
      console.error('로컬 스토리지에서 이미지 정보 로드 실패:', e)
    }
    return new Set<string>()
  }
  
  // 로컬 스토리지에 로딩된 이미지 정보 저장
  const saveLoadedImageToStorage = (url: string) => {
    if (typeof window === 'undefined') return
    try {
      const current = getLoadedImagesFromStorage()
      current.add(url)
      localStorage.setItem('review_event_loaded_images', JSON.stringify(Array.from(current)))
    } catch (e) {
      console.error('로컬 스토리지에 이미지 정보 저장 실패:', e)
    }
  }
  
  const [loadedDetailBannerImages, setLoadedDetailBannerImages] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>()
    return getLoadedImagesFromStorage()
  })

  // 로그인 폼용 전역 리뷰 이벤트 배너 로드 (팝업이 열릴 때)
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    ;(async () => {
      try {
        // app_settings의 전역 review_event_banners 가져오기
        const query = contentId ? `?content_id=${contentId}` : ''
        const res = await fetch(`/api/settings/review-events${query}`, { cache: 'no-store' })
        
        let json = {}
        try {
          const text = await res.text()
          if (text) {
            json = JSON.parse(text)
          } else {
            console.warn('[MyHistory] API 응답이 비어있습니다.')
          }
        } catch (e) {
          console.error('[MyHistory] API 응답 파싱 실패:', e)
        }
        
        console.log('[MyHistory] API 응답 전체:', JSON.stringify(json, null, 2))
        const raw = (json as any)?.review_event_banners
        console.log('[MyHistory] raw review_event_banners:', raw)
        console.log('[MyHistory] raw 타입:', typeof raw)
        
        if (cancelled) return
        
        let banners: { basic: string; details: string[] } = { basic: '', details: [] }
        
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          banners = {
            basic: typeof raw.basic === 'string' && raw.basic.trim() !== '' ? raw.basic : '',
            details: Array.isArray(raw.details) ? raw.details.filter((u: any) => typeof u === 'string' && u.trim() !== '') : []
          }
          console.log('[MyHistory] 객체 파싱 결과:', JSON.stringify(banners, null, 2))
        } else if (Array.isArray(raw)) {
          const arr = raw.filter((u: any) => typeof u === 'string' && u.trim() !== '')
          banners = {
            basic: arr.length > 0 ? arr[0] : '',
            details: arr.length > 1 ? arr.slice(1) : []
          }
          console.log('[MyHistory] 배열 파싱 결과:', JSON.stringify(banners, null, 2))
        } else {
          console.log('[MyHistory] 파싱 실패 - 빈 배너 사용')
        }
        
        console.log('[MyHistory] 최종 banners:', JSON.stringify(banners, null, 2))
        console.log('[MyHistory] banners.basic 존재:', !!banners.basic)
        console.log('[MyHistory] banners.details.length:', banners.details.length)
        
        if (!cancelled) {
          setLoginFormBanners(banners)
          saveBannersToStorage(banners)
          
          // 백그라운드에서 상세 배너 이미지 미리 로딩
          if (banners.details && banners.details.length > 0) {
            banners.details.forEach((url: string) => {
              // 이미 로컬 스토리지에 로딩된 이미지인지 확인
              const alreadyLoaded = getLoadedImagesFromStorage().has(url)
              
              if (alreadyLoaded) {
                // 이미 로딩된 이미지는 Set에 추가
                if (!cancelled) {
                  setLoadedDetailBannerImages(prev => {
                    const newSet = new Set(prev)
                    newSet.add(url)
                    return newSet
                  })
                }
              } else {
                // 아직 로딩되지 않은 이미지만 로딩
                const img = new Image()
                img.onload = () => {
                  if (!cancelled) {
                    saveLoadedImageToStorage(url)
                    setLoadedDetailBannerImages(prev => {
                      const newSet = new Set(prev)
                      newSet.add(url)
                      return newSet
                    })
                  }
                }
                img.onerror = () => {
                  if (!cancelled) {
                    saveLoadedImageToStorage(url) // 에러가 나도 로딩 완료로 간주
                    setLoadedDetailBannerImages(prev => {
                      const newSet = new Set(prev)
                      newSet.add(url)
                      return newSet
                    })
                  }
                }
                img.src = url
              }
            })
          }
        }
      } catch {
        if (!cancelled) {
          setLoginFormBanners({ basic: '', details: [] })
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, contentId])

  // 결과 목록용 컨텐츠별 리뷰 이벤트 배너 로드
  useEffect(() => {
    if (!isOpen || !showResults) return
    let cancelled = false

    const contentIds = Array.from(
      new Set(
        savedResults
          .map((r) => (r as any)?.content?.id)
          .map((v) => (v !== undefined && v !== null ? parseInt(String(v), 10) : NaN))
          .filter((v) => !Number.isNaN(v))
      )
    )

    ;(async () => {
      for (const cid of contentIds) {
        if (cancelled) return
        if (reviewEventBannersByContentId[cid]) continue
        try {
          const res = await fetch(`/api/settings/review-events?content_id=${cid}`, { cache: 'no-store' })
          let json: any = {}
          try {
            const text = await res.text()
            if (text) {
              json = JSON.parse(text)
            }
          } catch (e) {
            console.error(`[MyHistory] 컨텐츠(${cid}) API 응답 파싱 실패:`, e)
          }
          const raw = json?.review_event_banners
          
          // API가 객체 형식으로 반환하거나 배열 형식으로 반환할 수 있음
          let banners: { basic: string; details: string[] } = { basic: '', details: [] }
          
          if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            // 객체 형식: { basic: '...', details: [...] }
            banners = {
              basic: typeof raw.basic === 'string' && raw.basic.trim() !== '' ? raw.basic : '',
              details: Array.isArray(raw.details) ? raw.details.filter((u: any) => typeof u === 'string' && u.trim() !== '') : []
            }
          } else if (Array.isArray(raw)) {
            // 레거시 배열 형식: 첫 번째가 basic, 나머지가 details
            const arr = raw.filter((u: any) => typeof u === 'string' && u.trim() !== '')
            banners = {
              basic: arr.length > 0 ? arr[0] : '',
              details: arr.length > 1 ? arr.slice(1) : []
            }
          }
          
          if (!cancelled) {
            setReviewEventBannersByContentId((prev) => ({ ...prev, [cid]: banners }))
            
            // 백그라운드에서 상세 배너 이미지 미리 로딩
            if (banners.details && banners.details.length > 0) {
              banners.details.forEach((url: string) => {
                // 이미 로컬 스토리지에 로딩된 이미지인지 확인
                const alreadyLoaded = getLoadedImagesFromStorage().has(url)
                
                if (alreadyLoaded) {
                  // 이미 로딩된 이미지는 Set에 추가
                  if (!cancelled) {
                    setLoadedDetailBannerImages(prev => {
                      const newSet = new Set(prev)
                      newSet.add(url)
                      return newSet
                    })
                  }
                } else {
                  // 아직 로딩되지 않은 이미지만 로딩
                  const img = new Image()
                  img.onload = () => {
                    if (!cancelled) {
                      saveLoadedImageToStorage(url)
                      setLoadedDetailBannerImages(prev => {
                        const newSet = new Set(prev)
                        newSet.add(url)
                        return newSet
                      })
                    }
                  }
                  img.onerror = () => {
                    if (!cancelled) {
                      saveLoadedImageToStorage(url) // 에러가 나도 로딩 완료로 간주
                      setLoadedDetailBannerImages(prev => {
                        const newSet = new Set(prev)
                        newSet.add(url)
                        return newSet
                      })
                    }
                  }
                  img.src = url
                }
              })
            }
          }
        } catch {
          if (!cancelled) {
            setReviewEventBannersByContentId((prev) => ({ ...prev, [cid]: { basic: '', details: [] } }))
          }
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isOpen, showResults, savedResults, reviewEventBannersByContentId])

  // ✅ 나의 이용내역 팝업 진입 후(결과 목록 포함) 상세배너가 있으면 백그라운드 프리로드
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false

    const preload = (url: string) => {
      if (!url) return
      const alreadyLoaded = getLoadedImagesFromStorage().has(url)
      if (alreadyLoaded) {
        if (!cancelled) {
          setLoadedDetailBannerImages(prev => {
            const next = new Set(prev)
            next.add(url)
            return next
          })
        }
        return
      }

      const img = new Image()
      img.onload = () => {
        if (cancelled) return
        saveLoadedImageToStorage(url)
        setLoadedDetailBannerImages(prev => {
          const next = new Set(prev)
          next.add(url)
          return next
        })
      }
      img.onerror = () => {
        if (cancelled) return
        saveLoadedImageToStorage(url)
        setLoadedDetailBannerImages(prev => {
          const next = new Set(prev)
          next.add(url)
          return next
        })
      }
      img.src = url
    }

    // 로그인 폼 배너 상세
    ;(loginFormBanners?.details || []).forEach(preload)
    // 컨텐츠별 배너 상세
    Object.values(reviewEventBannersByContentId || {}).forEach((b) => {
      ;(b?.details || []).forEach(preload)
    })

    return () => {
      cancelled = true
    }
  }, [isOpen, loginFormBanners, reviewEventBannersByContentId])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!phoneNumber1 || !phoneNumber2 || !phoneNumber3) {
      setError('휴대폰 번호를 모두 입력해주세요.')
      setLoading(false)
      return
    }

    if (!password || password.length < 4) {
      setError('비밀번호를 4자리 이상 입력해주세요.')
      setLoading(false)
      return
    }

    try {
      const fullPhoneNumber = `${phoneNumber1}-${phoneNumber2}-${phoneNumber3}`
      const response = await fetch('/api/saved-results/by-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: fullPhoneNumber,
          password: password
        })
      })

      const text = await response.text()
      let result: any = {}
      if (text) {
        try {
          result = JSON.parse(text)
        } catch (e) {
          setError('응답 파싱에 실패했습니다.')
          setLoading(false)
          return
        }
      }

      if (result.success && result.data) {
        setSavedResults(result.data)
        setShowResults(true)
      } else {
        setError(result.error || '이용내역을 찾을 수 없습니다.')
      }
    } catch (e: any) {
      setError('이용내역 조회 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (resultId: number) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/saved-results/delete?id=${resultId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        setSavedResults(prev => prev.filter(item => item.id !== resultId))
      } else {
        alert('삭제에 실패했습니다.')
      }
    } catch (e) {
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  const handleView = (resultId: number) => {
    if (typeof window !== 'undefined') {
      window.open(`/result?savedId=${resultId}`, '_blank')
    }
  }

  const handleGeneratePdfClick = (result: SavedResult) => {
    // PDF 생성 확인 팝업 표시
    setShowPdfConfirmPopup(result)
  }

  const handlePdfConfirm = async () => {
    if (!showPdfConfirmPopup) return
    
    const result = showPdfConfirmPopup
    setShowPdfConfirmPopup(null)
    
    // PDF 생성 시작
    await handleGeneratePdf(result)
  }

  const handleGeneratePdf = async (result: SavedResult) => {
    if (typeof window === 'undefined') return
    
    // PDF 생성 중 상태 설정
    setPdfGeneratingMap(prev => ({ ...prev, [result.id]: true }))
    setPdfProgressMap(prev => ({ ...prev, [result.id]: 0 }))
    
    // 프로그레스 업데이트 함수
    const updateProgress = (progress: number) => {
      setPdfProgressMap(prev => ({ ...prev, [result.id]: progress }))
    }
    
    // form 페이지의 handleClientSidePdf와 동일한 로직 사용
    let styleElement: HTMLStyleElement | null = null;
    let container: HTMLElement | null = null;
    let originalScrollY: number | undefined;
    let originalScrollX: number | undefined;
    
    try {
      // "보기" 버튼과 동일한 HTML 처리
      let htmlContent = result.html || '';
      htmlContent = htmlContent.replace(/\*\*/g, '');
      
      // 테이블 정제
      htmlContent = htmlContent
        .replace(/([>])\s*(\n\s*)+(\s*<table[^>]*>)/g, '$1$3')
        .replace(/(\n\s*)+(\s*<table[^>]*>)/g, '$2')
        .replace(/([^>\s])\s+(\s*<table[^>]*>)/g, '$1$2')
        .replace(/(<\/(?:p|div|h[1-6]|span|li|td|th)>)\s*(\n\s*)+(\s*<table[^>]*>)/gi, '$1$3')
        .replace(/(>)\s*(\n\s*){2,}(\s*<table[^>]*>)/g, '$1$3')
      
      const contentObj = result.content || {};
      const menuItems = contentObj?.menu_items || [];

      // 북커버(상단/엔딩)는 단일 URL(string)로 저장되는 것이 기본이지만,
      // 과거 데이터/마이그레이션/확장으로 배열이 들어오는 경우도 안전하게 처리한다.
      const normalizeUrlList = (raw: any): string[] => {
        if (!raw) return []
        if (typeof raw === 'string') {
          const s = raw.trim()
          return s ? [s] : []
        }
        if (Array.isArray(raw)) {
          return raw
            .map((x) => (typeof x === 'string' ? x.trim() : ''))
            .filter(Boolean)
        }
        // object 형태({ url: string } 등) 방어
        if (typeof raw === 'object' && typeof raw.url === 'string') {
          const s = raw.url.trim()
          return s ? [s] : []
        }
        return []
      }

      const bookCoverImageUrls = normalizeUrlList(contentObj?.book_cover_thumbnail)
      const endingBookCoverImageUrls = normalizeUrlList(contentObj?.ending_book_cover_thumbnail)

      // 동영상 썸네일 필드는 "PDF에서는 사용하지 않음" (요구사항)
      const bookCoverThumbnailVideoUrl = contentObj?.book_cover_thumbnail_video || ''
      const endingBookCoverThumbnailVideoUrl = contentObj?.ending_book_cover_thumbnail_video || ''

      // ✅ 실데이터에서 "이미지 썸네일" 필드가 비어있고 동영상 baseName만 저장되는 경우가 있어
      // PDF에서는 동영상에서 파생된 JPG(이미지 썸네일)를 사용한다.
      const supabaseBase = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const toSupabasePublicThumbnailUrl = (raw: string): string => {
        const s = (raw || '').trim()
        if (!s) return ''
        if (s.startsWith('http://') || s.startsWith('https://')) return s
        if (!supabaseBase) return ''

        // 이미 /storage/... 형태로 들어오는 경우
        if (s.startsWith('/storage/v1/object/public/thumbnails/')) {
          return `${supabaseBase}${s}`
        }

        // thumbnails/ 접두사 포함/미포함 모두 대응
        const fileName = s.replace(/^thumbnails\//, '').replace(/^\/+/, '')
        return `${supabaseBase}/storage/v1/object/public/thumbnails/${fileName}`
      }
      const buildJpgFromVideoBaseName = (baseName: string): string => {
        if (!supabaseBase) return ''
        let bn = (baseName || '').trim()
        if (!bn) return ''
        // AdminForm/getThumbnailUrl 규칙과 동일: thumbnails bucket의 `${base}.jpg`
        bn = bn.replace(/\.webm$/i, '').replace(/\.mp4$/i, '').replace(/\.mov$/i, '').replace(/\.jpg$/i, '').replace(/\.png$/i, '')
        return `${supabaseBase}/storage/v1/object/public/thumbnails/${bn}.jpg`
      }

      const bookCoverVideoBases = normalizeUrlList(bookCoverThumbnailVideoUrl)
      const endingBookCoverVideoBases = normalizeUrlList(endingBookCoverThumbnailVideoUrl)

      let finalBookCoverImageUrls =
        bookCoverImageUrls.length > 0
          ? bookCoverImageUrls.map(toSupabasePublicThumbnailUrl).filter(Boolean)
          : bookCoverVideoBases.map(buildJpgFromVideoBaseName).filter(Boolean)

      let finalEndingBookCoverImageUrls =
        endingBookCoverImageUrls.length > 0
          ? endingBookCoverImageUrls.map(toSupabasePublicThumbnailUrl).filter(Boolean)
          : endingBookCoverVideoBases.map(buildJpgFromVideoBaseName).filter(Boolean)

      // ✅ saved_results.content 스냅샷에 북커버가 누락된 경우가 있어, 최신 contents에서 북커버만 보강
      const fetchLatestCoverFields = async (): Promise<any | null> => {
        try {
          // 1) contentObj.id 우선
          let cid: number | null = null
          const rawId = (contentObj as any)?.id
          if (typeof rawId === 'number' && Number.isFinite(rawId)) cid = rawId
          if (cid === null && typeof rawId === 'string') {
            const n = parseInt(rawId, 10)
            if (Number.isFinite(n)) cid = n
          }

          // 2) 현재 페이지에서 넘어온 contentId (있는 경우)
          if (cid === null && typeof contentId === 'number' && Number.isFinite(contentId)) {
            cid = contentId
          }

          // 3) content_name → title 순으로 content_id 찾기
          if (cid === null) {
            const hint =
              String((contentObj as any)?.content_name || '').trim() ||
              String((contentObj as any)?.title || '').trim() ||
              String(result.title || '').trim()

            if (hint) {
              const r = await fetch(`/api/contents/find-by-title?title=${encodeURIComponent(hint)}`, {
                cache: 'no-store',
              })
              if (r.ok) {
                const j = await r.json()
                const found = (j as any)?.content_id
                if (typeof found === 'number') cid = found
                if (cid === null && typeof found === 'string') {
                  const n = parseInt(found, 10)
                  if (Number.isFinite(n)) cid = n
                }
              }
            }
          }

          if (cid === null) return null

          const r2 = await fetch(`/api/contents/get?id=${cid}`, { cache: 'no-store' })
          if (!r2.ok) return null
          const j2 = await r2.json()
          return (j2 as any)?.content || null
        } catch {
          return null
        }
      }

      if (finalBookCoverImageUrls.length === 0 || finalEndingBookCoverImageUrls.length === 0) {
        const latest = await fetchLatestCoverFields()
        if (latest) {
          if (finalBookCoverImageUrls.length === 0) {
            const latestImages = normalizeUrlList(latest.book_cover_thumbnail).map(toSupabasePublicThumbnailUrl).filter(Boolean)
            const latestVideos = normalizeUrlList(latest.book_cover_thumbnail_video)
            finalBookCoverImageUrls =
              latestImages.length > 0 ? latestImages : latestVideos.map(buildJpgFromVideoBaseName).filter(Boolean)
          }
          if (finalEndingBookCoverImageUrls.length === 0) {
            const latestImages = normalizeUrlList(latest.ending_book_cover_thumbnail).map(toSupabasePublicThumbnailUrl).filter(Boolean)
            const latestVideos = normalizeUrlList(latest.ending_book_cover_thumbnail_video)
            finalEndingBookCoverImageUrls =
              latestImages.length > 0 ? latestImages : latestVideos.map(buildJpgFromVideoBaseName).filter(Boolean)
          }
        }
      }
      
      // DOMParser로 썸네일 추가 ("보기" 버튼과 동일)
      // ... (기존 코드)

      console.log('[PDF 생성] 컨텐츠 정보:', {
        hasContent: !!contentObj,
        bookCoverThumbnail: contentObj?.book_cover_thumbnail,
        bookCoverThumbnailVideo: contentObj?.book_cover_thumbnail_video,
        endingBookCoverThumbnail: contentObj?.ending_book_cover_thumbnail,
        endingBookCoverThumbnailVideo: contentObj?.ending_book_cover_thumbnail_video,
        finalBookCoverImageUrls,
        finalEndingBookCoverImageUrls
      });

      // 템플릿 리터럴 특수 문자 이스케이프
      const safeHtml = htmlContent.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\${/g, '\\${');
      
      // "보기" 버튼과 동일한 HTML 생성 변수 (result 페이지와 완전히 동일)
      const savedMenuFontSize = result.content?.menu_font_size || 16
      const savedMenuFontBold = result.content?.menu_font_bold || false
      const savedSubtitleFontSize = result.content?.subtitle_font_size || 14
      const savedSubtitleFontBold = result.content?.subtitle_font_bold || false
      const savedDetailMenuFontSize = result.content?.detail_menu_font_size || 12
      const savedDetailMenuFontBold = result.content?.detail_menu_font_bold || false
      const savedBodyFontSize = result.content?.body_font_size || 11
      const savedBodyFontBold = result.content?.body_font_bold || false
      
      // 각 섹션별 웹폰트 적용 (관리자 폼 설정 우선, 없으면 font_face 하위호환성)
      const menuFontFace = result.content?.menu_font_face || result.content?.font_face || ''
      const subtitleFontFace = result.content?.subtitle_font_face || result.content?.font_face || ''
      const detailMenuFontFace = result.content?.detail_menu_font_face || result.content?.font_face || ''
      const bodyFontFace = result.content?.body_font_face || result.content?.font_face || ''

      // 하위 호환성을 위한 전체 폰트 (font_face)
      const fontFace = result.content?.font_face || ''

      const extractFontFamily = (fontFaceCss: string): string | null => {
        if (!fontFaceCss) return null
        const match = fontFaceCss.match(/font-family:\s*['"]([^'"]+)['"]|font-family:\s*([^;]+)/)
        return match ? (match[1] || match[2]?.trim()) : null
      }
      const menuFontFamily = extractFontFamily(menuFontFace)
      const subtitleFontFamily = extractFontFamily(subtitleFontFace)
      const detailMenuFontFamily = extractFontFamily(detailMenuFontFace)
      const bodyFontFamily = extractFontFamily(bodyFontFace)
      const fontFamilyName = extractFontFamily(fontFace)

      // result 페이지와 완전히 동일한 동적 스타일
      const fontFaceCssForPdf = `
        ${menuFontFace ? menuFontFace : ''}
        ${subtitleFontFace ? subtitleFontFace : ''}
        ${detailMenuFontFace ? detailMenuFontFace : ''}
        ${bodyFontFace ? bodyFontFace : ''}
        ${!menuFontFace && !subtitleFontFace && !detailMenuFontFace && !bodyFontFace && fontFace ? fontFace : ''}
      `
      const hasSectionFonts = Boolean(menuFontFamily || subtitleFontFamily || detailMenuFontFamily || bodyFontFamily)
      
      const fontStylesFallbackAll = fontFamilyName && !hasSectionFonts ? `
        * {
          font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
        }
        body, body *, h1, h2, h3, h4, h5, h6, p, div, span {
          font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;
        }
      ` : ''

      // "보기" 버튼과 완전히 동일한 HTML 구조 생성
      container = document.createElement('div');
      const containerId = `pdf-container-${result.id}`;
      container.id = containerId;
      container.style.position = 'absolute';
      container.style.left = '-10000px';
      container.style.top = '0';
      container.style.width = '896px';
      container.style.maxWidth = '896px';
      container.style.zIndex = '-5000';
      
      // "보기" 버튼과 완전히 동일한 스타일 적용 (명확한 스코핑으로 UI 폰트 오염 방지)
      styleElement = document.createElement('style');
      styleElement.innerHTML = `
        ${fontFaceCssForPdf}
        /* 폰트 스타일을 containerId로 스코핑하여 UI 폰트 오염 방지 */
        ${fontStylesFallbackAll ? `#${containerId} ${fontStylesFallbackAll.replaceAll('\n', '\n        #'+containerId+' ')}` : ''}
        ${menuFontFamily ? `#${containerId} .menu-title { font-family: '${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${subtitleFontFamily ? `#${containerId} .subtitle-title { font-family: '${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${detailMenuFontFamily ? `#${containerId} .detail-menu-title { font-family: '${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${bodyFontFamily ? `#${containerId} .subtitle-content, #${containerId} .detail-menu-content { font-family: '${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        ${fontFamilyName && !hasSectionFonts ? `#${containerId} * { font-family: '${fontFamilyName}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
        #${containerId} {
          font-family: ${bodyFontFamily ? `'${bodyFontFamily}', ` : (fontFamilyName && !hasSectionFonts ? `'${fontFamilyName}', ` : '')}-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          max-width: 896px;
          margin: 0 auto;
          padding: 32px 16px;
          background: #ffffff;
        }
        #${containerId} .container {
          background: transparent;
          padding: 0;
        }
        #${containerId} .title-container {
          text-align: center;
          margin-bottom: 16px;
        }
        #${containerId} h1 {
          font-size: 30px;
          font-weight: bold;
          margin: 0 0 16px 0;
          color: #111;
        }
        #${containerId} .thumbnail-container {
          width: 100%;
          margin-bottom: 16px;
        }
        #${containerId} .thumbnail-container img {
          width: 100%;
          height: auto;
          object-fit: cover;
        }
        #${containerId} .tts-button-container {
          display: none;
        }
        #${containerId} .menu-section {
          background: white;
          border-radius: 12px;
          padding: 24px;
          margin-bottom: 24px;
          box-shadow: none;
        }
        #${containerId} .menu-title {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 16px;
          color: #111;
        }
        #${containerId} .detail-menu-title {
          font-size: 16px;
          font-weight: 600;
          margin-top: 16px;
          margin-bottom: 8px;
          color: #111;
        }
        #${containerId} .menu-thumbnail {
          width: 100%;
          height: auto;
          object-fit: contain;
          border-radius: 8px;
          margin-bottom: 24px;
          display: block;
        }
        #${containerId} .subtitle-section {
          padding-top: 24px;
          padding-bottom: 24px;
          position: relative;
          background-color: #ffffff;
        }
        #${containerId} .subtitle-section:not(:last-child) {
          padding-bottom: 24px;
          margin-bottom: 24px;
        }
        #${containerId} .subtitle-section:not(:last-child)::after {
          content: '';
          display: block;
          width: 300px;
          height: 2px;
          background: linear-gradient(to right, transparent, #ffffff, transparent);
          margin: 24px auto 0;
        }
        #${containerId} .subtitle-section:last-child {
          padding-top: 24px;
          padding-bottom: 24px;
        }
        #${containerId} .subtitle-title {
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #333;
        }
        #${containerId} .subtitle-content {
          color: #555;
          line-height: 1.8;
          white-space: pre-line;
        }
        #${containerId} .detail-menu-content {
          color: #555;
          line-height: 1.8;
          white-space: pre-line;
        }
        #${containerId} .subtitle-thumbnail-container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 300px;
          height: 300px;
          margin-left: auto;
          margin-right: auto;
          margin-top: 8px;
          margin-bottom: 8px;
          background: #f3f4f6;
          border-radius: 8px;
          overflow: hidden;
        }
        #${containerId} .subtitle-thumbnail-container img,
        #${containerId} .subtitle-thumbnail-container video {
          width: 100%;
          height: 100%;
          display: block;
          border-radius: 8px;
          object-fit: contain;
        }
        #${containerId} .detail-menu-thumbnail-container {
          display: flex;
          justify-content: center;
          align-items: center;
          width: 300px;
          height: 300px;
          margin-left: auto;
          margin-right: auto;
          margin-top: 8px;
          margin-bottom: 8px;
          background: #f3f4f6;
          border-radius: 8px;
          overflow: hidden;
        }
        #${containerId} .detail-menu-thumbnail-container img,
        #${containerId} .detail-menu-thumbnail-container video {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: contain;
        }
        #${containerId} .menu-title { font-size: ${savedMenuFontSize}px !important; }
        #${containerId} .menu-title { font-weight: ${savedMenuFontBold ? 'bold' : 'normal'} !important; ${result.content?.menu_color ? `color: ${result.content.menu_color} !important;` : ''} }
        #${containerId} .subtitle-title { font-size: ${savedSubtitleFontSize}px !important; font-weight: ${savedSubtitleFontBold ? 'bold' : 'normal'} !important; ${result.content?.subtitle_color ? `color: ${result.content.subtitle_color} !important;` : ''} }
        #${containerId} .detail-menu-title { font-size: ${savedDetailMenuFontSize}px !important; font-weight: ${savedDetailMenuFontBold ? 'bold' : 'normal'} !important; ${result.content?.detail_menu_color ? `color: ${result.content.detail_menu_color} !important;` : ''} }
        #${containerId} .subtitle-content { font-size: ${savedBodyFontSize}px !important; font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important; ${result.content?.body_color ? `color: ${result.content.body_color} !important;` : ''} }
        #${containerId} .detail-menu-content { font-size: ${savedBodyFontSize}px !important; font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important; ${result.content?.body_color ? `color: ${result.content.body_color} !important;` : ''} }
      `;
      document.head.appendChild(styleElement);
      
      // "보기" 버튼과 완전히 동일한 HTML 구조
      const containerDiv = document.createElement('div');
      containerDiv.className = 'container';

      // 북커버(상단/엔딩)는 html2canvas에서 누락되거나,
      // jsPDF가 WEBP/기타 포맷을 지원하지 않아 addImage가 실패하는 케이스가 있어
      // 항상 JPEG dataURL로 변환해서 안정적으로 PDF에 삽입한다.
      const fetchAsJpegDataUrl = async (src: string): Promise<string> => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 20000)
        try {
          const res = await fetch(src, { cache: 'no-store', signal: controller.signal })
          if (!res.ok) throw new Error(`image fetch failed: ${res.status}`)
          const blob = await res.blob()

          // 이미지가 아닌 응답(JSON 에러 등) 방어
          if (!blob.type.startsWith('image/')) {
            throw new Error(`not an image response: ${blob.type || 'unknown'}`)
          }

          // createImageBitmap 우선 (WEBP 포함 대부분 처리)
          let bitmap: ImageBitmap | null = null
          try {
            bitmap = await createImageBitmap(blob)
          } catch {
            bitmap = null
          }

          // bitmap이 없으면 Image로 로드 (fallback)
          if (!bitmap) {
            const objUrl = URL.createObjectURL(blob)
            try {
              const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image()
                el.onload = () => resolve(el)
                el.onerror = () => reject(new Error('Image load failed'))
                el.src = objUrl
              })
              const canvas = document.createElement('canvas')
              canvas.width = img.naturalWidth || 1
              canvas.height = img.naturalHeight || 1
              const ctx = canvas.getContext('2d')
              if (!ctx) throw new Error('canvas ctx not available')
              ctx.fillStyle = '#ffffff'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
              ctx.drawImage(img, 0, 0)
              return canvas.toDataURL('image/jpeg', 0.92)
            } finally {
              URL.revokeObjectURL(objUrl)
            }
          }

          // ✅ 긴 PDF에서 실패가 나기 쉬워 북커버는 최대 해상도를 제한한다(용량/메모리 폭증 방지)
          const MAX_W = 1200
          const MAX_H = 2133 // 대략 9:16 기준
          const bw = bitmap.width || 1
          const bh = bitmap.height || 1
          const scale = Math.min(1, MAX_W / bw, MAX_H / bh)

          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(bw * scale))
          canvas.height = Math.max(1, Math.round(bh * scale))
          const ctx = canvas.getContext('2d')
          if (!ctx) throw new Error('canvas ctx not available')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(bitmap as any, 0, 0, canvas.width, canvas.height)
          try {
            ;(bitmap as any).close?.()
          } catch {}
          return canvas.toDataURL('image/jpeg', 0.85)
        } finally {
          clearTimeout(timeout)
        }
      }

      // ✅ 이미 dataURL인 이미지를 더 작게/낮은 품질로 재압축 (네트워크 fetch 없이)
      const recompressJpegDataUrl = async (dataUrl: string, maxW: number, quality: number): Promise<string> => {
        try {
          const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image()
            el.onload = () => resolve(el)
            el.onerror = () => reject(new Error('dataURL image load failed'))
            el.src = dataUrl
          })
          const w = img.naturalWidth || 1
          const h = img.naturalHeight || 1
          const s = Math.min(1, maxW / w)
          const canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(w * s))
          canvas.height = Math.max(1, Math.round(h * s))
          const ctx = canvas.getContext('2d')
          if (!ctx) return dataUrl
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          return canvas.toDataURL('image/jpeg', quality)
        } catch {
          return dataUrl
        }
      }

      const resolveCoverSrc = async (url: string): Promise<string> => {
        const direct = (url || '').trim()
        if (!direct) return ''
        const proxied = `/api/proxy/image?url=${encodeURIComponent(direct)}`

        // 1) 프록시 경유 (CORS/권한 안정)
        try {
          const dataUrl = await fetchAsJpegDataUrl(proxied)
          if (dataUrl) return dataUrl
        } catch {}

        // 2) 프록시가 거부(호스트 불일치 등)하는 경우 직접 시도
        try {
          const dataUrl = await fetchAsJpegDataUrl(direct)
          if (dataUrl) return dataUrl
        } catch {}

        // 3) 최후의 수단: dataURL 변환이 실패해도 <img src> 자체는 살려둔다.
        // (html2canvas 캡처 또는 이후 로직에서 재시도 가능)
        return proxied
      }

      const bookCoverSrcs = await Promise.all(finalBookCoverImageUrls.map(resolveCoverSrc))
      const endingBookCoverSrcs = await Promise.all(finalEndingBookCoverImageUrls.map(resolveCoverSrc))
      
      // ✅ PDF 템플릿에서 북커버/엔딩북커버를 "정해진 위치"에 렌더링한다.
      // ✅ 동영상이 있더라도 PDF에서는 "이미지 썸네일"만 사용한다.
      // ✅ 여러 장(배열)인 경우에도 모두 포함한다.
      const bookCoverHtml = bookCoverSrcs.filter(Boolean).length > 0
        ? `
          <div id="pdf-top-book-cover" class="book-cover-thumbnail-container" style="width: 100%; height: 1592px; margin-bottom: 40px; display: block !important; page-break-inside: avoid; background: #f3f4f6; overflow: hidden; border-radius: 8px;">
            ${bookCoverSrcs
              .filter(Boolean)
              .map((src, idx, arr) => `
                <img
                  src="${src}"
                  alt="북커버"
                  class="pdf-cover-img"
                  style="width: 100%; max-width: 100%; height: auto; object-fit: contain; display: block !important; ${idx < arr.length - 1 ? 'margin-bottom: 16px;' : ''}"
                />
              `)
              .join('')}
          </div>
        `
        : ''

      const endingBookCoverHtml = endingBookCoverSrcs.filter(Boolean).length > 0
        ? `
          <div id="pdf-ending-book-cover" class="ending-book-cover-thumbnail-container" style="width: 100%; height: 1592px; margin-top: 24px; display: block !important; page-break-inside: avoid; background: #f3f4f6; overflow: hidden; border-radius: 8px;">
            ${endingBookCoverSrcs
              .filter(Boolean)
              .map((src, idx, arr) => `
                <img
                  src="${src}"
                  alt="엔딩북커버"
                  class="pdf-cover-img"
                  style="width: 100%; max-width: 100%; height: auto; object-fit: contain; display: block !important; ${idx < arr.length - 1 ? 'margin-bottom: 16px;' : ''}"
                />
              `)
              .join('')}
          </div>
        `
        : ''
      
      containerDiv.innerHTML = `
        <div class="title-container">
          <h1>${result.title}</h1>
        </div>
        ${bookCoverHtml}
        ${result.content?.thumbnail_url ? `
        <div class="thumbnail-container">
          <img src="${result.content.thumbnail_url}" alt="${result.title}" />
        </div>
        ` : ''}
        <div class="tts-button-container" style="display: none;">
          <button id="ttsButton" class="tts-button">
            <span id="ttsIcon">🔊</span>
            <span id="ttsText">점사 듣기</span>
          </button>
        </div>
        <div id="contentHtml">${safeHtml}</div>
        ${endingBookCoverHtml}
      `;
      container.appendChild(containerDiv);
      document.body.appendChild(container);
      
      updateProgress(10);
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // 이미지 로딩 대기
      const images = Array.from(container.querySelectorAll('img'));
      await Promise.all(images.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
          setTimeout(resolve, 20000);
        });
      }));
      
      updateProgress(30);
      
      // 폰트 로딩 대기 (섹션별 폰트 포함)
      const fontFamiliesToWait = Array.from(new Set([menuFontFamily, subtitleFontFamily, detailMenuFontFamily, bodyFontFamily, fontFamilyName].filter(Boolean))) as string[]
      if (fontFamiliesToWait.length > 0) {
        try {
          await document.fonts.ready;
          let allLoaded = false;
          for (let i = 0; i < 60; i++) {
            allLoaded = fontFamiliesToWait.every((fam) => (
              document.fonts.check(`12px "${fam}"`) ||
              document.fonts.check(`16px "${fam}"`) ||
              document.fonts.check(`24px "${fam}"`)
            ))
            if (allLoaded) break
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (!allLoaded) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (e) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // PDF 생성 - 보기 화면의 스크롤 길이만큼 하나의 긴 페이지로 생성
      const margin = 5; // 최소 여백 5mm (상하좌우 동일)
      const pdfPageWidth = 210; // PDF 페이지 너비 210mm (A4 가로)
      
      // PDF는 나중에 캡처된 이미지 높이에 맞춰 동적으로 생성
      let pdf: jsPDF | null = null;
      
      // 제목 제거
      const titleEl = container.querySelector('h1');
      if (titleEl) {
        titleEl.remove();
      }
      
      // TTS 버튼 제거
      const ttsButtonContainer = container.querySelector('.tts-button-container');
      if (ttsButtonContainer) {
        ttsButtonContainer.remove();
      }
      
      // "보기" 화면과 동일한 구조로 캡처
      const contentHtml = container.querySelector('#contentHtml') || container.querySelector('.container');
      if (!contentHtml) {
        throw new Error('컨텐츠를 찾을 수 없습니다.');
      }
      
      // 전체 내용을 하나의 캔버스로 캡처
      const scale = 2; // 고품질 유지
      
      // 보기 화면과 동일한 너비로 설정 (896px는 보기 화면의 실제 너비)
      const viewWidth = 896;
      
      // 임시 컨테이너 생성 (보기 화면과 동일한 구조)
      // 원래 스크롤 위치 저장 (PDF 생성 후 복원)
      originalScrollY = window.scrollY;
      originalScrollX = window.scrollX;
      
      // html2canvas가 제대로 캡처하려면 요소가 화면에 보여야 하지만, 사용자에게는 보이지 않게 처리
      const tempContainer = document.createElement('div');
      const tempContainerId = `temp-pdf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      tempContainer.id = tempContainerId;
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      
      const pdfTargetWidth = viewWidth;
      
      tempContainer.style.width = `${pdfTargetWidth}px`;
      tempContainer.style.maxWidth = `${pdfTargetWidth}px`;
      tempContainer.style.minWidth = `${pdfTargetWidth}px`;
      tempContainer.style.boxSizing = 'border-box';
      tempContainer.style.zIndex = '-99999';
      tempContainer.style.backgroundColor = '#f9fafb';
      tempContainer.style.padding = '0';
      tempContainer.style.margin = '0';
      tempContainer.style.border = 'none';
      tempContainer.style.overflow = 'visible';
      tempContainer.style.opacity = '1';
      tempContainer.style.visibility = 'visible';
      tempContainer.style.pointerEvents = 'none';
      
      // 폰트 스타일 적용
      {
        const baseFontFamily = bodyFontFamily || (fontFamilyName && !hasSectionFonts ? fontFamilyName : '') || ''
        if (baseFontFamily) {
          tempContainer.style.fontFamily = `'${baseFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif`;
        }
        const scopedStyle = document.createElement('style');
        scopedStyle.innerHTML = `
          ${fontFaceCssForPdf}
          #${tempContainerId} * {
            ${baseFontFamily ? `font-family: '${baseFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important;` : ''}
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
          }
          ${menuFontFamily ? `#${tempContainerId} .menu-title { font-family: '${menuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          ${subtitleFontFamily ? `#${tempContainerId} .subtitle-title { font-family: '${subtitleFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          ${detailMenuFontFamily ? `#${tempContainerId} .detail-menu-title { font-family: '${detailMenuFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          ${bodyFontFamily ? `#${tempContainerId} .subtitle-content, #${tempContainerId} .detail-menu-content { font-family: '${bodyFontFamily}', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif !important; }` : ''}
          #${tempContainerId} {
            background: #f9fafb !important;
          }
          #${tempContainerId} body {
            background: #f9fafb !important;
          }
          #${tempContainerId} html {
            background: #f9fafb !important;
          }
          #${tempContainerId} .container {
            background: transparent !important;
            padding: 32px 16px;
          }
          #${tempContainerId} .menu-section {
            background: white;
            border-radius: 12px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: none;
          }
          #${tempContainerId} .menu-title {
            font-size: ${savedMenuFontSize}px !important;
            font-weight: ${savedMenuFontBold ? 'bold' : 'normal'} !important;
            margin-bottom: 16px;
            color: ${result.content?.menu_color ? result.content.menu_color : '#111'} !important;
            text-shadow: none !important;
            -webkit-text-stroke: 0 !important;
            -webkit-text-fill-color: ${result.content?.menu_color ? result.content.menu_color : '#111'} !important;
          }
          #${tempContainerId} .subtitle-section {
            padding-top: 24px;
            padding-bottom: 24px;
            position: relative;
            background-color: #ffffff;
          }
          #${tempContainerId} .subtitle-section:not(:last-child) {
            padding-bottom: 24px;
            margin-bottom: 24px;
          }
          #${tempContainerId} .subtitle-section:not(:last-child)::after {
            content: '';
            display: block;
            width: 300px;
            height: 2px;
            background: linear-gradient(to right, transparent, #ffffff, transparent);
            margin: 24px auto 0;
          }
          #${tempContainerId} .subtitle-title {
            font-size: ${savedSubtitleFontSize}px !important;
            font-weight: ${savedSubtitleFontBold ? 'bold' : 'normal'} !important;
            margin-bottom: 12px;
            color: ${result.content?.subtitle_color ? result.content.subtitle_color : '#333'} !important;
            text-shadow: none !important;
            -webkit-text-stroke: 0 !important;
            -webkit-text-fill-color: ${result.content?.subtitle_color ? result.content.subtitle_color : '#333'} !important;
          }
          #${tempContainerId} .detail-menu-title {
            font-size: ${savedDetailMenuFontSize}px !important;
            font-weight: ${savedDetailMenuFontBold ? 'bold' : 'normal'} !important;
            margin-top: 16px;
            margin-bottom: 8px;
            color: ${result.content?.detail_menu_color ? result.content.detail_menu_color : '#111'} !important;
            text-shadow: none !important;
            -webkit-text-stroke: 0 !important;
            -webkit-text-fill-color: ${result.content?.detail_menu_color ? result.content.detail_menu_color : '#111'} !important;
          }
          #${tempContainerId} .subtitle-content {
            font-size: ${savedBodyFontSize}px !important;
            font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important;
            color: ${result.content?.body_color ? result.content.body_color : '#555'} !important;
            line-height: 1.8;
            white-space: pre-line;
          }
          #${tempContainerId} .detail-menu-content {
            font-size: ${savedBodyFontSize}px !important;
            font-weight: ${savedBodyFontBold ? 'bold' : 'normal'} !important;
            color: ${result.content?.body_color ? result.content.body_color : '#555'} !important;
            line-height: 1.8;
            white-space: pre-line;
          }
          #${tempContainerId} .menu-thumbnail,
          #${tempContainerId} img.menu-thumbnail {
            width: 100% !important;
            max-width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
            display: block !important;
            margin-bottom: 16px !important;
          }
          #${tempContainerId} .subtitle-thumbnail-container {
            width: 300px !important;
            height: 300px !important;
            max-width: 300px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            margin-top: 0.5rem !important;
            margin-bottom: 0.5rem !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            background: #f3f4f6 !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }
          #${tempContainerId} .subtitle-thumbnail-container img,
          #${tempContainerId} .subtitle-thumbnail-container video {
            width: 100% !important;
            height: 100% !important;
            max-width: 100% !important;
            display: block !important;
            object-fit: contain !important;
          }
          #${tempContainerId} .detail-menu-thumbnail-container {
            width: 300px !important;
            height: 300px !important;
            max-width: 300px !important;
            margin-left: auto !important;
            margin-right: auto !important;
            margin-top: 0.5rem !important;
            margin-bottom: 0.5rem !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
            background: #f3f4f6 !important;
            border-radius: 8px !important;
            overflow: hidden !important;
          }
          #${tempContainerId} .book-cover-thumbnail-container, 
          #${tempContainerId} .ending-book-cover-thumbnail-container {
            display: block !important;
            width: 100% !important;
            position: relative !important;
            opacity: 1 !important;
            visibility: visible !important;
          }
          #${tempContainerId} .pdf-cover-img {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            object-fit: contain !important;
          }
        `;
        tempContainer.appendChild(scopedStyle);
      }
      
      // 보기 화면과 동일한 구조로 복사
      const containerWrapper = container.querySelector('.container') || contentHtml.parentElement;
      if (!containerWrapper) {
        throw new Error('컨테이너 래퍼를 찾을 수 없습니다.');
      }
      
      // container 전체를 복사 (북커버, 목차, 모든 메뉴 섹션 포함)
      const tempContainerDiv = containerWrapper.cloneNode(true) as HTMLElement;
      tempContainer.appendChild(tempContainerDiv);
      document.body.appendChild(tempContainer);
      
      // tempContainer의 높이를 명시적으로 설정하여 전체 내용이 포함되도록
      tempContainer.style.height = 'auto';
      tempContainer.style.minHeight = '0';
      
      // 목차 생성 및 삽입 (View 화면과 동일하게)
      try {
        const menuSections = Array.from(tempContainer.querySelectorAll('.menu-section'));
        if (menuSections.length > 0) {
          let tocHtml = '<div id="table-of-contents" class="toc-container" style="margin-bottom: 24px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; padding: 24px 24px 24px 24px; box-sizing: border-box;">';
          tocHtml += '<h3 style="font-size: 18px; font-weight: bold; color: #111827 !important; margin-bottom: 16px;">목차</h3>';
          tocHtml += '<div style="display: flex; flex-direction: column; gap: 8px;">';
          
          menuSections.forEach((section, mIndex) => {
            const menuTitleEl = section.querySelector('.menu-title');
            const menuTitle = (menuTitleEl?.textContent || '').trim();
            
            if (!menuTitle) return;
            
            const escapedMenuTitle = menuTitle
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
            
            tocHtml += '<div style="display: flex; flex-direction: column; gap: 4px;">';
            tocHtml += `<div style="text-align: left; font-size: 16px; font-weight: 600; color: #1f2937 !important; padding: 4px 0;">${escapedMenuTitle}</div>`;
            
            const subtitleSections = Array.from(section.querySelectorAll('.subtitle-section'));
            if (subtitleSections.length > 0) {
              tocHtml += '<div style="margin-left: 16px; display: flex; flex-direction: column; gap: 2px;">';
              subtitleSections.forEach((subSection, sIndex) => {
                const subtitleTitleEl = subSection.querySelector('.subtitle-title');
                const subTitle = (subtitleTitleEl?.textContent || '').trim();
                
                if (!subTitle || subTitle.includes('상세메뉴 해석 목록')) return;
                
                const escapedSubTitle = subTitle
                  .replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&#39;');
                
                tocHtml += `<div style="text-align: left; font-size: 14px; color: #4b5563 !important; padding: 2px 0;">${escapedSubTitle}</div>`;
              });
              tocHtml += '</div>';
            }
            tocHtml += '</div>';
          });
          
          tocHtml += '</div></div>';
          
          const containerDiv = tempContainer.querySelector('.container') || tempContainer.firstElementChild;
          if (containerDiv) {
             const tocDiv = document.createElement('div');
             tocDiv.innerHTML = tocHtml;
             
             const bookCover = Array.from(containerDiv.querySelectorAll('.book-cover-thumbnail-container'))
               .find(el => !el.closest('.menu-section'));
             const firstMenu = containerDiv.querySelector('.menu-section');
             
             if (bookCover) {
               containerDiv.insertBefore(tocDiv, bookCover.nextSibling);
             } else if (firstMenu) {
               containerDiv.insertBefore(tocDiv, firstMenu);
             } else {
               containerDiv.prepend(tocDiv);
             }
          }
        }
      } catch (e) {
      }
      
      updateProgress(60);
      
      // 이미지 로드 대기 및 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 이미지가 모두 로드될 때까지 대기
      const tempImages = tempContainer.querySelectorAll('img');
      if (tempImages.length > 0) {
        await Promise.all(
          Array.from(tempImages).map((img) => {
            if ((img as HTMLImageElement).complete) {
              return Promise.resolve();
            }
            return new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                resolve(null);
              }, 20000);
              (img as HTMLImageElement).onload = () => {
                clearTimeout(timeout);
                resolve(null);
              };
              (img as HTMLImageElement).onerror = () => {
                clearTimeout(timeout);
                resolve(null);
              };
            });
          })
        );
      }
      
      // 추가 렌더링 대기
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // html2canvas 캡처 전에 모든 요소의 배경색을 명시적으로 설정 (검정색 방지)
      const allElements = tempContainer.querySelectorAll('*');
      allElements.forEach((el) => {
        const htmlEl = el as HTMLElement;
        const computedBg = window.getComputedStyle(htmlEl).backgroundColor;
        if (computedBg === 'rgba(0, 0, 0, 0)' || computedBg === 'transparent' || computedBg === 'rgb(0, 0, 0)') {
          if (htmlEl.classList.contains('menu-section')) {
            htmlEl.style.backgroundColor = '#ffffff';
          } else if (htmlEl.classList.contains('subtitle-section') || htmlEl.classList.contains('container')) {
            htmlEl.style.backgroundColor = 'transparent';
          } else if (htmlEl.tagName === 'BODY' || htmlEl.tagName === 'HTML') {
            htmlEl.style.backgroundColor = '#f9fafb';
          }
        }
      });
      
      // tempContainer 자체도 배경색 확인
      const tempContainerBg = window.getComputedStyle(tempContainer).backgroundColor;
      if (tempContainerBg === 'rgba(0, 0, 0, 0)' || tempContainerBg === 'rgb(0, 0, 0)') {
        tempContainer.style.backgroundColor = '#f9fafb';
      }
      
      try {
        const maxPdfPageHeight = 5000; // mm
        const pdfMargin = 5; // mm (상하 여백)
        
        pdf = new jsPDF({
          orientation: 'p',
          unit: 'mm',
          format: [pdfPageWidth, maxPdfPageHeight],
          compress: true
        });
        
        let currentPdfY = pdfMargin;
        
        const root = (tempContainer.querySelector('.container') as HTMLElement) || (tempContainer.firstElementChild as HTMLElement);
        if (!root) throw new Error('PDF 캡처 루트(.container)를 찾을 수 없습니다.');
        
        // ✅ 북커버는 "블록 캡처(html2canvas)" 흐름과 분리해서 항상 직접 삽입한다.
        // (긴 PDF에서 특정 블록만 누락되는 케이스 방지)
        const topCoverEl =
          (root.querySelector('#pdf-top-book-cover') as HTMLElement | null) ||
          (Array.from(root.querySelectorAll('.book-cover-thumbnail-container'))
            .find((el) => !el.closest('.menu-section')) as HTMLElement | undefined)

        const endingCoverEl =
          (root.querySelector('#pdf-ending-book-cover') as HTMLElement | null) ||
          (Array.from(root.querySelectorAll('.ending-book-cover-thumbnail-container'))
            .filter((el) => !el.closest('.menu-section'))
            .slice(-1)[0] as HTMLElement | undefined)

        const blocks: HTMLElement[] = [];
        const toc = root.querySelector('#table-of-contents') as HTMLElement | null;
        const menuSections = Array.from(root.querySelectorAll('.menu-section')) as HTMLElement[];

        if (toc) blocks.push(toc);
        blocks.push(...menuSections);
        
        if (blocks.length === 0) throw new Error('PDF로 변환할 블록을 찾을 수 없습니다.');
        
        const maxSliceHeightPx = 8000;
        const sliceOverlapPx = 120;
        
        const addCanvasToPdf = (canvasToAdd: HTMLCanvasElement) => {
          if (!pdf) return;
          
          const imgW = canvasToAdd.width;
          const imgH = canvasToAdd.height;
          if (imgW <= 0 || imgH <= 0) return;
          
          const pdfImgWidth = pdfPageWidth - (pdfMargin * 2);
          const pdfImgHeight = (imgH * pdfImgWidth) / imgW;
          
          if (currentPdfY + pdfImgHeight > maxPdfPageHeight - pdfMargin) {
            pdf.addPage([pdfPageWidth, maxPdfPageHeight]);
            currentPdfY = pdfMargin;
          }
          
          pdf.addImage(canvasToAdd.toDataURL('image/jpeg', 0.95), 'JPEG', pdfMargin, currentPdfY, pdfImgWidth, pdfImgHeight);
          currentPdfY += pdfImgHeight;
        };
        
        const captureElement = async (el: HTMLElement) => {
          const elHeight = Math.max(el.scrollHeight || 0, el.offsetHeight || 0, el.clientHeight || 0);
          const elWidth = Math.max(el.scrollWidth || 0, el.offsetWidth || 0, el.clientWidth || 0);
          if (elHeight <= 0 || elWidth <= 0) return;
          
          if (elHeight <= maxSliceHeightPx) {
            const canvas = await html2canvas(el, {
              scale,
              useCORS: true,
              allowTaint: false, // CORS 사용 시 false로 설정해야 함
              backgroundColor: '#f9fafb',
              logging: false,
              imageTimeout: 20000,
              foreignObjectRendering: false
            });
            addCanvasToPdf(canvas);
            canvas.width = 1; canvas.height = 1;
            return;
          }
          
          const step = maxSliceHeightPx - sliceOverlapPx;
          for (let y = 0; y < elHeight; y += step) {
            const sliceStartY = Math.max(0, y - (y === 0 ? 0 : sliceOverlapPx));
            const sliceHeight = Math.min(elHeight - sliceStartY, maxSliceHeightPx);
            
            const wrapper = document.createElement('div');
            wrapper.style.position = 'absolute';
            wrapper.style.left = '0';
            wrapper.style.top = '0';
            wrapper.style.width = `${elWidth}px`;
            wrapper.style.height = `${sliceHeight}px`;
            wrapper.style.overflow = 'hidden';
            wrapper.style.background = '#f9fafb';
            
            const cloned = el.cloneNode(true) as HTMLElement;
            cloned.style.transform = `translateY(-${sliceStartY}px)`;
            cloned.style.transformOrigin = 'top left';
            cloned.style.width = `${elWidth}px`;
            cloned.style.boxSizing = 'border-box';
            
            wrapper.appendChild(cloned);
            tempContainer.appendChild(wrapper);
            
            const sliceCanvas = await html2canvas(wrapper, {
              scale,
              useCORS: true,
              allowTaint: false, // CORS 사용 시 false로 설정해야 함
              backgroundColor: '#f9fafb',
              logging: false,
              imageTimeout: 20000,
              foreignObjectRendering: false,
              width: elWidth,
              height: sliceHeight
            });
            
            tempContainer.removeChild(wrapper);
            
            let finalCanvas = sliceCanvas;
            if (y > 0) {
              const cropTopPx = sliceOverlapPx * scale;
              if (finalCanvas.height > cropTopPx + 10) {
                const cropped = document.createElement('canvas');
                cropped.width = finalCanvas.width;
                cropped.height = finalCanvas.height - cropTopPx;
                const cctx = cropped.getContext('2d');
                if (cctx) {
                  cctx.drawImage(finalCanvas, 0, cropTopPx, finalCanvas.width, cropped.height, 0, 0, cropped.width, cropped.height);
                  finalCanvas = cropped;
                }
              }
            }
            
            addCanvasToPdf(finalCanvas);
            
            sliceCanvas.width = 1; sliceCanvas.height = 1;
            if (finalCanvas !== sliceCanvas) { finalCanvas.width = 1; finalCanvas.height = 1; }
          }
        };

        // 북커버는 html2canvas 경로에서 누락되는 케이스가 있어 jsPDF에 직접 삽입
        // ✅ 긴 PDF에서만 누락되는 케이스가 있어, 치수 계산/압축을 단순화하고 실패 시 재시도한다.
        const addCoverImagesDirectly = async (srcs: string[]): Promise<boolean> => {
          if (!pdf) return false
          const list = (srcs || []).filter(Boolean)
          if (list.length === 0) return false
          let added = false

          for (const srcRaw of list) {
            let src = srcRaw

            // jsPDF는 dataURL이 가장 안정적이므로 가능하면 dataURL로 변환
            if (!src.startsWith('data:image/jpeg')) {
              try {
                src = await fetchAsJpegDataUrl(src)
              } catch {
                // 변환 실패 시 그대로 시도 (일부 환경에서 URL도 동작)
              }
            }

            const format = 'JPEG'

            // ✅ 북커버는 서비스 규칙상 9:16(세로) 비율이므로 비율 고정으로 계산
            const pdfImgWidth = pdfPageWidth - (pdfMargin * 2)
            const pdfImgHeight = (pdfImgWidth * 16) / 9

            if (currentPdfY + pdfImgHeight > maxPdfPageHeight - pdfMargin) {
              pdf.addPage([pdfPageWidth, maxPdfPageHeight])
              currentPdfY = pdfMargin
            }

            try {
              // FAST 압축: 긴 PDF에서 이미지 누락/실패 방지에 유리
              pdf.addImage(src, format as any, pdfMargin, currentPdfY, pdfImgWidth, pdfImgHeight, undefined, 'FAST')
              currentPdfY += pdfImgHeight
              added = true
            } catch {
              // ✅ 실패 시 한 번 더 더 작은 품질로 재압축 후 재시도
              try {
                const low = src.startsWith('data:image/')
                  ? await recompressJpegDataUrl(src, 700, 0.6)
                  : await fetchAsJpegDataUrl(src)
                pdf.addImage(low, format as any, pdfMargin, currentPdfY, pdfImgWidth, pdfImgHeight, undefined, 'FAST')
                currentPdfY += pdfImgHeight
                added = true
              } catch {
                // addImage 실패 시 스킵 (다른 블록은 계속 생성)
              }
            }
          }

          return added
        }
        
        // ✅ 1) 상단 북커버 먼저 삽입
        if (topCoverEl) {
          const topInserted = await addCoverImagesDirectly(bookCoverSrcs)
          // ✅ 상단 북커버가 실패하면(긴 PDF에서만 발생) html2canvas 경로로 한 번 더 시도해서
          // "상단이라도" 보이게 한다.
          if (!topInserted) {
            await captureElement(topCoverEl as HTMLElement)
          }
        }

        for (let i = 0; i < blocks.length; i++) {
          const block = blocks[i]
          await captureElement(block);
        }

        // ✅ 2) 엔딩 북커버를 마지막에 삽입
        if (endingCoverEl) {
          await addCoverImagesDirectly(endingBookCoverSrcs)
        }
        
        // tempContainer 제거
        if (tempContainer.parentNode) {
          document.body.removeChild(tempContainer);
        }
        
        // 원래 스크롤 위치 복원
        window.scrollTo(originalScrollX, originalScrollY);
        
      } catch (error) {
        if (tempContainer.parentNode) {
          document.body.removeChild(tempContainer);
        }
        window.scrollTo(originalScrollX, originalScrollY);
        throw error;
      }
      
      if (!pdf) {
        throw new Error('PDF 생성에 실패했습니다.');
      }
      
      updateProgress(95);
      pdf.save(`${result.title || '재회 결과'}.pdf`);
      updateProgress(100);
      
      // PDF 생성 완료 후 Supabase에 저장
      try {
        const response = await fetch('/api/saved-results/mark-pdf-generated', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ id: result.id }),
        })
      } catch (error) {
      }
      
      // 정리
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
      
      // PDF 생성 완료 후 결과 목록 업데이트 (pdf_generated 상태 반영)
      setSavedResults(prev => prev.map(item => 
        item.id === result.id ? { ...item, pdf_generated: true } : item
      ))
      
    } catch (error: any) {
      console.error('PDF 생성 실패:', error)
      alert('PDF 생성에 실패했습니다.')
      
      // PDF 생성 중 상태 해제
      setPdfGeneratingMap(prev => {
        const newMap = { ...prev }
        delete newMap[result.id]
        return newMap
      })
      
      // 정리
      if (container && container.parentNode) {
        container.parentNode.removeChild(container);
      }
      if (styleElement && styleElement.parentNode) {
        styleElement.parentNode.removeChild(styleElement);
      }
    }
  }

  const handleWriteReview = async (result: SavedResult) => {
    if (!result.title) {
      alert('컨텐츠 정보를 찾을 수 없습니다.')
      return
    }
    
    // content.id가 실제 contents 테이블에 존재하지 않을 수 있으므로
    // title로 contents 테이블에서 실제 ID를 찾기
    let actualContentId: number | null = null
    
    // 먼저 content.id가 있으면 그것을 시도
    if (result.content?.id) {
      const contentId = parseInt(String(result.content.id), 10)
      console.log('[MyHistory] 리뷰 작성 시도 - content_id:', contentId)
      
      // content_id가 유효한지 확인 (서버에서 확인함)
      // 일단 content_id를 사용하되, 서버에서 유효하지 않으면 에러가 발생함
      actualContentId = contentId
    }
    
    // content.id가 없거나, 나중에 유효하지 않으면 title로 찾기
    if (!actualContentId) {
      try {
        const findResponse = await fetch(`/api/contents/find-by-title?title=${encodeURIComponent(result.title || '')}`)
        if (findResponse.ok) {
          const findData = await findResponse.json().catch(() => ({}))
          if (findData.success && findData.content_id) {
            actualContentId = findData.content_id
            console.log('[MyHistory] title로 content_id 찾음:', actualContentId)
          }
        }
      } catch (e) {
        console.warn('[MyHistory] title로 content_id 찾기 실패:', e)
      }
    }
    
    if (!actualContentId) {
      alert('컨텐츠를 찾을 수 없습니다. 관리자에게 문의해주세요.')
      return
    }
    
    setShowReviewPopup({
      contentId: actualContentId,
      userName: result.user_name || null,
      title: result.title || null
    })
    
    console.log('[MyHistory] 리뷰 팝업 표시:', {
      contentId: actualContentId,
      userName: result.user_name || null,
      title: result.title || null
    })
  }

  const handleReviewSuccess = () => {
    // 리뷰 작성 성공 후 필요한 작업 (예: 목록 새로고침 등)
    // 현재는 팝업이 자동으로 닫히므로 특별한 작업 없음
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    // 한국 시간(KST, Asia/Seoul, UTC+9)으로 변환
    const kstOptions: Intl.DateTimeFormatOptions = {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }
    
    // 한국 시간대로 변환된 날짜 문자열 생성
    const formatter = new Intl.DateTimeFormat('en-US', kstOptions)
    const parts = formatter.formatToParts(date)
    
    const year = parts.find(p => p.type === 'year')?.value || ''
    const month = parts.find(p => p.type === 'month')?.value || ''
    const day = parts.find(p => p.type === 'day')?.value || ''
    const hours = parts.find(p => p.type === 'hour')?.value || ''
    const minutes = parts.find(p => p.type === 'minute')?.value || ''
    const seconds = parts.find(p => p.type === 'second')?.value || ''
    
    return `${year}년 ${month}월 ${day}일 ${hours}:${minutes}:${seconds}`
  }

  const getRemainingViewDays = (savedAt: string, totalDays: number = 60) => {
    const saved = new Date(savedAt)
    const now = new Date()
    
    // 날짜만 비교 (시간 제외)
    const savedDate = new Date(saved.getFullYear(), saved.getMonth(), saved.getDate())
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    // 경과 일수 계산
    const elapsedDays = Math.floor((nowDate.getTime() - savedDate.getTime()) / (1000 * 60 * 60 * 24))
    
    // 잔여일 계산 (결제일로부터 60일까지)
    const remaining = totalDays - elapsedDays
    
    // 최대 60일, 최소 0일
    if (remaining > totalDays) return totalDays
    if (remaining < 0) return 0
    return remaining
  }

  const formatUserInfoLine = (result: SavedResult) => {
    const name = result.user_name || result.content?.user_info?.name || ''
    const birthDate = result.content?.user_info?.birth_date || ''
    const birthHour = result.content?.user_info?.birth_hour || ''

    if (!name) return ''

    const parts: string[] = [name]
    if (birthDate || birthHour) {
      let formattedDate = birthDate;
      if (birthDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [y, m, d] = birthDate.split('-');
        formattedDate = `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
      }
      
      let formattedHour = '';
      if (birthHour) {
        // 자(子), 축(丑) 등의 한자를 한글로 변환
        const zodiacMap: Record<string, string> = {
          '子': '자', '丑': '축', '寅': '인', '卯': '묘',
          '辰': '진', '巳': '사', '午': '오', '未': '미',
          '申': '신', '酉': '유', '戌': '술', '亥': '해'
        };
        
        // birthHour가 "丑" 또는 "丑시" 등으로 올 수 있음
        const cleanHour = birthHour.replace('시', '').trim();
        
        if (zodiacMap[cleanHour]) {
          // 예: "축(丑)시"
          formattedHour = `${zodiacMap[cleanHour]}(${cleanHour})시`;
        } else {
          // 그 외 (모름 등): "X시" 또는 그대로
          formattedHour = birthHour.endsWith('시') ? birthHour : `${birthHour}시`;
        }
      }
      
      if (formattedDate || formattedHour) {
        const dateParts = [];
        if (formattedDate) dateParts.push(formattedDate);
        if (formattedHour) dateParts.push(formattedHour);
        parts.push(`(${dateParts.join(' ')})`);
      }
    }

    return parts.join(' ')
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col relative">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">나의 이용내역</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 내용 */}
        <div className="flex-1 overflow-y-auto">
          {!showResults ? (
            /* 로그인 폼 */
            <form onSubmit={handleSubmit}>
              <div className="p-6 pb-0 space-y-6">
                <div className="bg-pink-50 border border-pink-200 rounded-lg p-4">
                  <p className="text-sm text-pink-700">
                    * 최근 6개월간의 이용내역만 조회 가능합니다.
                  </p>
                </div>
              </div>

              {/* 리뷰 이벤트 기본 배너 (로그인 폼 영역 - 패딩 없이 꽉 차게) */}
              {loginFormBanners.basic && (
                <div className="mx-6 my-6 rounded-xl overflow-hidden shadow-md">
                  <img
                    src={loginFormBanners.basic}
                    alt="리뷰 이벤트 기본 배너"
                    className="w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity block"
                    onClick={async () => {
                      console.log('[MyHistory] 로그인 폼 배너 클릭')
                      console.log('[MyHistory] detailBannersLoading:', detailBannersLoading)
                      console.log('[MyHistory] loginFormBanners:', loginFormBanners)
                      console.log('[MyHistory] loginFormBanners.details:', loginFormBanners.details)
                      console.log('[MyHistory] loginFormBanners.details.length:', loginFormBanners.details?.length)
                      
                      if (detailBannersLoading) {
                        console.log('[MyHistory] 로딩 중이므로 리턴')
                        return
                      }
                      
                      if (loginFormBanners.details && loginFormBanners.details.length > 0) {
                        console.log('[MyHistory] 상세 배너가 있음, 로딩 확인 시작')
                        // 이미 로딩된 이미지인지 확인 (메모리 + 로컬 스토리지)
                        const allLoaded = loginFormBanners.details.every((url: string) => {
                          return loadedDetailBannerImages.has(url) || getLoadedImagesFromStorage().has(url)
                        })
                        
                        if (allLoaded) {
                          // 이미 모두 로딩되어 있으면 즉시 표시
                          setShowDetailBannersModal({ contentId: 0, details: loginFormBanners.details })
                        } else {
                          // 아직 로딩 중이면 대기
                          setDetailBannersLoading(true)
                          
                          // 아직 로딩되지 않은 이미지만 로딩 (메모리 + 로컬 스토리지 확인)
                          const storageLoaded = getLoadedImagesFromStorage()
                          const imagePromises = loginFormBanners.details
                            .filter((url: string) => !loadedDetailBannerImages.has(url) && !storageLoaded.has(url))
                            .map((url: string) => {
                              return new Promise<void>((resolve) => {
                                const img = new Image()
                                img.onload = () => {
                                  saveLoadedImageToStorage(url)
                                  setLoadedDetailBannerImages(prev => {
                                    const newSet = new Set(prev)
                                    newSet.add(url)
                                    return newSet
                                  })
                                  resolve()
                                }
                                img.onerror = () => {
                                  saveLoadedImageToStorage(url) // 에러가 나도 로딩 완료로 간주
                                  setLoadedDetailBannerImages(prev => {
                                    const newSet = new Set(prev)
                                    newSet.add(url)
                                    return newSet
                                  })
                                  resolve()
                                }
                                img.src = url
                              })
                            })
                          
                          await Promise.all(imagePromises)
                          setDetailBannersLoading(false)
                          setShowDetailBannersModal({ contentId: 0, details: loginFormBanners.details })
                        }
                      }
                    }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}

              {error && (
                <div className="px-6 mb-6">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                </div>
              )}

              <div className="px-6 space-y-6 pb-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    휴대폰 번호
                  </label>
                  <input
                    type="text"
                  value={
                    !phoneNumber2 
                      ? `${phoneNumber1}-` 
                      : `${phoneNumber1}-${phoneNumber2}${phoneNumber3 ? '-' + phoneNumber3 : ''}`
                  }
                  onChange={(e) => {
                    let value = e.target.value.replace(/[^0-9]/g, '')
                    
                    // 010 접두사가 없으면 강제로 추가 (삭제 방지)
                    if (!value.startsWith('010')) {
                      // 010이 아닌 다른 숫자로 시작하면 010을 앞에 붙임
                      // 예: '1' -> '0101'
                      // 예: '01' (0 삭제) -> '01001' (이상함) -> 그냥 '010'으로 리셋이 나을 수도 있음
                      
                      if (value.length < 3) {
                        value = '010'
                      } else {
                        // 3자리 이상인데 010이 아니면, 앞부분이 손상된 것으로 보고 010으로 대체하거나 붙임
                        // 여기서는 단순히 010으로 리셋하고 뒷부분은 유지하지 않거나, 
                        // UX상 사용자가 010을 지우려고 한 의도를 막기 위해 010 + 입력값으로 처리
                        // 하지만 '01' -> '01001'은 이상하므로, 
                        // '010'이 깨진 경우 무조건 010... 포맷으로 맞춤
                        value = '010' + value
                      }
                    }

                    // 길이 제한 (010 + 8자리 = 11자리)
                    if (value.length > 11) {
                      value = value.slice(0, 11)
                    }

                    setPhoneNumber1('010')
                    if (value.length <= 3) {
                      setPhoneNumber2('')
                      setPhoneNumber3('')
                    } else if (value.length <= 7) {
                      setPhoneNumber2(value.slice(3))
                      setPhoneNumber3('')
                    } else {
                      setPhoneNumber2(value.slice(3, 7))
                      setPhoneNumber3(value.slice(7))
                    }
                  }}
                  className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all"
                  placeholder="010-0000-0000"
                  maxLength={13}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  비밀번호
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border-2 border-gray-300 rounded-lg px-4 py-3 text-base text-gray-900 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 transition-all"
                  placeholder="비밀번호를 입력하세요 (4자리 이상)"
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={loading || !streamingFinished}
                  onClick={(e) => {
                    if (!streamingFinished) {
                      e.preventDefault()
                      alert('점사중이니 완료될때까지 기다려주세요')
                      return
                    }
                  }}
                  className="flex-1 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? '조회 중...' : '조회하기'}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    if (!streamingFinished) {
                      e.preventDefault()
                      alert('점사중이니 완료될때까지 기다려주세요')
                      return
                    }
                    onClose()
                  }}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
                >
                  취소
                </button>
              </div>
              </div>
            </form>
          ) : (
            /* 결과 목록 */
            <div className="space-y-4 p-6">
              <div className="bg-pink-50 border border-pink-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-pink-700">
                  * 최근 6개월간의 이용내역만 조회 가능합니다.
                </p>
              </div>

              {/* 리뷰 이벤트 기본 배너 (결과 목록 영역) */}
              {loginFormBanners.basic && (
                <div className="mb-4 rounded-xl overflow-hidden shadow-md">
                  <img
                    src={loginFormBanners.basic}
                    alt="리뷰 이벤트 기본 배너"
                    className="w-full h-auto object-contain cursor-pointer hover:opacity-90 transition-opacity block"
                    onClick={async (e) => {
                      if (!streamingFinished) {
                        e.preventDefault()
                        alert('점사중이니 완료될때까지 기다려주세요')
                        return
                      }
                      if (detailBannersLoading) return
                      if (loginFormBanners.details && loginFormBanners.details.length > 0) {
                        // 이미 로딩된 이미지인지 확인 (메모리 + 로컬 스토리지)
                        const allLoaded = loginFormBanners.details.every((url: string) => {
                          return loadedDetailBannerImages.has(url) || getLoadedImagesFromStorage().has(url)
                        })
                        
                        if (allLoaded) {
                          // 이미 모두 로딩되어 있으면 즉시 표시
                          setShowDetailBannersModal({ contentId: 0, details: loginFormBanners.details })
                        } else {
                          // 아직 로딩 중이면 대기
                          setDetailBannersLoading(true)
                          
                          // 아직 로딩되지 않은 이미지만 로딩 (메모리 + 로컬 스토리지 확인)
                          const storageLoaded = getLoadedImagesFromStorage()
                          const imagePromises = loginFormBanners.details
                            .filter((url: string) => !loadedDetailBannerImages.has(url) && !storageLoaded.has(url))
                            .map((url: string) => {
                              return new Promise<void>((resolve) => {
                                const img = new Image()
                                img.onload = () => {
                                  saveLoadedImageToStorage(url)
                                  setLoadedDetailBannerImages(prev => {
                                    const newSet = new Set(prev)
                                    newSet.add(url)
                                    return newSet
                                  })
                                  resolve()
                                }
                                img.onerror = () => {
                                  saveLoadedImageToStorage(url) // 에러가 나도 로딩 완료로 간주
                                  setLoadedDetailBannerImages(prev => {
                                    const newSet = new Set(prev)
                                    newSet.add(url)
                                    return newSet
                                  })
                                  resolve()
                                }
                                img.src = url
                              })
                            })
                          
                          await Promise.all(imagePromises)
                          setDetailBannersLoading(false)
                          setShowDetailBannersModal({ contentId: 0, details: loginFormBanners.details })
                        }
                      }
                    }}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.display = 'none'
                    }}
                  />
                </div>
              )}

              {savedResults.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500">저장된 이용내역이 없습니다.</p>
                </div>
              ) : (
                savedResults.map((result) => (
                  <div
                    key={result.id}
                    className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-1">
                          {result.title || '저장된 결과'}
                        </h3>
                        {formatUserInfoLine(result) && (
                          <p className="text-sm text-gray-700">
                            {formatUserInfoLine(result)}
                          </p>
                        )}
                        <p className="text-sm text-gray-500">
                          결제일자: {formatDate(result.saved_at)}
                        </p>
                        <p className="text-sm text-gray-500">
                          다시보기 잔여일: {getRemainingViewDays(result.saved_at, 60)}일
                        </p>
                      </div>
                    </div>


                    <div className="flex flex-col gap-2">
                      {/* 컨텐츠별 리뷰 이벤트 배너는 제거 - 상단에 기본 배너만 한 번 표시됨 */}

                      {/* 버튼: 글자 길이에 맞게 + 우측 정렬 */}
                      <div className="flex justify-end gap-2 flex-wrap">
                        {!result.pdf_generated && (
                          <button
                            onClick={() => handleGeneratePdfClick(result)}
                            disabled={pdfGeneratingMap[result.id]}
                            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-all duration-200 relative overflow-hidden ${
                              pdfGeneratingMap[result.id]
                                ? 'cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-600'
                            }`}
                            style={pdfGeneratingMap[result.id] ? {
                              background: `linear-gradient(to right, #1e40af ${pdfProgressMap[result.id] || 0}%, #60a5fa ${pdfProgressMap[result.id] || 0}%)`
                            } : {}}
                          >
                            {pdfGeneratingMap[result.id] ? (
                              <>
                                <span>PDF 생성중</span>
                                <span className="flex space-x-1 items-center h-full pt-1">
                                  <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                  <span className="w-1 h-1 bg-white rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                  <span className="w-1 h-1 bg-white rounded-full animate-bounce"></span>
                                </span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                PDF 생성
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleView(result.id)}
                          className="inline-flex items-center justify-center whitespace-nowrap bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200"
                        >
                          다시보기
                        </button>
                        <button
                          onClick={() => handleDelete(result.id)}
                          className="inline-flex items-center justify-center whitespace-nowrap bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2.5 px-4 rounded-lg transition-colors duration-200"
                        >
                          삭제
                        </button>
                      </div>
                      <button
                        onClick={() => handleWriteReview(result)}
                        className="w-full bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white text-base font-bold py-3 px-4 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
                      >
                        리뷰 쓰기
                      </button>
                    </div>
                  </div>
                ))
              )}

              <div className="pt-4">
                <button
                  onClick={(e) => {
                    if (!streamingFinished) {
                      e.preventDefault()
                      alert('점사중이니 완료될때까지 기다려주세요')
                      return
                    }
                    setShowResults(false)
                    setSavedResults([])
                    setError('')
                  }}
                  className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors duration-200"
                >
                  돌아가기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* PDF 생성 확인 팝업 */}
      {showPdfConfirmPopup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4" onClick={() => setShowPdfConfirmPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="bg-white px-6 py-4 flex items-center justify-between border-b border-gray-200">
              <h3 className="text-lg font-bold text-gray-900">PDF 생성</h3>
              <button
                onClick={() => setShowPdfConfirmPopup(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 내용 */}
            <div className="p-6">
              <p className="text-gray-700 mb-2">
                소장용으로 <span className="text-red-600 font-bold">1회만</span> 생성이 가능합니다. 생성하시겠어요?
              </p>
              <p className="text-sm text-gray-500 mb-6">
                PDF 생성은 약 1분정도 소요될 수 있어요.
              </p>

              {/* 버튼 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPdfConfirmPopup(null)}
                  className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-4 rounded-xl transition-colors duration-200"
                >
                  취소
                </button>
                <button
                  onClick={handlePdfConfirm}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors duration-200"
                >
                  생성하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상세 배너 모달 */}
      {showDetailBannersModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[10000] p-4" onClick={() => setShowDetailBannersModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-pink-500 to-pink-600 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">리뷰 이벤트 상세</h3>
              <button
                onClick={() => setShowDetailBannersModal(null)}
                className="text-white hover:text-gray-200 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 상세 배너 목록 */}
            <div className="p-6 max-h-[70vh] overflow-y-auto">
              <div className="space-y-4">
                {showDetailBannersModal.details.map((url, idx) => {
                  // 이미 로딩된 이미지인지 확인 (메모리 + 로컬 스토리지)
                  const isLoaded = loadedDetailBannerImages.has(url) || getLoadedImagesFromStorage().has(url)
                  return (
                    <img
                      key={`detail-${idx}`}
                      src={url}
                      alt={`상세 이벤트 배너 ${idx + 1}`}
                      className="w-full object-cover"
                      loading="eager"
                      decoding="sync"
                      style={{
                        opacity: 1,
                        display: 'block'
                      }}
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = 'none'
                      }}
                    />
                  )
                })}
              </div>

              {/* 돌아가기 버튼 */}
              <button
                onClick={() => setShowDetailBannersModal(null)}
                className="w-full mt-6 bg-gradient-to-r from-pink-500 to-pink-600 hover:from-pink-600 hover:to-pink-700 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                돌아가기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 리뷰 작성 팝업 */}
      {showReviewPopup && (
        <ReviewPopup
          isOpen={true}
          onClose={() => setShowReviewPopup(null)}
          contentId={showReviewPopup.contentId}
          userName={showReviewPopup.userName}
          title={showReviewPopup.title || null}
          onSuccess={handleReviewSuccess}
        />
      )}
    </div>
  )
}
