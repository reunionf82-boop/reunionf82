'use client'

interface PrivacyPopupProps {
  isOpen: boolean
  onClose: () => void
}

export default function PrivacyPopup({ isOpen, onClose }: PrivacyPopupProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">개인정보 수집 및 이용동의</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            ×
          </button>
        </div>
        
        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300 text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">수집 목적</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">구분</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">수집 항목</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">수집 방법</th>
                  <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-900">보유 기간</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700" rowSpan={2}>회원 가입</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">네이버 간편 가입</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">네이버 계정 (이메일, 식별번호)</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">회원 탈퇴 즉시 파기</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">카카오 간편 가입</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">카카오 계정 (이메일, 식별번호)</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">부정 이용 방지를 위하여 30일 동안 보관 (아이디, 휴대폰 번호) 후 파기</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">운세 콘텐츠 제공, 효율적인 고객 지원 및 운영</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700"></td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">이름, 성별, 생년월일시, 양/음력</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">컨텐츠 제공 완료 (다시보기 7일 만료) 후 개인정보 자동 파기</td>
                </tr>
                <tr>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">서비스 방문 및 이용 기록 분석, 부정 이용 방지 등을 위한 기록 관리</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700"></td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">서비스 이용기록, 모바일기기정보 (광고식별자, OS/앱 버번)</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                  <td className="border border-gray-300 px-4 py-3 text-gray-700">회원 탈퇴 즉시 또는 이용 목적 달성 즉시 파기</td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">※</span> 개인정보 수집 및 이용에 대해서는 거부 할 수 있으며, 거부 시에는 서비스 이용이 불가합니다.
            </p>
          </div>
        </div>
        
        {/* 푸터 */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}





















