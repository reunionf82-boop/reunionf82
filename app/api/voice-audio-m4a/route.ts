import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** ffmpeg 실행 파일 경로: FFMPEG_PATH → 프로젝트 bin/ffmpeg → 시스템 ffmpeg */
function getFfmpegPath(): string {
  const envPath = process.env.FFMPEG_PATH
  if (envPath && fs.existsSync(envPath)) return envPath
  const binPath = path.join(process.cwd(), 'bin', 'ffmpeg')
  if (fs.existsSync(binPath)) return binPath
  return 'ffmpeg'
}

function getSupabaseClient() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase 설정이 없습니다.')
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function isAllowedUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const base = supabaseUrl ? new URL(supabaseUrl).hostname : ''
    const host = u.hostname.toLowerCase()
    return !base || host === base || host.endsWith('.supabase.co') || host.endsWith('.supabase.in')
  } catch {
    return false
  }
}

/**
 * GET /api/voice-audio-m4a?url=ENCODED_WEBM_URL&savedId=123
 * WebM URL을 받아 M4A로 변환 후 Supabase에 업로드하고 URL 반환.
 * savedId가 있으면 saved_results.voice_audio_url_m4a에 저장.
 * 서버에 ffmpeg가 없으면 503 반환 (클라이언트는 WebM으로 fallback).
 */
export async function GET(req: NextRequest) {
  const urlParam = req.nextUrl.searchParams.get('url')
  const savedIdParam = req.nextUrl.searchParams.get('savedId')
  const savedId = savedIdParam ? parseInt(savedIdParam, 10) : null

  if (!urlParam) {
    return NextResponse.json({ error: 'url 쿼리가 필요합니다.' }, { status: 400 })
  }
  let webmUrl: string
  try {
    webmUrl = decodeURIComponent(urlParam)
  } catch {
    return NextResponse.json({ error: 'url 인코딩이 올바르지 않습니다.' }, { status: 400 })
  }
  if (!isAllowedUrl(webmUrl)) {
    return NextResponse.json({ error: '허용되지 않은 URL입니다.' }, { status: 400 })
  }

  const tmpDir = os.tmpdir()
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const webmPath = path.join(tmpDir, `voice_${id}.webm`)
  const m4aPath = path.join(tmpDir, `voice_${id}.m4a`)

  try {
    const res = await fetch(webmUrl, { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json(
        { error: 'WebM 다운로드 실패', status: res.status },
        { status: 502 }
      )
    }
    const buf = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(webmPath, buf)

    const ffmpegPath = getFfmpegPath()
    const result = spawnSync(
      ffmpegPath,
      ['-y', '-i', webmPath, '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', m4aPath],
      { encoding: 'utf8', timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
    )
    if (result.error || result.status !== 0) {
      const ffmpegErr = result.error || new Error(result.stderr || result.stdout || 'ffmpeg failed')
      throw ffmpegErr
    }
    if (!fs.existsSync(m4aPath)) {
      try { fs.unlinkSync(webmPath) } catch { /* ignore */ }
      return NextResponse.json({ error: 'M4A 변환 결과 파일이 생성되지 않았습니다.' }, { status: 502 })
    }

    const m4aBuffer = fs.readFileSync(m4aPath)
    try { fs.unlinkSync(webmPath) } catch { /* ignore */ }
    try { fs.unlinkSync(m4aPath) } catch { /* ignore */ }

    const fileName = `voice_${Date.now()}_${id}.m4a`
    const filePath = `voice/${fileName}`
    const supabase = getSupabaseClient()
    const { error: uploadError } = await supabase.storage
      .from('thumbnails')
      .upload(filePath, m4aBuffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: 'audio/mp4',
      })

    if (uploadError) {
      return NextResponse.json(
        { error: 'M4A 업로드 실패', details: uploadError.message },
        { status: 500 }
      )
    }

    const { data: urlData } = supabase.storage.from('thumbnails').getPublicUrl(filePath)
    const m4aUrl = urlData?.publicUrl || ''

    if (savedId != null && Number.isFinite(savedId)) {
      await supabase
        .from('saved_results')
        .update({ voice_audio_url_m4a: m4aUrl })
        .eq('id', savedId)
    }

    return NextResponse.json({ url: m4aUrl, success: true })
  } catch (e: any) {
    try { fs.unlinkSync(webmPath) } catch { /* ignore */ }
    try { fs.unlinkSync(m4aPath) } catch { /* ignore */ }
    const msg = e?.message || String(e)
    const notFound = /ffmpeg.*not found|ENOENT|spawn.*ffmpeg/i.test(msg)
    return NextResponse.json(
      { error: notFound ? 'ffmpeg를 사용할 수 없습니다.' : '서버 오류', details: msg },
      { status: notFound ? 503 : 500 }
    )
  }
}
