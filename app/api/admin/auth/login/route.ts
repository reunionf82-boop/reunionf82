import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import crypto from 'crypto'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'

// 환경 변수의 비밀번호를 SHA-256으로 해시
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex')
}

// 서버 시작 시 해시된 비밀번호 계산
const ADMIN_PASSWORD_HASH = hashPassword(ADMIN_PASSWORD)

export async function POST(req: NextRequest) {
  try {
    const { passwordHash } = await req.json()

    if (!passwordHash) {
      return NextResponse.json(
        { error: '비밀번호를 입력하세요.' },
        { status: 400 }
      )
    }

    // 클라이언트에서 전송된 해시와 서버의 해시 비교
    if (passwordHash === ADMIN_PASSWORD_HASH) {
      // 로그인 성공 - 쿠키에 세션 저장
      const cookieStore = await cookies()
      cookieStore.set('admin_session', 'authenticated', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7일
        path: '/',
      })

      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json(
        { error: '비밀번호가 올바르지 않습니다.' },
        { status: 401 }
      )
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: '로그인 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  // 로그아웃
  const cookieStore = await cookies()
  cookieStore.delete('admin_session')
  return NextResponse.json({ success: true })
}

