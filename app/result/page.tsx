'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { callJeminaiAPIStream } from '@/lib/jeminai'

interface ResultData {
  content: any
  html: string // HTML 결과
  startTime?: number
  model?: string // 사용된 모델 정보
}

function ResultContent() {
  const searchParams = useSearchParams()
  const storageKey = searchParams.get('key')
  const isStreaming = searchParams.get('stream') === 'true'
  const [resultData, setResultData] = useState<ResultData | null>(null)
  const [streamingHtml, setStreamingHtml] = useState('')
  const [isStreamingActive, setIsStreamingActive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedResults, setSavedResults] = useState<any[]>([])
  const [streamingProgress, setStreamingProgress] = useState(0)

  // 저장된 결과 목록 로드 함수 (useEffect 위에 정의)
  const loadSavedResults = () => {
    if (typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem('saved_jeminai_results')
      if (saved) {
        const parsed = JSON.parse(saved)
        setSavedResults(parsed)
      } else {
        setSavedResults([])
      }
    } catch (e) {
      console.error('저장된 결과 불러오기 실패:', e)
      setSavedResults([])
    }
  }

  // 경과 시간 상태 (모든 hooks는 early return 이전에 정의)
  const [currentTime, setCurrentTime] = useState('0:00')

  useEffect(() => {
    if (!storageKey) {
      setError('결과 데이터 키가 없습니다.')
      setLoading(false)
      return
    }

    console.log('결과 페이지: 키로 데이터 찾기 시작, 키:', storageKey)
    
    // 기존 방식: 완료된 결과 로드
    const loadData = () => {
      try {
        // 세션 스토리지에서 데이터 가져오기
        const resultDataStr = sessionStorage.getItem(storageKey)
        
        console.log('결과 페이지: sessionStorage에서 데이터 조회, 키:', storageKey)
        console.log('결과 페이지: 데이터 존재 여부:', !!resultDataStr)
        
        if (!resultDataStr) {
          // 모든 키 확인 (디버깅용)
          console.log('결과 페이지: sessionStorage의 모든 키:', Object.keys(sessionStorage))
          setError('결과 데이터를 찾을 수 없습니다. 다시 시도해주세요.')
          setLoading(false)
          return
        }

        console.log('결과 페이지: 데이터 파싱 시작, 크기:', resultDataStr.length, 'bytes')
        const parsedData: ResultData = JSON.parse(resultDataStr)
        console.log('결과 페이지: 데이터 파싱 완료, HTML 길이:', parsedData.html?.length || 0)
        setResultData(parsedData)
        
        // 저장된 결과 목록 로드
        loadSavedResults()
        
        // 사용 후 세션 스토리지에서 삭제하지 않음 (저장 기능을 위해 유지)
        console.log('결과 페이지: 데이터 로드 완료')
      } catch (e) {
        console.error('결과 데이터 파싱 실패:', e)
        setError('결과 데이터를 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }

    // 약간의 지연 후 데이터 로드
    const timer = setTimeout(loadData, 50)
    
    return () => clearTimeout(timer)
  }, [storageKey, isStreaming])

  // 경과 시간 계산 (완료된 결과만 표시)
  useEffect(() => {
    if (resultData?.startTime) {
      const elapsed = Date.now() - resultData.startTime
      const mins = Math.floor(elapsed / 60000)
      const secs = Math.floor((elapsed % 60000) / 1000)
      setCurrentTime(`${mins}:${secs.toString().padStart(2, '0')}`)
    }
  }, [resultData?.startTime])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p>결과 로딩 중...</p>
        </div>
      </div>
    )
  }

  if (error || !resultData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>{error || '결과 데이터가 없습니다.'}</p>
        </div>
      </div>
    )
  }

  // 완료된 결과 표시
  const content = resultData.content
  const html = resultData.html || ''
  const startTime = resultData.startTime
  const model = resultData.model
  
  // 모델 이름 표시용
  const modelDisplayName = model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : model || 'Unknown'

  // 경과 시간 계산 (로깅용)
  const elapsedTime = startTime ? Date.now() - startTime : 0

  console.log('결과 페이지: 데이터 분석 시작')
  console.log('결과 페이지: 경과 시간:', currentTime, `(${elapsedTime}ms)`)
  console.log('결과 페이지: HTML 길이:', html?.length)

  // 폰트 크기 설정 (관리자 페이지에서 설정한 값 사용)
  const menuFontSize = content?.menu_font_size || 16
  const subtitleFontSize = content?.subtitle_font_size || 14
  const bodyFontSize = content?.body_font_size || 11

  // 동적 스타일 생성
  const dynamicStyles = `
    .jeminai-results .menu-title {
      font-size: ${menuFontSize}px !important;
    }
    .jeminai-results .subtitle-title {
      font-size: ${subtitleFontSize}px !important;
    }
    .jeminai-results .subtitle-content {
      font-size: ${bodyFontSize}px !important;
    }
  `

  // 결과를 로컬에 저장
  const saveResultToLocal = () => {
    if (typeof window === 'undefined' || !resultData) {
      console.error('결과 저장 실패: resultData가 없습니다.')
      alert('결과 저장에 실패했습니다. (데이터 없음)')
      return
    }
    
    try {
      const currentSaved = [...savedResults]
      const newResult = {
        id: `result_${Date.now()}`,
        title: content?.content_name || '재회 결과',
        html: html || '',
        savedAt: new Date().toLocaleString('ko-KR'),
        content: content,
        model: model || 'gemini-2.5-flash', // 모델 정보 저장
        processingTime: currentTime // 처리 시간 저장 (timeString 대신 currentTime 사용)
      }
      
      console.log('저장할 결과:', newResult)
      
      currentSaved.unshift(newResult) // 최신 결과를 맨 위에
      const maxSaved = 50 // 최대 50개만 저장
      const trimmedResults = currentSaved.slice(0, maxSaved)
      
      localStorage.setItem('saved_jeminai_results', JSON.stringify(trimmedResults))
      setSavedResults(trimmedResults) // 상태 업데이트
      alert('결과가 저장되었습니다.')
      
      // 페이지 새로고침하지 않고 상태만 업데이트
    } catch (e) {
      console.error('결과 저장 실패:', e)
      console.error('에러 상세:', e instanceof Error ? e.stack : e)
      alert('결과 저장에 실패했습니다.\n\n개발자 도구 콘솔을 확인해주세요.')
    }
  }

  // 저장된 결과 삭제
  const deleteSavedResult = (resultId: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const updatedResults = savedResults.filter((r: any) => r.id !== resultId)
      localStorage.setItem('saved_jeminai_results', JSON.stringify(updatedResults))
      setSavedResults(updatedResults)
    } catch (e) {
      console.error('저장된 결과 삭제 실패:', e)
      alert('저장된 결과 삭제에 실패했습니다.')
    }
  }

  // 저장된 결과 보기
  const viewSavedResult = (resultId: string) => {
    if (typeof window === 'undefined') return
    
    try {
      const saved = savedResults.find((r: any) => r.id === resultId)
      
      if (saved) {
        // 새 창으로 결과 표시
        const newWindow = window.open('', '_blank')
        if (newWindow) {
          newWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="UTF-8">
              <title>${saved.title}</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                  max-width: 1200px;
                  margin: 0 auto;
                  padding: 20px;
                  background: #f5f5f5;
                }
                .container {
                  background: white;
                  border-radius: 12px;
                  padding: 24px;
                  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                h1 {
                  font-size: 28px;
                  font-weight: bold;
                  margin-bottom: 8px;
                  color: #111;
                }
                .saved-at {
                  color: #666;
                  font-size: 14px;
                  margin-bottom: 24px;
                }
                .menu-section {
                  background: white;
                  border-radius: 12px;
                  padding: 24px;
                  margin-bottom: 24px;
                  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .menu-title {
                  font-size: 20px;
                  font-weight: bold;
                  margin-bottom: 16px;
                  color: #111;
                }
                .menu-thumbnail {
                  width: 100%;
                  height: 256px;
                  object-fit: cover;
                  border-radius: 8px;
                  margin-bottom: 24px;
                }
                .subtitle-section {
                  padding-top: 24px;
                }
                .subtitle-title {
                  font-size: 18px;
                  font-weight: 600;
                  margin-bottom: 12px;
                  color: #333;
                }
                .subtitle-content {
                  color: #555;
                  line-height: 1.8;
                  white-space: pre-line;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>${saved.title}</h1>
                <div class="saved-at">
                  저장일시: ${saved.savedAt}<br/>
                  ${saved.model ? `모델: ${saved.model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : saved.model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : saved.model}<br/>` : ''}
                  ${saved.processingTime ? `처리 시간: ${saved.processingTime}` : ''}
                </div>
                ${saved.html}
              </div>
            </body>
            </html>
          `)
          newWindow.document.close()
        }
      } else {
        alert('저장된 결과를 찾을 수 없습니다.')
      }
    } catch (e) {
      console.error('저장된 결과 보기 실패:', e)
      alert('저장된 결과를 불러오는데 실패했습니다.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 동적 스타일 주입 */}
      <style dangerouslySetInnerHTML={{ __html: dynamicStyles }} />
      
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* 제목 */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">
            {content?.content_name || '결과 생성 중...'}
          </h1>
          {startTime && (
            <div className="text-sm text-gray-500">
              사용 모델: <span className="font-semibold text-gray-700">{modelDisplayName}</span>
              {' · '}
              처리 시간: <span className="font-semibold text-gray-700">{currentTime}</span>
            </div>
          )}
        </div>

        {/* 결과 출력 - HTML 그대로 표시 */}
        <div 
          className="jeminai-results"
          dangerouslySetInnerHTML={{ __html: html }}
        />

        {/* 저장된 파일 보기 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8 mt-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">저장된 결과</h3>
          <div className="space-y-3">
            {savedResults.length === 0 ? (
              <p className="text-sm text-gray-600">저장된 결과가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {savedResults.map((saved: any) => (
                    <div key={saved.id} className="bg-white rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-900">{saved.title}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {saved.savedAt}
                            {saved.model && (
                              <> · 모델: {saved.model === 'gemini-2.5-pro' ? 'Gemini 2.5 Pro' : saved.model === 'gemini-2.5-flash' ? 'Gemini 2.5 Flash' : saved.model}</>
                            )}
                            {saved.processingTime && (
                              <> · 처리 시간: {saved.processingTime}</>
                            )}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => viewSavedResult(saved.id)}
                            className="bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                          >
                            보기
                          </button>
                          <button
                            onClick={() => deleteSavedResult(saved.id)}
                            className="bg-red-500 hover:bg-red-600 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors duration-200"
                          >
                            삭제
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="mt-8 text-center space-x-4">
          <button
            onClick={() => saveResultToLocal()}
            className="bg-green-500 hover:bg-green-600 text-white font-semibold py-3 px-8 rounded-xl transition-colors duration-200"
          >
            결과 저장
          </button>
          <button
            onClick={() => window.history.back()}
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-8 rounded-xl transition-colors duration-200"
          >
            이전으로
          </button>
        </div>
      </main>
    </div>
  )
}

export default function ResultPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
          <p>로딩 중...</p>
        </div>
      </div>
    }>
      <ResultContent />
    </Suspense>
  )
}

