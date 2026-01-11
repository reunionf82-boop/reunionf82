'use client'

interface PrivacyPopupProps {
  isOpen: boolean
  onClose: () => void
}

export default function PrivacyPopup({ isOpen, onClose }: PrivacyPopupProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4">
      <div className="bg-white rounded-xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">개인정보처리방침</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
          >
            ×
          </button>
        </div>
        
        {/* 내용 */}
        <div className="flex-1 overflow-y-auto p-6 text-sm text-gray-700 leading-relaxed">
          <div className="space-y-6">
            <div>
              <p className="mb-4">
                테크앤조이(이하 &quot;회사&quot;)는 통신비밀보호법, 전기통신사업법, 정보통신망 이용촉진 및 정보보호 등에 관한 법률 등 정보통신서비스제공자가 준수하여야 할 관련 법령상의 개인정보보호 규정을 준수하며, 관련 법령에 의거한 개인정보취급방침을 정하여 이용자 권익 보호에 최선을 다하고 있습니다.
              </p>
              <p className="mb-4">
                본 개인정보취급방침은 다음과 같은 내용을 담고 있습니다.
              </p>
              <ol className="list-decimal list-inside space-y-1 ml-4">
                <li>수집하는 개인정보의 항목 및 수집방법</li>
                <li>개인정보의 수집 및 이용목적</li>
                <li>개인정보 공유 및 제공</li>
                <li>개인정보의 보유 및 이용기간</li>
                <li>개인정보 파기절차 및 방법</li>
                <li>이용자 및 법정대리인의 권리와 그 행사방법</li>
                <li>개인정보 자동 수집 장치의 설치/운영 및 거부에 관한 사항</li>
                <li>개인정보의 기술적/관리적 보호 대책</li>
                <li>개인정보관리책임자 및 담당자의 연락처</li>
                <li>기타</li>
                <li>고지의 의무</li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">1. 수집하는 개인정보의 항목 및 수집방법</h3>
              
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">가. 수집하는 개인정보의 항목</h4>
                <p className="mb-2">첫째, 회사는 회원가입, 원활한 고객상담, 각종 서비스의 제공을 위해 최초 회원가입 당시 아래와 같은 개인정보를 수집하고 있습니다.</p>
                <p className="mb-2">수집항목 : 이름, 생년월일, 양/음력, 태어난 시/분, 성별, 아이디, 결제기록, 휴대전화번호, 통신사 정보</p>
                <p className="mb-2">둘째, 서비스 이용과정이나 사업처리 과정에서 아래와 같은 정보들이 자동으로 생성되어 수집될 수 있습니다.</p>
                <p className="mb-2">IP Address, 쿠키, 방문 일시, 서비스 이용 기록, 불량 이용 기록</p>
                <p className="mb-2">셋째, 유료 서비스 이용 과정에서 아래와 같은 결제 정보들이 수집될 수 있습니다.</p>
                <p className="mb-2">휴대전화 결제시 : 이동전화번호, 통신사, 결제승인번호 등</p>
                <p className="mb-2">상품권 이용시 : 상품권 번호</p>
              </div>

              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">나. 개인정보 수집방법</h4>
                <p>회사는 다음과 같은 방법으로 개인정보를 수집합니다.</p>
                <p>홈페이지, 서면양식, 팩스, 전화, 상담 게시판, 이메일, 이벤트 응모, 배송요청협력회사로부터의 제공생성정보 수집 툴을 통한 수집</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">2. 개인정보의 수집 및 이용목적</h3>
              <p className="mb-4">
                회사는 다음의 목적을 위하여 개인정보를 처리합니다. 처리하고 있는 개인정보는 다음의 목적 이외의 용도로는 이용되지 않으며, 이용 목적이 변경되는 경우에는 법률에 따라 별도의 동의를 받는등 필요한 조치를 이행할 예정입니다.
              </p>
              
              <div className="overflow-x-auto mb-4">
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
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">네이버 간편가입</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">네이버 계정(이메일, 식별번호)</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700" rowSpan={2}>
                        회원 탈퇴 즉시 파기<br />
                        부정이용 방지를 위하여 30일 동안 보관(아이디, 휴대폰 번호) 후 파기
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">카카오 간편가입</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">카카오 계정(이메일, 식별번호)</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">운세 콘텐츠 제공, 효율적인 고객 지원 및 운영</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700"></td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">이름, 성별, 생년월일시, 양/음력</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">컨텐츠 제공 완료 (다시보기 7일 만료) 후 개인정보 자동 파기</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">서비스방문 및이용기록 분석, 부정이용 방지 등을 위한 기록 관리</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700"></td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">서비스 이용기록, 모바일기기정보(광고식별자, OS/앱 버번)</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">홈페이지, 모바일앱</td>
                      <td className="border border-gray-300 px-4 py-3 text-gray-700">회원 탈퇴 즉시 또는 이용 목적 달성 즉시 파기</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mb-4">
                <p className="mb-2">가. 서비스 제공에 관한 계약 이행 및 서비스 제공에 따른 요금정산</p>
                <p className="mb-2 ml-4">컨텐츠 제공, 특정 맞춤 서비스 제공, 물품배송 또는 청구서 등 발송, 본인인증, 구매 및 요금 결제, 요금추심</p>
                <p className="mb-2">나. 회원관리</p>
                <p className="mb-2 ml-4">회원제 서비스 이용 및 제한적 본인 확인제에 따른 본인확인, 개인식별, 불량회원의 부정 이용방지와 비인가 사용방지, 가입의사 확인, 가입 및 가입횟수 제한, 만14세 미만 아동 개인정보 수집 시 법정 대리인 동의여부 확인, 추후 법정 대리인 본인확인, 분쟁 조정을 위한 기록보존, 불만처리 등 민원처리, 고지사항 전달</p>
                <p className="mb-2">다. 신규 서비스 개발 및 마케팅</p>
                <p className="mb-2 ml-4">신규 서비스 개발 및 맞춤 서비스 제공, 통계학적 특성에 따른 서비스 제공 및 광고 게재, 서비스의 유효성 확인, 이벤트 및 광고성 정보 제공 및 참여기회 제공, 접속빈도 파악, 회원의 서비스이용에 대한 통계</p>
              </div>

              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">*</span> 개인정보 수집 및 이용에 대해서는 거부 할 수 있으며, 거부 시에는 서비스 이용이 불가합니다.
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">3. 개인정보의 공유 및 제공</h3>
              <p className="mb-2">
                회사는 이용자들의 개인정보를 &quot;2. 개인정보의 수집목적 및 이용목적&quot;에서 고지한 범위내에서 사용하며, 이용자의 사전 동의 없이는 동 범위를 초과하여 이용하거나 원칙적으로 이용자의 개인정보를 외부에 공개하지 않습니다. 다만, 아래의 경우에는 예외로 합니다.
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>이용자들이 사전에 공개에 동의한 경우</li>
                <li>법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">4. 개인정보의 보유 및 이용기간</h3>
              <p className="mb-2">
                이용자의 개인정보는 원칙적으로 개인정보의 수집 및 이용목적이 달성되면 지체 없이 파기합니다. 단, 다음의 정보에 대해서는 아래의 이유로 명시한 기간 동안 보존합니다.
              </p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">가. 회사 내부 방침에 의한 정보보유 사유</h4>
                <div className="ml-4">
                  <p className="mb-2"><strong>&lt; 부정이용기록 &gt;</strong></p>
                  <p className="mb-2">보존 이유 : 부정 이용 방지</p>
                  <p className="mb-2">보존 기간 : 1년</p>
                </div>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">나. 관련법령에 의한 정보보유 사유</h4>
                <p className="mb-2">
                  상법, 전자상거래 등에서의 소비자보호에 관한 법률 등 관계법령의 규정에 의하여 보존할 필요가 있는 경우 회사는 관계법령에서 정한 일정한 기간 동안 회원정보를 보관합니다. 이 경우 회사는 보관하는 정보를 그 보관의 목적으로만 이용하며 보존기간은 아래와 같습니다.
                </p>
                <div className="space-y-2 ml-4">
                  <div>
                    <p className="mb-1"><strong>&lt; 계약 또는 청약철회 등에 관한 기록 &gt;</strong></p>
                    <p className="mb-1">보존 이유 : 전자상거래 등에서의 소비자보호에 관한 법률</p>
                    <p>보존 기간 : 5년</p>
                  </div>
                  <div>
                    <p className="mb-1"><strong>&lt; 대금결제 및 재화 등의 공급에 관한 기록 &gt;</strong></p>
                    <p className="mb-1">보존 이유 : 전자상거래 등에서의 소비자보호에 관한 법률</p>
                    <p>보존 기간 : 5년</p>
                  </div>
                  <div>
                    <p className="mb-1"><strong>&lt; 소비자의 불만 또는 분쟁처리에 관한 기록 &gt;</strong></p>
                    <p className="mb-1">보존 이유 : 전자상거래 등에서의 소비자보호에 관한 법률</p>
                    <p>보존 기간 : 3년</p>
                  </div>
                  <div>
                    <p className="mb-1"><strong>&lt; 본인확인에 관한 기록 &gt;</strong></p>
                    <p className="mb-1">보존 이유 : 정보통신 이용촉진 및 정보보호 등에 관한 법률</p>
                    <p>보존 기간 : 6개월</p>
                  </div>
                  <div>
                    <p className="mb-1"><strong>&lt; 방문에 관한 기록 &gt;</strong></p>
                    <p className="mb-1">보존 이유 : 통신비밀보호법</p>
                    <p>보존 기간 : 3개월</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">5. 개인정보 파기절차 및 방법</h3>
              <p className="mb-2">
                이용자의 개인정보는 원칙적으로 개인정보의 수집 및 이용목적이 달성되면 지체 없이 파기합니다.회사의 개인정보 파기절차 및 방법은 다음과 같습니다.
              </p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">가. 파기절차</h4>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>이용자가 회원가입 등을 위해 입력한 정보는 목적이 달성된 후 별도의 DB로 옮겨져(종이의 경우 별도의 서류함) 내부 방침 및 기타 관련 법령에 의한 정보보호 사유에 따라(보유 및 이용기간 참조)일정 기간 저장된 후 파기됩니다.</li>
                  <li>동 개인정보는 법률에 의한 경우가 아니고서는 보유되는 이외의 다른 목적으로 이용되지 않습니다.</li>
                </ul>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">나. 파기방법</h4>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>종이에 출력된 개인정보는 분쇄기로 분쇄하거나 소각을 통하여 파기합니다</li>
                  <li>전자적 파일 형태로 저장된 개인정보는 기록을 재생할 수 없는 기술적 방법을 사용하여 삭제합니다.</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">6. 이용자 및 법정대리인의 권리와 그 행사방법</h3>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>이용자 및 법정 대리인은 언제든지 등록되어 있는 자신 혹은 당해 만 14세 미만 아동의 개인정보를 조회하거나 수정할 수 있으며 가입해지를 요청할 수도 있습니다.</li>
                <li>이용자 혹은 만 14세 미만 아동의 개인정보 조회, 수정을 위해서는 &apos;개인정보변경&apos;(또는 &apos;회원정보수정&apos; 등)을, 가입해지(동의철회)를 위해서는 &quot;회원탈퇴&quot;를 클릭하여 본인 확인 절차를 거치신 후 직접 열람, 정정 또는 탈퇴가 가능합니다.</li>
                <li>혹은 개인정보관리책임자에게 서면, 전화 또는 이메일로 연락하시면 지체 없이 조치하겠습니다.</li>
                <li>이용자가 개인정보의 오류에 대한 정정을 요청하신 경우에는 정정을 완료하기 전까지 당해 개인정보를 이용 또는 제공하지 않습니다. 또한 잘못된 개인정보를 제3 자에게 이미 제공한 경우에는 정정 처리결과를 제3자에게 지체 없이 통지하여 정정이 이루어지도록 하겠습니다.</li>
                <li>회사는 이용자 혹은 법정 대리인의 요청에 의해 해지 또는 삭제된 개인정보는 &quot;5. 개인정보의 보유 및 이용기간&quot;에 명시된 바에 따라 처리하고 그 외의 용도로 열람 또는 이용할 수 없도록 처리하고 있습니다.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">7. 개인정보 자동 수집 장치의 설치/운영 및 거부에 관한 사항</h3>
              <p className="mb-2">
                회사는 이용자들에게 특화된 맞춤서비스를 제공하기 위해서 이용자들의 정보를 저장하고 수시로 불러오는 &apos;쿠키(cookie)&apos;를 사용합니다. 쿠키는 웹사이트를 운영하는데 이용되는 서버(HTTP)가 이용자의 컴퓨터 브라우저에게 보내는 소량의 정보이며 이용자들의 PC 컴퓨터내의 하드디스크에 저장되기도 합니다.
              </p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">가. 쿠키의 사용 목적</h4>
                <p className="mb-2">이용자들이 방문한 회사의 각 서비스와 웹 사이트들에 대한 방문 및 이용형태, 인기 검색어, 보안접속 여부, 뉴스편집, 이용자 규모 등을 파악하여 이용자에게 최적화된 정보 제공을 위하여 사용합니다.</p>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">나. 쿠키의 사용 목적</h4>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>이용자는 쿠키 설치에 대한 선택권을 가지고 있습니다. 따라서, 이용자는 웹브라우저에서 옵션을 설정함으로써 모든 쿠키를 허용하거나, 쿠키가 저장될 때마다 확인을 거치거나, 아니면 모든 쿠키의 저장을 거부할 수도 있습니다.</li>
                  <li>쿠키 설정을 거부하는 방법으로는 이용자가 사용하는 웹 브라우저의 옵션을 선택함으로써 모든 쿠키를 허용하거나 쿠키를 저장할 때마다 확인을 거치거나, 모든 쿠키의 저장을 거부할 수 있습니다.</li>
                  <li>설정방법 예(인터넷 익스플로어의 경우) : 웹 브라우저 상단의 도구 &gt; 인터넷 옵션 &gt; 개인정보</li>
                  <li>다만, 쿠키의 저장을 거부할 경우에는 로그인이 필요한 일부 서비스는 이용에 어려움이 있을 수 있습니다.</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">8. 개인정보의 기술적/관리적 보호 대책</h3>
              <p className="mb-2">
                회사는 이용자들의 개인정보를 취급함에 있어 개인정보가 분실, 도난, 누출, 변조 또는 훼손되지 않도록 안전성 확보를 위하여 다음과 같은 기술적/관리적 대책을 강구하고 있습니다.
              </p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">가. 비밀번호 암호화</h4>
                <p>회원 아이디(ID)의 비밀번호는 암호화되어 저장 및 관리되고 있어 본인만이 알고 있으며, 개인정보의 확인 및 변경도 비밀번호를 알고 있는 본인에 의해서만 가능합니다.</p>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">나. 해킹 등에 대비한 대책</h4>
                <p className="mb-2">
                  회사는 해킹이나 컴퓨터 바이러스 등에 의해 회원의 개인정보가 유출되거나 훼손되는 것을 막기 위해 최선을 다하고 있습니다.
                  개인정보의 훼손에 대비해서 자료를 수시로 백업하고 있고, 최신 백신프로그램을 이용하여 이용자들의 개인정보나 자료가 누출되거나 손상되지 않도록 방지하고 있으며, 암호화통신 등을 통하여 네트워크상에서 개인정보를 안전하게 전송할 수 있도록 하고 있습니다. 그리고 침입차단시스템을 이용하여 외부로부터의 무단 접근을 통제하고 있으며, 기타 시스템적으로 보안성을 확보하기 위한 가능한 모든 기술적 장치를 갖추려 노력하고 있습니다.
                </p>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">다. 취급 직원의 최소화 및 교육</h4>
                <p>회사의 개인정보관련 취급 직원은 담당자에 한정시키고 있고 이를 위한 별도의 비밀번호를 부여하여 정기적으로 갱신하고 있으며, 담당자에 대한 수시 교육을 통하여 개인정보취급방침의 준수를 항상 강조하고 있습니다.</p>
              </div>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">라. 개인정보보호전담기구의 운영</h4>
                <p>그리고 사내 개인정보보호전담기구 등을 통하여 개인정보취급방침의 이행사항 및 담당자의 준수여부를 확인하여 문제가 발견될 경우 즉시 수정하고 바로 잡을 수 있도록 노력하고 있습니다.</p>
                <p className="mt-2">단, 이용자 본인의 부주의나 인터넷상의 문제로 ID, 비밀번호, 주민등록번호 등 개인정보가 유출되어 발생한 문제에 대해 회사는 일체의 책임을 지지 않습니다.</p>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">9. 개인정보관리책임자 및 담당자의 연락처</h3>
              <p className="mb-2">
                귀하께서는 회사의 서비스를 이용하시며 발생하는 모든 개인정보보호 관련 민원을 개인정보관리책임자 혹은 담당부서로 신고하실 수 있습니다.
                회사는 이용자들의 신고사항에 대해 신속하게 충분한 답변을 드릴 것입니다.
              </p>
              <div className="mb-4">
                <h4 className="font-semibold text-gray-900 mb-2">개인정보 관리책임자</h4>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse border border-gray-300 text-sm">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">구분</th>
                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">이름</th>
                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">소속</th>
                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">전화</th>
                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">직위</th>
                        <th className="border border-gray-300 px-4 py-2 text-left font-semibold text-gray-900">메일</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="border border-gray-300 px-4 py-2 text-gray-700">개인정보 관리 책임자/담당자</td>
                        <td className="border border-gray-300 px-4 py-2 text-gray-700">정홍규</td>
                        <td className="border border-gray-300 px-4 py-2 text-gray-700">개발팀</td>
                        <td className="border border-gray-300 px-4 py-2 text-gray-700">070-4323-7009</td>
                        <td className="border border-gray-300 px-4 py-2 text-gray-700">팀장</td>
                        <td className="border border-gray-300 px-4 py-2 text-gray-700">vcpro@techenjoy.co.kr</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 mb-2">기타 개인정보침해에 대한 신고나 상담이 필요하신 경우에는 아래 기관에 문의하시기 바랍니다</p>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>개인분쟁조정위원회 (www.1336.or.kr / 1336)</li>
                  <li>정보보호마크인증위원회 (www.eprivacy.or.kr / 02-580-0533~4)</li>
                  <li>대검찰청 인터넷범죄수사센터 (http://icic.sppo.go.kr / 02-3480-3600)</li>
                  <li>경찰청 사이버테러대응센터 (www.ctrc.go.kr / 02-392-0330)</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">10. 기타</h3>
              <p>서비스에 링크되어 있는 웹사이트들이 개인정보를 수집하는 행위에 대해서는 본 &quot;개인정보취급방침&quot;이 적용되지 않음을 알려 드립니다.</p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-3">11. 고지의 의무</h3>
              <p>현 개인정보취급방침 내용 추가, 삭제 및 수정이 있을 시에는 개정 최소 7일전부터 홈페이지의 &apos;공지사항&apos;을 통해 고지할 것입니다.</p>
            </div>

            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-500">시행일자 : 2011년 12월 1일</p>
            </div>
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
