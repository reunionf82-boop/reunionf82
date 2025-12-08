export default function Header() {
  return (
    <header className="bg-white shadow-md sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">🔮</span>
            <h1 className="text-2xl font-bold text-gray-900">Fortune82</h1>
          </div>
          <nav className="hidden md:flex space-x-6">
            <a href="/" className="text-gray-700 hover:text-purple-600 transition-colors">
              무료운세
            </a>
            <a href="/" className="text-gray-700 hover:text-purple-600 transition-colors">
              신년운세
            </a>
            <a href="/" className="text-gray-700 hover:text-purple-600 transition-colors">
              사주/운세
            </a>
            <a href="/" className="text-purple-600 font-semibold">
              궁합/애정
            </a>
            <a href="/" className="text-gray-700 hover:text-purple-600 transition-colors">
              타로카드
            </a>
            <a href="/" className="text-gray-700 hover:text-purple-600 transition-colors">
              테마운세
            </a>
            <a href="/" className="text-gray-700 hover:text-purple-600 transition-colors">
              포춘콜상담
            </a>
          </nav>
          <button className="md:hidden text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}














